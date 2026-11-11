-- 0018 — Version simple : 4 rôles et circuit devis → direction → commande → caisse → OF
--
--   Directeur Général    : voit tout, valide tout.
--   Responsable commercial : Devis et Commandes uniquement. Le devis est soumis à la direction ;
--                          une fois validé il est envoyé au client ; accord du client → commande.
--   Caissière            : Caisse uniquement. Le paiement validé transforme la commande en OF
--                          (automatiquement, selon le mode de règlement du client).
--   Chef de production   : arrivée des bobines (réceptions), stock et production (OF, fiche opérateur,
--                          vérification, fins de bobine) et bons de livraison.

-- ---------------------------------------------------------------------
-- 1. Devis soumis à la direction
-- ---------------------------------------------------------------------
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('brouillon', 'soumis', 'valide', 'converti', 'refuse', 'expire', 'annule'));
alter table public.quotes
  add column if not exists submitted_by  uuid references public.profiles (id),
  add column if not exists submitted_at  timestamptz,
  add column if not exists approved_by   uuid references public.profiles (id),
  add column if not exists approved_at   timestamptz,
  add column if not exists decision_note text;

create or replace function public.submit_quote(p_quote uuid)
returns void
language plpgsql
as $$
declare
  q public.quotes%rowtype;
begin
  if not (public.has_permission('quotes.create') or public.has_permission('quotes.edit')) then
    raise exception 'Vous n''avez pas le droit de soumettre un devis.';
  end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if q.status <> 'brouillon' then raise exception 'Seul un devis en brouillon peut être soumis.'; end if;
  if not exists (select 1 from public.document_lines where quote_id = q.id) then raise exception 'Le devis n''a aucune ligne.'; end if;
  update public.quotes set status = 'soumis', submitted_by = auth.uid(), submitted_at = now(), decision_note = null, updated_at = now()
  where id = q.id;
end;
$$;

create or replace function public.approve_quote(p_quote uuid)
returns void
language plpgsql
as $$
begin
  if not public.has_permission('quotes.validate') then
    raise exception 'Seule la direction peut valider un devis.';
  end if;
  update public.quotes set status = 'valide', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  where id = p_quote and status = 'soumis';
  if not found then raise exception 'Ce devis n''est pas en attente de validation.'; end if;
end;
$$;

create or replace function public.return_quote(p_quote uuid, p_note text)
returns void
language plpgsql
as $$
begin
  if not public.has_permission('quotes.validate') then
    raise exception 'Seule la direction peut renvoyer un devis.';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Indiquez le motif du renvoi.'; end if;
  update public.quotes set status = 'brouillon', decision_note = trim(p_note), updated_at = now()
  where id = p_quote and status = 'soumis';
  if not found then raise exception 'Ce devis n''est pas en attente de validation.'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. OF automatique : cœur de la création (sans contrôle de droit) + version « si possible »
-- ---------------------------------------------------------------------
create or replace function public.make_production_order(p_order uuid)
returns uuid
language plpgsql
as $$
declare
  o       public.sales_orders%rowtype;
  v_block text;
  v_of    uuid;
  v_wh    uuid;
  l       record;
  v_left  numeric;
  v_n     int := 0;
begin
  select * into o from public.sales_orders where id = p_order for update;
  v_block := public.order_production_block(p_order);
  if v_block is not null then raise exception '%', v_block; end if;
  if exists (select 1 from public.production_orders where order_id = p_order and status in ('cree', 'en_production', 'soumis')) then
    raise exception 'Un ordre de fabrication est déjà en cours pour cette commande.';
  end if;

  select id into v_wh from public.warehouses where id = o.warehouse_id and can_production;
  if v_wh is null then
    select id into v_wh from public.warehouses where can_production and is_active order by (type = 'production') desc, code limit 1;
  end if;
  if v_wh is null then raise exception 'Aucun dépôt de production n''est défini.'; end if;

  insert into public.production_orders (order_id, client_id, warehouse_id, status, planned_date, is_test)
  values (o.id, o.client_id, v_wh, 'cree', coalesce(o.delivery_date, current_date), o.is_test)
  returning id into v_of;

  for l in
    select dl.*, p.kind from public.document_lines dl join public.products p on p.id = dl.product_id
    where dl.order_id = o.id and p.kind in ('tole', 'faitiere')
    order by dl.position
  loop
    v_left := l.quantity - l.delivered_qty - public.order_line_in_production(l.id);
    if v_left > 0.0005 then
      v_n := v_n + 1;
      insert into public.production_order_lines (production_order_id, order_line_id, position, product_id, description, sheets_count, length_m, quantity)
      values (v_of, l.id, v_n, l.product_id, l.description,
              case when l.length_m > 0 then round(v_left / l.length_m)::int else l.sheets_count end,
              l.length_m, v_left);
    end if;
  end loop;
  if v_n = 0 then raise exception 'Il ne reste aucune tôle à produire pour cette commande.'; end if;

  update public.sales_orders set status = case when status = 'confirmee' then 'en_production' else status end, updated_at = now()
  where id = o.id;
  return v_of;
end;
$$;

-- Bouton « Créer l'OF » (direction)
create or replace function public.create_production_order(p_order uuid)
returns uuid
language plpgsql
as $$
begin
  if not public.has_permission('production.create') then
    raise exception 'Vous n''avez pas le droit de créer un ordre de fabrication.';
  end if;
  return public.make_production_order(p_order);
end;
$$;

-- Création automatique : seulement si la commande est prête (paiement suffisant, pas d'OF en cours, reste à produire)
create or replace function public.auto_production_order(p_order uuid)
returns uuid
language plpgsql
as $$
begin
  if p_order is null or public.order_production_block(p_order) is not null then return null; end if;
  if exists (select 1 from public.production_orders where order_id = p_order and status in ('cree', 'en_production', 'soumis')) then
    return null;
  end if;
  if not exists (
    select 1 from public.document_lines dl join public.products p on p.id = dl.product_id
    where dl.order_id = p_order and p.kind in ('tole', 'faitiere')
      and dl.quantity - dl.delivered_qty - public.order_line_in_production(dl.id) > 0.0005
  ) then
    return null;
  end if;
  begin
    return public.make_production_order(p_order);
  exception when others then
    return null;   -- l'encaissement ne doit jamais échouer à cause de l'OF ; il pourra être créé à la main
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Transformation du devis : uniquement un devis validé par la direction ;
--    client « paie après livraison » → l'OF est créé tout de suite
-- ---------------------------------------------------------------------
create or replace function public.convert_quote(p_quote uuid)
returns uuid
language plpgsql
as $$
declare
  q     public.quotes%rowtype;
  v_wh  uuid;
  v_ord uuid;
begin
  if not (public.has_permission('orders.create') or public.has_permission('sales.transform')) then
    raise exception 'Vous n''avez pas le droit de transformer un devis en commande.';
  end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if q.status <> 'valide' then
    raise exception 'Le devis doit d''abord être validé par la direction (statut actuel : %).', q.status;
  end if;
  if not exists (select 1 from public.document_lines where quote_id = q.id) then raise exception 'Le devis n''a aucune ligne.'; end if;

  v_wh := coalesce(q.warehouse_id, public.default_warehouse('production'));
  insert into public.sales_orders (quote_id, client_id, warehouse_id, sales_rep_id, delivery_address, notes, status, is_test)
  values (q.id, q.client_id, v_wh, q.sales_rep_id, q.delivery_address, q.notes, 'confirmee', q.is_test)
  returning id into v_ord;

  insert into public.document_lines (order_id, source_line_id, position, product_id, description, sheets_count, length_m,
                                     quantity, unit_price, discount_pct, vat_rate)
  select v_ord, l.id, l.position, l.product_id, l.description, l.sheets_count, l.length_m, l.quantity, l.unit_price,
         l.discount_pct, l.vat_rate
  from public.document_lines l where l.quote_id = q.id order by l.position;

  update public.quotes set status = 'converti', updated_at = now() where id = q.id;
  perform public.auto_production_order(v_ord);     -- clients à crédit
  return v_ord;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Encaissement : dès que le paiement suffit, la commande devient un OF
-- ---------------------------------------------------------------------
create or replace function public.record_payment(
  p_client uuid, p_order uuid, p_invoice uuid, p_account uuid, p_method uuid,
  p_amount numeric, p_reference text, p_phone text, p_notes text)
returns uuid
language plpgsql
as $$
declare
  v_acc  public.cash_accounts%rowtype;
  v_sess uuid;
  v_id   uuid;
  v_ord  uuid := p_order;
  v_due  numeric;
begin
  if not public.has_permission('payments.create') then
    raise exception 'Vous n''avez pas le droit d''encaisser.';
  end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Le montant doit être supérieur à 0.'; end if;
  select * into v_acc from public.cash_accounts where id = p_account;
  if not found then raise exception 'Compte de trésorerie introuvable.'; end if;
  if v_acc.type = 'caisse' then
    select id into v_sess from public.cash_sessions where cash_account_id = p_account and status = 'ouverte' limit 1;
    if v_sess is null then raise exception 'La caisse % n''est pas ouverte. Ouvrez la caisse avant d''encaisser.', v_acc.name; end if;
  end if;
  if p_invoice is not null and v_ord is null then
    select order_id into v_ord from public.invoices where id = p_invoice;
  end if;
  if p_invoice is not null then
    select total_ttc - amount_paid into v_due from public.invoices where id = p_invoice;
  elsif v_ord is not null then
    select total_ttc - amount_paid into v_due from public.sales_orders where id = v_ord;
  end if;
  if v_due is not null and p_amount > v_due + 0.01 then
    raise exception 'Le montant dépasse le reste à payer (% F).', v_due;
  end if;

  insert into public.payments (client_id, order_id, invoice_id, cash_account_id, cash_session_id, payment_method_id,
                               amount, reference, phone_number, notes)
  values (p_client, v_ord, p_invoice, p_account, v_sess, p_method, p_amount,
          nullif(trim(p_reference), ''), nullif(trim(p_phone), ''), nullif(trim(p_notes), ''))
  returning id into v_id;

  if v_ord is not null then perform public.order_refresh_paid(v_ord); end if;
  perform public.allocate_payment(v_id);
  perform public.auto_production_order(v_ord);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Les 4 rôles de la version simple
-- ---------------------------------------------------------------------
update public.roles set name = 'Caissière' where code = 'caissier';
update public.roles set name = 'Responsable commercial' where code = 'responsable_commercial';
update public.roles set name = 'Chef de production' where code = 'chef_production';

-- Directeur Général : toutes les permissions
insert into public.role_permissions (role_code, permission_code)
select 'directeur', code from public.permissions
on conflict do nothing;

-- Responsable commercial : Devis et Commandes (création de client depuis le devis)
delete from public.role_permissions where role_code = 'responsable_commercial';
insert into public.role_permissions (role_code, permission_code)
select 'responsable_commercial', p from unnest(array[
  'quotes.view', 'quotes.create', 'quotes.edit', 'sales.transform', 'orders.view', 'clients.create'
]) p
on conflict do nothing;

-- Caissière : Caisse uniquement
delete from public.role_permissions where role_code = 'caissier';
insert into public.role_permissions (role_code, permission_code)
select 'caissier', p from unnest(array['payments.view', 'payments.create']) p
on conflict do nothing;

-- Chef de production : réceptions de bobines, stock, production, bons de livraison
delete from public.role_permissions where role_code = 'chef_production';
insert into public.role_permissions (role_code, permission_code)
select 'chef_production', p from unnest(array[
  'products.view', 'receptions.view', 'receptions.create', 'receptions.validate',
  'stocks.view', 'stocks.transfer', 'stocks.transfer.receive', 'stocks.coil_end',
  'production.view', 'production.create', 'production.launch', 'production.declare',
  'deliveries.view', 'deliveries.edit', 'deliveries.validate'
]) p
on conflict do nothing;
