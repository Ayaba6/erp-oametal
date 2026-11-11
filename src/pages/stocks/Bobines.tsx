import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { AppContext } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { Warehouse, loadWarehouses, typeInfo } from '../../lib/depots'
import { btnPrimary, btnSecondary, card, input } from '../../lib/ui'
import { Coil, STATUSES, fmt, loadCoils, massPerMeter, statusInfo } from './bobineData'

const th = 'px-2 py-1.5 text-[10.5px] font-bold text-white uppercase tracking-wide whitespace-nowrap'
const td = 'px-2 py-1 whitespace-nowrap'

export default function Bobines() {
  const ctx = useOutletContext<AppContext>()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Coil[]>([])
  const [loading, setLoading] = useState(true)
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [moving, setMoving] = useState(false)
  const [form, setForm] = useState({ search: '', article: '', status: '', depot: '' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    Promise.all([loadCoils(), loadWarehouses()]).then(([c, w]) => {
      setRows(c)
      setDepots(w.filter((d) => d.is_active))
      setLoading(false)
    })
  }, [])

  const canMove = ctx.can('stocks.transfer')
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // Les bobines cochées partent dans un bon de transfert (brouillon → expédié → reçu)
  function transfer() {
    const sel = rows.filter((r) => picked.has(r.id) && r.warehouse_id !== target)
    if (!target || sel.length === 0) return
    const sources = [...new Set(sel.map((r) => r.warehouse_id))]
    if (sources.length > 1) return setMsg({ ok: false, text: 'Cochez des bobines d’un seul dépôt à la fois.' })
    navigate(`/stocks/transferts/nouveau?source=${sources[0]}&dest=${target}&bobines=${sel.map((r) => r.id).join(',')}`)
  }

  const articles = useMemo(() => {
    const m = new Map<string, string>()
    rows.forEach((r) => r.products && m.set(r.product_id, `${r.products.code} — ${r.products.name}`))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!q || [r.reference, r.lot_number ?? '', r.supplier_coil_no ?? '', r.products?.name ?? ''].some((v) => v.toLowerCase().includes(q))) &&
        (!filter.article || r.product_id === filter.article) &&
        (!filter.status || r.status === filter.status) &&
        (!filter.depot || r.warehouse_id === filter.depot),
    )
  }, [rows, filter])

  const total = (k: 'initial_weight_kg' | 'gross_weight_kg' | 'length_m' | 'remaining_weight_kg') => shown.reduce((s, r) => s + Number(r[k] ?? 0), 0)
  const inStock = shown.filter((r) => r.status !== 'epuisee').length

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  function exportCsv() {
    const head = ['N° bobine OA', 'N° de lot', 'Code article', 'Désignation', 'Épaisseur (mm)', 'Largeur (mm)', 'N° coil fournisseur', 'Poids net (kg)', 'Poids brut (kg)', 'Métrage bobine (m)', 'Masse (kg/m)', 'Poids restant (kg)', 'Dépôt', 'Statut']
    const lines = shown.map((r) => [
      r.reference, r.lot_number ?? '', r.products?.code ?? '', r.products?.name ?? '', r.thickness_mm ?? '', r.width_mm ?? '', r.supplier_coil_no ?? '',
      r.initial_weight_kg, r.gross_weight_kg ?? '', r.length_m ?? '', massPerMeter(r)?.toFixed(3) ?? '', r.remaining_weight_kg, r.warehouses?.name ?? '', statusInfo(r.status).label,
    ])
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `bobines-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Liste des bobines OA</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {shown.length} bobine(s) · {inStock} en stock · {fmt(total('remaining_weight_kg'))} kg restants
            {depots.map((d) => {
              const kg = rows.filter((r) => r.warehouse_id === d.id).reduce((s, r) => s + Number(r.remaining_weight_kg), 0)
              return (
                <span key={d.id}>
                  {' · '}
                  {d.name} : <b className="text-gray-700">{fmt(kg)} kg</b>
                </span>
              )
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className={btnSecondary}>
            Exporter
          </button>
          {ctx.can('receptions.create') && (
            <>
              <Link to="/stocks/bobines/import" className={btnSecondary}>
                Importer
              </Link>
              <Link to="/stocks/bobines/nouvelle" className={btnPrimary}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nouvelle bobine
              </Link>
            </>
          )}
        </div>
      </div>

      <form onSubmit={onFilter} className={`${card} p-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="N° bobine, lot, coil..." className={input} />
          <select value={form.article} onChange={(e) => setForm({ ...form, article: e.target.value })} className={input}>
            <option value="">Tous les articles</option>
            {articles.map(([id, l]) => (
              <option key={id} value={id}>
                {l}
              </option>
            ))}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
            <option value="">Tous les statuts</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={form.depot} onChange={(e) => setForm({ ...form, depot: e.target.value })} className={input}>
            <option value="">Tous les dépôts</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" className={`${btnPrimary} justify-center`}>
            Filtrer
          </button>
        </div>
      </form>

      {msg && (
        <div className={`text-sm rounded-[4px] px-4 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>
      )}

      {canMove && picked.size > 0 && (
        <div className={`${card} p-3 flex flex-wrap items-center gap-3 !border-emerald-500 !bg-[#eef5f0]`}>
          <span className="text-sm text-gray-700">
            <b>{picked.size}</b> bobine(s) sélectionnée(s)
          </span>
          <div className="w-64">
          <select value={target} onChange={(e) => setTarget(e.target.value)} className={input}>
            <option value="">— Transférer vers —</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          </div>
          <button type="button" onClick={transfer} disabled={!target || moving} className={btnPrimary}>
            {moving ? 'Transfert...' : 'Créer la demande de transfert'}
          </button>
          <button type="button" onClick={() => setPicked(new Set())} className={btnSecondary}>
            Annuler
          </button>
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-[#3b4248]">
              <tr>
                {canMove && (
                  <th className={th}>
                    <input
                      type="checkbox"
                      checked={shown.length > 0 && shown.every((r) => picked.has(r.id))}
                      onChange={(e) => setPicked(e.target.checked ? new Set(shown.filter((r) => r.status !== 'epuisee').map((r) => r.id)) : new Set())}
                    />
                  </th>
                )}
                <th className={`${th} text-left`}>N° bobine OA</th>
                <th className={`${th} text-left`}>N° de lot</th>
                <th className={`${th} text-left`}>Code article</th>
                <th className={`${th} text-left`}>Désignation</th>
                <th className={`${th} text-right`}>Épaisseur (mm)</th>
                <th className={`${th} text-right`}>Largeur (mm)</th>
                <th className={`${th} text-center`}>N° coil fourn.</th>
                <th className={`${th} text-right`}>Poids net (kg)</th>
                <th className={`${th} text-right`}>Poids brut (kg)</th>
                <th className={`${th} text-right`}>Métrage (m)</th>
                <th className={`${th} text-right`}>Masse (kg/m)</th>
                <th className={`${th} text-right`}>Restant (kg)</th>
                <th className={`${th} text-left`}>Dépôt</th>
                <th className={`${th} text-left`}>Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((r) => {
                const st = statusInfo(r.status)
                const done = r.status === 'epuisee'
                return (
                  <tr key={r.id} className={`odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50 ${done ? 'text-gray-400' : 'text-gray-700'}`}>
                    {canMove && (
                      <td className={td}>
                        <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                    )}
                    <td className={`${td} font-mono`}>
                      <Link to={`/stocks/bobines/${r.id}`} className="text-emerald-800 font-semibold hover:underline">
                        {r.reference}
                      </Link>
                    </td>
                    <td className={`${td} font-mono`}>{r.lot_number ?? '—'}</td>
                    <td className={`${td} font-mono`}>{r.products?.code}</td>
                    <td className={`${td} max-w-[320px] truncate`} title={r.products?.name}>
                      {r.products?.name}
                    </td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(r.thickness_mm, 2)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(r.width_mm)}</td>
                    <td className={`${td} text-center`}>{r.supplier_coil_no ?? '—'}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(r.initial_weight_kg)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(r.gross_weight_kg)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(r.length_m)}</td>
                    <td className={`${td} text-right tabular-nums`}>{fmt(massPerMeter(r), 3)}</td>
                    <td className={`${td} text-right tabular-nums font-semibold`}>{fmt(r.remaining_weight_kg)}</td>
                    <td className={td}>
                      {r.warehouses && (
                        <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold ${typeInfo(r.warehouses.type).badge}`} title={r.warehouses.name}>
                          {r.warehouses.code}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold ${st.badge}`}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={canMove ? 15 : 14} className="px-3 py-8 text-center text-gray-400">
                    Aucune bobine. Ajoutez-les une par une ou importez votre liste Excel.
                  </td>
                </tr>
              )}
            </tbody>
            {shown.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-300 font-semibold text-gray-800">
                <tr>
                  <td className={td} colSpan={canMove ? 8 : 7}>
                    {shown.length} bobine(s)
                  </td>
                  <td className={`${td} text-right tabular-nums`}>{fmt(total('initial_weight_kg'))}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmt(total('gross_weight_kg'))}</td>
                  <td className={`${td} text-right tabular-nums`}>{fmt(total('length_m'))}</td>
                  <td className={td} />
                  <td className={`${td} text-right tabular-nums`}>{fmt(total('remaining_weight_kg'))}</td>
                  <td className={td} colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
