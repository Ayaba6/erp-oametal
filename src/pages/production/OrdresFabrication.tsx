import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { printOperatorSheet } from './printOF'
import { Eligible, OF_STATUSES, OfStatus, PAYMENT_RULE, ProductionOrder, loadEligibleOrders, loadProductionOrders, ofStatus } from './prodData'

const fmt = (n: number, d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(Number(n)).replace(/ | /g, ' ')
const dFr = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR') : '—')
const th = 'font-bold px-3 py-2 uppercase tracking-wide text-[11px] text-emerald-900'

// Ordres de fabrication : commandes prêtes à produire + liste des OF
export default function OrdresFabrication() {
  const ctx = useOutletContext<AppContext>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'commandes' ? 'commandes' : 'of'
  const [rows, setRows] = useState<ProductionOrder[]>([])
  const [eligible, setEligible] = useState<Eligible[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>(params.get('statut') ?? '')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function reload() {
    setLoading(true)
    const [o, e] = await Promise.all([loadProductionOrders(), loadEligibleOrders()])
    setRows(o)
    setEligible(e)
    setLoading(false)
  }
  useEffect(() => {
    reload()
  }, [])

  const count = (s: OfStatus) => rows.filter((r) => r.status === s).length
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!status || r.status === status) &&
        (!q || [r.number, r.clients?.name, r.sales_orders?.number, r.operator_name].some((x) => (x ?? '').toLowerCase().includes(q))),
    )
  }, [rows, status, search])

  async function createOf(e: Eligible) {
    setBusy(e.id)
    setMsg(null)
    const { data, error } = await supabase.rpc('create_production_order', { p_order: e.id })
    setBusy(null)
    if (error) return setMsg(error.message)
    navigate(`/production/of/${data as string}`)
  }

  const ml = (r: ProductionOrder) => r.production_order_lines.reduce((s, l) => s + Number(l.quantity), 0)
  const sheets = (r: ProductionOrder) => r.production_order_lines.reduce((s, l) => s + Number(l.sheets_count ?? 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Ordres de fabrication</h1>
          <p className="text-sm text-gray-500 mt-0.5">Commande payée → OF → fiche opérateur → vérification magasinier → confirmation direction → BL</p>
        </div>
        <button type="button" onClick={() => printOperatorSheet(null, [], { blank: true })} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-[4px] text-sm hover:bg-gray-50 self-start">
          Fiche opérateur vierge
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ['Commandes à produire', String(eligible.filter((x) => !x.blocked).length), 'text-gray-900', () => setParams({ tab: 'commandes' })],
          ['À lancer', String(count('cree')), 'text-gray-700', () => (setParams({}), setStatus('cree'))],
          ['En production', String(count('en_production')), 'text-blue-700', () => (setParams({}), setStatus('en_production'))],
          ['À confirmer (direction)', String(count('soumis')), 'text-amber-700', () => (setParams({}), setStatus('soumis'))],
          ['Confirmés', String(count('confirme')), 'text-emerald-700', () => (setParams({}), setStatus('confirme'))],
        ].map(([l, v, cls, fn]) => (
          <button key={l as string} type="button" onClick={fn as () => void} className="text-left bg-white border border-gray-300 rounded-[4px] p-3 hover:border-emerald-400">
            <p className="text-xs text-gray-500">{l as string}</p>
            <p className={`text-xl font-bold tabular-nums ${cls}`}>{v as string}</p>
          </button>
        ))}
      </div>

      <div className="border-b border-gray-200 flex gap-6">
        {[
          ['of', 'Ordres de fabrication'],
          ['commandes', `Commandes à produire (${eligible.length})`],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setParams(k === 'of' ? {} : { tab: k })}
            className={`py-2 px-1 border-b-2 text-sm ${tab === k ? 'border-emerald-600 text-emerald-800 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {msg && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{msg}</div>}

      {tab === 'commandes' ? (
        <div className="bg-white border border-gray-300 rounded-[4px] overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr>
                <th className={`${th} text-left`}>Commande</th>
                <th className={`${th} text-left`}>Client</th>
                <th className={`${th} text-left`}>Règlement</th>
                <th className={`${th} text-left`}>Livraison prévue</th>
                <th className={`${th} text-right`}>TTC</th>
                <th className={`${th} text-right`}>Encaissé</th>
                <th className={`${th} text-left`}>Production</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {eligible.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono font-semibold">
                    <Link to={`/ventes/commandes/${e.id}`} className="text-emerald-700 hover:underline">
                      {e.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{e.clients?.name}</td>
                  <td className="px-3 py-2 text-gray-600">{PAYMENT_RULE[e.clients?.payment_mode ?? 'comptant']}</td>
                  <td className="px-3 py-2">{dFr(e.delivery_date)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(e.total_ttc)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(e.amount_paid)}</td>
                  <td className="px-3 py-2">{e.blocked ? <span className="text-red-600 text-[12px]">⛔ {e.blocked}</span> : <span className="text-emerald-700 text-[12px] font-semibold">✓ Prête</span>}</td>
                  <td className="px-3 py-2 text-right">
                    {ctx.can('production.create') && (
                      <button
                        type="button"
                        disabled={!!e.blocked || busy === e.id}
                        onClick={() => createOf(e)}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-[12px] font-semibold disabled:opacity-40"
                      >
                        {busy === e.id ? 'Création…' : "Créer l'OF"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && eligible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                    Aucune commande confirmée en attente de production.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="bg-white border border-gray-300 rounded-[4px] p-3 flex flex-wrap gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° OF, commande, client, opérateur…" className="flex-1 min-w-[200px] h-9 border border-gray-300 rounded-[4px] px-3 text-sm" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 border border-gray-300 rounded-[4px] px-2.5 text-sm">
              <option value="">Tous les statuts</option>
              {OF_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-white border border-gray-300 rounded-[4px] overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-[#eef5f0] border-b border-gray-300">
                <tr>
                  <th className={`${th} text-left`}>N° OF</th>
                  <th className={`${th} text-left`}>Commande</th>
                  <th className={`${th} text-left`}>Client</th>
                  <th className={`${th} text-right`}>Tôles</th>
                  <th className={`${th} text-right`}>Métrage</th>
                  <th className={`${th} text-right`}>Bonnes</th>
                  <th className={`${th} text-right`}>Avariées</th>
                  <th className={`${th} text-left`}>Prévue</th>
                  <th className={`${th} text-left`}>Opérateur</th>
                  <th className={`${th} text-left`}>Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((r) => {
                  const s = ofStatus(r.status)
                  const good = r.production_order_lines.reduce((t, l) => t + Number(l.produced_qty), 0)
                  const bad = r.production_order_lines.reduce((t, l) => t + Number(l.damaged_qty), 0)
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/production/of/${r.id}`)}>
                      <td className="px-3 py-2 font-mono font-semibold text-emerald-800 whitespace-nowrap">
                        {r.number}
                        {r.parent_id && <span className="ml-1 text-[10px] text-amber-700 font-sans">complément</span>}
                      </td>
                      <td className="px-3 py-2 font-mono">{r.sales_orders?.number ?? '—'}</td>
                      <td className="px-3 py-2">{r.clients?.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{sheets(r)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(ml(r), 2)} m</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{good ? fmt(good, 2) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600">{bad ? fmt(bad, 2) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{dFr(r.planned_date)}</td>
                      <td className="px-3 py-2">{r.operator_name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.badge}`}>{s.label}</span>
                      </td>
                    </tr>
                  )
                })}
                {!loading && shown.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-gray-400">
                      Aucun ordre de fabrication.{' '}
                      {eligible.length > 0 && (
                        <button type="button" onClick={() => setParams({ tab: 'commandes' })} className="text-emerald-700 hover:underline">
                          Voir les commandes à produire
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-gray-500">
            {shown.length} OF · {fmt(shown.reduce((s, r) => s + ml(r), 0), 2)} m à produire
          </p>
        </>
      )}
    </div>
  )
}
