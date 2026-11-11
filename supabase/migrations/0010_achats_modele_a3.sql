-- =====================================================================
-- ERP OA Metal — fournisseurs et commandes fournisseurs au modèle A3 ERP
--   Fournisseur : fiche complète (onglets Général, Adresses, Achats,
--                 Finance, Réception, Contacts, Comptabilité)
--   Commande    : numéro CA-AAAA-NNNN, remise et TVA par ligne, HT/TVA/TTC,
--                 statuts Brouillon → Envoyé → Confirmé → Partiel → Reçu → Clôturé
-- À exécuter une seule fois, après 0009.
-- =====================================================================

-- 1. Fiche fournisseur
alter table public.suppliers
  add column if not exists type               text not null default 'entreprise' check (type in ('entreprise','particulier')),
  add column if not exists category           text,
  add column if not exists trade_name         text,
  add column if not exists rccm               text,
  add column if not exists numero_contribuable text,
  add column if not exists groupe_fournisseur text,
  add column if not exists secteur_activite   text,
  add column if not exists currency           text not null default 'XOF',
  add column if not exists language           text not null default 'FR',
  add column if not exists soumis_tva         boolean not null default true,
  add column if not exists blocage_achat      boolean not null default false,
  add column if not exists phone2             text,
  add column if not exists mobile             text,
  add column if not exists website            text,
  add column if not exists address_line2      text,
  add column if not exists boite_postale      text,
  add column if not exists postal_code        text,
  add column if not exists city               text,
  add column if not exists quartier           text,
  add column if not exists region             text,
  add column if not exists gps_lat            numeric(10,6),
  add column if not exists gps_lng            numeric(10,6),
  add column if not exists addresses          jsonb not null default '[]'::jsonb,
  add column if not exists contacts           jsonb not null default '[]'::jsonb,
  add column if not exists canal              text,
  add column if not exists famille_tarifaire  text,
  add column if not exists default_discount   numeric(5,2) not null default 0,
  add column if not exists payment_mode       text not null default 'virement',
  add column if not exists payment_days       int not null default 0,
  add column if not exists tax_rate           numeric(5,2) not null default 18,
  add column if not exists rating             numeric(3,1),
  add column if not exists avg_delivery_days  int,
  add column if not exists credit_limit       numeric(14,2),
  add column if not exists banque             text,
  add column if not exists swift              text,
  add column if not exists rib_iban           text,
  add column if not exists numero_compte      text,
  add column if not exists depot_reception_id uuid references public.warehouses (id),
  add column if not exists mode_livraison     text,
  add column if not exists transporteur       text,
  add column if not exists delai_livraison    int,
  add column if not exists compte_tiers       text,
  add column if not exists compte_collectif   text,
  add column if not exists condition_paiement text,
  add column if not exists echeance           text,
  add column if not exists notes              text;

alter table public.suppliers alter column country set default 'BF';

-- Code fournisseur automatique si vide : FRN0001, FRN0002...
create or replace function public.supplier_auto_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or trim(new.code) = '' then
    select 'FRN' || lpad((coalesce(max(substring(code from '^FRN(\d+)$')::int), 0) + 1)::text, 4, '0')
    into new.code
    from public.suppliers;
  else
    new.code := upper(trim(new.code));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_suppliers_code on public.suppliers;
create trigger trg_suppliers_code before insert on public.suppliers
  for each row execute function public.supplier_auto_code();

-- 2. En-tête de commande
alter table public.purchase_orders
  add column if not exists supplier_contact  text,
  add column if not exists delivery_address  text,
  add column if not exists exchange_rate     numeric(14,6) not null default 1,
  add column if not exists buyer_id          uuid references public.profiles (id),
  add column if not exists reference         text,
  add column if not exists project_reference text,
  add column if not exists price_list        text,
  add column if not exists payment_terms     text,
  add column if not exists payment_method    text not null default 'virement',
  add column if not exists priority          text not null default 'normale' check (priority in ('basse','normale','haute')),
  add column if not exists terms             text,             -- commentaire sur les lignes
  add column if not exists carrier           text,
  add column if not exists vehicle_number    text,
  add column if not exists delivery_location text,
  add column if not exists incoterm          text not null default 'EXW',
  add column if not exists total_weight_kg   numeric(14,2),
  add column if not exists footer_note       text,
  add column if not exists total_tax         numeric(14,2) not null default 0,
  add column if not exists total_ttc         numeric(14,2) not null default 0,
  add column if not exists sent_at           timestamptz,
  add column if not exists closed_at         timestamptz;

-- Statuts du modèle A3 (Envoyé et Clôturé en plus)
alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check
  check (status in ('brouillon','envoyee','confirmee','partiellement_recue','recue','cloturee','annulee'));

-- Numérotation CA-AAAA-NNNN comme l'A3 ERP
drop trigger if exists trg_purchase_orders_number on public.purchase_orders;
create trigger trg_purchase_orders_number before insert on public.purchase_orders
  for each row execute function public.set_document_number('CA');

-- 3. Lignes : désignation, remise et TVA
alter table public.purchase_order_lines
  add column if not exists description      text,
  add column if not exists discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  add column if not exists tax_rate         numeric(5,2) not null default 18 check (tax_rate between 0 and 100),
  add column if not exists position         int not null default 0;

-- Totaux HT / TVA / TTC recalculés à chaque changement de ligne
create or replace function public.po_refresh_total()
returns trigger
language plpgsql
as $$
declare
  v_po uuid := coalesce(new.purchase_order_id, old.purchase_order_id);
begin
  update public.purchase_orders po
  set total_ht  = t.ht,
      total_tax = t.tax,
      total_ttc = t.ht + t.tax
  from (
    select coalesce(sum(round(quantity * unit_price * (1 - discount_percent / 100), 2)), 0) as ht,
           coalesce(sum(round(quantity * unit_price * (1 - discount_percent / 100) * tax_rate / 100, 2)), 0) as tax
    from public.purchase_order_lines
    where purchase_order_id = v_po
  ) t
  where po.id = v_po;
  return null;
end;
$$;

-- Recalcul des commandes existantes
update public.purchase_order_lines set tax_rate = tax_rate;

-- 4. La validation d'une réception ne rouvre pas une commande clôturée
create or replace function public.po_after_reception(p_po uuid)
returns void
language sql
as $$
  update public.purchase_orders po
  set status = case
    when not exists (select 1 from public.purchase_order_lines
                     where purchase_order_id = po.id and received_qty < quantity) then 'recue'
    when exists (select 1 from public.purchase_order_lines
                 where purchase_order_id = po.id and received_qty > 0) then 'partiellement_recue'
    else po.status end
  where po.id = p_po and po.status in ('confirmee', 'partiellement_recue');
$$;

-- 5. Validation d'une réception (version modèle A3) d'une réception : entrée en stock des bobines conformes
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
    perform public.po_after_reception(r.purchase_order_id);
  end if;

  update public.receptions
  set status = 'validee', validated_by = auth.uid(), validated_at = now()
  where id = r.id;

  return v_count;
end;
$$;
