import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AppContext } from '../../lib/session'
import { Warehouse, loadWarehouses } from '../../lib/depots'
import { TRF_STATUSES, Transfer, kg, lineKg, loadTransfers, profileNames, trfStatus } from './transfertData'

const filterInput = 'border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'
const th = 'font-bold px-3 py-2 uppercase tracking-wide'
const dateFr = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR')

// Liste des demandes de transfert (affichée dans l'onglet de Mouvements de stock)
export default function Transferts({ embedded = false }: { embedded?: boolean }) {
  const ctx = useOutletContext<AppContext>()
  const [rows, setRows] = useState<Transfer[]>([])
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ status: '', source: '', dest: '' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    Promise.all([loadTransfers(), loadWarehouses()]).then(async ([t, w]) => {
      setRows(t)
      setDepots(w)
      setNames(await profileNames(t.map((x) => x.created_by)))
      setLoading(false)
    })
  }, [])

  const shown = useMemo(
    () =>
      rows.filter(
        (t) => (!filter.status || t.status === filter.status) && (!filter.source || t.source_warehouse_id === filter.source) && (!filter.dest || t.dest_warehouse_id === filter.dest),
      ),
    [rows, filter],
  )
  const count = (s: string) => rows.filter((t) => t.status === s).length

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
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${embedded ? 'hidden' : ''}`}>
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Demandes de transfert</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {rows.length} demande(s) — le magasinier coche les bobines et soumet, la direction valide, les bobines passent au dépôt production
          </p>
        </div>
        {ctx.can('stocks.transfer') && (
          <Link to="/stocks/transferts/nouveau" className="inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px] self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvelle demande
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpi('Brouillons', count('brouillon'), 'text-gray-500')}
        {kpi('À valider (direction)', count('soumise'), 'text-blue-600')}
        {kpi('Validées — transférées', count('validee') + count('recu'), 'text-emerald-600')}
        {kpi('Refusées', count('refusee'), 'text-red-600')}
      </div>

      {ctx.can('stocks.transfer.approve') && count('soumise') > 0 && (
        <div className="bg-white border border-blue-300 rounded-[4px] overflow-hidden">
          <div className="px-4 py-2 border-b border-blue-200 bg-blue-50 text-[13px] font-bold text-blue-900">À valider par la direction ({count('soumise')})</div>
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-gray-100">
              {rows
                .filter((t) => t.status === 'soumise')
                .map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-mono font-semibold text-emerald-800">{t.number}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {t.source?.code} → {t.dest?.code}
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {t.stock_transfer_lines.length} bobine(s) · {kg(t.stock_transfer_lines.reduce((s, l) => s + lineKg(l), 0))} kg
                    </td>
                    <td className="px-3 py-2 text-gray-500">{t.created_by ? names[t.created_by] ?? '' : ''}</td>
                    <td className="px-3 py-2 text-right">
                      <Link to={`/stocks/transferts/${t.id}`} className="bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold px-3 py-1 rounded-[4px] whitespace-nowrap">
                        Décider →
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <form onSubmit={onFilter} className="bg-white rounded-[4px] border border-gray-300 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={filterInput}>
            <option value="">Tous les statuts</option>
            {TRF_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={filterInput}>
            <option value="">Dépôt source</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select value={form.dest} onChange={(e) => setForm({ ...form, dest: e.target.value })} className={filterInput}>
            <option value="">Dépôt destination</option>
            {depots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button type="submit" className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px]">
            Filtrer
          </button>
        </div>
      </form>

      <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-[#eef5f0] text-emerald-900 border-b border-gray-300">
                <th className={`${th} text-left`}>Numéro</th>
                <th className={`${th} text-left`}>Date</th>
                <th className={`${th} text-left`}>De → Vers</th>
                <th className={`${th} text-right`}>Bobines</th>
                <th className={`${th} text-right`}>Poids (kg)</th>
                <th className={`${th} text-center`}>Statut</th>
                <th className={`${th} text-left hidden md:table-cell`}>Demandé par</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const st = trfStatus(t.status)
                return (
                  <tr key={t.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50">
                    <td className="px-3 py-1.5 font-mono font-semibold whitespace-nowrap">
                      <Link to={`/stocks/transferts/${t.id}`} className="text-emerald-800 hover:underline">
                        {t.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{dateFr(t.transfer_date)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className="font-mono text-gray-700">{t.source?.code}</span> <span className="text-gray-400">→</span>{' '}
                      <span className="font-mono text-gray-700">{t.dest?.code}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{t.stock_transfer_lines.length}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{kg(t.stock_transfer_lines.reduce((s, l) => s + lineKg(l), 0))}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${st.badge}`}>{st.label}</span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 hidden md:table-cell">{t.created_by ? names[t.created_by] ?? '' : ''}</td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    Aucune demande.{' '}
                    {ctx.can('stocks.transfer') && (
                      <Link to="/stocks/transferts/nouveau" className="text-emerald-700 hover:underline">
                        Créer la première demande
                      </Link>
                    )}
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
