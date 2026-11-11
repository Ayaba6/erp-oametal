import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AppContext } from '../../lib/session'
import { PO_STATUSES, PurchaseOrder, dateFr, loadOrders, num, poStatus } from './achatsData'

const EYE = 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
const filterInput = 'border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500'
const th = 'font-bold px-3 py-2 uppercase tracking-wide'

export default function Commandes() {
  const ctx = useOutletContext<AppContext>()
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ search: '', supplier: '', status: '' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    loadOrders().then((o) => {
      setRows(o)
      setLoading(false)
    })
  }, [])

  const suppliers = useMemo(() => {
    const m = new Map<string, string>()
    rows.forEach((o) => o.suppliers && m.set(o.supplier_id, o.suppliers.name))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter(
      (o) =>
        (!q || o.number.toLowerCase().includes(q) || (o.suppliers?.name ?? '').toLowerCase().includes(q) || (o.reference ?? '').toLowerCase().includes(q)) &&
        (!filter.supplier || o.supplier_id === filter.supplier) &&
        (!filter.status || o.status === filter.status),
    )
  }, [rows, filter])

  const ttc = shown.reduce((s, o) => s + Number(o.total_ttc), 0)
  const ht = shown.reduce((s, o) => s + Number(o.total_ht), 0)
  const enCours = shown.filter((o) => ['envoyee', 'confirmee', 'partiellement_recue'].includes(o.status)).length
  const recues = shown.filter((o) => o.status === 'recue' || o.status === 'cloturee').length

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  const kpi = (label: string, value: string, unit: string, color: string) => (
    <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1.5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>
        {value} <span className="text-xs font-normal text-gray-400">{unit}</span>
      </p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpi('Total TTC filtré', num(ttc), 'FCFA', 'text-gray-900')}
        {kpi('Total HT filtré', num(ht), 'FCFA', 'text-gray-700')}
        {kpi('En cours', String(enCours), 'commande(s)', 'text-amber-600')}
        {kpi('Reçues', String(recues), 'commande(s)', 'text-emerald-600')}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Commandes fournisseurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} commande(s)</p>
        </div>
        {ctx.can('purchase_orders.create') && (
          <Link
            to="/achats/commandes/nouvelle"
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-3 py-1.5 rounded-[4px] flex items-center gap-2 self-start transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle commande
          </Link>
        )}
      </div>

      <form onSubmit={onFilter} className="bg-white rounded-[4px] border border-gray-300 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="Numéro, fournisseur..." className={filterInput} />
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
            {PO_STATUSES.map((s) => (
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
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#eef5f0] text-emerald-900 border-b border-gray-300">
                <th className={`${th} text-left w-32`}>N° commande</th>
                <th className={`${th} text-left`}>Fournisseur</th>
                <th className={`${th} text-left hidden md:table-cell w-24`}>Date</th>
                <th className={`${th} text-left hidden lg:table-cell w-28`}>Livraison prévue</th>
                <th className={`${th} text-right hidden lg:table-cell w-32`}>Montant HT</th>
                <th className={`${th} text-right w-32`}>Montant TTC</th>
                <th className={`${th} text-center w-28`}>Statut</th>
                <th className="px-3 py-2 w-24" />
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const st = poStatus(o.status)
                return (
                  <tr key={o.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50 transition-colors">
                    <td className="px-3 py-1.5 font-mono text-emerald-800 whitespace-nowrap">
                      <Link to={`/achats/commandes/${o.id}`} className="hover:underline font-semibold">
                        {o.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 font-medium text-gray-900">{o.suppliers?.name}</td>
                    <td className="px-3 py-1.5 text-gray-600 hidden md:table-cell whitespace-nowrap">{dateFr(o.issued_at)}</td>
                    <td className="px-3 py-1.5 hidden lg:table-cell whitespace-nowrap">
                      {o.expected_at ? <span className="text-gray-600">{dateFr(o.expected_at)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-700 hidden lg:table-cell whitespace-nowrap">{num(o.total_ht)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900 whitespace-nowrap">{num(o.total_ttc)}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st.badge}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <Link to={`/achats/commandes/${o.id}`} className="p-1 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Voir">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={EYE} />
                          </svg>
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                    Aucune commande.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-[#f7faf8] text-xs text-gray-500">
          <span>
            {shown.length} commande(s) · Total TTC filtré : <b className="text-emerald-700 tabular-nums">{num(ttc)} FCFA</b> · HT :{' '}
            <b className="text-gray-700 tabular-nums">{num(ht)} FCFA</b>
          </span>
        </div>
      </div>
    </div>
  )
}
