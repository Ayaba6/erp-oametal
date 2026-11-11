-- =====================================================================
-- ERP OA Metal — transferts inter-dépôts (alimentation de la production)
-- Modèle A3 ERP en 2 étapes :
--   Brouillon → Expédié (en transit, DEPMP) → Reçu (DEPPROD)
-- Les bobines changent de dépôt à la réception : le stock suit tout seul.
-- À exécuter une seule fois, après 0011.
-- =====================================================================

create table if not exists public.stock_transfers (
  id                  uuid primary key default gen_random_uuid(),
  number              text unique,
  transfer_date       date not null default current_date,
  source_warehouse_id uuid not null references public.warehouses (id),
  dest_warehouse_id   uuid not null references public.warehouses (id),
  type                text not null default 'standard' check (type in ('standard', 'urgent', 'retour', 'regularisation')),
  priority            text not null default 'normale' check (priority in ('basse', 'normale', 'haute', 'urgente')),
  reason              text not null,
  reference           text,
  manager_id          uuid references public.profiles (id),
  comment             text,
  transport_mode      text not null default 'interne' check (transport_mode in ('interne', 'externe')),
  vehicle             text,
  driver              text,
  status              text not null default 'brouillon' check (status in ('brouillon', 'en_transit', 'recu', 'annule')),
  shipped_by          uuid references public.profiles (id),
  shipped_at          timestamptz,
  received_by         uuid references public.profiles (id),
  received_at         timestamptz,
  receive_note        text,
  created_by          uuid default auth.uid() references public.profiles (id),
  created_at          timestamptz not null default now(),
  check (source_warehouse_id <> dest_warehouse_id)
);

drop trigger if exists trg_stock_transfers_number on public.stock_transfers;
create trigger trg_stock_transfers_number before insert on public.stock_transfers
  for each row execute function public.set_document_number('TRF');

-- Une ligne = une bobine transférée en entier
create table if not exists public.stock_transfer_lines (
  id          uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers (id) on delete cascade,
  coil_id     uuid not null references public.coils (id),
  product_id  uuid not null references public.products (id),
  quantity_kg numeric(12,3) not null default 0,
  position    int not null default 0,
  unique (transfer_id, coil_id)
);

do $$
declare t text;
begin
  foreach t in array array['stock_transfers', 'stock_transfer_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "acces utilisateurs actifs" on public.%I', t);
    execute format(
      'create policy "acces utilisateurs actifs" on public.%I for all to authenticated
         using (public.is_active_user()) with check (public.is_active_user())', t);
  end loop;
end;
$$;

-- Permission : réceptionner un transfert au dépôt destinataire (production)
insert into public.permissions (code, group_name, label, sort_order)
values ('stocks.transfer.receive', 'Stocks', 'Réceptionner un transfert', 73)
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r, 'stocks.transfer.receive'
from unnest(array['directeur', 'directeur_usine', 'chef_production', 'chef_atelier', 'responsable_stock', 'magasinier']) r
where exists (select 1 from public.roles where code = r)
on conflict do nothing;

-- Expédition : contrôle des bobines, le transfert passe « en transit »
create or replace function public.ship_transfer(p_transfer uuid)
returns int
language plpgsql
as $$
declare
  t      public.stock_transfers%rowtype;
  v_bad  text;
  v_n    int;
begin
  if not public.has_permission('stocks.transfer') then
    raise exception 'Vous n''avez pas le droit d''expédier un transfert.';
  end if;
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if t.status <> 'brouillon' then raise exception 'Ce transfert a déjà été expédié ou annulé.'; end if;

  select count(*) into v_n from public.stock_transfer_lines where transfer_id = t.id;
  if v_n = 0 then raise exception 'Ajoutez au moins une bobine.'; end if;

  -- Chaque bobine doit être au dépôt expéditeur, disponible, avec du poids restant
  select c.reference into v_bad
  from public.stock_transfer_lines l join public.coils c on c.id = l.coil_id
  where l.transfer_id = t.id
    and (c.warehouse_id <> t.source_warehouse_id or c.status not in ('disponible') or c.remaining_weight_kg <= 0)
  limit 1;
  if found then raise exception 'La bobine % n''est plus disponible au dépôt expéditeur.', v_bad; end if;

  -- … et ne pas être déjà dans un autre transfert en transit
  select c.reference into v_bad
  from public.stock_transfer_lines l
  join public.coils c on c.id = l.coil_id
  join public.stock_transfer_lines l2 on l2.coil_id = l.coil_id and l2.transfer_id <> t.id
  join public.stock_transfers t2 on t2.id = l2.transfer_id and t2.status = 'en_transit'
  where l.transfer_id = t.id
  limit 1;
  if found then raise exception 'La bobine % est déjà dans un transfert en cours.', v_bad; end if;

  -- Poids figé au moment de l'expédition
  update public.stock_transfer_lines l set quantity_kg = c.remaining_weight_kg
  from public.coils c where c.id = l.coil_id and l.transfer_id = t.id;

  update public.stock_transfers
  set status = 'en_transit', shipped_by = auth.uid(), shipped_at = now()
  where id = t.id;
  return v_n;
end;
$$;

-- Réception au dépôt destinataire : les bobines changent de dépôt
create or replace function public.receive_transfer(p_transfer uuid, p_note text default null)
returns int
language plpgsql
as $$
declare
  t   public.stock_transfers%rowtype;
  v_n int;
begin
  if not public.has_permission('stocks.transfer.receive') then
    raise exception 'Vous n''avez pas le droit de réceptionner un transfert.';
  end if;
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if t.status <> 'en_transit' then raise exception 'Ce transfert n''est pas en transit.'; end if;

  -- Le trigger des bobines enregistre la sortie DEPMP et l'entrée DEPPROD
  update public.coils c set warehouse_id = t.dest_warehouse_id
  from public.stock_transfer_lines l
  where l.transfer_id = t.id and l.coil_id = c.id and c.warehouse_id = t.source_warehouse_id;
  get diagnostics v_n = row_count;

  update public.stock_transfers
  set status = 'recu', received_by = auth.uid(), received_at = now(), receive_note = nullif(trim(p_note), '')
  where id = t.id;
  return v_n;
end;
$$;

-- Annulation (avant réception)
create or replace function public.cancel_transfer(p_transfer uuid)
returns void
language plpgsql
as $$
declare
  t public.stock_transfers%rowtype;
begin
  if not public.has_permission('stocks.transfer') then
    raise exception 'Vous n''avez pas le droit d''annuler un transfert.';
  end if;
  select * into t from public.stock_transfers where id = p_transfer for update;
  if not found then raise exception 'Transfert introuvable.'; end if;
  if t.status not in ('brouillon', 'en_transit') then raise exception 'Ce transfert ne peut plus être annulé.'; end if;
  update public.stock_transfers set status = 'annule' where id = t.id;
end;
$$;

-- Libellé des mouvements : on indique le n° du transfert
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
    where l.coil_id = new.id and t.status = 'en_transit'
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
