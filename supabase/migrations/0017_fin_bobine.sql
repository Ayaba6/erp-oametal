-- 0017 — Fiche fin de bobine (même contenu que la fiche papier OAMI « FICHE FIN DE BOBINE — OPÉRATEUR »)
--
-- Circuit :
--   1. Le magasinier crée la fiche pour une bobine terminée : en-tête repris de la bobine,
--      historique d'utilisation (une ligne par poste, pré-rempli depuis les OF confirmés),
--      contrôle visuel, reste / chutes / ml produits.                     statut : brouillon
--   2. Il la soumet à la direction.                                          statut : soumise
--   3. La direction valide (ou renvoie au magasinier avec un motif).        statut : validee
--      La validation clôture la bobine : le poids restant est sorti du stock
--      (mouvement « Perte » libellé avec le n° FDB) et la bobine passe « Épuisée ».

-- ---------------------------------------------------------------------
-- 1. Permissions
-- ---------------------------------------------------------------------
insert into public.permissions (code, group_name, label, sort_order)
values ('stocks.coil_end', 'Stocks', 'Établir une fiche fin de bobine', 75),
       ('stocks.coil_end.approve', 'Stocks', 'Valider une fiche fin de bobine (direction)', 76)
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r, 'stocks.coil_end' from unnest(array['magasinier', 'responsable_stock', 'chef_production', 'directeur', 'directeur_usine']) r
where exists (select 1 from public.roles where code = r)
on conflict do nothing;
insert into public.role_permissions (role_code, permission_code)
select r, 'stocks.coil_end.approve' from unnest(array['directeur', 'directeur_usine']) r
where exists (select 1 from public.roles where code = r)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
create table if not exists public.coil_end_reports (
  id                    uuid primary key default gen_random_uuid(),
  number                text unique,
  coil_id               uuid not null references public.coils (id),
  machine               text,
  supplier_name         text,
  color                 text,
  thickness_mm          numeric(6,3),
  width_mm              numeric(8,2),
  label_weight_kg       numeric(12,3),
  started_on            date,
  ended_on              date not null default current_date,
  -- contrôle visuel (true = Oui, défaut constaté)
  defect_rust           boolean not null default false,
  defect_paint          boolean not null default false,
  defect_edges          boolean not null default false,
  defect_deformed       boolean not null default false,
  defect_other          boolean not null default false,
  defect_other_text     text,
  -- fin de bobine
  remaining_kg          numeric(12,3) not null default 0,   -- reste / queue de bobine
  measured_thickness_mm numeric(6,3),
  total_ml              numeric(14,3) not null default 0,
  total_scrap_kg        numeric(12,3) not null default 0,
  to_report             boolean not null default false,     -- bobine à signaler
  notes                 text,
  operator_names        text,
  team_leader           text,
  status                text not null default 'brouillon' check (status in ('brouillon', 'soumise', 'validee', 'annulee')),
  decision_note         text,
  submitted_by          uuid references public.profiles (id),
  submitted_at          timestamptz,
  decided_by            uuid references public.profiles (id),
  decided_at            timestamptz,
  is_test               boolean not null default false,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
drop trigger if exists trg_coil_end_reports_number on public.coil_end_reports;
create trigger trg_coil_end_reports_number before insert on public.coil_end_reports
  for each row execute function public.set_document_number('FDB');
-- une seule fiche active par bobine
create unique index if not exists coil_end_reports_one_active on public.coil_end_reports (coil_id) where status <> 'annulee';

create table if not exists public.coil_end_report_lines (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references public.coil_end_reports (id) on delete cascade,
  position            int not null default 1,
  used_on             date,
  shift               text,           -- poste
  sheet_no            text,           -- n° fiche opérateur
  ml_produced         numeric(14,3) not null default 0,
  scrap_kg            numeric(12,3) not null default 0,
  operator            text,
  notes               text,
  production_order_id uuid references public.production_orders (id)
);
create index if not exists coil_end_report_lines_report on public.coil_end_report_lines (report_id);

alter table public.coil_end_reports enable row level security;
alter table public.coil_end_report_lines enable row level security;
drop policy if exists "acces utilisateurs actifs" on public.coil_end_reports;
drop policy if exists "acces utilisateurs actifs" on public.coil_end_report_lines;
create policy "acces utilisateurs actifs" on public.coil_end_reports for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy "acces utilisateurs actifs" on public.coil_end_report_lines for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- Une fiche soumise ou validée ne se modifie plus (sauf par les fonctions de décision)
create or replace function public.coil_end_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  if current_setting('app.coil_end_decision', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_table_name = 'coil_end_reports' then
    v_status := case when tg_op = 'INSERT' then 'brouillon' else old.status end;
  else
    select status into v_status from public.coil_end_reports
    where id = case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  end if;
  if v_status <> 'brouillon' then
    raise exception 'Cette fiche fin de bobine est soumise ou validée : elle ne peut plus être modifiée.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists trg_coil_end_guard on public.coil_end_reports;
create trigger trg_coil_end_guard before update or delete on public.coil_end_reports
  for each row execute function public.coil_end_guard();
drop trigger if exists trg_coil_end_lines_guard on public.coil_end_report_lines;
create trigger trg_coil_end_lines_guard before insert or update or delete on public.coil_end_report_lines
  for each row execute function public.coil_end_guard();

-- ---------------------------------------------------------------------
-- 3. Mouvements de bobines : consommation OF (production_sortie) et fin de bobine (perte)
-- ---------------------------------------------------------------------
create or replace function public.coil_stock_sync()
returns trigger
language plpgsql
as $$
declare
  v_from text;
  v_to   text;
  v_trf  text;
  v_of   text := nullif(current_setting('app.coil_of', true), '');
  v_fdb  text := nullif(current_setting('app.coil_fdb', true), '');
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
            case when v_fdb is not null then 'perte' when v_of is not null then 'production_sortie' else 'ajustement' end,
            case when v_fdb is not null then v_fdb
                 when v_of is not null then v_of || ' — Consommation bobine ' || new.reference
                 else 'Correction poids bobine ' || new.reference end,
            'coils', new.id);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Historique proposé : ml produits par OF confirmé ayant consommé la bobine
--    (si un OF a utilisé plusieurs bobines, les ml sont répartis au prorata des kg)
-- ---------------------------------------------------------------------
create or replace function public.coil_usage_history(p_coil uuid)
returns table (production_order_id uuid, used_on date, sheet_no text, operator text, line_code text, ml numeric, kg numeric)
language sql
stable
as $$
  select po.id,
         coalesce(po.finished_at, po.confirmed_at, po.created_at)::date,
         po.number,
         po.operator_name,
         pl.code,
         round((select coalesce(sum(l.produced_qty + l.damaged_qty), 0) from public.production_order_lines l where l.production_order_id = po.id)
               * a.weight_kg / nullif((select sum(x.weight_kg) from public.coil_allocations x where x.production_order_id = po.id), 0), 2),
         a.weight_kg
  from public.coil_allocations a
  join public.production_orders po on po.id = a.production_order_id
  left join public.production_lines pl on pl.id = po.production_line_id
  where a.coil_id = p_coil and po.status = 'confirme'
  order by 2, 3
$$;

-- ---------------------------------------------------------------------
-- 5. Soumission, renvoi, validation, annulation
-- ---------------------------------------------------------------------
create or replace function public.submit_coil_end(p_report uuid)
returns void
language plpgsql
as $$
declare
  r public.coil_end_reports%rowtype;
begin
  if not public.has_permission('stocks.coil_end') then
    raise exception 'Vous n''avez pas le droit d''établir une fiche fin de bobine.';
  end if;
  select * into r from public.coil_end_reports where id = p_report for update;
  if r.status <> 'brouillon' then raise exception 'Cette fiche a déjà été soumise.'; end if;
  if r.remaining_kg < 0 or r.total_scrap_kg < 0 then raise exception 'Le reste et les chutes ne peuvent pas être négatifs.'; end if;
  if not exists (select 1 from public.coil_end_report_lines where report_id = p_report) then
    raise exception 'Ajoutez au moins une ligne à l''historique d''utilisation.';
  end if;
  perform set_config('app.coil_end_decision', 'on', true);
  update public.coil_end_reports
  set status = 'soumise', submitted_by = auth.uid(), submitted_at = now(), decision_note = null, updated_at = now(),
      total_ml = (select coalesce(sum(ml_produced), 0) from public.coil_end_report_lines where report_id = p_report),
      total_scrap_kg = greatest(total_scrap_kg, (select coalesce(sum(scrap_kg), 0) from public.coil_end_report_lines where report_id = p_report))
  where id = p_report;
  perform set_config('app.coil_end_decision', '', true);
end;
$$;

create or replace function public.return_coil_end(p_report uuid, p_note text)
returns void
language plpgsql
as $$
begin
  if not public.has_permission('stocks.coil_end.approve') then
    raise exception 'Seule la direction peut renvoyer une fiche fin de bobine.';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Indiquez le motif du renvoi.'; end if;
  perform set_config('app.coil_end_decision', 'on', true);
  update public.coil_end_reports set status = 'brouillon', decision_note = trim(p_note), updated_at = now()
  where id = p_report and status = 'soumise';
  if not found then raise exception 'Cette fiche n''est pas en attente de validation.'; end if;
  perform set_config('app.coil_end_decision', '', true);
end;
$$;

create or replace function public.validate_coil_end(p_report uuid)
returns void
language plpgsql
as $$
declare
  r public.coil_end_reports%rowtype;
  c public.coils%rowtype;
begin
  if not public.has_permission('stocks.coil_end.approve') then
    raise exception 'Seule la direction peut valider une fiche fin de bobine.';
  end if;
  select * into r from public.coil_end_reports where id = p_report for update;
  if r.status <> 'soumise' then raise exception 'Cette fiche n''est pas en attente de validation.'; end if;
  select * into c from public.coils where id = r.coil_id for update;

  -- clôture de la bobine : le poids encore en stock sort (reste + chutes + écart)
  if c.remaining_weight_kg <> 0 then
    perform set_config('app.coil_fdb',
      r.number || ' — Fin de bobine ' || c.reference || ' (reste ' || trim(to_char(r.remaining_kg, 'FM999G990D0')) ||
      ' kg, chutes ' || trim(to_char(r.total_scrap_kg, 'FM999G990D0')) || ' kg)', true);
    update public.coils set remaining_weight_kg = 0, status = 'epuisee' where id = c.id;
    perform set_config('app.coil_fdb', '', true);
  else
    update public.coils set status = 'epuisee' where id = c.id;
  end if;

  perform set_config('app.coil_end_decision', 'on', true);
  update public.coil_end_reports set status = 'validee', decided_by = auth.uid(), decided_at = now(), updated_at = now()
  where id = p_report;
  perform set_config('app.coil_end_decision', '', true);
end;
$$;

create or replace function public.cancel_coil_end(p_report uuid)
returns void
language plpgsql
as $$
begin
  if not public.has_permission('stocks.coil_end') then
    raise exception 'Vous n''avez pas le droit d''annuler cette fiche.';
  end if;
  perform set_config('app.coil_end_decision', 'on', true);
  update public.coil_end_reports set status = 'annulee', updated_at = now()
  where id = p_report and status in ('brouillon', 'soumise');
  if not found then raise exception 'Cette fiche ne peut plus être annulée.'; end if;
  perform set_config('app.coil_end_decision', '', true);
end;
$$;
