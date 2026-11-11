-- =====================================================================
-- ERP OA Metal — articles simplifiés : bobines -> tôles ondulées
-- Trois types d'article seulement :
--   bobine   : matière première achetée, suivie en kg
--   tole     : tôle ondulée produite, vendue au mètre linéaire
--   faitiere : faîtière produite, vendue à la pièce
-- À exécuter une seule fois, après 0003.
-- =====================================================================

alter table public.products
  add column if not exists kind text check (kind in ('bobine','tole','faitiere')),
  add column if not exists finish text check (finish in ('aluzinc','galva','prelaquee')),
  add column if not exists waves int check (waves is null or waves between 1 and 20),
  add column if not exists coil_product_id uuid references public.products (id),
  add column if not exists notes text;

-- Une tôle ou une faîtière indique la bobine dont elle est issue
alter table public.products
  add constraint products_coil_only_for_finished
  check (coil_product_id is null or kind in ('tole','faitiere'));

-- Une couleur est obligatoire pour le prélaqué
alter table public.products
  add constraint products_color_for_prelaquee
  check (finish is distinct from 'prelaquee' or coalesce(color, '') <> '');

-- Unité pièce pour les faîtières
insert into public.units (code, name) values ('PCE', 'Pièce') on conflict (code) do nothing;

-- Catégorie des faîtières (vendue à la pièce)
insert into public.categories
  (code, name, nature, strategy, is_purchasable, is_sellable, is_manufactured, is_coil, unit_id, tax_rate_id, sale_account, stock_account)
values
  ('PFFAI', 'Produit fini faîtières', 'produit_fini', 'MTO', false, true, true, false,
   (select id from public.units where code = 'PCE'), (select id from public.tax_rates where code = 'TVA18'), '70211', '361')
on conflict (code) do nothing;
