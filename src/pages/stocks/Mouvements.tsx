import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Warehouse, loadWarehouses } from '../../lib/depots'
import Transferts from './Transferts'
import { kg, profileNames } from './transfertData'

type Movement = {
  id: string
  occurred_at: string
  product_id: string
  warehouse_id: string
  coil_id: string | null
  quantity: number
  type: string
  reason: string | null
  created_by: string | null
  products: { code: string; name: string } | null
  warehouses: { code: string; name: string } | null
  coils: { reference: string; reception_lines: { receptions: { id: string; number: string } | null } | null } | null
}

// Libellés et couleurs des types de mouvement
const TYPES: Record<string, { label: string; badge: string }> = {
  reception: { label: 'Réception', badge: 'bg-emerald-100 text-emerald-700' },
  inventaire: { label: 'Stock initial', badge: 'bg-gray-100 text-gray-700' },
  transfert: { label: 'Transfert', badge: 'bg-blue-100 text-blue-700' },
  ajustement: { label: 'Ajustement', badge: 'bg-amber-100 text-amber-800' },
  production_sortie: { label: 'Consommation production', badge: 'bg-violet-100 text-violet-700' },
  production_entree: { label: 'Production', badge: 'bg-violet-100 text-violet-700' },
  livraison: { label: 'Livraison client', badge: 'bg-orange-100 text-orange-700' },
  perte: { label: 'Perte', badge: 'bg-red-100 text-red-700' },
  retour_client: { label: 'Retour client', badge: 'bg-gray-100 text-gray-700' },
  retour_fournisseur: { label: 'Retour fournisseur', badge: 'bg-gray-100 text-gray-700' },
}
const typeOf = (t: string) => TYPES[t] ?? { label: t, badge: 'bg-gray-100 text-gray-700' }

const filterInput = 'border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'
const th = 'font-bold px-3 py-2 uppercase tracking-wide text-[11px]'
const COLUMNS =
  'id, occurred_at, product_id, warehouse_id, coil_id, quantity, type, reason, created_by, products(code, name), warehouses(code, name), coils(reference, reception_lines(receptions(id, number)))'

// Document d'origine : n° de transfert dans le libellé, ou n° de réception de la bobine
function documentOf(m: Movement, trfIds: Record<string, string> = {}): { label: string; to: string | null } {
  const trf = /TRF-\d{4}-\d+/.exec(m.reason ?? '')?.[0]
  if (trf) return { label: trf, to: trfIds[trf] ? `/stocks/transferts/${trfIds[trf]}` : null }
  const rec = m.coils?.reception_lines?.receptions
  if (m.type === 'reception' && rec) return { label: rec.number, to: `/achats/receptions/${rec.id}` }
  return { label: '—', to: null }
}

export default function Mouvements() {
  const ctx = useOutletContext<AppContext>()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'demandes' ? 'demandes' : 'journal'
  const [rows, setRows] = useState<Movement[]>([])
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(0)
  const [trfIds, setTrfIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ search: '', depot: '', type: '', article: '', from: '', to: '' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    Promise.all([
      supabase.from('stock_movements').select(COLUMNS).eq('is_test', false).order('occurred_at', { ascending: false }).limit(2000),
      loadWarehouses(),
      supabase.from('stock_transfers').select('id', { count: 'exact', head: true }).eq('status', 'soumise'),
      supabase.from('stock_transfers').select('id, number'),
    ]).then(async ([m, w, p, tr]) => {
      const ids: Record<string, string> = {}
      ;((tr.data as { id: string; number: string }[]) ?? []).forEach((x) => (ids[x.number] = x.id))
      setTrfIds(ids)
      const list = (m.data as unknown as Movement[]) ?? []
      setRows(list)
      setDepots(w)
      setPending(p.count ?? 0)
      setNames(await profileNames(list.map((x) => x.created_by)))
      setLoading(false)
    })
  }, [])

  const articles = useMemo(() => {
    const m = new Map<string, string>()
    rows.forEach((r) => r.products && m.set(r.product_id, `${r.products.code} — ${r.products.name}`))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter((r) => {
      const day = r.occurred_at.slice(0, 10)
      return (
        (!q || (r.coils?.reference ?? '').toLowerCase().includes(q) || (r.reason ?? '').toLowerCase().includes(q)) &&
        (!filter.depot || r.warehouse_id === filter.depot) &&
        (!filter.type || r.type === filter.type) &&
        (!filter.article || r.product_id === filter.article) &&
        (!filter.from || day >= filter.from) &&
        (!filter.to || day <= filter.to)
      )
    })
  }, [rows, filter])

  const entries = shown.filter((r) => Number(r.quantity) > 0).reduce((s, r) => s + Number(r.quantity), 0)
  const exits = shown.filter((r) => Number(r.quantity) < 0).reduce((s, r) => s - Number(r.quantity), 0)

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const data = shown.map((r) => ({
      Date: new Date(r.occurred_at).toLocaleString('fr-FR'),
      Type: typeOf(r.type).label,
      'N° bobine': r.coils?.reference ?? '',
      Article: r.products ? `${r.products.code} — ${r.products.name}` : '',
      Dépôt: r.warehouses?.code ?? '',
      'Entrée (kg)': Number(r.quantity) > 0 ? Number(r.quantity) : '',
      'Sortie (kg)': Number(r.quantity) < 0 ? -Number(r.quantity) : '',
      Document: documentOf(r).label,
      Libellé: r.reason ?? '',
      Par: r.created_by ? names[r.created_by] ?? '' : '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Mouvements')
    XLSX.writeFile(wb, `mouvements-stock-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const tabBtn = (key: 'journal' | 'demandes', label: string, badge?: number) => (
    <button
      type="button"
      onClick={() => setParams(key === 'journal' ? {} : { tab: key })}
      className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${
        tab === key ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
      {badge ? <span className="ml-1.5 inline-flex px-1.5 rounded-full text-[11px] bg-blue-600 text-white">{badge}</span> : null}
    </button>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Mouvements de stock</h1>
          <p className="text-sm text-gray-500 mt-0.5">Toutes les entrées et sorties de bobines, et les demandes de transfert vers la production.</p>
        </div>
        {ctx.can('stocks.transfer') && (
          <Link to="/stocks/transferts/nouveau" className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px] self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Demande de transfert
          </Link>
        )}
      </div>

      <div className="flex border-b border-gray-300">
        {tabBtn('journal', 'Journal des mouvements')}
        {tabBtn('demandes', 'Demandes de transfert', pending)}
      </div>

      {tab === 'demandes' ? (
        <Transferts embedded />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1.5">
              <p className="text-xs text-gray-500">Mouvements</p>
              <p className="text-[16px] font-bold text-gray-900 tabular-nums">{shown.length}</p>
            </div>
            <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1.5">
              <p className="text-xs text-gray-500">Entrées</p>
              <p className="text-[16px] font-bold text-emerald-600 tabular-nums">+{kg(entries)} kg</p>
            </div>
            <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1.5">
              <p className="text-xs text-gray-500">Sorties</p>
              <p className="text-[16px] font-bold text-red-600 tabular-nums">−{kg(exits)} kg</p>
            </div>
            <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1.5">
              <p className="text-xs text-gray-500">Solde</p>
              <p className="text-[16px] font-bold text-gray-900 tabular-nums">{kg(entries - exits)} kg</p>
            </div>
          </div>

          <form onSubmit={onFilter} className="bg-white rounded-[4px] border border-gray-300 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="N° bobine, TRF…" className={filterInput} />
              <select value={form.depot} onChange={(e) => setForm({ ...form, depot: e.target.value })} className={filterInput}>
                <option value="">Tous les dépôts</option>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={filterInput}>
                <option value="">Tous les types</option>
                {Object.entries(TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
              <select value={form.article} onChange={(e) => setForm({ ...form, article: e.target.value })} className={filterInput}>
                <option value="">Tous les articles</option>
                {articles.map(([id, l]) => (
                  <option key={id} value={id}>
                    {l}
                  </option>
                ))}
              </select>
              <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={filterInput} title="Du" />
              <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={filterInput} title="Au" />
              <div className="flex gap-2">
                <button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px]">
                  Filtrer
                </button>
                <button type="button" onClick={exportExcel} className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-sm font-medium px-3 py-1.5 rounded-[4px]" title="Exporter Excel">
                  Excel
                </button>
              </div>
            </div>
          </form>

          <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse">
                <thead>
                  <tr className="bg-[#eef5f0] text-emerald-900 border-b border-gray-300">
                    <th className={`${th} text-left`}>Date</th>
                    <th className={`${th} text-left`}>Type</th>
                    <th className={`${th} text-left`}>N° bobine</th>
                    <th className={`${th} text-left hidden lg:table-cell`}>Article</th>
                    <th className={`${th} text-left`}>Dépôt</th>
                    <th className={`${th} text-right`}>Entrée (kg)</th>
                    <th className={`${th} text-right`}>Sortie (kg)</th>
                    <th className={`${th} text-left`}>Document</th>
                    <th className={`${th} text-left hidden md:table-cell`}>Par</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const t = typeOf(r.type)
                    const q = Number(r.quantity)
                    const doc = documentOf(r, trfIds)
                    return (
                      <tr key={r.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50" title={r.reason ?? ''}>
                        <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{new Date(r.occurred_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="px-3 py-1.5">
                          <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-medium whitespace-nowrap ${t.badge}`}>{t.label}</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono font-semibold text-gray-800 whitespace-nowrap">{r.coils?.reference ?? '—'}</td>
                        <td className="px-3 py-1.5 text-gray-700 hidden lg:table-cell">
                          <span className="font-mono text-gray-500">{r.products?.code}</span> {r.products?.name}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-700">{r.warehouses?.code}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-emerald-700">{q > 0 ? `+${kg(q)}` : ''}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-red-600">{q < 0 ? `−${kg(-q)}` : ''}</td>
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                          {doc.to ? (
                            <Link to={doc.to} className="text-emerald-700 hover:underline">
                              {doc.label}
                            </Link>
                          ) : (
                            <span className="text-gray-600">{doc.label}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 hidden md:table-cell">{r.created_by ? names[r.created_by] ?? '' : ''}</td>
                      </tr>
                    )
                  })}
                  {!loading && shown.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                        Aucun mouvement.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2 border-t border-gray-200 bg-[#f7faf8] text-xs text-gray-500">
              {shown.length} mouvement(s) · Entrées <b className="text-emerald-700">+{kg(entries)} kg</b> · Sorties <b className="text-red-600">−{kg(exits)} kg</b>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
