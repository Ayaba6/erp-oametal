-- =====================================================================
-- ERP OA Metal — catalogue initial repris de l'A3 ERP (facultatif)
-- 6 bobines 0,30 mm, 12 tôles ondulées 4 ondes, 6 faîtières.
-- Prix à 0 : à compléter dans l'écran Articles.
-- =====================================================================

with f(code, finish, color, label) as (values
  ('AZ',    'aluzinc',   null,             'aluzinc'),
  ('GA',    'galva',     null,             'galva'),
  ('PL-BL', 'prelaquee', 'Bleue',          'prélaquée bleue'),
  ('PL-OR', 'prelaquee', 'Orange',         'prélaquée orange'),
  ('PL-RB', 'prelaquee', 'Rouge bordeaux', 'prélaquée rouge bordeaux'),
  ('PL-VE', 'prelaquee', 'Verte',          'prélaquée verte')
)
insert into public.products (code, name, kind, finish, color, thickness_mm, kg_per_meter, category_id, unit_id)
select 'BOB-' || f.code || '-030', 'Bobine ' || f.label || ' 0,30 mm', 'bobine', f.finish, f.color, 0.30, 2.355,
       (select id from public.categories where code = 'MPTBC'), (select id from public.units where code = 'KG')
from f
on conflict (code) do nothing;

with f(code, finish, color, label) as (values
  ('AZ',    'aluzinc',   null,             'aluzinc'),
  ('GA',    'galva',     null,             'galva'),
  ('PL-BL', 'prelaquee', 'Bleue',          'prélaquée bleue'),
  ('PL-OR', 'prelaquee', 'Orange',         'prélaquée orange'),
  ('PL-RB', 'prelaquee', 'Rouge bordeaux', 'prélaquée rouge bordeaux'),
  ('PL-VE', 'prelaquee', 'Verte',          'prélaquée verte')
), e(th, label) as (values (0.35, '35/100'), (0.40, '40/100'))
insert into public.products (code, name, kind, finish, color, thickness_mm, waves, kg_per_meter, coil_product_id, category_id, unit_id)
select 'TOL-' || f.code || '-' || to_char(e.th * 100, 'FM000'),
       'Tôle ondulée ' || f.label || ' ' || e.label || ' 4 ondes', 'tole', f.finish, f.color, e.th, 4, 2.355,
       (select id from public.products where code = 'BOB-' || f.code || '-030'),
       (select id from public.categories where code = 'PFTBC'), (select id from public.units where code = 'MTL')
from f cross join e
on conflict (code) do nothing;

with f(code, finish, color, label) as (values
  ('AZ',    'aluzinc',   null,             'aluzinc'),
  ('GA',    'galva',     null,             'galva'),
  ('PL-BL', 'prelaquee', 'Bleue',          'prélaquée bleue'),
  ('PL-OR', 'prelaquee', 'Orange',         'prélaquée orange'),
  ('PL-RB', 'prelaquee', 'Rouge bordeaux', 'prélaquée rouge bordeaux'),
  ('PL-VE', 'prelaquee', 'Verte',          'prélaquée verte')
)
insert into public.products (code, name, kind, finish, color, thickness_mm, kg_per_meter, coil_product_id, category_id, unit_id)
select 'FAI-' || f.code || '-035', 'Faîtière ' || f.label || ' 35/100', 'faitiere', f.finish, f.color, 0.35, 2.355,
       (select id from public.products where code = 'BOB-' || f.code || '-030'),
       (select id from public.categories where code = 'PFFAI'), (select id from public.units where code = 'PCE')
from f
on conflict (code) do nothing;
