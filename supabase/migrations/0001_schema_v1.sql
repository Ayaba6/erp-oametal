-- =====================================================================
-- ERP OA Metal — schéma v1 (cœur : paramètres, ventes, caisse, stock,
-- achats de bobines, production MTO)
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. Outils communs
-- ---------------------------------------------------------------------

-- Numérotation des documents : DEV-2026-0001, CMD-2026-0001...
create table public.document_sequences (
  doc_type    text not null,
  year        int  not null,
  prefix      text not null,
  last_number int  not null default 0,
  primary key (doc_type, year)
);

create or replace function public.next_document_number(p_doc_type text, p_prefix text)
returns text
language plpgsql
as $$
declare
  v_year int := extract(year from now())::int;
  v_num  int;
begin
  insert into public.document_sequences (doc_type, year, prefix, last_number)
  values (p_doc_type, v_year, p_prefix, 1)
  on conflict (doc_type, year)
  do update set last_number = public.document_sequences.last_number + 1
  returning last_number into v_num;
  return p_prefix || '-' || v_year || '-' || lpad(v_num::text, 4, '0');
end;
$$;

-- Déclencheur générique : remplit "number" si vide. Argument = préfixe.
create or replace function public.set_document_number()
returns trigger
language plpgsql
as $$
begin
  if new.number is null or new.number = '' then
    new.number := public.next_document_number(tg_table_name, tg_argv[0]);
  end if;
  return new;
end;
$$;

-- Déclencheur générique : met à jour updated_at.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 1. Paramètres et référentiels
-- ---------------------------------------------------------------------

create table public.company (
  id            int primary key default 1 check (id = 1),  -- une seule ligne
  name          text not null,
  trade_name    text,
  ifu           text,
  rccm          text,
  address       text,
  city          text,
  phone         text,
  email         text,
  logo_url      text,
  currency      text not null default 'XOF',
  default_vat   numeric(5,2) not null default 18,
  deposit_rate_before_production numeric(5,2) not null default 100,
  updated_at    timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        text not null default 'lecture'
              check (role in ('admin','direction','commercial','caissier',
                              'magasinier','acheteur','production','comptable','lecture')),
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.units (
  id    uuid primary key default gen_random_uuid(),
  code  text not null unique,
  name  text not null
);

create table public.tax_rates (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  rate       numeric(5,2) not null,
  is_default boolean not null default false
);

create table public.payment_methods (
  id    uuid primary key default gen_random_uuid(),
  code  text not null unique,
  name  text not null,
  type  text not null check (type in ('especes','cheque','virement','mobile_money','autre'))
);

create table public.warehouses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  can_sale    boolean not null default true,
  can_purchase boolean not null default true,
  can_production boolean not null default true,
  is_default  boolean not null default false,
  is_active   boolean not null default true
);

-- La catégorie porte les réglages communs (stratégie, comptes, unité).
create table public.categories (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  nature           text not null check (nature in ('matiere_premiere','produit_fini','marchandise',
                                                   'chute','rebut','consommable','service')),
  strategy         text check (strategy in ('MTO','MTS','ACHAT_REVENTE','SERVICE')),
  is_purchasable   boolean not null default false,
  is_sellable      boolean not null default false,
  is_manufactured  boolean not null default false,
  is_coil          boolean not null default false,   -- matière suivie en bobines
  unit_id          uuid references public.units (id),
  tax_rate_id      uuid references public.tax_rates (id),
  sale_account     text,   -- ex. 70211
  purchase_account text,   -- ex. 6021
  stock_account    text,   -- ex. 3211
  is_active        boolean not null default true
);

-- L'article ne garde que ses champs propres.
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  name            text not null,
  category_id     uuid not null references public.categories (id),
  unit_id         uuid references public.units (id),
  sale_price      numeric(14,2) not null default 0,
  min_sale_price  numeric(14,2),
  purchase_price  numeric(14,2) not null default 0,
  kg_per_meter    numeric(10,4),   -- tôles : poids par mètre linéaire
  thickness_mm    numeric(6,3),
  width_mm        numeric(8,2),
  color           text,
  stock_min       numeric(14,3) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_products_updated before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. Tiers
-- ---------------------------------------------------------------------

create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  code           text unique,
  name           text not null,
  type           text not null default 'particulier'
                 check (type in ('particulier','entreprise','distributeur','minier')),
  ifu            text,
  rccm           text,
  phone          text,
  email          text,
  address        text,
  city           text,
  payment_mode   text not null default 'comptant' check (payment_mode in ('comptant','acompte','credit')),
  payment_days   int not null default 0,
  credit_limit   numeric(14,2) not null default 0,
  is_blocked     boolean not null default false,
  blocked_reason text,
  is_test        boolean not null default false,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint blocked_needs_reason check (not is_blocked or blocked_reason is not null)
);
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.touch_updated_at();

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  country     text,
  phone       text,
  email       text,
  address     text,
  ifu         text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Ventes : devis -> commande -> bon de livraison -> facture
-- ---------------------------------------------------------------------

create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  client_id     uuid not null references public.clients (id),
  warehouse_id  uuid references public.warehouses (id),
  sales_rep_id  uuid references public.profiles (id),
  issued_at     date not null default current_date,
  valid_until   date,
  status        text not null default 'brouillon'
                check (status in ('brouillon','valide','converti','refuse','expire','annule')),
  notes         text,
  total_ht      numeric(14,2) not null default 0,
  total_tva     numeric(14,2) not null default 0,
  total_ttc     numeric(14,2) not null default 0,
  is_test       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_quotes_number before insert on public.quotes
  for each row execute function public.set_document_number('DEV');
create trigger trg_quotes_updated before update on public.quotes
  for each row execute function public.touch_updated_at();

create table public.sales_orders (
  id              uuid primary key default gen_random_uuid(),
  number          text unique,
  quote_id        uuid references public.quotes (id),
  client_id       uuid not null references public.clients (id),
  warehouse_id    uuid not null references public.warehouses (id),
  sales_rep_id    uuid references public.profiles (id),
  issued_at       date not null default current_date,
  delivery_date   date,
  delivery_address text,
  status          text not null default 'brouillon'
                  check (status in ('brouillon','confirmee','en_production','partiellement_livree',
                                    'livree','facturee','annulee')),
  notes           text,
  total_ht        numeric(14,2) not null default 0,
  total_tva       numeric(14,2) not null default 0,
  total_ttc       numeric(14,2) not null default 0,
  amount_paid     numeric(14,2) not null default 0,
  is_test         boolean not null default false,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_sales_orders_number before insert on public.sales_orders
  for each row execute function public.set_document_number('CMD');
create trigger trg_sales_orders_updated before update on public.sales_orders
  for each row execute function public.touch_updated_at();

create table public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  order_id      uuid not null references public.sales_orders (id),
  client_id     uuid not null references public.clients (id),
  warehouse_id  uuid not null references public.warehouses (id),
  delivered_at  date not null default current_date,
  status        text not null default 'brouillon'
                check (status in ('brouillon','validee','annulee')),
  carrier       text,
  vehicle       text,
  notes         text,
  is_test       boolean not null default false,
  validated_by  uuid references public.profiles (id),
  validated_at  timestamptz,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create trigger trg_deliveries_number before insert on public.deliveries
  for each row execute function public.set_document_number('BL');

create table public.invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  order_id      uuid references public.sales_orders (id),
  delivery_id   uuid references public.deliveries (id),
  client_id     uuid not null references public.clients (id),
  issued_at     date not null default current_date,
  due_at        date,
  status        text not null default 'brouillon'
                check (status in ('brouillon','emise','partiellement_payee','payee','annulee')),
  total_ht      numeric(14,2) not null default 0,
  total_tva     numeric(14,2) not null default 0,
  total_ttc     numeric(14,2) not null default 0,
  amount_paid   numeric(14,2) not null default 0,
  cancel_reason text,
  is_test       boolean not null default false,
  validated_by  uuid references public.profiles (id),
  validated_at  timestamptz,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint cancel_needs_reason check (status <> 'annulee' or cancel_reason is not null)
);
create trigger trg_invoices_number before insert on public.invoices
  for each row execute function public.set_document_number('FA');

create table public.credit_notes (
  id          uuid primary key default gen_random_uuid(),
  number      text unique,
  invoice_id  uuid not null references public.invoices (id),
  client_id   uuid not null references public.clients (id),
  issued_at   date not null default current_date,
  reason      text not null,
  status      text not null default 'brouillon' check (status in ('brouillon','valide','annule')),
  total_ttc   numeric(14,2) not null default 0,
  is_test     boolean not null default false,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create trigger trg_credit_notes_number before insert on public.credit_notes
  for each row execute function public.set_document_number('AV');

-- Lignes : même structure pour devis, commande, BL, facture, avoir.
-- Une ligne appartient à UN seul document (une seule clé renseignée).
create table public.document_lines (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid references public.quotes (id) on delete cascade,
  order_id        uuid references public.sales_orders (id) on delete cascade,
  delivery_id     uuid references public.deliveries (id) on delete cascade,
  invoice_id      uuid references public.invoices (id) on delete cascade,
  credit_note_id  uuid references public.credit_notes (id) on delete cascade,
  source_line_id  uuid references public.document_lines (id),  -- ligne d'origine (devis -> commande...)
  position        int not null default 1,
  product_id      uuid references public.products (id),
  description     text not null,
  sheets_count    int,                 -- nombre de tôles
  length_m        numeric(10,3),       -- longueur unitaire
  quantity        numeric(14,3) not null check (quantity > 0),
  unit_price      numeric(14,2) not null default 0,
  discount_pct    numeric(5,2)  not null default 0,
  vat_rate        numeric(5,2)  not null default 18,
  lot_number      text,
  total_ht        numeric(14,2) generated always as
                  (round(quantity * unit_price * (1 - discount_pct / 100), 2)) stored,
  constraint one_parent check (num_nonnulls(quote_id, order_id, delivery_id, invoice_id, credit_note_id) = 1)
);
create index on public.document_lines (quote_id);
create index on public.document_lines (order_id);
create index on public.document_lines (delivery_id);
create index on public.document_lines (invoice_id);

-- ---------------------------------------------------------------------
-- 4. Caisse et encaissements
-- ---------------------------------------------------------------------

create table public.cash_accounts (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  type             text not null check (type in ('caisse','banque','mobile_money')),
  opening_balance  numeric(14,2) not null default 0,
  min_balance      numeric(14,2),
  ledger_account   text,             -- ex. 5711
  is_active        boolean not null default true
);

create table public.cash_sessions (
  id               uuid primary key default gen_random_uuid(),
  number           text unique,
  cash_account_id  uuid not null references public.cash_accounts (id),
  cashier_id       uuid not null references public.profiles (id),
  opened_at        timestamptz not null default now(),
  opening_balance  numeric(14,2) not null,
  closed_at        timestamptz,
  expected_balance numeric(14,2),
  counted_balance  numeric(14,2),
  difference_reason text,
  status           text not null default 'ouverte' check (status in ('ouverte','cloturee'))
);
create trigger trg_cash_sessions_number before insert on public.cash_sessions
  for each row execute function public.set_document_number('CAI');
-- Une seule session ouverte par caisse.
create unique index one_open_session_per_account
  on public.cash_sessions (cash_account_id) where status = 'ouverte';

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  number             text unique,
  client_id          uuid not null references public.clients (id),
  order_id           uuid references public.sales_orders (id),
  cash_account_id    uuid not null references public.cash_accounts (id),
  cash_session_id    uuid references public.cash_sessions (id),
  payment_method_id  uuid not null references public.payment_methods (id),
  paid_at            timestamptz not null default now(),
  amount             numeric(14,2) not null check (amount > 0),
  reference          text,
  phone_number       text,
  notes              text,
  status             text not null default 'confirme' check (status in ('confirme','annule')),
  is_test            boolean not null default false,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now()
);
create trigger trg_payments_number before insert on public.payments
  for each row execute function public.set_document_number('ENC');

-- Imputation d'un encaissement sur une ou plusieurs factures.
create table public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  payment_id  uuid not null references public.payments (id) on delete cascade,
  invoice_id  uuid not null references public.invoices (id),
  amount      numeric(14,2) not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (payment_id, invoice_id)
);

-- Mouvements divers de caisse (entrées / sorties hors clients).
create table public.cash_operations (
  id               uuid primary key default gen_random_uuid(),
  number           text unique,
  cash_account_id  uuid not null references public.cash_accounts (id),
  cash_session_id  uuid references public.cash_sessions (id),
  direction        text not null check (direction in ('entree','sortie')),
  amount           numeric(14,2) not null check (amount > 0),
  label            text not null,
  counterpart_account text,
  occurred_at      timestamptz not null default now(),
  created_by       uuid default auth.uid()
);
create trigger trg_cash_operations_number before insert on public.cash_operations
  for each row execute function public.set_document_number('OPC');

-- ---------------------------------------------------------------------
-- 5. Achats : commande fournisseur -> réception -> bobines
-- ---------------------------------------------------------------------

create table public.purchase_orders (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  supplier_id   uuid not null references public.suppliers (id),
  warehouse_id  uuid not null references public.warehouses (id),
  issued_at     date not null default current_date,
  expected_at   date,
  currency      text not null default 'XOF',
  status        text not null default 'brouillon'
                check (status in ('brouillon','confirmee','partiellement_recue','recue','annulee')),
  notes         text,
  total_ht      numeric(14,2) not null default 0,
  is_test       boolean not null default false,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create trigger trg_purchase_orders_number before insert on public.purchase_orders
  for each row execute function public.set_document_number('BC');

create table public.purchase_order_lines (
  id                uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id        uuid not null references public.products (id),
  quantity          numeric(14,3) not null check (quantity > 0),
  unit_price        numeric(14,2) not null default 0,
  received_qty      numeric(14,3) not null default 0
);

create table public.receptions (
  id                uuid primary key default gen_random_uuid(),
  number            text unique,
  purchase_order_id uuid references public.purchase_orders (id),
  supplier_id       uuid not null references public.suppliers (id),
  warehouse_id      uuid not null references public.warehouses (id),
  received_at       date not null default current_date,
  status            text not null default 'brouillon' check (status in ('brouillon','validee','annulee')),
  notes             text,
  is_test           boolean not null default false,
  validated_by      uuid references public.profiles (id),
  validated_at      timestamptz,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now()
);
create trigger trg_receptions_number before insert on public.receptions
  for each row execute function public.set_document_number('REC');

create table public.reception_lines (
  id              uuid primary key default gen_random_uuid(),
  reception_id    uuid not null references public.receptions (id) on delete cascade,
  po_line_id      uuid references public.purchase_order_lines (id),
  product_id      uuid not null references public.products (id),
  quantity        numeric(14,3) not null check (quantity > 0),   -- kg pour une bobine
  unit_cost       numeric(14,2) not null default 0,
  lot_number      text,
  quality_status  text not null default 'libere'
                  check (quality_status in ('en_attente','quarantaine','libere','refuse'))
);

-- Bobine = lot de matière première (une seule notion).
create table public.coils (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  product_id         uuid not null references public.products (id),
  reception_line_id  uuid references public.reception_lines (id),
  supplier_id        uuid references public.suppliers (id),
  warehouse_id       uuid not null references public.warehouses (id),
  thickness_mm       numeric(6,3),
  width_mm           numeric(8,2),
  color              text,
  initial_weight_kg  numeric(12,3) not null check (initial_weight_kg > 0),
  remaining_weight_kg numeric(12,3) not null,
  reserved_weight_kg numeric(12,3) not null default 0,
  cost_per_kg        numeric(12,2) not null default 0,
  status             text not null default 'disponible'
                     check (status in ('disponible','en_production','epuisee','bloquee')),
  received_at        date not null default current_date,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Stock : un seul journal de mouvements, le stock est calculé
-- ---------------------------------------------------------------------

create table public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  product_id    uuid not null references public.products (id),
  warehouse_id  uuid not null references public.warehouses (id),
  coil_id       uuid references public.coils (id),
  quantity      numeric(14,3) not null check (quantity <> 0),   -- + entrée / - sortie
  unit_cost     numeric(14,2) not null default 0,
  type          text not null check (type in ('reception','livraison','production_entree',
                                              'production_sortie','ajustement','inventaire',
                                              'transfert','perte','retour_client','retour_fournisseur')),
  reason        text,
  source_table  text,          -- ex. 'deliveries'
  source_id     uuid,
  is_test       boolean not null default false,
  created_by    uuid default auth.uid()
);
create index on public.stock_movements (product_id, warehouse_id);

create view public.stock_levels
with (security_invoker = true) as
select m.product_id,
       m.warehouse_id,
       sum(m.quantity)                         as quantity,
       max(m.occurred_at)                      as last_movement_at
from public.stock_movements m
where not m.is_test
group by m.product_id, m.warehouse_id;

-- ---------------------------------------------------------------------
-- 7. Production MTO
-- ---------------------------------------------------------------------

create table public.production_lines (
  id             uuid primary key default gen_random_uuid(),   -- machine + ligne fusionnées
  code           text not null unique,
  name           text not null,
  hourly_cost    numeric(12,2) not null default 0,
  status         text not null default 'en_service'
                 check (status in ('en_service','en_maintenance','arret')),
  is_active      boolean not null default true
);

create table public.production_orders (
  id                 uuid primary key default gen_random_uuid(),
  number             text unique,
  order_id           uuid references public.sales_orders (id),
  order_line_id      uuid references public.document_lines (id),
  product_id         uuid not null references public.products (id),
  production_line_id uuid references public.production_lines (id),
  warehouse_id       uuid not null references public.warehouses (id),
  quantity           numeric(14,3) not null check (quantity > 0),
  length_m           numeric(10,3),
  produced_qty       numeric(14,3) not null default 0,
  planned_date       date,
  priority           text not null default 'normale' check (priority in ('basse','normale','haute','urgente')),
  status             text not null default 'brouillon'
                     check (status in ('brouillon','autorise','matiere_allouee','en_cours',
                                       'termine','suspendu','annule')),
  authorized_by      uuid references public.profiles (id),
  authorized_at      timestamptz,
  started_at         timestamptz,
  finished_at        timestamptz,
  notes              text,
  is_test            boolean not null default false,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now()
);
create trigger trg_production_orders_number before insert on public.production_orders
  for each row execute function public.set_document_number('OF');

-- Bobines réservées pour un OF.
create table public.coil_allocations (
  id                   uuid primary key default gen_random_uuid(),
  production_order_id  uuid not null references public.production_orders (id) on delete cascade,
  coil_id              uuid not null references public.coils (id),
  weight_kg            numeric(12,3) not null check (weight_kg > 0),
  created_at           timestamptz not null default now(),
  unique (production_order_id, coil_id)
);

-- Déclaration de production + consommation de bobine + visa du chef.
create table public.production_declarations (
  id                   uuid primary key default gen_random_uuid(),
  production_order_id  uuid not null references public.production_orders (id),
  declared_at          timestamptz not null default now(),
  quantity             numeric(14,3) not null check (quantity > 0),
  length_m             numeric(10,3),
  coil_id              uuid references public.coils (id),
  weight_consumed_kg   numeric(12,3),
  scrap_weight_kg      numeric(12,3) not null default 0,
  lot_number           text,
  status               text not null default 'a_valider' check (status in ('a_valider','validee','rejetee')),
  validated_by         uuid references public.profiles (id),
  validated_at         timestamptz,
  notes                text,
  created_by           uuid default auth.uid()
);

-- ---------------------------------------------------------------------
-- 8. Sécurité (RLS) — v1 : tout utilisateur connecté et actif a accès.
--    Les droits fins par rôle viendront avec les écrans.
-- ---------------------------------------------------------------------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'document_sequences','company','profiles','units','tax_rates','payment_methods','warehouses',
    'categories','products','clients','suppliers','quotes','sales_orders','deliveries','invoices',
    'credit_notes','document_lines','cash_accounts','cash_sessions','payments','payment_allocations',
    'cash_operations','purchase_orders','purchase_order_lines','receptions','reception_lines','coils',
    'stock_movements','production_lines','production_orders','coil_allocations','production_declarations']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "acces utilisateurs actifs" on public.%I for all to authenticated
         using (public.is_active_user()) with check (public.is_active_user())', t);
  end loop;
end;
$$;

-- Chacun peut lire son propre profil (même s'il n'est pas encore actif).
create policy "lire son profil" on public.profiles
  for select to authenticated using (id = auth.uid());

-- Création automatique du profil à l'inscription d'un utilisateur.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
