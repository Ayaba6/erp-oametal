import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Ask, Confirm, DocHeader, Info, Msg, Steps, amber, btn, danger, outline, pdf, primary } from '../ventes/DocParts'
import { profileNames } from '../ventes/salesData'
import { CoilOption, OfLine, ProductionOrder, loadCoilsIn, loadProductionLines, loadProductionOrder, loadProductionOrders, ofStatus } from './prodData'
import { printOperatorSheet } from './printOF'

// Fiche d'un OF : impression de la fiche opérateur, vérification du magasinier, décision de la direction

type Row = { id: string; good: string; bad: string; checked: boolean; notes: string }
const num = (s: string) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(v) ? 0 : v
}
const fmt = (n: number | null | undefined, d = 2) => (n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(Number(n)).replace(/ | /g, ' '))
const dFr = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR') : null)
const dtFr = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : null)
const bySheets = (l: OfLine) => Number(l.length_m) > 0

// Quantité (ml) à partir de la saisie : nombre de tôles × longueur, ou quantité directe
const toQty = (l: OfLine, v: string) => (bySheets(l) ? Math.round(num(v)) * Number(l.length_m) : num(v))
const toSheets = (l: OfLine, v: string) => (bySheets(l) ? Math.round(num(v)) : null)

export default function OFShow() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [of, setOf] = useState<ProductionOrder | null>(null)
  const [children, setChildren] = useState<ProductionOrder[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [coils, setCoils] = useState<CoilOption[]>([])
  const [use, setUse] = useState<Record<string, string>>({})
  const [lines, setLines] = useState<{ id: string; code: string; name: string }[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [launch, setLaunch] = useState<{ operator: string; line: string } | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function reload() {
    const o = await loadProductionOrder(id!)
    setOf(o)
    if (!o) return
    setRows(
      o.production_order_lines.map((l) => ({
        id: l.id,
        good: bySheets(l) ? (l.produced_sheets != null ? String(l.produced_sheets) : '') : Number(l.produced_qty) ? String(l.produced_qty) : '',
        bad: bySheets(l) ? (l.damaged_sheets != null ? String(l.damaged_sheets) : '') : Number(l.damaged_qty) ? String(l.damaged_qty) : '',
        checked: l.is_checked,
        notes: l.notes ?? '',
      })),
    )
    setUse(Object.fromEntries(o.coil_allocations.map((a) => [a.coil_id, String(a.weight_kg)])))
    setDirty(false)
    const [c, pl, n, ch] = await Promise.all([
      loadCoilsIn(o.warehouse_id),
      loadProductionLines(),
      profileNames([o.created_by, o.submitted_by, o.confirmed_by]),
      o.order_id ? loadProductionOrders(o.order_id) : Promise.resolve([]),
    ])
    setCoils(c)
    setLines(pl)
    setNames(n)
    setChildren(ch.filter((x) => x.parent_id === o.id))
  }
  useEffect(() => {
    reload()
  }, [id])

  // Bobines utiles : celles qui correspondent aux tôles de l'OF (sinon toutes celles du dépôt)
  const coilProducts = useMemo(() => new Set((of?.production_order_lines ?? []).map((l) => l.products?.coil_product_id).filter(Boolean) as string[]), [of])
  const usefulCoils = useMemo(() => {
    const m = coils.filter((c) => coilProducts.has(c.product_id))
    const allocated = new Set(Object.keys(use))
    const list = m.length ? m : coils
    // garder visibles les bobines déjà saisies même si elles ne correspondent pas
    return [...list, ...coils.filter((c) => allocated.has(c.id) && !list.includes(c))]
  }, [coils, coilProducts, use])

  if (!of) return null
  const s = ofStatus(of.status)
  const canEdit = of.status === 'en_production' && ctx.can('production.declare')
  const showVerif = ['en_production', 'soumis', 'confirme'].includes(of.status)

  const lineOf = (r: Row) => of.production_order_lines.find((l) => l.id === r.id)!
  const theoKg = rows.reduce((t, r) => {
    const l = lineOf(r)
    const kpm = Number(l.products?.kg_per_meter ?? 0)
    return t + (toQty(l, r.good) + toQty(l, r.bad)) * kpm
  }, 0)
  const usedKg = Object.values(use).reduce((t, v) => t + num(v), 0)

  async function run(a: Ask) {
    setBusy(true)
    setMsg(null)
    try {
      await a.run(note)
      setAsk(null)
      setNote('')
      await reload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }

  async function saveVerification(silent = false) {
    if (!of) return
    for (const r of rows) {
      const l = lineOf(r)
      const good = toQty(l, r.good)
      const bad = toQty(l, r.bad)
      if (good < 0 || bad < 0) throw new Error(`Quantités négatives sur « ${l.description} ».`)
      const u = await supabase
        .from('production_order_lines')
        .update({ produced_sheets: toSheets(l, r.good), produced_qty: good, damaged_sheets: toSheets(l, r.bad), damaged_qty: bad, is_checked: r.checked, notes: r.notes.trim() || null })
        .eq('id', r.id)
      if (u.error) throw new Error(u.error.message)
    }
    const d = await supabase.from('coil_allocations').delete().eq('production_order_id', of.id)
    if (d.error) throw new Error(d.error.message)
    const alloc = Object.entries(use)
      .filter(([, v]) => num(v) > 0)
      .map(([coil_id, v]) => ({ production_order_id: of.id, coil_id, weight_kg: num(v) }))
    for (const a of alloc) {
      const c = coils.find((x) => x.id === a.coil_id)
      if (c && a.weight_kg > Number(c.remaining_weight_kg) + 0.001) throw new Error(`La bobine ${c.reference} n'a que ${fmt(c.remaining_weight_kg)} kg restants.`)
    }
    if (alloc.length) {
      const i = await supabase.from('coil_allocations').insert(alloc)
      if (i.error) throw new Error(i.error.message)
    }
    if (!silent) setMsg({ ok: true, text: 'Vérification enregistrée.' })
    setDirty(false)
  }

  async function onSave() {
    setBusy(true)
    setMsg(null)
    try {
      await saveVerification()
      await reload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }

  async function doLaunch() {
    if (!of || !launch) return
    setBusy(true)
    const { error } = await supabase.rpc('launch_production', { p_of: of.id, p_operator: launch.operator, p_line: launch.line || null })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    const fresh = await loadProductionOrder(of.id)
    if (fresh) {
      const refs = usefulCoils.map((c) => c.reference)
      printOperatorSheet(fresh, refs.slice(0, 6))
    }
    setLaunch(null)
    await reload()
  }

  const steps = [
    { key: 'cree', label: 'OF créé', icon: '📝' },
    { key: 'en_production', label: 'En production', icon: '🏭' },
    { key: 'soumis', label: 'Vérifié', icon: '🔎' },
    { key: 'confirme', label: 'Confirmé', icon: '✅' },
    { key: 'bl', label: 'BL magasinier', icon: '🚚' },
  ]
  const cur = of.status === 'annule' ? -1 : of.status === 'confirme' ? (of.delivery_id ? 4 : 3) : steps.findIndex((x) => x.key === of.status)
  const set = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    setDirty(true)
  }
  const thc = 'px-2 py-2 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'
  const inp = 'w-full h-8 px-2 border border-[#c3d3c9] rounded-[3px] text-[13px] text-right bg-white focus:outline-none focus:border-emerald-600 disabled:bg-gray-50'

  return (
    <div className="space-y-3">
      <Steps steps={steps} current={cur} />
      <DocHeader number={of.number} badge={s} sub={of.clients?.name}>
        {['cree', 'en_production'].includes(of.status) && ctx.can('production.launch') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setLaunch({ operator: of.operator_name ?? '', line: of.production_line_id ?? lines[0]?.id ?? '' })}
            className={`${btn} ${of.printed_at ? outline : primary}`}
          >
            {of.printed_at ? 'Réimprimer la fiche opérateur' : 'Imprimer la fiche opérateur'}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setAsk({
                question: 'Soumettre la production à la direction ? Vérifiez que chaque ligne est cochée et que les bobines consommées sont saisies.',
                run: async () => {
                  await saveVerification(true)
                  const r = await supabase.rpc('submit_production', { p_of: of.id })
                  if (r.error) throw new Error(r.error.message)
                  setMsg({ ok: true, text: 'Production soumise à la direction.' })
                },
              })
            }
            className={`${btn} ${amber}`}
          >
            Soumettre à la direction
          </button>
        )}
        {of.status === 'soumis' && ctx.can('production.approve') && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAsk({
                  question: 'Confirmer la production ? Les tôles bonnes entrent en stock, les avariées vont au Magasin, les bobines sont déduites et le bon de livraison est créé pour le magasinier.',
                  run: async () => {
                    const r = await supabase.rpc('confirm_production', { p_of: of.id })
                    if (r.error) throw new Error(r.error.message)
                    if (r.data) navigate(`/ventes/livraisons/${r.data as string}`)
                  },
                })
              }
              className={`${btn} ${primary}`}
            >
              Confirmer la production
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAsk({
                  question: 'Renvoyer cet OF au magasinier pour correction ?',
                  note: true,
                  noteLabel: 'Motif du renvoi (obligatoire)',
                  run: async (n) => {
                    const r = await supabase.rpc('return_production', { p_of: of.id, p_note: n })
                    if (r.error) throw new Error(r.error.message)
                  },
                })
              }
              className={`${btn} ${outline}`}
            >
              Renvoyer au magasinier
            </button>
          </>
        )}
        {['cree', 'en_production', 'soumis'].includes(of.status) && (ctx.can('production.cancel') || ctx.can('production.approve')) && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setAsk({
                question: `Annuler l'${of.number} ?`,
                note: true,
                noteLabel: 'Motif de l’annulation (obligatoire)',
                run: async (n) => {
                  const r = await supabase.rpc('cancel_production', { p_of: of.id, p_reason: n })
                  if (r.error) throw new Error(r.error.message)
                },
              })
            }
            className={`${btn} ${danger}`}
          >
            Annuler
          </button>
        )}
        {of.status !== 'cree' && of.status !== 'annule' && (
          <button type="button" onClick={() => printOperatorSheet(of, usefulCoils.map((c) => c.reference).slice(0, 6))} className={`${btn} ${pdf}`}>
            PDF
          </button>
        )}
        <Link to="/production/of" className={`${btn} ${outline}`}>
          Retour
        </Link>
      </DocHeader>

      {launch && (
        <div className="bg-white border border-emerald-300 rounded-[4px] p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-gray-700 mb-1">Chef opérateur (à qui la fiche est remise)</label>
            <input value={launch.operator} onChange={(e) => setLaunch({ ...launch, operator: e.target.value })} className="w-full h-9 px-2.5 border border-[#c3d3c9] rounded-[3px] text-[13px]" autoFocus />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-700 mb-1">Ligne de production</label>
            <select value={launch.line} onChange={(e) => setLaunch({ ...launch, line: e.target.value })} className="w-full h-9 px-2 border border-[#c3d3c9] rounded-[3px] text-[13px]">
              <option value="">—</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setLaunch(null)} className={`${btn} ${outline} flex-1 justify-center`}>
              Annuler
            </button>
            <button type="button" disabled={busy} onClick={doLaunch} className={`${btn} ${primary} flex-1 justify-center`}>
              Imprimer
            </button>
          </div>
          <p className="sm:col-span-4 text-[12px] text-gray-500">L'OF passe « En production » et la fiche s'ouvre pour impression.</p>
        </div>
      )}

      {of.status === 'en_production' && of.decision_note && <div className="bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-[4px] px-4 py-2">↩ Renvoyé par la direction : {of.decision_note}</div>}
      {of.status === 'annule' && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-[4px] px-4 py-2">OF annulé : {of.cancel_reason}</div>}
      {of.status === 'soumis' && !ctx.can('production.approve') && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[4px] px-4 py-2">Production vérifiée : en attente de la confirmation de la direction.</div>}
      {ask && <Confirm ask={ask} busy={busy} note={note} setNote={setNote} onCancel={() => setAsk(null)} onOk={() => run(ask)} />}
      <Msg msg={msg} />

      <Info
        items={[
          ['Commande', of.order_id ? ctx.can('orders.view') ? <Link to={`/ventes/commandes/${of.order_id}`} className="font-mono text-emerald-700 hover:underline">{of.sales_orders?.number}</Link> : <span className="font-mono">{of.sales_orders?.number}</span> : null],
          ['Client', of.clients ? ctx.can('clients.view') ? <Link to={`/ventes/clients/${of.client_id}`} className="font-semibold text-emerald-700 hover:underline">{of.clients.name}</Link> : of.clients.name : null],
          ['Date prévue', dFr(of.planned_date)],
          ['Dépôt de production', of.warehouses ? `${of.warehouses.code} — ${of.warehouses.name}` : null],
          ['Ligne de production', of.production_lines?.name],
          ['Chef opérateur', of.operator_name],
          ['Fiche imprimée', dtFr(of.printed_at)],
          ['OF d’origine', of.parent_id ? <Link to={`/production/of/${of.parent_id}`} className="font-mono text-emerald-700 hover:underline">{of.parent?.number}</Link> : null],
          ['Créé par', of.created_by ? names[of.created_by] : null],
          ['Vérifié et soumis', of.submitted_at ? `${dtFr(of.submitted_at)}${of.submitted_by ? ' · ' + (names[of.submitted_by] ?? '') : ''}` : null],
          ['Confirmé par la direction', of.confirmed_at ? `${dtFr(of.confirmed_at)}${of.confirmed_by ? ' · ' + (names[of.confirmed_by] ?? '') : ''}` : null],
          ['Bon de livraison', of.delivery_id ? <Link to={`/ventes/livraisons/${of.delivery_id}`} className="font-mono text-emerald-700 hover:underline">{of.deliveries?.number}</Link> : null],
          ['OF complémentaire', children.length ? <span className="space-x-2">{children.map((c) => <Link key={c.id} to={`/production/of/${c.id}`} className="font-mono text-emerald-700 hover:underline">{c.number}</Link>)}</span> : null],
          ['Observations', of.notes],
        ]}
      />

      {/* Lignes : à produire + vérification */}
      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">{showVerif ? 'Vérification de la production' : 'Tôles à produire'}</h2>
          {canEdit && <span className="text-[12px] text-gray-500">Saisissez les tôles bonnes et avariées, puis cochez « Exact » pour chaque ligne.</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr>
                <th className={`${thc} text-left`}>#</th>
                <th className={`${thc} text-left`}>Article</th>
                <th className={`${thc} text-right`}>Long. m</th>
                <th className={`${thc} text-right`}>À produire</th>
                <th className={`${thc} text-right`}>ml</th>
                {showVerif && (
                  <>
                    <th className={`${thc} text-right w-24`}>Bonnes</th>
                    <th className={`${thc} text-right w-24`}>Avariées</th>
                    <th className={`${thc} text-right`}>Manque</th>
                    <th className={`${thc} text-center`}>Exact</th>
                    <th className={`${thc} text-left`}>Observation</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {of.production_order_lines.map((l, i) => {
                const r = rows[i]
                if (!r) return null
                const good = toQty(l, r.good)
                const bad = toQty(l, r.bad)
                const miss = Math.max(0, Number(l.quantity) - good)
                const unit = bySheets(l) ? 'tôles' : l.products?.kind === 'faitiere' ? 'pce' : ''
                return (
                  <tr key={l.id} className={r.checked ? 'bg-emerald-50/40' : ''}>
                    <td className="px-2 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-2 py-1.5">
                      {l.description}
                      <p className="text-xs text-gray-400 font-mono">{l.products?.code}</p>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.length_m != null ? fmt(l.length_m, 3) : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                      {bySheets(l) ? `${l.sheets_count ?? '—'} tôles` : fmt(l.quantity, 3)}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{fmt(l.quantity, 3)}</td>
                    {showVerif && (
                      <>
                        <td className="px-2 py-1.5">
                          <input inputMode="decimal" value={r.good} disabled={!canEdit} onChange={(e) => set(i, { good: e.target.value })} className={`${inp} font-semibold text-emerald-800`} />
                          <p className="text-[10px] text-gray-400 text-right">{good ? `${fmt(good, 3)} ml` : unit}</p>
                        </td>
                        <td className="px-2 py-1.5">
                          <input inputMode="decimal" value={r.bad} disabled={!canEdit} onChange={(e) => set(i, { bad: e.target.value })} className={`${inp} text-red-700`} />
                          <p className="text-[10px] text-gray-400 text-right">{bad ? `${fmt(bad, 3)} ml` : unit}</p>
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${miss > 0.0005 ? 'text-amber-700 font-semibold' : 'text-gray-300'}`}>{miss > 0.0005 ? fmt(miss, 3) : '—'}</td>
                        <td className="px-2 py-1.5 text-center">
                          <input type="checkbox" checked={r.checked} disabled={!canEdit} onChange={(e) => set(i, { checked: e.target.checked })} className="w-5 h-5 accent-emerald-700" />
                        </td>
                        <td className="px-2 py-1.5 min-w-[160px]">
                          <input value={r.notes} disabled={!canEdit} onChange={(e) => set(i, { notes: e.target.value })} className={`${inp} text-left`} />
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {showVerif && rows.some((r, i) => Number(of.production_order_lines[i]?.quantity) - toQty(of.production_order_lines[i], r.good) > 0.0005) && (
          <p className="px-4 py-1.5 text-[12px] text-amber-800 bg-amber-50 border-t border-amber-200">
            Les tôles manquantes (avariées ou non produites) seront relancées dans un OF complémentaire à la confirmation. Les avariées entrent au dépôt Magasin (DEPMAG).
          </p>
        )}
      </div>

      {/* Bobines consommées */}
      {showVerif && (
        <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900">Bobines consommées ({of.warehouses?.code})</h2>
            <p className="text-[12px] text-gray-600">
              Poids théorique : <b className="tabular-nums">{fmt(theoKg, 1)} kg</b> · Saisi : <b className={`tabular-nums ${theoKg && Math.abs(usedKg - theoKg) > theoKg * 0.1 ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(usedKg, 1)} kg</b>
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr>
                <th className={`${thc} text-left`}>Bobine</th>
                <th className={`${thc} text-left`}>Matière</th>
                <th className={`${thc} text-left`}>Lot</th>
                <th className={`${thc} text-right`}>Restant (kg)</th>
                <th className={`${thc} text-right w-36`}>Consommé (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(canEdit ? usefulCoils : coils.filter((c) => use[c.id]))
                .concat(canEdit ? [] : of.coil_allocations.filter((a) => !coils.some((c) => c.id === a.coil_id)).map((a) => ({ id: a.coil_id, reference: a.coils?.reference ?? '', lot_number: a.coils?.lot_number ?? null, remaining_weight_kg: a.coils?.remaining_weight_kg ?? 0, product_id: '', products: a.coils?.products ?? null })))
                .map((c) => (
                  <tr key={c.id} className={num(use[c.id] ?? '') > 0 ? 'bg-emerald-50/40' : ''}>
                    <td className="px-2 py-1.5 font-mono font-semibold">{c.reference}</td>
                    <td className="px-2 py-1.5 text-gray-600">{c.products?.code} — {c.products?.name}</td>
                    <td className="px-2 py-1.5 font-mono text-gray-500">{c.lot_number ?? '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(c.remaining_weight_kg, 1)}</td>
                    <td className="px-2 py-1.5">
                      <input
                        inputMode="decimal"
                        value={use[c.id] ?? ''}
                        disabled={!canEdit}
                        onChange={(e) => {
                          setUse((u) => ({ ...u, [c.id]: e.target.value }))
                          setDirty(true)
                        }}
                        className={inp}
                      />
                    </td>
                  </tr>
                ))}
              {usefulCoils.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                    Aucune bobine disponible au dépôt {of.warehouses?.code}. Faites d'abord une demande de transfert DEPMP → DEPPROD.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy || !dirty} onClick={onSave} className={`${btn} ${outline}`}>
            Enregistrer la vérification
          </button>
        </div>
      )}
    </div>
  )
}
