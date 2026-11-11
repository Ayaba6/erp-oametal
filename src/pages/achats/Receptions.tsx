import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { PurchaseOrder, REC_STATUSES, Reception, dateFr, dateTimeFr, loadOrders, loadReceptions, num, poStatus, recStatus } from './achatsData'

const filterInput = 'border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500'
const th = 'font-bold px-3 py-2 uppercase tracking-wide'

export default function Receptions() {
  const ctx = useOutletContext<AppContext>()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Reception[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ search: '', supplier: '', status: '' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    Promise.all([loadReceptions(), loadOrders()]).then(([r, o]) => {
      setRows(r)
      setOrders(o.filter((x) => x.status === 'confirmee' || x.status === 'partiellement_recue'))
      setLoading(false)
    })
  }, [])

  const suppliers = useMemo(() => {
    const m = new Map<string, string>()
    rows.forEach((r) => r.suppliers && m.set(r.supplier_id, r.suppliers.name))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!q || r.number.toLowerCase().includes(q) || (r.purchase_orders?.number ?? '').toLowerCase().includes(q)) &&
        (!filter.supplier || r.supplier_id === filter.supplier) &&
        (!filter.status || r.status === filter.status),
    )
  }, [rows, filter])

  const toApprove = rows.filter((r) => r.status === 'soumise')
  const draftOf = (poId: string) => rows.find((r) => r.purchase_order_id === poId && (r.status === 'brouillon' || r.status === 'soumise'))

  // Le gestionnaire ouvre la commande à réceptionner (crée la réception si besoin)
  async function open(po: PurchaseOrder) {
    const existing = draftOf(po.id)
    if (existing) return navigate(`/achats/receptions/${existing.id}`)
    setBusy(po.id)
    setError(null)
    const r = await supabase.from('receptions').insert({ purchase_order_id: po.id, supplier_id: po.supplier_id, warehouse_id: po.warehouse_id }).select('id').single()
    setBusy(null)
    if (r.error) return setError(r.error.message)
    navigate(`/achats/receptions/${(r.data as { id: string }).id}`)
  }

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  const kpi = (label: string, value: number, color: string) => (
    <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-[16px] font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpi('Commandes à réceptionner', orders.length, 'text-amber-600')}
        {kpi('En vérification (magasin)', rows.filter((r) => r.status === 'brouillon').length, 'text-gray-600')}
        {kpi('À valider (direction)', toApprove.length, 'text-blue-600')}
        {kpi('Validées — en stock', rows.filter((r) => r.status === 'validee').length, 'text-emerald-600')}
      </div>

      <div>
        <h1 className="text-[16px] font-bold text-gray-900">Réceptions fournisseurs</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Le magasin ouvre la commande arrivée, imprime la fiche de contrôle, vérifie les bobines puis soumet. La direction décide de l'entrée en stock.
        </p>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}

      {/* Direction : réceptions en attente de décision */}
      {ctx.can('receptions.approve') && toApprove.length > 0 && (
        <div className="bg-white border border-blue-300 rounded-[4px] overflow-hidden">
          <div className="px-4 py-2 border-b border-blue-200 bg-blue-50 text-[13px] font-bold text-blue-900">À valider par la direction ({toApprove.length})</div>
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-gray-100">
              {toApprove.map((r) => {
                const ok = r.reception_lines.filter((l) => l.quality_status === 'libere')
                const refused = r.reception_lines.filter((l) => l.quality_status === 'refuse').length
                return (
                  <tr key={r.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-2 font-mono font-semibold text-emerald-800 whitespace-nowrap">{r.number}</td>
                    <td className="px-3 py-2 text-gray-900">{r.suppliers?.name}</td>
                    <td className="px-3 py-2 font-mono text-gray-600">{r.purchase_orders?.number}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {ok.length} conforme(s) · {num(ok.reduce((t, l) => t + Number(l.quantity), 0))} kg
                      {refused > 0 && <span className="text-red-600"> · {refused} refusée(s)</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">soumise le {dateTimeFr(r.submitted_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link to={`/achats/receptions/${r.id}`} className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold px-3 py-1 rounded-[4px] whitespace-nowrap">
                        Décider →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Magasin : commandes arrivées ou attendues */}
      <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-200 bg-[#eef5f0] text-[13px] font-bold text-emerald-900">Commandes à réceptionner ({orders.length})</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="text-emerald-900 border-b border-gray-200 text-[11px]">
                <th className={`${th} text-left`}>N° commande</th>
                <th className={`${th} text-left`}>Fournisseur</th>
                <th className={`${th} text-left hidden md:table-cell`}>Livraison prévue</th>
                <th className={`${th} text-left hidden lg:table-cell`}>Articles</th>
                <th className={`${th} text-right`}>Reste à recevoir</th>
                <th className={`${th} text-center`}>Statut</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const rest = o.purchase_order_lines.reduce((t, l) => t + Math.max(0, Number(l.quantity) - Number(l.received_qty)), 0)
                const d = draftOf(o.id)
                const st = d ? recStatus(d.status) : poStatus(o.status)
                return (
                  <tr key={o.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50">
                    <td className="px-3 py-1.5 font-mono font-semibold whitespace-nowrap">
                      <Link to={`/achats/commandes/${o.id}`} className="text-emerald-800 hover:underline">
                        {o.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 font-medium text-gray-900">{o.suppliers?.name}</td>
                    <td className="px-3 py-1.5 text-gray-600 hidden md:table-cell">{dateFr(o.expected_at)}</td>
                    <td className="px-3 py-1.5 text-gray-600 hidden lg:table-cell">{o.purchase_order_lines.map((l) => l.products?.code).join(', ')}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{num(rest)} kg</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${st.badge}`}>{d ? `${d.number} · ${st.label}` : st.label}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {(d || ctx.can('receptions.create')) && (
                        <button
                          type="button"
                          disabled={busy === o.id}
                          onClick={() => open(o)}
                          className="bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-semibold px-3 py-1 rounded-[4px] whitespace-nowrap disabled:opacity-60"
                        >
                          {d ? 'Ouvrir la réception' : 'Réceptionner'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!loading && orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                    Aucune commande confirmée en attente de livraison.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <form onSubmit={onFilter} className="bg-white rounded-[4px] border border-gray-300 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="N° réception, N° commande…" className={filterInput} />
          <select value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={filterInput}>
            <option value="">Tous les fournisseurs</option>
            {suppliers.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={filterInput}>
            <option value="">Tous les statuts</option>
            {REC_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-3 py-1.5 rounded-[4px] transition-colors">
              Filtrer
            </button>
          </div>
        </div>
      </form>

      <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-[#eef5f0] text-emerald-900 border-b border-gray-300">
                <th className={`${th} text-left w-36`}>N° réception</th>
                <th className={`${th} text-left`}>Fournisseur</th>
                <th className={`${th} text-left hidden md:table-cell w-32`}>BC lié</th>
                <th className={`${th} text-left hidden lg:table-cell w-32`}>Date réception</th>
                <th className={`${th} text-right hidden lg:table-cell`}>Bobines</th>
                <th className={`${th} text-right hidden md:table-cell`}>Conformes (kg)</th>
                <th className={`${th} text-center w-36`}>Statut</th>
                <th className={`${th} text-right w-24`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = recStatus(r.status)
                const ok = r.reception_lines.filter((l) => l.quality_status === 'libere')
                return (
                  <tr key={r.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50 transition-colors">
                    <td className="px-3 py-1.5 font-mono text-emerald-800 whitespace-nowrap">
                      <Link to={`/achats/receptions/${r.id}`} className="hover:underline font-semibold">
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 font-medium text-gray-900">{r.suppliers?.name}</td>
                    <td className="px-3 py-1.5 hidden md:table-cell whitespace-nowrap">
                      {r.purchase_order_id ? (
                        <Link to={`/achats/commandes/${r.purchase_order_id}`} className="font-mono text-emerald-700 hover:underline text-[12px]">
                          {r.purchase_orders?.number}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 hidden lg:table-cell whitespace-nowrap">{dateFr(r.received_at)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums hidden lg:table-cell">{r.reception_lines.length}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums hidden md:table-cell">{num(ok.reduce((t, l) => t + Number(l.quantity), 0))}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${st.badge}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Link to={`/achats/receptions/${r.id}`} className="text-emerald-700 hover:text-emerald-900 hover:underline text-[12px] font-semibold">
                        Voir →
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                    Aucune réception.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
