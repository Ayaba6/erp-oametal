import { Fragment, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Warehouse, loadWarehouses } from '../../lib/depots'
import { nextReference } from '../stocks/bobineData'
import { PoLine, PurchaseOrder, Quality, Reception, dateFr, dateTimeFr, loadOrder, loadReception, num, qualityInfo, recStatus, toNum } from './achatsData'
import { printReception } from './printReception'

// Une bobine arrivée (ligne de réception)
type Coil = {
  key: number
  id?: string
  po_line_id: string
  coil_reference: string
  lot_number: string
  supplier_coil_no: string
  thickness_mm: string
  width_mm: string
  quantity: string
  gross_weight_kg: string
  length_m: string
  unit_cost: string
  quality_status: Quality
  quality_note: string
}

let seq = 0
const s = (v: number | null | undefined) => (v == null ? '' : String(v))
const kgOf = (c: Coil) => toNum(c.quantity) ?? 0
const cell =
  'w-full border border-gray-300 rounded px-2 py-0.5 text-xs focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none disabled:bg-transparent disabled:border-transparent'
const lotFor = (date: string, i: number) => `LOT-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-${String(i).padStart(4, '0')}`
const netPrice = (pl?: PoLine) => (pl ? Math.round(Number(pl.unit_price) * (1 - Number(pl.discount_percent) / 100) * 100) / 100 : 0)
export default function ReceptionShow() {
  const { id } = useParams()
  const ctx = useOutletContext<AppContext>()
  const [rec, setRec] = useState<Reception | null>(null)
  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [coils, setCoils] = useState<Coil[]>([])
  const [removed, setRemoved] = useState<string[]>([])
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [creator, setCreator] = useState('')
  const [usedRefs, setUsedRefs] = useState<string[]>([])
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [depot, setDepot] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState(false)
  const [prepared, setPrepared] = useState(false)
  const [decision, setDecision] = useState<null | 'back' | 'refuse'>(null)
  const [note, setNote] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function reload() {
    const r = await loadReception(id!)
    setRec(r)
    if (!r) return
    setDate(r.received_at)
    setNotes(r.notes ?? '')
    setDepot(r.warehouse_id)
    setCoils(
      r.reception_lines.map((l) => ({
        key: ++seq,
        id: l.id,
        po_line_id: l.po_line_id ?? '',
        coil_reference: l.coil_reference ?? '',
        lot_number: l.lot_number ?? '',
        supplier_coil_no: l.supplier_coil_no ?? '',
        thickness_mm: s(l.thickness_mm),
        width_mm: s(l.width_mm),
        quantity: s(l.quantity),
        gross_weight_kg: s(l.gross_weight_kg),
        length_m: s(l.length_m),
        unit_cost: s(l.unit_cost),
        quality_status: l.quality_status,
        quality_note: l.quality_note ?? '',
      })),
    )
    setRemoved([])
    setPrepared(false)
    setDirty(false)
    const [o, c, l, w, p] = await Promise.all([
      r.purchase_order_id ? loadOrder(r.purchase_order_id) : Promise.resolve(null),
      supabase.from('coils').select('reference'),
      supabase.from('reception_lines').select('coil_reference').neq('reception_id', r.id).not('coil_reference', 'is', null),
      loadWarehouses(),
      supabase.from('receptions').select('created_by').eq('id', r.id).maybeSingle(),
    ])
    setPo(o)
    const used = [
      ...((c.data as { reference: string }[]) ?? []).map((x) => x.reference),
      ...((l.data as { coil_reference: string }[]) ?? []).map((x) => x.coil_reference),
    ]
    setUsedRefs(used)
    // Réception neuve : la liste des bobines attendues est préparée à partir de la commande
    if (o && r.status === 'brouillon' && r.reception_lines.length === 0) {
      const out: Coil[] = []
      for (const pl of o.purchase_order_lines) {
        const rest = Math.max(0, Number(pl.quantity) - Number(pl.received_qty))
        if (rest <= 0) continue
        const n = pl.coils_count && pl.coils_count > 0 ? pl.coils_count : Math.max(1, Math.round(rest / 4000))
        const each = Math.round((rest / n) * 100) / 100
        for (let i = 0; i < n; i++) {
          const w = i === n - 1 ? Math.round((rest - each * (n - 1)) * 100) / 100 : each
          out.push(blank(pl, out.map((x) => x.coil_reference), out.length + 1, String(w), used, r.received_at))
        }
      }
      if (out.length) {
        setCoils(out)
        setDirty(true)
        setPrepared(true)
      }
    }
    setDepots(w.filter((d) => d.is_active))
    const by = (p.data as { created_by: string | null } | null)?.created_by
    const ids = [by, r.submitted_by, r.decided_by].filter(Boolean) as string[]
    if (ids.length) {
      const { data } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      const m: Record<string, string> = {}
      ;((data as { id: string; full_name: string }[]) ?? []).forEach((x) => (m[x.id] = x.full_name))
      setNames(m)
      setCreator(by ? m[by] ?? '' : '')
    }
  }
  useEffect(() => {
    reload()
  }, [id])

  const lines = po?.purchase_order_lines ?? []
  const editable = rec?.status === 'brouillon' && ctx.can('receptions.create')
  const lineOf = (pid: string) => lines.find((l) => l.id === pid)

  function touch() {
    setDirty(true)
    setMsg(null)
  }
  function update(key: number, patch: Partial<Coil>) {
    setCoils((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
    touch()
  }
  function blank(pl: PoLine, refs: string[], rank: number, weight = '', used = usedRefs, day = date): Coil {
    return {
      key: ++seq,
      po_line_id: pl.id,
      coil_reference: nextReference([...used, ...refs]),
      lot_number: lotFor(day || new Date().toISOString().slice(0, 10), rank),
      supplier_coil_no: '',
      thickness_mm: s(pl.products?.thickness_mm),
      width_mm: s(pl.products?.width_mm),
      quantity: weight,
      gross_weight_kg: '',
      length_m: '',
      unit_cost: String(netPrice(pl)),
      quality_status: 'en_attente',
      quality_note: '',
    }
  }
  function addCoil(pl: PoLine) {
    setCoils((cs) => [...cs, blank(pl, cs.map((c) => c.coil_reference), cs.length + 1)])
    touch()
  }
  // Répartit le reste attendu sur N bobines (remplace les bobines de cette ligne)
  function spread(pl: PoLine) {
    const old = coils.filter((c) => c.po_line_id === pl.id && c.id).map((c) => c.id!)
    if (old.length) setRemoved((r) => [...r, ...old])
    const n = Math.max(1, Math.min(200, Math.round(toNum(counts[pl.id] ?? '') ?? 1)))
    const rest = Math.max(0, Number(pl.quantity) - Number(pl.received_qty))
    const each = Math.round((rest / n) * 100) / 100
    setCoils((cs) => {
      const others = cs.filter((c) => c.po_line_id !== pl.id)
      const out = [...others]
      for (let i = 0; i < n; i++) {
        const w = i === n - 1 ? Math.round((rest - each * (n - 1)) * 100) / 100 : each
        out.push(blank(pl, out.map((c) => c.coil_reference), out.length + 1, w ? String(w) : ''))
      }
      return out
    })
    touch()
  }
  function remove(c: Coil) {
    if (c.id) setRemoved((r) => [...r, c.id!])
    setCoils((cs) => cs.filter((x) => x.key !== c.key))
    touch()
  }
  function allConform(plId?: string) {
    setCoils((cs) => cs.map((c) => (c.quality_status === 'en_attente' && (!plId || c.po_line_id === plId) ? { ...c, quality_status: 'libere' } : c)))
    touch()
  }

  async function save(): Promise<boolean> {
    if (!rec) return false
    const bad = coils.find((c) => !c.po_line_id || !(kgOf(c) > 0))
    if (bad) return fail(`Bobine ${bad.coil_reference || '?'} : saisissez le poids reçu.`, false)
    const refs = coils.map((c) => c.coil_reference.trim().toUpperCase()).filter(Boolean)
    const dup = refs.find((r, i) => refs.indexOf(r) !== i)
    if (dup) return fail(`Le numéro ${dup} est saisi deux fois.`, false)
    const h = await supabase.from('receptions').update({ received_at: date, notes: notes.trim() || null, warehouse_id: depot || rec.warehouse_id }).eq('id', rec.id)
    if (h.error) return fail(h.error.message)
    if (removed.length) {
      const d = await supabase.from('reception_lines').delete().in('id', removed)
      if (d.error) return fail(d.error.message)
    }
    const toRow = (c: Coil) => ({
      reception_id: rec.id,
      po_line_id: c.po_line_id,
      product_id: lineOf(c.po_line_id)!.product_id,
      coil_reference: c.coil_reference.trim().toUpperCase() || null,
      lot_number: c.lot_number.trim() || null,
      supplier_coil_no: c.supplier_coil_no.trim() || null,
      thickness_mm: toNum(c.thickness_mm),
      width_mm: toNum(c.width_mm),
      quantity: kgOf(c),
      gross_weight_kg: toNum(c.gross_weight_kg),
      length_m: toNum(c.length_m),
      unit_cost: toNum(c.unit_cost) ?? 0,
      quality_status: c.quality_status,
      quality_note: c.quality_note.trim() || null,
    })
    for (const c of coils.filter((x) => x.id)) {
      const u = await supabase.from('reception_lines').update(toRow(c)).eq('id', c.id!)
      if (u.error) return fail(u.error.message)
    }
    const fresh = coils.filter((x) => !x.id).map(toRow)
    if (fresh.length) {
      const i = await supabase.from('reception_lines').insert(fresh)
      if (i.error) return fail(i.error.message)
    }
    return true
  }
  function fail(text: string, prefix = true) {
    setMsg({ ok: false, text: prefix ? "L'enregistrement a échoué : " + text : text })
    return false
  }

  async function onSave() {
    setBusy(true)
    if (await save()) {
      await reload()
      setMsg({ ok: true, text: 'Réception enregistrée.' })
    }
    setBusy(false)
  }

  async function onValidate() {
    if (!depot) return fail("Choisissez l'entrepôt de destination.", false)
    setBusy(true)
    setMsg(null)
    if (depot !== rec!.warehouse_id) {
      const u = await supabase.from('receptions').update({ warehouse_id: depot }).eq('id', rec!.id)
      if (u.error) {
        setBusy(false)
        return fail(u.error.message)
      }
    }
    const { data, error } = await supabase.rpc('validate_reception', { p_reception: rec!.id })
    await reload()
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setModal(false)
    setMsg({ ok: true, text: `${data} bobine(s) entrée(s) en stock.` })
  }

  // Le magasin soumet la réception vérifiée à la direction
  async function onSubmit() {
    setBusy(true)
    setMsg(null)
    if (dirty && !(await save())) return setBusy(false)
    const { error } = await supabase.rpc('submit_reception', { p_reception: rec!.id })
    await reload()
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: 'Réception soumise à la direction pour décision.' })
  }

  // La direction renvoie au magasin ou refuse l'arrivage
  async function onReject() {
    if (!note.trim()) return fail('Indiquez le motif.', false)
    setBusy(true)
    const { error } = await supabase.rpc('reject_reception', { p_reception: rec!.id, p_note: note.trim(), p_back_to_store: decision === 'back' })
    await reload()
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: decision === 'back' ? 'Réception renvoyée au magasin pour correction.' : 'Arrivage refusé : rien n’entre en stock.' })
    setDecision(null)
    setNote('')
  }

  async function onCancel() {
    setBusy(true)
    const r = await supabase.from('receptions').update({ status: 'annulee' }).eq('id', rec!.id)
    setBusy(false)
    if (r.error) return fail(r.error.message)
    reload()
  }

  if (!rec) return null
  const st = recStatus(rec.status)

  // Vérification ligne par ligne de la commande
  const check = lines.map((pl) => {
    const mine = coils.filter((c) => c.po_line_id === pl.id)
    const ok = mine.filter((c) => c.quality_status === 'libere')
    const okKg = ok.reduce((t, c) => t + kgOf(c), 0)
    // Une fois validée, la quantité de cette réception est déjà comptée dans « reçu »
    const before = Math.max(0, Number(pl.received_qty) - (rec?.status === 'validee' ? okKg : 0))
    const rest = Math.max(0, Number(pl.quantity) - before)
    const allKg = mine.reduce((t, c) => t + kgOf(c), 0)
    const pending = mine.filter((c) => c.quality_status === 'en_attente').length
    const refused = mine.filter((c) => c.quality_status === 'refuse').length
    const disposition =
      mine.length === 0
        ? { label: 'Non livré', badge: 'bg-gray-100 text-gray-500' }
        : pending
          ? { label: 'À vérifier', badge: 'bg-amber-100 text-amber-700' }
          : okKg === 0
            ? { label: 'Refusé', badge: 'bg-red-100 text-red-700' }
            : refused || okKg < rest - 0.005
              ? { label: 'Partiel', badge: 'bg-amber-100 text-amber-800' }
              : { label: 'Accepté', badge: 'bg-emerald-100 text-emerald-700' }
    return { pl, mine, before, rest, okKg, allKg, pending, refused, disposition }
  })
  const pendingAll = coils.filter((c) => c.quality_status === 'en_attente').length
  const okAll = coils.filter((c) => c.quality_status === 'libere')
  const okKgAll = okAll.reduce((t, c) => t + kgOf(c), 0)
  const totale = check.length > 0 && check.every((x) => x.okKg >= x.rest - 0.005)
  const mpDepots = depots.filter((d) => d.type === 'matiere_premiere')
  const canDecide = rec.status === 'soumise' && ctx.can('receptions.approve')
  const canSubmit = editable && ctx.can('receptions.create')

  const card = (label: string, value: string) => (
    <div className="bg-white rounded-[4px] border border-gray-300 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-semibold text-gray-900 truncate">{value || '—'}</p>
    </div>
  )
  const thc = 'px-3 py-1.5 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[16px] font-bold text-gray-900">{rec.number}</h1>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-[3px] text-[11px] font-semibold border ${st.badge}`}>{st.label}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Fournisseur : <strong>{rec.suppliers?.name}</strong>
            {po && (
              <>
                {' · BC : '}
                <Link to={`/achats/commandes/${po.id}`} className="text-emerald-700 hover:underline font-mono">
                  {po.number}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/achats/receptions" className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-[4px]">
            Retour
          </Link>
          <button type="button" onClick={() => printReception(rec, po, coils, creator)} className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-[4px] inline-flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimer la fiche de contrôle
          </button>
          {editable && (
            <button type="button" onClick={onSave} disabled={busy || !dirty} className="border border-emerald-500 text-emerald-700 bg-white hover:bg-emerald-50 text-sm font-semibold px-3 py-1.5 rounded-[4px] disabled:opacity-50">
              Enregistrer
            </button>
          )}
          {rec.status === 'brouillon' && ctx.can('receptions.cancel') && (
            <button type="button" onClick={onCancel} disabled={busy} className="border border-red-300 text-red-700 hover:bg-red-50 text-sm px-3 py-1.5 rounded-[4px]">
              Annuler la réception
            </button>
          )}
          {canSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || coils.length === 0 || pendingAll > 0}
              title={pendingAll > 0 ? 'Cochez Conforme ou Refusée pour chaque bobine' : ''}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded-[4px] disabled:opacity-50"
            >
              Soumettre à la direction
            </button>
          )}
          {canDecide && (
            <>
              <button type="button" onClick={() => (setDecision('back'), setNote(''))} className="border border-amber-400 text-amber-800 hover:bg-amber-50 text-sm px-3 py-1.5 rounded-[4px]">
                Renvoyer au magasin
              </button>
              <button type="button" onClick={() => (setDecision('refuse'), setNote(''))} className="border border-red-300 text-red-700 hover:bg-red-50 text-sm px-3 py-1.5 rounded-[4px]">
                Refuser l'arrivage
              </button>
              <button
                type="button"
                onClick={() => setModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-1.5 rounded-[4px] flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Valider &amp; Entrer en stock
              </button>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div className={`text-sm rounded-[4px] px-4 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
          {msg.ok && rec.status === 'validee' && (
            <Link to="/stocks/bobines" className="ml-2 underline">
              Voir les bobines
            </Link>
          )}
        </div>
      )}

      {rec.status === 'soumise' && !canDecide && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-[4px] px-4 py-2">
          Réception soumise à la direction le {dateTimeFr(rec.submitted_at)}
          {rec.submitted_by && names[rec.submitted_by] ? ` par ${names[rec.submitted_by]}` : ''}. En attente de décision : rien n'est encore en stock.
        </div>
      )}
      {canDecide && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 text-sm rounded-[4px] px-4 py-2">
          <b>Décision de la direction attendue.</b> Le magasin a vérifié les bobines
          {rec.submitted_by && names[rec.submitted_by] ? ` (${names[rec.submitted_by]}, ${dateTimeFr(rec.submitted_at)})` : ''}. Contrôlez la liste ci-dessous, puis validez l'entrée en stock,
          renvoyez au magasin ou refusez l'arrivage.
        </div>
      )}
      {rec.decision_note && rec.status !== 'validee' && (
        <div className={`text-sm rounded-[4px] px-4 py-2 border ${rec.status === 'refusee' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <b>{rec.status === 'refusee' ? 'Arrivage refusé par la direction' : 'Renvoyé par la direction'}</b>
          {rec.decided_by && names[rec.decided_by] ? ` (${names[rec.decided_by]}, ${dateTimeFr(rec.decided_at)})` : ''} : {rec.decision_note}
        </div>
      )}
      {decision && (
        <div className="bg-white rounded-[4px] border border-gray-300 p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-900">
            {decision === 'back' ? 'Renvoyer la réception au magasin pour correction' : "Refuser l'arrivage (aucune bobine n'entrera en stock)"}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={decision === 'back' ? 'Ex : revérifier le poids de BO-OA-0002' : 'Ex : marchandise non conforme à la commande'}
            className="w-full border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDecision(null)} className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-[4px]">
              Annuler
            </button>
            <button
              type="button"
              onClick={onReject}
              disabled={busy || !note.trim()}
              className={`text-white text-sm font-medium px-4 py-1.5 rounded-[4px] disabled:opacity-50 ${decision === 'back' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {decision === 'back' ? 'Renvoyer au magasin' : 'Refuser'}
            </button>
          </div>
        </div>
      )}

      {prepared && editable && (
        <div className="bg-[#eef5f0] border border-emerald-200 text-emerald-900 text-sm rounded-[4px] px-4 py-2">
          La liste des bobines attendues a été préparée à partir de la commande. Complétez-la avec les étiquettes (N° coil, poids, métrage), imprimez la fiche de
          contrôle, puis cochez <b>Conforme</b> ou <b>Refusée</b> pour chaque bobine.
        </div>
      )}
      {canSubmit && (coils.length === 0 || pendingAll > 0) && (
        <div className="text-[12.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-[4px] px-4 py-1.5">
          {coils.length === 0
            ? '« Soumettre à la direction » sera disponible quand des bobines seront saisies et cochées.'
            : `« Soumettre à la direction » sera disponible quand les ${pendingAll} bobine(s) restante(s) seront cochées Conforme ou Refusée.`}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {card('Date réception', dateFr(date || rec.received_at))}
        {card('Type', coils.length === 0 ? '—' : totale ? 'Totale' : 'Partielle')}
        {card('Articles', `${lines.length} ligne(s) · ${coils.length} bobine(s)`)}
        {card('Créé par', creator)}
      </div>

      {/* Liste de la commande à vérifier */}
      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-800">Vérification de la commande</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Pour chaque article commandé, saisissez les bobines arrivées (étiquette ou pesée), imprimez la fiche de contrôle, vérifiez physiquement, puis cochez <b>Conforme</b> ou <b>Refusée</b> et soumettez à la direction.
            </p>
          </div>
          {editable && pendingAll > 0 && (
            <button type="button" onClick={() => allConform()} className="text-[12px] font-semibold text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-[3px]">
              Tout cocher conforme ({pendingAll})
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr>
                <th className={`${thc} text-left`}>Produit</th>
                <th className={`${thc} text-right`}>Commandé</th>
                <th className={`${thc} text-right`}>Déjà reçu</th>
                <th className={`${thc} text-right`}>Reste à recevoir</th>
                <th className={`${thc} text-right`}>Cette réception</th>
                <th className={`${thc} text-right hidden md:table-cell`}>P.U. achat</th>
                <th className={`${thc} text-center`}>Disposition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {check.map(({ pl, mine, before, rest, okKg, allKg, pending, refused, disposition }) => {
                const ecart = okKg - rest
                return (
                  <Fragment key={pl.id}>
                    <tr className="hover:bg-gray-50">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-gray-900">{pl.description || pl.products?.name}</div>
                        <div className="text-xs text-gray-400 font-mono">{pl.products?.code}</div>
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{num(pl.quantity, 2)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">{num(before, 2)}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700 font-medium tabular-nums">{num(rest, 2)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-emerald-700 tabular-nums">
                        {num(okKg, 2)}
                        {refused > 0 && <div className="text-[11px] font-normal text-red-600">{refused} refusée(s)</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-700 hidden md:table-cell whitespace-nowrap">{num(netPrice(pl))} FCFA</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-medium ${disposition.badge}`}>{disposition.label}</span>
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/30">
                      <td colSpan={7} className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-1.5">
                          <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">Détail des bobines reçues ({mine.length})</span>
                          {editable && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <label className="text-gray-600">Nombre de bobines</label>
                              <input
                                inputMode="numeric"
                                value={counts[pl.id] ?? ''}
                                placeholder={String(mine.length || 1)}
                                onChange={(e) => setCounts({ ...counts, [pl.id]: e.target.value })}
                                className="w-16 border border-gray-300 rounded px-2 py-0.5 text-xs text-right"
                              />
                              <button
                                type="button"
                                onClick={() => spread(pl)}
                                title="Répartit le reste attendu sur ce nombre de bobines"
                                className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 rounded px-2 py-0.5 text-xs font-semibold"
                              >
                                Répartir
                              </button>
                              <button type="button" onClick={() => addCoil(pl)} className="border border-gray-300 text-gray-700 hover:bg-gray-50 rounded px-2 py-0.5 text-xs font-semibold">
                                + Ajouter une bobine
                              </button>
                              {pending > 0 && (
                                <button type="button" onClick={() => allConform(pl.id)} className="border border-emerald-300 bg-emerald-50 text-emerald-700 rounded px-2 py-0.5 text-xs font-semibold">
                                  Conformes ({pending})
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs bg-white border border-gray-200 rounded">
                            <thead className="bg-[#eef5f0]">
                              <tr className="text-emerald-900 uppercase font-bold">
                                <th className="px-2 py-1 text-left w-8">#</th>
                                <th className="px-2 py-1 text-left">Conforme / Refusée</th>
                                <th className="px-2 py-1 text-left">N° bobine</th>
                                <th className="px-2 py-1 text-right">
                                  Poids reçu (kg) <span className="text-red-500">*</span>
                                </th>
                                <th className="px-2 py-1 text-right">Poids brut</th>
                                <th className="px-2 py-1 text-right">Métrage (ml)</th>
                                <th className="px-2 py-1 text-left">N° lot</th>
                                <th className="px-2 py-1 text-left">Coil fourn.</th>
                                <th className="px-2 py-1 text-left">Motif</th>
                                {editable && <th className="px-2 py-1 w-8" />}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {mine.map((c, k) => {
                                const q = qualityInfo(c.quality_status)
                                return (
                                  <tr key={c.key} className={c.quality_status === 'refuse' ? 'bg-red-50/60' : c.quality_status === 'libere' ? 'bg-green-50/40' : ''}>
                                    <td className="px-2 py-1 text-gray-500">{k + 1}</td>
                                    <td className="px-2 py-1 min-w-[120px]">
                                      {editable ? (
                                        <div className="flex items-center gap-3 whitespace-nowrap">
                                          {(
                                            [
                                              ['libere', 'Conforme', 'text-emerald-700', 'accent-emerald-600'],
                                              ['refuse', 'Refusée', 'text-red-700', 'accent-red-600'],
                                            ] as [Quality, string, string, string][]
                                          ).map(([v, l, tc, ac]) => (
                                            <label key={v} className={`inline-flex items-center gap-1 cursor-pointer font-semibold ${c.quality_status === v ? tc : 'text-gray-500'}`}>
                                              <input
                                                type="checkbox"
                                                checked={c.quality_status === v}
                                                onChange={(e) => update(c.key, { quality_status: e.target.checked ? v : 'en_attente' })}
                                                className={`w-4 h-4 ${ac}`}
                                              />
                                              {l}
                                            </label>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold ${q.badge}`}>{q.label}</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1 min-w-[100px]">
                                      <input value={c.coil_reference} disabled={!editable} onChange={(e) => update(c.key, { coil_reference: e.target.value })} className={`${cell} font-mono`} />
                                    </td>
                                    <td className="px-2 py-1 min-w-[100px]">
                                      <input inputMode="decimal" value={c.quantity} disabled={!editable} placeholder="kg" onChange={(e) => update(c.key, { quantity: e.target.value })} className={`${cell} text-right`} />
                                    </td>
                                    <td className="px-2 py-1 min-w-[90px]">
                                      <input inputMode="decimal" value={c.gross_weight_kg} disabled={!editable} onChange={(e) => update(c.key, { gross_weight_kg: e.target.value })} className={`${cell} text-right`} />
                                    </td>
                                    <td className="px-2 py-1 min-w-[90px]">
                                      <input inputMode="decimal" value={c.length_m} disabled={!editable} onChange={(e) => update(c.key, { length_m: e.target.value })} className={`${cell} text-right`} />
                                    </td>
                                    <td className="px-2 py-1 min-w-[130px]">
                                      <input value={c.lot_number} disabled={!editable} placeholder="Lot bobine" onChange={(e) => update(c.key, { lot_number: e.target.value })} className={`${cell} font-mono`} />
                                    </td>
                                    <td className="px-2 py-1 min-w-[70px]">
                                      <input value={c.supplier_coil_no} disabled={!editable} onChange={(e) => update(c.key, { supplier_coil_no: e.target.value })} className={cell} />
                                    </td>
                                    <td className="px-2 py-1 min-w-[130px]">
                                      <input
                                        value={c.quality_note}
                                        disabled={!editable}
                                        placeholder={c.quality_status === 'refuse' ? 'Ex : rouille, choc…' : ''}
                                        onChange={(e) => update(c.key, { quality_note: e.target.value })}
                                        className={cell}
                                      />
                                    </td>
                                    {editable && (
                                      <td className="px-2 py-1 text-center">
                                        <button type="button" onClick={() => remove(c)} className="text-red-500 hover:text-red-700 text-sm leading-none" title="Retirer cette bobine">
                                          ×
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                )
                              })}
                              {mine.length === 0 && (
                                <tr>
                                  <td colSpan={editable ? 10 : 9} className="px-2 py-3 text-center text-gray-400">
                                    Aucune bobine saisie pour cet article.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            {mine.length > 0 && (
                              <tfoot className="bg-gray-50 font-semibold">
                                <tr>
                                  <td colSpan={2} className="px-2 py-1 text-gray-700">
                                    Total
                                  </td>
                                  <td className="px-2 py-1 text-right tabular-nums">{num(allKg, 2)} kg</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{num(mine.reduce((t, c) => t + (toNum(c.gross_weight_kg) ?? 0), 0))}</td>
                                  <td className="px-2 py-1 text-right tabular-nums">{num(mine.reduce((t, c) => t + (toNum(c.length_m) ?? 0), 0))} ml</td>
                                  <td colSpan={editable ? 5 : 4} className={`px-2 py-1 text-[11px] font-normal ${Math.abs(ecart) > 0.005 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    {Math.abs(ecart) > 0.005 ? `Écart conforme / attendu : ${ecart > 0 ? '+' : ''}${num(ecart, 2)} kg` : "Conforme à l'attendu"}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date d'arrivée</label>
            <input
              type="date"
              value={date}
              disabled={!editable}
              onChange={(e) => {
                setDate(e.target.value)
                touch()
              }}
              className="w-full border border-gray-300 rounded-[4px] px-3 py-1.5 text-sm disabled:bg-gray-50"
            />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Remarques (transporteur, camion, état général…)</label>
            <input
              value={notes}
              disabled={!editable}
              onChange={(e) => {
                setNotes(e.target.value)
                touch()
              }}
              className="w-full border border-gray-300 rounded-[4px] px-3 py-1.5 text-sm disabled:bg-gray-50"
            />
          </div>
        </div>
      </div>

      {/* Confirmation de l'entrée en stock */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setModal(false)} />
          <div className="relative bg-white rounded-[4px] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <h3 className="font-semibold text-lg text-gray-900">Valider la réception &amp; entrée en stock</h3>
              <button type="button" onClick={() => setModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entrepôt de destination <span className="text-red-500">*</span>
                </label>
                <select value={depot} onChange={(e) => (setDepot(e.target.value), setDirty(true))} className="w-full border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500">
                  <option value="">-- Choisir un entrepôt --</option>
                  {(mpDepots.length ? mpDepots : depots).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="border border-gray-200 rounded-[4px] overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-[#eef5f0] border-b border-gray-300">
                    <tr>
                      <th className={`${thc} text-left`}>Produit</th>
                      <th className={`${thc} text-right hidden md:table-cell`}>Commandé</th>
                      <th className={`${thc} text-right hidden md:table-cell`}>Déjà reçu</th>
                      <th className={`${thc} text-right`}>Reste à recevoir</th>
                      <th className={`${thc} text-right`}>Cette réception</th>
                      <th className={`${thc} text-right`}>Bobines</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {check.map(({ pl, before, rest, okKg, mine, refused }) => (
                      <tr key={pl.id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800 text-xs">{pl.description || pl.products?.name}</div>
                          <div className="text-[11px] text-gray-500 font-mono">{pl.products?.code}</div>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500 text-xs hidden md:table-cell">{num(pl.quantity, 2)}</td>
                        <td className="px-3 py-2 text-right text-gray-500 text-xs hidden md:table-cell">{num(before, 2)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 text-xs font-medium">{num(rest, 2)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{num(okKg, 2)}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-600">
                          {mine.length - refused} conforme(s){refused > 0 && <span className="text-red-600"> · {refused} refusée(s)</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pendingAll > 0 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[4px] px-3 py-2">
                  {pendingAll} bobine(s) ne sont pas encore vérifiées. Marquez-les Conforme ou Refusée avant de confirmer.
                </div>
              ) : (
                <div className="bg-[#eef5f0] border border-emerald-100 text-[13px] text-gray-700 rounded-[4px] px-3 py-2">
                  <b>{okAll.length}</b> bobine(s) conforme(s), soit <b>{num(okKgAll, 2)} kg</b>, entreront en stock. Les bobines refusées ne sont pas stockées. La commande sera mise à jour
                  ({totale ? 'reçue' : 'partiellement reçue'}). Cette action est définitive.
                </div>
              )}
              {msg && !msg.ok && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-3 py-2">{msg.text}</div>}
            </div>
            <div className="flex justify-end gap-3 px-4 py-2 border-t border-gray-100">
              <button type="button" onClick={() => setModal(false)} className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm px-3 py-1.5 rounded-[4px] transition-colors">
                Annuler
              </button>
              <button
                type="button"
                onClick={onValidate}
                disabled={busy || pendingAll > 0 || okAll.length === 0 || !depot}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-5 py-1.5 rounded-[4px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? 'Validation…' : "Confirmer l'entrée en stock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
