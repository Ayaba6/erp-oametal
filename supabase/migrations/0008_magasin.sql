-- =====================================================================
-- ERP OA Metal — troisième type de dépôt : le magasin
--   magasin : produits avariés et surproductions mis de côté
-- À exécuter une seule fois, après 0007.
-- =====================================================================

alter table public.warehouses
  drop constraint if exists warehouses_type_check,
  add constraint warehouses_type_check
  check (type in ('matiere_premiere', 'production', 'magasin'));

insert into public.warehouses (code, name, type, can_purchase, can_production, can_sale, is_default, notes)
values ('DEPMAG', 'Magasin', 'magasin', false, false, true, true,
        'Produits avariés et surproductions')
on conflict (code) do nothing;
