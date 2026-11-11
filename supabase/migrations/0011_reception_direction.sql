-- =====================================================================
-- ERP OA Metal — réception en deux temps
--   1. Le gestionnaire de stock vérifie les bobines (conforme / refusée)
--      et soumet la réception à la direction
--   2. La direction décide : entrée en stock, renvoi au magasin, ou refus
-- À exécuter une seule fois, après 0010.
-- =====================================================================

-- 1. Statuts : brouillon (en vérification) → soumise (à valider) → validee / refusee
alter table public.receptions drop constraint if exists receptions_status_check;
alter table public.receptions add constraint receptions_status_check
  check (status in ('brouillon', 'soumise', 'validee', 'refusee', 'annulee'));

alter table public.receptions
  add column if not exists submitted_by  uuid references public.profiles (id),
  add column if not exists submitted_at  timestamptz,
  add column if not exists decided_by    uuid references public.profiles (id),
  add column if not exists decided_at    timestamptz,
  add column if not exists decision_note text;

-- 2. Nouvelle permission : décision de la direction
insert into public.permissions (code, group_name, label, sort_order)
values ('receptions.approve', 'Réceptions', 'Approuver l''entrée en stock (direction)', 62)
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r, 'receptions.approve' from unnest(array['directeur', 'directeur_usine']) r
where exists (select 1 from public.roles where code = r)
on conflict do nothing;

-- 3. Le magasin soumet la réception vérifiée
create or replace function public.submit_reception(p_reception uuid)
returns void
language plpgsql
as $$
declare
  r public.receptions%rowtype;
begin
  if not public.has_permission('receptions.create') then
    raise exception 'Vous n''avez pas le droit de soumettre une réception.';
  end if;
  select * into r from public.receptions where id = p_reception for update;
  if not found then raise exception 'Réception introuvable.'; end if;
  if r.status <> 'brouillon' then raise exception 'Cette réception a déjà été soumise.'; end if;
  if not exists (select 1 from public.reception_lines where reception_id = r.id) then
    raise exception 'Aucune bobine saisie sur cette réception.';
  end if;
  if exists (select 1 from public.reception_lines where reception_id = r.id and quality_status in ('en_attente', 'quarantaine')) then
    raise exception 'Cochez Conforme ou Refusée pour chaque bobine avant de soumettre.';
  end if;
  update public.receptions
  set status = 'soumise', submitted_by = auth.uid(), submitted_at = now(),
      decided_by = null, decided_at = null
  where id = r.id;
end;
$$;

-- 4. La direction renvoie au magasin (correction) ou refuse l'arrivage
create or replace function public.reject_reception(p_reception uuid, p_note text, p_back_to_store boolean)
returns void
language plpgsql
as $$
declare
  r public.receptions%rowtype;
begin
  if not public.has_permission('receptions.approve') then
    raise exception 'Seule la direction peut décider de cette réception.';
  end if;
  select * into r from public.receptions where id = p_reception for update;
  if not found then raise exception 'Réception introuvable.'; end if;
  if r.status <> 'soumise' then raise exception 'Cette réception n''est pas en attente de décision.'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Indiquez le motif.'; end if;
  update public.receptions
  set status = case when p_back_to_store then 'brouillon' else 'refusee' end,
      decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
  where id = r.id;
end;
$$;

-- 5. La direction valide : entrée en stock des bobines conformes
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
  if not public.has_permission('receptions.approve') then
    raise exception 'Seule la direction peut valider l''entrée en stock.';
  end if;

  select * into r from public.receptions where id = p_reception for update;
  if not found then raise exception 'Réception introuvable.'; end if;
  if r.status <> 'soumise' then raise exception 'La réception doit d''abord être vérifiée et soumise par le magasin.'; end if;
  if exists (select 1 from public.reception_lines where reception_id = r.id and quality_status in ('en_attente', 'quarantaine')) then
    raise exception 'Toutes les bobines doivent être vérifiées (conforme ou refusée).';
  end if;

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
  set status = 'validee', validated_by = auth.uid(), validated_at = now(),
      decided_by = auth.uid(), decided_at = now()
  where id = r.id;

  return v_count;
end;
$$;
