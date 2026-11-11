-- =====================================================================
-- ERP OA Metal — transfert simplifié : demande du magasinier, validation
-- de la direction, puis mouvement automatique vers le dépôt production.
--   Brouillon → Soumise (à valider) → Validée (bobines transférées)
--                                   → Refusée
-- À exécuter après 0012.
-- =====================================================================

alter table public.stock_transfers drop constraint if exists stock_transfers_status_check;
alter table public.stock_transfers add constraint stock_transfers_status_check
  check (status in ('brouillon', 'soumise', 'validee', 'refusee', 'annule', 'en_transit', 'recu'));

alter table public.stock_transfers
  add column if not exists submitted_by  uuid references public.profiles (id),
  add column if not exists submitted_at  timestamptz,
  add column if not exists decided_by    uuid references public.profiles (id),
  add column if not exists decided_at    timestamptz,
  add column if not exists decision_note text;

-- Permission de la direction
insert into public.permissions (code, group_name, label, sort_order)
values ('stocks.transfer.approve', 'Stocks', 'Valider une demande de transfert (direction)', 74)
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r, 'stocks.transfer.approve' from unnest(array['directeur', 'directeur_usine']) r
where exists (select 1 from public.roles where code = r)
on conflict do nothing;

-- Contrôle commun : les bobines sont au dépôt source, disponibles, et pas dans une autre demande
create or replace function public.transfer_check_coils(p_transfer uuid)
returns void
language plpgsql
as $$
declare
  t     public.stock_transfers%rowtype;
  v_bad text;
begin
  select * into t from public.stock_transfers where id = p_transfer;
  if not exists (select 1 from public.stock_transfer_lines where transfer_id = t.id) then
    raise exception 'Cochez au moins une bobine.';
  end if;
  select c.reference into v_bad
  from public.stock_transfer_lines l join public.coils c on c.id = l.coil_id
  where l.transfer_id = t.id
    and (c.warehouse_id <> t.source_warehouse_id or c.status <> 'disponible' or c.remaining_weight_kg <= 0)
  limit 1;
  if found then raise exception 'La bobine % n''est plus disponible au dépôt source.', v_bad; end if;
  select c.reference into v_bad
  from public.stock_transfer_lines l
  join public.coils c on c.id = l.coil_id
  join public.stock_transfer_lines l2 on l2.coil_id = l.coil_id and l2.transfer_id <> t.id
  join public.stock_transfers t2 on t2.id = l2.transfer_id and t2.status in ('soumise', 'en_transit')
  where l.transfer_id = t.id
  limit 1;
  if found then raise exception 'La bobine % est déjà dans une autre demande en cours.', v_bad; end if;
end;
$$;

-- 1. Le magasinier soumet sa demande
create or replace function public.submit_transfer(p_transfer uuid)
returns void
language plpgsql
as $$
declare
  t public.stock_transfers%rowtype;
begin
  if not public.has_permission('stocks.transfer') then
    raise exception 'Vous n''avez pas le droit de demander un transfert.';
  end if;
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if t.status <> 'brouillon' then raise exception 'Cette demande a déjà été soumise.'; end if;
  perform public.transfer_check_coils(t.id);
  update public.stock_transfer_lines l set quantity_kg = c.remaining_weight_kg
  from public.coils c where c.id = l.coil_id and l.transfer_id = t.id;
  update public.stock_transfers
  set status = 'soumise', submitted_by = auth.uid(), submitted_at = now(),
      decided_by = null, decided_at = null
  where id = t.id;
end;
$$;

-- 2. La direction valide : les bobines passent au dépôt destination
create or replace function public.approve_transfer(p_transfer uuid)
returns int
language plpgsql
as $$
declare
  t   public.stock_transfers%rowtype;
  v_n int;
begin
  if not public.has_permission('stocks.transfer.approve') then
    raise exception 'Seule la direction peut valider une demande de transfert.';
  end if;
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if t.status <> 'soumise' then raise exception 'Cette demande n''est pas en attente de validation.'; end if;
  perform public.transfer_check_coils(t.id);

  update public.coils c set warehouse_id = t.dest_warehouse_id
  from public.stock_transfer_lines l
  where l.transfer_id = t.id and l.coil_id = c.id;
  get diagnostics v_n = row_count;

  update public.stock_transfers
  set status = 'validee', decided_by = auth.uid(), decided_at = now()
  where id = t.id;
  return v_n;
end;
$$;

-- 3. La direction refuse (ou renvoie au magasinier pour correction)
create or replace function public.reject_transfer(p_transfer uuid, p_note text, p_back boolean default false)
returns void
language plpgsql
as $$
declare
  t public.stock_transfers%rowtype;
begin
  if not public.has_permission('stocks.transfer.approve') then
    raise exception 'Seule la direction peut refuser une demande de transfert.';
  end if;
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if t.status <> 'soumise' then raise exception 'Cette demande n''est pas en attente de validation.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Indiquez le motif.'; end if;
  update public.stock_transfers
  set status = case when p_back then 'brouillon' else 'refusee' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
  where id = t.id;
end;
$$;

-- Annulation par le magasinier (avant décision)
create or replace function public.cancel_transfer(p_transfer uuid)
returns void
language plpgsql
as $$
declare
  t public.stock_transfers%rowtype;
begin
  if not public.has_permission('stocks.transfer') then
    raise exception 'Vous n''avez pas le droit d''annuler une demande.';
  end if;
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'Demande introuvable.'; end if;
  if t.status not in ('brouillon', 'soumise') then raise exception 'Cette demande ne peut plus être annulée.'; end if;
  update public.stock_transfers set status = 'annule' where id = t.id;
end;
$$;

-- Les mouvements de stock portent le n° de la demande
create or replace function public.coil_stock_sync()
returns trigger
language plpgsql
as $$
declare
  v_from text;
  v_to   text;
  v_trf  text;
begin
  if tg_op = 'INSERT' then
    if new.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (new.product_id, new.warehouse_id, new.id, new.remaining_weight_kg, new.cost_per_kg,
              case when new.reception_line_id is null then 'inventaire' else 'reception' end,
              'Entrée bobine ' || new.reference, 'coils', new.id);
    end if;

  elsif new.product_id = old.product_id and new.warehouse_id <> old.warehouse_id then
    select code into v_from from public.warehouses where id = old.warehouse_id;
    select code into v_to   from public.warehouses where id = new.warehouse_id;
    select t.number into v_trf
    from public.stock_transfer_lines l join public.stock_transfers t on t.id = l.transfer_id
    where l.coil_id = new.id and t.status in ('soumise', 'en_transit')
    limit 1;
    if old.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (old.product_id, old.warehouse_id, old.id, -old.remaining_weight_kg, old.cost_per_kg, 'transfert',
              coalesce(v_trf || ' — ', '') || 'Transfert bobine ' || old.reference || ' : ' || v_from || ' → ' || v_to, 'coils', old.id);
    end if;
    if new.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (new.product_id, new.warehouse_id, new.id, new.remaining_weight_kg, new.cost_per_kg, 'transfert',
              coalesce(v_trf || ' — ', '') || 'Transfert bobine ' || new.reference || ' : ' || v_from || ' → ' || v_to, 'coils', new.id);
    end if;

  elsif new.product_id <> old.product_id or new.warehouse_id <> old.warehouse_id then
    if old.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (old.product_id, old.warehouse_id, old.id, -old.remaining_weight_kg, old.cost_per_kg,
              'ajustement', 'Correction bobine ' || old.reference, 'coils', old.id);
    end if;
    if new.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (new.product_id, new.warehouse_id, new.id, new.remaining_weight_kg, new.cost_per_kg,
              'ajustement', 'Correction bobine ' || new.reference, 'coils', new.id);
    end if;

  elsif new.remaining_weight_kg <> old.remaining_weight_kg then
    insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
    values (new.product_id, new.warehouse_id, new.id, new.remaining_weight_kg - old.remaining_weight_kg, new.cost_per_kg,
            'ajustement', 'Correction poids bobine ' || new.reference, 'coils', new.id);
  end if;
  return new;
end;
$$;
