-- 0016 — Production : ordre de fabrication (OF) à partir d'une commande client
--
-- Circuit :
--   1. Commande confirmée (et payée si le client paie avant production) → « Créer l'OF »
--      L'OF reprend les tôles / faîtières de la commande.            statut : cree
--   2. Le magasinier imprime la fiche opérateur et la remet au chef opérateur.
--                                                                     statut : en_production
--   3. Fin de production : le magasinier vérifie chaque ligne (coche l'exactitude),
--      saisit les tôles bonnes et avariées, les bobines consommées, puis soumet.
--                                                                     statut : soumis
--   4. La direction confirme (ou renvoie au magasinier).              statut : confirme
--      La confirmation :
--        - entre les tôles bonnes au dépôt de l'OF (DEPPROD),
--        - entre les tôles avariées au dépôt Magasin (DEPMAG),
--        - sort les kg de bobines consommés,
--        - crée le bon de livraison (brouillon) envoyé au magasinier,
--        - crée un OF complémentaire pour les tôles manquantes (avariées / non produites).
--
-- Règle de paiement (fiche client › Commercial › Mode de règlement) :
--   comptant → commande payée à 100 % ; acompte → payée au moins au taux
--   « deposit_rate_before_production » de la société ; crédit (paie après livraison) → aucun paiement exigé.

-- ---------------------------------------------------------------------
-- 1. Permission « confirmer la production » (direction)
-- ---------------------------------------------------------------------
insert into public.permissions (code, group_name, label, sort_order)
values ('production.approve', 'Production', 'Confirmer la production (direction)', 90)
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r, 'production.approve' from unnest(array['directeur', 'directeur_usine']) r
on conflict do nothing;

-- Le magasinier crée l'OF, imprime la fiche et vérifie la production
insert into public.role_permissions (role_code, permission_code)
select r, p from unnest(array['magasinier', 'responsable_stock']) r,
                 unnest(array['production.view', 'production.create', 'production.launch', 'production.declare']) p
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2. OF = une commande, plusieurs lignes
-- ---------------------------------------------------------------------
alter table public.production_orders
  alter column product_id drop not null,
  alter column quantity drop not null;
alter table public.production_orders drop constraint if exists production_orders_quantity_check;
alter table public.production_orders drop constraint if exists production_orders_status_check;
update public.production_orders set status = 'cree' where status in ('brouillon', 'autorise', 'matiere_allouee');
update public.production_orders set status = 'en_production' where status in ('en_cours', 'suspendu');
update public.production_orders set status = 'confirme' where status = 'termine';
alter table public.production_orders
  add constraint production_orders_status_check
  check (status in ('cree', 'en_production', 'soumis', 'confirme', 'annule'));
alter table public.production_orders alter column status set default 'cree';

alter table public.production_orders
  add column if not exists client_id       uuid references public.clients (id),
  add column if not exists parent_id       uuid references public.production_orders (id),
  add column if not exists operator_name   text,
  add column if not exists printed_at      timestamptz,
  add column if not exists submitted_by    uuid references public.profiles (id),
  add column if not exists submitted_at    timestamptz,
  add column if not exists confirmed_by    uuid references public.profiles (id),
  add column if not exists confirmed_at    timestamptz,
  add column if not exists decision_note   text,
  add column if not exists cancel_reason   text,
  add column if not exists delivery_id     uuid references public.deliveries (id),
  add column if not exists updated_at      timestamptz not null default now();

create table if not exists public.production_order_lines (
  id                  uuid primary key default gen_random_uuid(),
  production_order_id uuid not null references public.production_orders (id) on delete cascade,
  order_line_id       uuid references public.document_lines (id),
  position            int not null default 1,
  product_id          uuid not null references public.products (id),
  description         text not null,
  sheets_count        int,
  length_m            numeric(10,3),
  quantity            numeric(14,3) not null check (quantity > 0),   -- à produire (ml ou unités)
  produced_sheets     int,
  produced_qty        numeric(14,3) not null default 0,              -- bonnes
  damaged_sheets      int,
  damaged_qty         numeric(14,3) not null default 0,              -- avariées
  is_checked          boolean not null default false,                -- exactitude cochée par le magasinier
  notes               text
);
create index if not exists production_order_lines_of on public.production_order_lines (production_order_id);
alter table public.production_order_lines enable row level security;
drop policy if exists "acces utilisateurs actifs" on public.production_order_lines;
create policy "acces utilisateurs actifs" on public.production_order_lines for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- Bobines consommées (coil_allocations existe déjà : production_order_id, coil_id, weight_kg)
alter table public.deliveries add column if not exists production_order_id uuid references public.production_orders (id);

-- ---------------------------------------------------------------------
-- 3. Mouvements de bobines : la consommation porte le n° d'OF
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
            case when v_of is not null then 'production_sortie' else 'ajustement' end,
            case when v_of is not null then v_of || ' — Consommation bobine ' || new.reference
                 else 'Correction poids bobine ' || new.reference end,
            'coils', new.id);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. La commande peut-elle passer en production ?  (renvoie null si oui, sinon la raison)
-- ---------------------------------------------------------------------
create or replace function public.order_production_block(p_order uuid)
returns text
language plpgsql
stable
as $$
declare
  o      public.sales_orders%rowtype;
  v_mode text;
  v_rate numeric;
begin
  select * into o from public.sales_orders where id = p_order;
  if not found then return 'Commande introuvable.'; end if;
  if o.status not in ('confirmee', 'en_production', 'partiellement_livree', 'facturee') then
    return 'La commande doit être confirmée.';
  end if;
  select payment_mode into v_mode from public.clients where id = o.client_id;
  if v_mode = 'credit' then return null; end if;            -- paie après livraison
  if v_mode = 'acompte' then
    select coalesce(deposit_rate_before_production, 100) into v_rate from public.company where id = 1;
  else
    v_rate := 100;                                           -- comptant : payée en totalité
  end if;
  if o.amount_paid + 0.5 < round(o.total_ttc * v_rate / 100, 0) then
    return format('Client payant avant production : il faut %s %% de la commande encaissé (%s F requis, %s F encaissé).',
                  trim(to_char(v_rate, 'FM990D##')), to_char(round(o.total_ttc * v_rate / 100, 0), 'FM999G999G999'),
                  to_char(o.amount_paid, 'FM999G999G999'));
  end if;
  return null;
end;
$$;

-- Quantité d'une ligne de commande déjà prise : OF en cours + BL brouillons (les BL validés sont dans delivered_qty)
create or replace function public.order_line_in_production(p_line uuid)
returns numeric
language sql
stable
as $$
  select coalesce((select sum(l.quantity)
                   from public.production_order_lines l
                   join public.production_orders po on po.id = l.production_order_id
                   where l.order_line_id = p_line and po.status in ('cree', 'en_production', 'soumis')), 0)
       + coalesce((select sum(x.quantity)
                   from public.document_lines x
                   join public.deliveries d on d.id = x.delivery_id
                   where x.source_line_id = p_line and d.status = 'brouillon'), 0)
$$;

-- ---------------------------------------------------------------------
-- 5. Créer l'OF depuis la commande
-- ---------------------------------------------------------------------
create or replace function public.create_production_order(p_order uuid)
returns uuid
language plpgsql
as $$
declare
  o       public.sales_orders%rowtype;
  v_block text;
  v_of    uuid;
  v_wh    uuid;
  l       record;
  v_left  numeric;
  v_n     int := 0;
begin
  if not public.has_permission('production.create') then
    raise exception 'Vous n''avez pas le droit de créer un ordre de fabrication.';
  end if;
  select * into o from public.sales_orders where id = p_order for update;
  v_block := public.order_production_block(p_order);
  if v_block is not null then raise exception '%', v_block; end if;
  if exists (select 1 from public.production_orders where order_id = p_order and status in ('cree', 'en_production', 'soumis')) then
    raise exception 'Un ordre de fabrication est déjà en cours pour cette commande.';
  end if;

  -- dépôt de production : celui de la commande s'il produit, sinon le dépôt production par défaut
  select id into v_wh from public.warehouses where id = o.warehouse_id and can_production;
  if v_wh is null then
    select id into v_wh from public.warehouses where can_production and is_active order by (type = 'production') desc, code limit 1;
  end if;
  if v_wh is null then raise exception 'Aucun dépôt de production n''est défini.'; end if;

  insert into public.production_orders (order_id, client_id, warehouse_id, status, planned_date, is_test)
  values (o.id, o.client_id, v_wh, 'cree', coalesce(o.delivery_date, current_date), o.is_test)
  returning id into v_of;

  for l in
    select dl.*, p.kind from public.document_lines dl join public.products p on p.id = dl.product_id
    where dl.order_id = o.id and p.kind in ('tole', 'faitiere')
    order by dl.position
  loop
    v_left := l.quantity - l.delivered_qty - public.order_line_in_production(l.id);
    if v_left > 0.0005 then
      v_n := v_n + 1;
      insert into public.production_order_lines (production_order_id, order_line_id, position, product_id, description, sheets_count, length_m, quantity)
      values (v_of, l.id, v_n, l.product_id, l.description,
              case when l.length_m > 0 then round(v_left / l.length_m)::int else l.sheets_count end,
              l.length_m, v_left);
    end if;
  end loop;
  if v_n = 0 then raise exception 'Il ne reste aucune tôle à produire pour cette commande.'; end if;

  update public.sales_orders set status = case when status = 'confirmee' then 'en_production' else status end, updated_at = now()
  where id = o.id;
  return v_of;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Fiche opérateur imprimée / remise au chef opérateur
-- ---------------------------------------------------------------------
create or replace function public.launch_production(p_of uuid, p_operator text, p_line uuid)
returns void
language plpgsql
as $$
declare
  po public.production_orders%rowtype;
begin
  if not public.has_permission('production.launch') then
    raise exception 'Vous n''avez pas le droit de lancer la production.';
  end if;
  select * into po from public.production_orders where id = p_of for update;
  if po.status not in ('cree', 'en_production') then raise exception 'Cet OF n''est plus modifiable.'; end if;
  update public.production_orders
  set status = 'en_production',
      operator_name = coalesce(nullif(trim(p_operator), ''), operator_name),
      production_line_id = coalesce(p_line, production_line_id),
      printed_at = coalesce(printed_at, now()),
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_of;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Vérification du magasinier → soumission à la direction
-- ---------------------------------------------------------------------
create or replace function public.submit_production(p_of uuid)
returns void
language plpgsql
as $$
declare
  po public.production_orders%rowtype;
  l  record;
begin
  if not public.has_permission('production.declare') then
    raise exception 'Vous n''avez pas le droit de déclarer la production.';
  end if;
  select * into po from public.production_orders where id = p_of for update;
  if po.status <> 'en_production' then raise exception 'L''OF doit être en production pour être soumis.'; end if;
  for l in select * from public.production_order_lines where production_order_id = p_of loop
    if not l.is_checked then raise exception 'Cochez l''exactitude de la ligne « % » avant de soumettre.', l.description; end if;
    if l.produced_qty < 0 or l.damaged_qty < 0 then raise exception 'Quantités négatives sur « % ».', l.description; end if;
  end loop;
  if not exists (select 1 from public.production_order_lines where production_order_id = p_of and produced_qty > 0) then
    raise exception 'Aucune tôle bonne déclarée.';
  end if;
  update public.production_orders
  set status = 'soumis', submitted_by = auth.uid(), submitted_at = now(), finished_at = now(), decision_note = null, updated_at = now()
  where id = p_of;
end;
$$;

-- La direction renvoie au magasinier
create or replace function public.return_production(p_of uuid, p_note text)
returns void
language plpgsql
as $$
begin
  if not public.has_permission('production.approve') then
    raise exception 'Seule la direction peut renvoyer un OF.';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Indiquez le motif du renvoi.'; end if;
  update public.production_orders set status = 'en_production', decision_note = trim(p_note), updated_at = now()
  where id = p_of and status = 'soumis';
  if not found then raise exception 'Cet OF n''est pas en attente de confirmation.'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Confirmation par la direction : stock, bobines, BL, OF complémentaire
-- ---------------------------------------------------------------------
create or replace function public.confirm_production(p_of uuid)
returns uuid
language plpgsql
as $$
declare
  po      public.production_orders%rowtype;
  o       public.sales_orders%rowtype;
  l       record;
  a       record;
  v_mag   uuid;
  v_bl    uuid;
  v_new   uuid;
  v_pos   int := 0;
  v_npos  int := 0;
  v_left  numeric;
  v_qty   numeric;
  v_miss  numeric;
begin
  if not public.has_permission('production.approve') then
    raise exception 'Seule la direction peut confirmer la production.';
  end if;
  select * into po from public.production_orders where id = p_of for update;
  if not found then raise exception 'OF introuvable.'; end if;
  if po.status <> 'soumis' then raise exception 'Cet OF n''est pas en attente de confirmation.'; end if;
  select * into o from public.sales_orders where id = po.order_id;
  select id into v_mag from public.warehouses where code = 'DEPMAG';

  -- a) Entrées en stock : bonnes au dépôt de l'OF, avariées au magasin
  for l in select * from public.production_order_lines where production_order_id = p_of order by position loop
    if l.produced_qty > 0 then
      insert into public.stock_movements (product_id, warehouse_id, quantity, type, reason, source_table, source_id, is_test)
      values (l.product_id, po.warehouse_id, l.produced_qty, 'production_entree', po.number || ' — Production ' || l.description, 'production_orders', po.id, po.is_test);
    end if;
    if l.damaged_qty > 0 then
      insert into public.stock_movements (product_id, warehouse_id, quantity, type, reason, source_table, source_id, is_test)
      values (l.product_id, coalesce(v_mag, po.warehouse_id), l.damaged_qty, 'production_entree', po.number || ' — Avariés ' || l.description, 'production_orders', po.id, po.is_test);
    end if;
  end loop;

  -- b) Consommation des bobines
  perform set_config('app.coil_of', po.number, true);
  for a in select ca.*, c.remaining_weight_kg, c.reference from public.coil_allocations ca join public.coils c on c.id = ca.coil_id
           where ca.production_order_id = p_of loop
    if a.weight_kg > a.remaining_weight_kg + 0.001 then
      raise exception 'La bobine % n''a que % kg restants (% kg déclarés).', a.reference, a.remaining_weight_kg, a.weight_kg;
    end if;
    update public.coils set remaining_weight_kg = remaining_weight_kg - a.weight_kg where id = a.coil_id;
  end loop;
  perform set_config('app.coil_of', '', true);

  -- c) Bon de livraison (brouillon) pour les tôles bonnes, envoyé au magasinier
  if o.id is not null then
    insert into public.deliveries (order_id, client_id, warehouse_id, production_order_id, notes, is_test)
    values (o.id, o.client_id, po.warehouse_id, po.id, 'Production ' || po.number, o.is_test)
    returning id into v_bl;
    for l in select pl.*, dl.quantity as ordered, dl.delivered_qty, dl.unit_price, dl.discount_pct, dl.vat_rate
             from public.production_order_lines pl left join public.document_lines dl on dl.id = pl.order_line_id
             where pl.production_order_id = p_of and pl.produced_qty > 0 order by pl.position loop
      v_left := coalesce(l.ordered - l.delivered_qty
                 - coalesce((select sum(x.quantity) from public.document_lines x join public.deliveries d on d.id = x.delivery_id
                             where x.source_line_id = l.order_line_id and d.status = 'brouillon' and d.id <> v_bl), 0), l.produced_qty);
      v_qty := least(l.produced_qty, greatest(v_left, 0));
      if v_qty > 0.0005 then
        v_pos := v_pos + 1;
        insert into public.document_lines (delivery_id, source_line_id, position, product_id, description, sheets_count, length_m, quantity, unit_price, discount_pct, vat_rate)
        values (v_bl, l.order_line_id, v_pos, l.product_id, l.description,
                case when l.length_m > 0 then round(v_qty / l.length_m)::int else l.produced_sheets end,
                l.length_m, v_qty, coalesce(l.unit_price, 0), coalesce(l.discount_pct, 0), coalesce(l.vat_rate, 18));
      end if;
    end loop;
    if v_pos = 0 then
      delete from public.deliveries where id = v_bl;
      v_bl := null;
    end if;
  end if;

  -- d) OF complémentaire pour ce qui manque (avariés ou non produit)
  for l in select * from public.production_order_lines where production_order_id = p_of order by position loop
    v_miss := l.quantity - l.produced_qty;
    if v_miss > 0.0005 then
      if v_new is null then
        insert into public.production_orders (order_id, client_id, warehouse_id, status, parent_id, planned_date, notes, is_test)
        values (po.order_id, po.client_id, po.warehouse_id, 'cree', po.id, current_date,
                'Complément de ' || po.number || ' (tôles avariées ou manquantes)', po.is_test)
        returning id into v_new;
      end if;
      v_npos := v_npos + 1;
      insert into public.production_order_lines (production_order_id, order_line_id, position, product_id, description, sheets_count, length_m, quantity)
      values (v_new, l.order_line_id, v_npos, l.product_id, l.description,
              case when l.length_m > 0 then round(v_miss / l.length_m)::int else null end, l.length_m, v_miss);
    end if;
  end loop;

  update public.production_orders
  set status = 'confirme', confirmed_by = auth.uid(), confirmed_at = now(), delivery_id = v_bl,
      produced_qty = (select coalesce(sum(produced_qty), 0) from public.production_order_lines where production_order_id = p_of),
      updated_at = now()
  where id = p_of;
  return v_bl;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Annulation (avant confirmation)
-- ---------------------------------------------------------------------
create or replace function public.cancel_production(p_of uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  po public.production_orders%rowtype;
begin
  if not public.has_permission('production.cancel') and not public.has_permission('production.approve') then
    raise exception 'Vous n''avez pas le droit d''annuler un OF.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indiquez le motif de l''annulation.'; end if;
  select * into po from public.production_orders where id = p_of for update;
  if po.status not in ('cree', 'en_production', 'soumis') then raise exception 'Cet OF ne peut plus être annulé.'; end if;
  delete from public.coil_allocations where production_order_id = p_of and po.status <> 'soumis';
  update public.production_orders set status = 'annule', cancel_reason = trim(p_reason), updated_at = now() where id = p_of;
  -- la commande revient à « confirmée » s'il n'y a plus d'OF actif ni de livraison
  update public.sales_orders s set status = 'confirmee', updated_at = now()
  where s.id = po.order_id and s.status = 'en_production'
    and not exists (select 1 from public.production_orders x where x.order_id = s.id and x.status in ('cree', 'en_production', 'soumis', 'confirme'));
end;
$$;

-- Le magasinier ne modifie les lignes et les bobines que pendant la production
create or replace function public.production_lines_guard()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.production_orders
  where id = case when tg_op = 'DELETE' then old.production_order_id else new.production_order_id end;
  if v_status is not null and v_status not in ('cree', 'en_production') then
    raise exception 'Cet OF est soumis ou clôturé : il ne peut plus être modifié.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists trg_production_lines_guard on public.production_order_lines;
create trigger trg_production_lines_guard before insert or update or delete on public.production_order_lines
  for each row execute function public.production_lines_guard();
drop trigger if exists trg_coil_allocations_guard on public.coil_allocations;
create trigger trg_coil_allocations_guard before insert or update or delete on public.coil_allocations
  for each row execute function public.production_lines_guard();
