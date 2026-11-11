-- =====================================================================
-- ERP OA Metal — types de dépôt
--   matiere_premiere : bobines commandées au fournisseur (réception)
--   production       : bobines en transformation + tôles produites
-- À exécuter une seule fois, après 0006.
-- =====================================================================

-- 1. Type de dépôt
alter table public.warehouses
  add column if not exists type  text,
  add column if not exists notes text;

update public.warehouses set type = 'matiere_premiere' where type is null;

alter table public.warehouses
  alter column type set not null,
  drop constraint if exists warehouses_type_check,
  add constraint warehouses_type_check check (type in ('matiere_premiere', 'production'));

-- Un seul dépôt par défaut par type
update public.warehouses set is_default = false where is_default and type <> 'matiere_premiere';
create unique index if not exists warehouses_one_default_per_type
  on public.warehouses (type) where is_default;

-- 2. Les deux dépôts principaux
--    L'ancien « Dépôt principal » devient le dépôt matières premières :
--    les bobines déjà saisies y restent.
update public.warehouses
set code = 'DEPMP', name = 'Dépôt matières premières', type = 'matiere_premiere',
    can_purchase = true, can_production = false, can_sale = false, is_default = true
where code = 'DEPPRI';

insert into public.warehouses (code, name, type, can_purchase, can_production, can_sale, is_default)
values ('DEPMP', 'Dépôt matières premières', 'matiere_premiere', true, false, false, true)
on conflict (code) do nothing;

insert into public.warehouses (code, name, type, can_purchase, can_production, can_sale, is_default)
values ('DEPPROD', 'Dépôt production', 'production', false, true, true, true)
on conflict (code) do nothing;

-- 3. Dépôt par défaut d'un type (réception → matières premières, fabrication → production)
create or replace function public.default_warehouse(p_type text)
returns uuid
language sql
stable
as $$
  select id from public.warehouses
  where type = p_type and is_active
  order by is_default desc, code
  limit 1
$$;

-- 4. Changer une bobine de dépôt = un transfert (sortie d'un dépôt, entrée dans l'autre)
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
              'inventaire', 'Entrée bobine ' || new.reference, 'coils', new.id);
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
