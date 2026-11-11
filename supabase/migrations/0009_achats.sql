-- =====================================================================
-- ERP OA Metal — achats de bobines
--   1. Commande fournisseur (BC) : le directeur liste ses besoins
--   2. Réception (REC) : à l'arrivée sur site, chaque bobine est saisie
--      et vérifiée (conforme / refusée)
--   3. Validation : les bobines conformes entrent en stock au dépôt
--      matières premières, la commande est mise à jour
-- À exécuter une seule fois, après 0008.
-- =====================================================================

-- 1. Commande : nombre de bobines prévu, suivi de confirmation
alter table public.purchase_order_lines
  add column if not exists coils_count int check (coils_count is null or coils_count > 0),
  add column if not exists notes       text;

alter table public.purchase_orders
  add column if not exists confirmed_by uuid references public.profiles (id),
  add column if not exists confirmed_at timestamptz;

-- Total HT de la commande recalculé à chaque changement de ligne
create or replace function public.po_refresh_total()
returns trigger
language plpgsql
as $$
declare
  v_po uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
begin
  update public.purchase_orders
  set total_ht = coalesce((select sum(quantity * unit_price) from public.purchase_order_lines
                           where purchase_order_id = v_po), 0)
  where id = v_po;
  return null;
end;
$$;

drop trigger if exists trg_po_lines_total on public.purchase_order_lines;
create trigger trg_po_lines_total
  after insert or update or delete on public.purchase_order_lines
  for each row execute function public.po_refresh_total();

-- 2. Réception : une ligne = une bobine physique, avec sa vérification
alter table public.reception_lines
  add column if not exists coil_reference   text,          -- N° bobine OA (BO-OA-xxxx)
  add column if not exists supplier_coil_no text,
  add column if not exists thickness_mm     numeric(6,3),
  add column if not exists width_mm         numeric(8,2),
  add column if not exists gross_weight_kg  numeric(12,3),
  add column if not exists length_m         numeric(12,2),
  add column if not exists quality_note     text;

-- Une bobine saisie est « à vérifier » tant qu'on ne l'a pas contrôlée
alter table public.reception_lines alter column quality_status set default 'en_attente';

-- 3. Les entrées de bobines issues d'une réception sont typées « réception »
create or replace function public.coil_stock_sync()
returns trigger
language plpgsql
as $$
declare
  v_from text;
  v_to   text;
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
    if old.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (old.product_id, old.warehouse_id, old.id, -old.remaining_weight_kg, old.cost_per_kg,
              'transfert', 'Transfert bobine ' || old.reference || ' : ' || v_from || ' → ' || v_to, 'coils', old.id);
    end if;
    if new.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (new.product_id, new.warehouse_id, new.id, new.remaining_weight_kg, new.cost_per_kg,
              'transfert', 'Transfert bobine ' || new.reference || ' : ' || v_from || ' → ' || v_to, 'coils', new.id);
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

-- 4. Validation d'une réception : entrée en stock des bobines conformes
create or replace function public.validate_reception(p_reception uuid)
returns int
language plpgsql
as $$
declare
  r       public.receptions%rowtype;
  l       record;
  v_count int := 0;
  v_ref   text;
begin
  if not public.has_permission('receptions.validate') then
    raise exception 'Vous n''avez pas le droit de valider une réception.';
  end if;

  select * into r from public.receptions where id = p_reception for update;
  if not found then raise exception 'Réception introuvable.'; end if;
  if r.status <> 'brouillon' then raise exception 'Cette réception est déjà validée ou annulée.'; end if;
  if not exists (select 1 from public.reception_lines where reception_id = r.id) then
    raise exception 'Aucune bobine saisie sur cette réception.';
  end if;
  if exists (select 1 from public.reception_lines where reception_id = r.id and quality_status in ('en_attente', 'quarantaine')) then
    raise exception 'Toutes les bobines doivent être vérifiées (conforme ou refusée) avant validation.';
  end if;

  -- Numéros de bobine : doublons interdits
  select coalesce(l2.coil_reference, '') into v_ref
  from public.reception_lines l2
  where l2.reception_id = r.id and l2.quality_status = 'libere'
    and (l2.coil_reference is null or trim(l2.coil_reference) = ''
         or exists (select 1 from public.coils c where upper(c.reference) = upper(trim(l2.coil_reference))))
  limit 1;
  if found then
    raise exception 'Numéro de bobine manquant ou déjà utilisé : %', nullif(v_ref, '');
  end if;

  for l in
    select * from public.reception_lines where reception_id = r.id and quality_status = 'libere'
  loop
    insert into public.coils (reference, product_id, reception_line_id, supplier_id, warehouse_id,
                              thickness_mm, width_mm, initial_weight_kg, remaining_weight_kg,
                              gross_weight_kg, length_m, cost_per_kg, lot_number, supplier_coil_no,
                              received_at, status)
    values (upper(trim(l.coil_reference)), l.product_id, l.id, r.supplier_id, r.warehouse_id,
            l.thickness_mm, l.width_mm, l.quantity, l.quantity,
            l.gross_weight_kg, l.length_m, l.unit_cost, l.lot_number, l.supplier_coil_no,
            r.received_at, 'disponible');
    v_count := v_count + 1;
  end loop;

  -- Quantités reçues sur la commande
  update public.purchase_order_lines pol
  set received_qty = pol.received_qty + x.kg
  from (select po_line_id, sum(quantity) as kg from public.reception_lines
        where reception_id = r.id and quality_status = 'libere' and po_line_id is not null
        group by po_line_id) x
  where pol.id = x.po_line_id;

  if r.purchase_order_id is not null then
    update public.purchase_orders po
    set status = case
      when not exists (select 1 from public.purchase_order_lines
                       where purchase_order_id = po.id and received_qty < quantity) then 'recue'
      when exists (select 1 from public.purchase_order_lines
                   where purchase_order_id = po.id and received_qty > 0) then 'partiellement_recue'
      else po.status end
    where po.id = r.purchase_order_id and po.status not in ('annulee', 'recue');
  end if;

  update public.receptions
  set status = 'validee', validated_by = auth.uid(), validated_at = now()
  where id = r.id;

  return v_count;
end;
$$;
