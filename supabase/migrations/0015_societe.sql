-- 0015 — Paramétrage de la société : reprise COMPLÈTE de la page Société de l'ancien A3 ERP
-- (Informations générales, Adresse, Fiscalité, Banques, Documents, Numérotation,
--  Branding, Options globales, Suivi, Mentions légales).
-- Ce script peut être exécuté plusieurs fois sans risque.

alter table public.company
  -- Informations générales
  add column if not exists company_code        text,
  add column if not exists sigle               text,
  add column if not exists legal_form          text,
  add column if not exists cnss_number         text,
  add column if not exists main_activity       text,
  add column if not exists language            text not null default 'fr',
  add column if not exists country             text default 'Burkina Faso',
  add column if not exists timezone            text not null default 'GMT',
  add column if not exists opened_at           date,
  add column if not exists status              text not null default 'active',
  add column if not exists website             text,
  add column if not exists notes               text,
  -- Adresse et contacts
  add column if not exists district            text,
  add column if not exists postal_code         text,
  add column if not exists po_box              text,
  add column if not exists main_contact        text,
  add column if not exists accounting_email    text,
  add column if not exists phone2              text,
  add column if not exists slogan              text,
  -- Fiscalité
  add column if not exists fiscal_regime       text,
  add column if not exists vat_mode            text not null default 'collectee',
  add column if not exists minimum_margin_rate numeric(6,2) not null default 0,
  add column if not exists tax_center          text,
  add column if not exists withholding_regime  text,
  add column if not exists taxpayer_type       text,
  -- Mentions légales
  add column if not exists nif                 text,
  add column if not exists vat_number          text,
  add column if not exists share_capital       numeric(18,0),
  add column if not exists is_vat_subject      boolean not null default true,
  -- Documents (mise en page, colonnes, textes, signature)
  add column if not exists primary_color       text not null default '#1e40af',
  add column if not exists font_family         text not null default 'DejaVu Sans',
  add column if not exists page_size           text not null default 'A4',
  add column if not exists orientation         text not null default 'portrait',
  add column if not exists show_logo           boolean not null default true,
  add column if not exists show_watermark      boolean not null default false,
  add column if not exists watermark_text      text default 'CONFIDENTIEL',
  add column if not exists product_columns     text[] not null default array['description','longueur','quantity','unit_price','tax','total_ht','total_ttc'],
  add column if not exists footer_text         text,
  add column if not exists terms_conditions    text,
  add column if not exists penalty_mentions    text,
  add column if not exists signature_name      text,
  add column if not exists signature_title     text,
  -- Branding (images enregistrées directement dans la fiche)
  add column if not exists stamp_url           text,
  add column if not exists signature_url       text,
  add column if not exists pdf_header_url      text,
  add column if not exists pdf_footer_url      text,
  -- Options globales
  add column if not exists multi_sites          boolean not null default false,
  add column if not exists vat_management       boolean not null default true,
  add column if not exists validation_workflow  boolean not null default false,
  add column if not exists electronic_signature boolean not null default false,
  add column if not exists auto_pdf_print       boolean not null default false,
  add column if not exists email_notifications  boolean not null default false,
  add column if not exists secondary_currency   boolean not null default false,
  add column if not exists maintenance_mode     boolean not null default false,
  -- Suivi
  add column if not exists created_by_name     text,
  add column if not exists created_at          timestamptz not null default now();

-- Colonnes d'une version précédente de ce script, devenues inutiles
alter table public.company
  drop column if exists bank_name,
  drop column if exists bank_account,
  drop column if exists bank_iban,
  drop column if exists bank_swift;

-- Valeurs reprises telles quelles de l'ancien ERP
update public.company set
  company_code        = 'OMA-BF-001',
  name                = 'OA METAL INDUSTRIE',
  sigle               = 'OAMI',
  legal_form          = 'SARL',
  ifu                 = '00123456789',
  rccm                = 'BF-OUA-2020-B-12345',
  cnss_number         = null,
  main_activity       = null,
  currency            = 'XOF',
  language            = 'fr',
  country             = 'Burkina Faso',
  city                = 'Ouagadougou',
  timezone            = 'GMT',
  opened_at           = null,
  status              = 'active',
  email               = 'contact@iboa-commerce.bf',
  phone               = '+226 25 30 00 00',
  website             = null,
  notes               = null,
  address             = 'Avenue de la Nation, Secteur 4',
  district            = null,
  postal_code         = null,
  po_box              = null,
  main_contact        = null,
  accounting_email    = null,
  phone2              = '+226 70 00 00 00',
  trade_name          = 'OA METAL',
  slogan              = 'Votre partenaire commercial de confiance',
  fiscal_regime       = 'reel_normal',
  vat_mode            = 'collectee',
  default_vat         = 18,
  minimum_margin_rate = 10,
  tax_center          = null,
  withholding_regime  = 'source_tva',
  taxpayer_type       = 'personne_morale',
  nif                 = null,
  vat_number          = null,
  share_capital       = 5000000,
  is_vat_subject      = true,
  primary_color       = '#1e40af',
  font_family         = 'DejaVu Sans',
  page_size           = 'A4',
  orientation         = 'portrait',
  show_logo           = true,
  show_watermark      = false,
  watermark_text      = 'CONFIDENTIEL',
  product_columns     = array['description','longueur','quantity','unit_price','tax','total_ht','total_ttc'],
  footer_text         = null,
  terms_conditions    = null,
  penalty_mentions    = null,
  signature_name      = null,
  signature_title     = null,
  multi_sites          = true,
  vat_management       = true,
  validation_workflow  = true,
  electronic_signature = true,
  auto_pdf_print       = true,
  email_notifications  = true,
  secondary_currency   = true,
  maintenance_mode     = false,
  created_by_name     = 'Administrateur IBOA',
  created_at          = '2026-06-15 15:50:00+00',
  updated_at          = now()
where id = 1;

-- Comptes bancaires de la société (onglet Banques)
create table if not exists public.company_bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  bank_name       text not null,
  account_holder  text not null,
  account_number  text not null,
  branch          text,
  iban            text,
  swift_bic       text,
  is_default      boolean not null default false,
  cash_account_id uuid references public.cash_accounts (id),
  created_at      timestamptz not null default now()
);
alter table public.company_bank_accounts enable row level security;

-- Lecture pour tous les utilisateurs actifs (impression) ; modification avec company.edit
drop policy if exists "acces utilisateurs actifs" on public.company;
drop policy if exists "lecture societe" on public.company;
drop policy if exists "modification societe" on public.company;
create policy "lecture societe" on public.company
  for select to authenticated using (public.is_active_user());
create policy "modification societe" on public.company
  for update to authenticated
  using (public.has_permission('company.edit'))
  with check (public.has_permission('company.edit'));

drop policy if exists "lecture banques societe" on public.company_bank_accounts;
drop policy if exists "gestion banques societe" on public.company_bank_accounts;
create policy "lecture banques societe" on public.company_bank_accounts
  for select to authenticated using (public.is_active_user());
create policy "gestion banques societe" on public.company_bank_accounts
  for all to authenticated
  using (public.has_permission('company.edit'))
  with check (public.has_permission('company.edit'));

-- Un seul compte principal
create or replace function public.company_bank_single_default()
returns trigger
language plpgsql
as $$
begin
  if new.is_default then
    update public.company_bank_accounts set is_default = false where id <> new.id and is_default;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_company_bank_default on public.company_bank_accounts;
create trigger trg_company_bank_default after insert or update of is_default on public.company_bank_accounts
  for each row when (new.is_default) execute function public.company_bank_single_default();
