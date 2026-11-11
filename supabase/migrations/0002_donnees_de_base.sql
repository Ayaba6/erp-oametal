-- =====================================================================
-- ERP OA Metal — données de base (référentiels repris de l'A3 ERP)
-- À exécuter une seule fois, après 0001_schema_v1.sql.
-- =====================================================================

-- Société (à compléter ensuite dans l'écran Paramètres > Société)
insert into public.company (id, name, trade_name, city, currency, default_vat)
values (1, 'OA METAL INDUSTRIE', 'OA METAL', 'Ouagadougou', 'XOF', 18)
on conflict (id) do nothing;

-- Profils des utilisateurs déjà créés dans Supabase Auth : administrateurs.
insert into public.profiles (id, full_name, role)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email), 'admin'
from auth.users u
on conflict (id) do update set role = 'admin', is_active = true;

-- Unités
insert into public.units (code, name) values
  ('KG',  'Kilogramme'),
  ('MTL', 'Mètre linéaire'),
  ('UN',  'Unité')
on conflict (code) do nothing;

-- TVA
insert into public.tax_rates (code, name, rate, is_default) values
  ('TVA18', 'TVA 18 %', 18, true),
  ('EXO',   'Exonéré',   0, false)
on conflict (code) do nothing;

-- Modes de règlement
insert into public.payment_methods (code, name, type) values
  ('ESP',  'Espèces',           'especes'),
  ('CHQ',  'Chèque',            'cheque'),
  ('VIR',  'Virement bancaire', 'virement'),
  ('OM',   'Orange Money',      'mobile_money'),
  ('MOOV', 'Moov Money',        'mobile_money')
on conflict (code) do nothing;

-- Dépôt
insert into public.warehouses (code, name, can_sale, can_purchase, can_production, is_default) values
  ('DEPPRI', 'Dépôt principal Ouagadougou', true, true, true, true)
on conflict (code) do nothing;

-- Caisse
insert into public.cash_accounts (code, name, type, opening_balance, ledger_account) values
  ('CAISSE', 'Caisse principale', 'caisse', 0, '5711')
on conflict (code) do nothing;

-- Catégories (reprises de l'A3 ERP, avec stratégie et comptes renseignés)
insert into public.categories
  (code, name, nature, strategy, is_purchasable, is_sellable, is_manufactured, is_coil,
   unit_id, tax_rate_id, sale_account, purchase_account, stock_account)
values
  ('PFTBC', 'Produit fini tôles bacs',      'produit_fini',     'MTO',           false, true,  true,  false,
   (select id from public.units where code = 'MTL'), (select id from public.tax_rates where code = 'TVA18'), '70211', null,   '361'),
  ('MPTBC', 'Matière première bobine',      'matiere_premiere', null,            true,  false, false, true,
   (select id from public.units where code = 'KG'),  (select id from public.tax_rates where code = 'TVA18'), null,    '6021', '3211'),
  ('MACCE', 'Marchandise accessoire',       'marchandise',      'ACHAT_REVENTE', true,  true,  false, false,
   (select id from public.units where code = 'UN'),  (select id from public.tax_rates where code = 'TVA18'), '7011',  '6011', '3111'),
  ('MTUBE', 'Marchandise tubes',            'marchandise',      'ACHAT_REVENTE', true,  true,  false, false,
   (select id from public.units where code = 'UN'),  (select id from public.tax_rates where code = 'TVA18'), '7011',  '6011', '3111'),
  ('MPIPE', 'Marchandise IPE',              'marchandise',      'ACHAT_REVENTE', true,  true,  false, false,
   (select id from public.units where code = 'UN'),  (select id from public.tax_rates where code = 'TVA18'), '7011',  '6011', '3111'),
  ('MFILF', 'Marchandise fil de fer',       'marchandise',      'ACHAT_REVENTE', true,  true,  false, false,
   (select id from public.units where code = 'KG'),  (select id from public.tax_rates where code = 'TVA18'), '7011',  '6011', '3111'),
  ('CHTBC', 'Chute tôle bac',               'chute',            null,            false, true,  false, false,
   (select id from public.units where code = 'KG'),  (select id from public.tax_rates where code = 'TVA18'), '704',   null,   null),
  ('AVTBC', 'Avarie tôle bac',              'rebut',            null,            false, false, false, false,
   (select id from public.units where code = 'KG'),  null, null, null, null)
on conflict (code) do nothing;

-- Ligne de production (machine + ligne fusionnées)
insert into public.production_lines (code, name) values
  ('PROF1', 'Profileuse tôles bac')
on conflict (code) do nothing;
