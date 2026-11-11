-- =====================================================================
-- ERP OA Metal — Ventes et Trésorerie (circuit simplifié)
--   Clients → Devis → Commande → Caisse (encaissement) → BL → Facture
-- À exécuter une seule fois, après 0013.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Clients
-- ---------------------------------------------------------------------
alter table public.clients
  add column if not exists trade_name       text,
  add column if not exists category         text,
  add column if not exists phone2           text,
  add column if not exists country          text not null default 'BF',
  add column if not exists quartier         text,
  add column if not exists contacts         jsonb not null default '[]'::jsonb,
  add column if not exists default_discount numeric(5,2) not null default 0,
  add column if not exists soumis_tva       boolean not null default true,
  add column if not exists sales_rep_id     uuid references public.profiles (id),
  add column if not exists notes            text;

create or replace function public.client_auto_code()
returns trigger
language plpgsql
as $$
declare
  v_max int;
begin
  if new.code is null or trim(new.code) = '' then
    select coalesce(max(substring(code from '^CLI(\d+)$')::int), 0) into v_max
    from public.clients where code ~ '^CLI\d+$';
    new.code := 'CLI' || lpad((v_max + 1)::text, 4, '0');
  else
    new.code := upper(trim(new.code));
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_client_auto_code on public.clients;
create trigger trg_client_auto_code before insert or update on public.clients
  for each row execute function public.client_auto_code();

-- ---------------------------------------------------------------------
-- 2. Lignes de documents : quantité livrée, totaux des documents
-- ---------------------------------------------------------------------
alter table public.document_lines
  add column if not exists delivered_qty numeric(14,3) not null default 0;

alter table public.quotes add column if not exists delivery_address text;
alter table public.quotes add column if not exists payment_terms text;

create or replace function public.doc_refresh_totals()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  for r in select coalesce(new.quote_id, old.quote_id) as q, coalesce(new.order_id, old.order_id) as o,
                  coalesce(new.invoice_id, old.invoice_id) as i
  loop
    if r.q is not null then
      update public.quotes d set total_ht = x.ht, total_tva = x.tva, total_ttc = x.ht + x.tva, updated_at = now()
      from (select coalesce(sum(total_ht), 0) ht, coalesce(sum(round(total_ht * vat_rate / 100, 2)), 0) tva
            from public.document_lines where quote_id = r.q) x where d.id = r.q;
    end if;
    if r.o is not null then
      update public.sales_orders d set total_ht = x.ht, total_tva = x.tva, total_ttc = x.ht + x.tva, updated_at = now()
      from (select coalesce(sum(total_ht), 0) ht, coalesce(sum(round(total_ht * vat_rate / 100, 2)), 0) tva
            from public.document_lines where order_id = r.o) x where d.id = r.o;
    end if;
    if r.i is not null then
      update public.invoices d set total_ht = x.ht, total_tva = x.tva, total_ttc = x.ht + x.tva
      from (select coalesce(sum(total_ht), 0) ht, coalesce(sum(round(total_ht * vat_rate / 100, 2)), 0) tva
            from public.document_lines where invoice_id = r.i) x where d.id = r.i;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_doc_lines_totals on public.document_lines;
create trigger trg_doc_lines_totals after insert or update or delete on public.document_lines
  for each row execute function public.doc_refresh_totals();

-- ---------------------------------------------------------------------
-- 3. Devis → Commande
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
  if q.status not in ('brouillon', 'valide') then raise exception 'Ce devis est déjà converti, refusé ou annulé.'; end if;
  if not exists (select 1 from public.document_lines where quote_id = q.id) then raise exception 'Le devis n''a aucune ligne.'; end if;

  v_wh := coalesce(q.warehouse_id, public.default_warehouse('production'));
  insert into public.sales_orders (quote_id, client_id, warehouse_id, sales_rep_id, delivery_address, notes, status)
  values (q.id, q.client_id, v_wh, q.sales_rep_id, q.delivery_address, q.notes, 'confirmee')
  returning id into v_ord;

  insert into public.document_lines (order_id, source_line_id, position, product_id, description, sheets_count, length_m,
                                     quantity, unit_price, discount_pct, vat_rate)
  select v_ord, l.id, l.position, l.product_id, l.description, l.sheets_count, l.length_m, l.quantity, l.unit_price,
         l.discount_pct, l.vat_rate
  from public.document_lines l where l.quote_id = q.id order by l.position;

  update public.quotes set status = 'converti', updated_at = now() where id = q.id;
  return v_ord;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Caisse : sessions, encaissements, imputation sur facture
-- ---------------------------------------------------------------------
alter table public.payments add column if not exists invoice_id uuid references public.invoices (id);
alter table public.payments add column if not exists cancel_reason text;

-- Solde attendu d'une session : ouverture + espèces encaissées + entrées - sorties
create or replace function public.cash_session_expected(p_session uuid)
returns numeric
language sql
stable
as $$
  select s.opening_balance
       + coalesce((select sum(p.amount) from public.payments p join public.payment_methods m on m.id = p.payment_method_id
                   where p.cash_session_id = s.id and p.status = 'confirme' and m.type = 'especes'), 0)
       + coalesce((select sum(case when o.direction = 'entree' then o.amount else -o.amount end)
                   from public.cash_operations o where o.cash_session_id = s.id), 0)
  from public.cash_sessions s where s.id = p_session
$$;

create or replace function public.open_cash_session(p_account uuid, p_opening numeric)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not public.has_permission('payments.create') then
    raise exception 'Vous n''avez pas le droit d''ouvrir une caisse.';
  end if;
  if exists (select 1 from public.cash_sessions where cash_account_id = p_account and status = 'ouverte') then
    raise exception 'Cette caisse est déjà ouverte.';
  end if;
  insert into public.cash_sessions (cash_account_id, cashier_id, opening_balance)
  values (p_account, auth.uid(), coalesce(p_opening, 0))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.close_cash_session(p_session uuid, p_counted numeric, p_reason text)
returns numeric
language plpgsql
as $$
declare
  s     public.cash_sessions%rowtype;
  v_exp numeric;
begin
  if not public.has_permission('payments.create') then
    raise exception 'Vous n''avez pas le droit de clôturer la caisse.';
  end if;
  select * into s from public.cash_sessions where id = p_session for update;
  if not found then raise exception 'Session introuvable.'; end if;
  if s.status <> 'ouverte' then raise exception 'Cette caisse est déjà clôturée.'; end if;
  v_exp := public.cash_session_expected(s.id);
  if p_counted <> v_exp and coalesce(trim(p_reason), '') = '' then
    raise exception 'Écart de % F : indiquez le motif.', p_counted - v_exp;
  end if;
  update public.cash_sessions
  set status = 'cloturee', closed_at = now(), expected_balance = v_exp, counted_balance = p_counted,
      difference_reason = nullif(trim(p_reason), '')
  where id = s.id;
  return p_counted - v_exp;
end;
$$;

-- Recalcul d'une facture à partir de ses imputations
create or replace function public.invoice_refresh_paid(p_invoice uuid)
returns void
language plpgsql
as $$
begin
  update public.invoices i
  set amount_paid = x.paid,
      status = case when i.status in ('annulee', 'brouillon') then i.status
                    when x.paid >= i.total_ttc and i.total_ttc > 0 then 'payee'
                    when x.paid > 0 then 'partiellement_payee'
                    else 'emise' end
  from (select coalesce(sum(a.amount), 0) paid from public.payment_allocations a
        join public.payments p on p.id = a.payment_id and p.status = 'confirme'
        where a.invoice_id = p_invoice) x
  where i.id = p_invoice;
end;
$$;

-- Impute ce qui reste d'un encaissement sur les factures ouvertes de sa commande (ou sa facture)
create or replace function public.allocate_payment(p_payment uuid)
returns void
language plpgsql
as $$
declare
  p      public.payments%rowtype;
  inv    record;
  v_left numeric;
  v_amt  numeric;
begin
  select * into p from public.payments where id = p_payment;
  if not found or p.status <> 'confirme' then return; end if;
  v_left := p.amount - coalesce((select sum(amount) from public.payment_allocations where payment_id = p.id), 0);
  for inv in
    select i.id, i.total_ttc - i.amount_paid as due
    from public.invoices i
    where i.status in ('emise', 'partiellement_payee')
      and ((p.invoice_id is not null and i.id = p.invoice_id) or (p.invoice_id is null and p.order_id is not null and i.order_id = p.order_id))
    order by i.issued_at, i.number
  loop
    exit when v_left <= 0;
    v_amt := least(v_left, inv.due);
    if v_amt > 0 then
      insert into public.payment_allocations (payment_id, invoice_id, amount) values (p.id, inv.id, v_amt)
      on conflict (payment_id, invoice_id) do update set amount = public.payment_allocations.amount + excluded.amount;
      perform public.invoice_refresh_paid(inv.id);
      v_left := v_left - v_amt;
    end if;
  end loop;
end;
$$;

-- Montant encaissé d'une commande
create or replace function public.order_refresh_paid(p_order uuid)
returns void
language sql
as $$
  update public.sales_orders o set amount_paid = coalesce((select sum(amount) from public.payments
    where order_id = o.id and status = 'confirme'), 0), updated_at = now()
  where o.id = p_order
$$;

-- Encaissement client depuis la caisse
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
  -- On n'encaisse pas plus que le reste dû
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
  return v_id;
end;
$$;

create or replace function public.cancel_payment(p_payment uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  p public.payments%rowtype;
  a record;
begin
  if not public.has_permission('payments.cancel') then
    raise exception 'Vous n''avez pas le droit d''annuler un encaissement.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indiquez le motif de l''annulation.'; end if;
  select * into p from public.payments where id = p_payment for update;
  if not found or p.status <> 'confirme' then raise exception 'Encaissement introuvable ou déjà annulé.'; end if;
  if p.cash_session_id is not null and exists (select 1 from public.cash_sessions where id = p.cash_session_id and status = 'cloturee') then
    raise exception 'La caisse de cet encaissement est clôturée.';
  end if;
  update public.payments set status = 'annule', cancel_reason = trim(p_reason) where id = p.id;
  for a in select invoice_id from public.payment_allocations where payment_id = p.id loop
    perform public.invoice_refresh_paid(a.invoice_id);
  end loop;
  if p.order_id is not null then perform public.order_refresh_paid(p.order_id); end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Bon de livraison : sortie de stock à la validation
-- ---------------------------------------------------------------------
create or replace function public.validate_delivery(p_delivery uuid)
returns int
language plpgsql
as $$
declare
  d    public.deliveries%rowtype;
  l    record;
  v_n  int := 0;
  v_c  text;
  v_left numeric;
begin
  if not public.has_permission('deliveries.validate') then
    raise exception 'Vous n''avez pas le droit de valider un bon de livraison.';
  end if;
  select * into d from public.deliveries where id = p_delivery for update;
  if not found then raise exception 'Bon de livraison introuvable.'; end if;
  if d.status <> 'brouillon' then raise exception 'Ce bon de livraison est déjà validé ou annulé.'; end if;
  select name into v_c from public.clients where id = d.client_id;

  for l in select dl.*, src.quantity as ordered, src.delivered_qty as already
           from public.document_lines dl left join public.document_lines src on src.id = dl.source_line_id
           where dl.delivery_id = d.id
  loop
    v_left := coalesce(l.ordered, l.quantity) - coalesce(l.already, 0);
    if l.quantity > v_left + 0.0005 then
      raise exception 'La ligne « % » dépasse la quantité restant à livrer (%).', l.description, v_left;
    end if;
    if l.product_id is not null then
      insert into public.stock_movements (product_id, warehouse_id, quantity, type, reason, source_table, source_id)
      values (l.product_id, d.warehouse_id, -l.quantity, 'livraison', d.number || ' — ' || coalesce(v_c, ''), 'deliveries', d.id);
    end if;
    if l.source_line_id is not null then
      update public.document_lines set delivered_qty = delivered_qty + l.quantity where id = l.source_line_id;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Le bon de livraison n''a aucune ligne.'; end if;

  update public.deliveries set status = 'validee', validated_by = auth.uid(), validated_at = now() where id = d.id;

  update public.sales_orders o
  set status = case
        when o.status = 'facturee' then o.status
        when not exists (select 1 from public.document_lines where order_id = o.id and delivered_qty < quantity) then 'livree'
        else 'partiellement_livree' end,
      updated_at = now()
  where o.id = d.order_id;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Facture depuis la commande, avec lettrage des encaissements
-- ---------------------------------------------------------------------
create or replace function public.invoice_order(p_order uuid)
returns uuid
language plpgsql
as $$
declare
  o     public.sales_orders%rowtype;
  v_inv uuid;
  v_days int;
  p     record;
begin
  if not public.has_permission('invoices.create') then
    raise exception 'Vous n''avez pas le droit de facturer.';
  end if;
  select * into o from public.sales_orders where id = p_order for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if o.status in ('brouillon', 'annulee') then raise exception 'Cette commande ne peut pas être facturée.'; end if;
  if exists (select 1 from public.invoices where order_id = o.id and status <> 'annulee') then
    raise exception 'Cette commande est déjà facturée.';
  end if;
  select payment_days into v_days from public.clients where id = o.client_id;

  insert into public.invoices (order_id, client_id, issued_at, due_at, status, validated_by, validated_at)
  values (o.id, o.client_id, current_date, current_date + coalesce(v_days, 0), 'emise', auth.uid(), now())
  returning id into v_inv;

  insert into public.document_lines (invoice_id, source_line_id, position, product_id, description, sheets_count, length_m,
                                     quantity, unit_price, discount_pct, vat_rate)
  select v_inv, l.id, l.position, l.product_id, l.description, l.sheets_count, l.length_m, l.quantity, l.unit_price,
         l.discount_pct, l.vat_rate
  from public.document_lines l where l.order_id = o.id order by l.position;

  -- Lettrage : les encaissements de la commande règlent la facture
  for p in select id from public.payments where order_id = o.id and status = 'confirme' order by paid_at loop
    perform public.allocate_payment(p.id);
  end loop;
  perform public.invoice_refresh_paid(v_inv);

  update public.sales_orders set status = 'facturee', updated_at = now() where id = o.id;
  return v_inv;
end;
$$;

create or replace function public.cancel_invoice(p_invoice uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  i public.invoices%rowtype;
begin
  if not public.has_permission('invoices.delete') then
    raise exception 'Vous n''avez pas le droit d''annuler une facture.';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Indiquez le motif de l''annulation.'; end if;
  select * into i from public.invoices where id = p_invoice for update;
  if not found or i.status = 'annulee' then raise exception 'Facture introuvable ou déjà annulée.'; end if;
  delete from public.payment_allocations where invoice_id = i.id;
  update public.invoices set status = 'annulee', cancel_reason = trim(p_reason), amount_paid = 0 where id = i.id;
  if i.order_id is not null then
    update public.sales_orders o set status = case
      when not exists (select 1 from public.document_lines where order_id = o.id and delivered_qty < quantity) then 'livree'
      when exists (select 1 from public.document_lines where order_id = o.id and delivered_qty > 0) then 'partiellement_livree'
      else 'confirmee' end
    where o.id = i.order_id;
  end if;
end;
$$;

-- Solde dû par client (factures émises non réglées)
create or replace view public.client_balances
with (security_invoker = true) as
select c.id as client_id,
       coalesce((select sum(total_ttc - amount_paid) from public.invoices i
                 where i.client_id = c.id and i.status in ('emise', 'partiellement_payee')), 0) as balance_due,
       coalesce((select sum(total_ttc) from public.sales_orders o
                 where o.client_id = c.id and o.status not in ('annulee', 'brouillon')), 0) as ordered_total
from public.clients c;
