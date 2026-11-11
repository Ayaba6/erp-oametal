-- =====================================================================
-- ERP OA Metal — bobines physiques (liste des bobines OA)
-- + code RAL sur les articles et catalogue aligné sur les bobines réelles.
-- À exécuter une seule fois, après 0004 (et 0005 si tu l'as exécuté).
-- =====================================================================

-- 1. Code RAL sur les articles prélaqués
alter table public.products add column if not exists ral text;

-- 2. Catalogue des bobines aligné sur la liste réelle (codes MPTBC0001 à 0005)
do $$
declare
  cat uuid := (select id from public.categories where code = 'MPTBC');
  kg  uuid := (select id from public.units where code = 'KG');
  r record;
begin
  for r in
    select * from (values
      ('BOB-PL-VE-030', 'MPTBC0001', 'BOBINE DE TOLE PRELAQUE VERTE RAL6005 0.30 mm',          'prelaquee', 'Verte',          '6005'),
      ('BOB-PL-BL-030', 'MPTBC0002', 'BOBINE DE TOLE PRELAQUE BLEUE RAL5017 0.30 mm',          'prelaquee', 'Bleue',          '5017'),
      ('BOB-PL-RB-030', 'MPTBC0003', 'BOBINE DE TOLE PRELAQUE ROUGE BORDEAU RAL3011 0.30 mm',  'prelaquee', 'Rouge bordeaux', '3011'),
      ('BOB-PL-OR-030', 'MPTBC0004', 'BOBINE DE TOLE PRELAQUE ORANGE RAL2009 0.30 mm',         'prelaquee', 'Orange',         '2009'),
      ('BOB-GA-030',    'MPTBC0005', 'BOBINE DE TOLE GALVA 0.30 mm',                           'galva',     null,             null)
    ) as t(old_code, code, name, finish, color, ral)
  loop
    -- Renomme l'article créé par 0005 s'il existe, sinon le crée
    update public.products
       set code = r.code, name = r.name, ral = r.ral, width_mm = 1000, thickness_mm = 0.30
     where code = r.old_code;
    insert into public.products (code, name, kind, finish, color, ral, thickness_mm, width_mm, kg_per_meter, category_id, unit_id)
    values (r.code, r.name, 'bobine', r.finish, r.color, r.ral, 0.30, 1000, 2.33, cat, kg)
    on conflict (code) do nothing;
  end loop;
  -- L'aluzinc n'est pas utilisé aujourd'hui : désactivé (pas supprimé)
  update public.products set is_active = false where code = 'BOB-AZ-030';
end;
$$;

-- RAL repris sur les tôles et faîtières prélaquées déjà créées
update public.products p set ral = b.ral
from public.products b
where p.coil_product_id = b.id and p.ral is null and b.ral is not null;

-- 3. Bobines physiques : colonnes de la liste OA
alter table public.coils
  add column if not exists lot_number       text,
  add column if not exists supplier_coil_no text,     -- N° coil fournisseur (ex. 1-1)
  add column if not exists gross_weight_kg  numeric(12,3),
  add column if not exists length_m         numeric(12,2),  -- métrage de la bobine
  add column if not exists notes            text;

-- 4. Le stock suit automatiquement le poids restant des bobines
create or replace function public.coil_stock_sync()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.remaining_weight_kg <> 0 then
      insert into public.stock_movements (product_id, warehouse_id, coil_id, quantity, unit_cost, type, reason, source_table, source_id)
      values (new.product_id, new.warehouse_id, new.id, new.remaining_weight_kg, new.cost_per_kg,
              'inventaire', 'Entrée bobine ' || new.reference, 'coils', new.id);
    end if;
  elsif new.product_id <> old.product_id or new.warehouse_id <> old.warehouse_id then
    -- changement d'article ou de dépôt : on sort l'ancien, on entre le nouveau
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

drop trigger if exists trg_coil_stock_sync on public.coils;
create trigger trg_coil_stock_sync
  after insert or update on public.coils
  for each row execute function public.coil_stock_sync();

-- Une bobine à 0 kg restant passe automatiquement en « Fin »
create or replace function public.coil_auto_status()
returns trigger
language plpgsql
as $$
begin
  if new.remaining_weight_kg <= 0 and new.status in ('disponible', 'en_production') then
    new.status := 'epuisee';
  elsif new.remaining_weight_kg > 0 and new.status = 'epuisee' then
    new.status := 'disponible';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_coil_auto_status on public.coils;
create trigger trg_coil_auto_status
  before insert or update on public.coils
  for each row execute function public.coil_auto_status();
