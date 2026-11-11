import { FormEvent, ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

// Liste commune des documents de vente (devis, commandes, BL, factures) — modèle A3 ERP
export type Col<T> = { label: string; cls?: string; cell: (r: T) => ReactNode; hide?: 'md' | 'lg' }
export type Kpi = { label: string; value: string; cls?: string }

const fInput = 'border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-amber-500 focus:border-amber-500'
const th = 'font-bold px-3 py-2 uppercase tracking-wide text-[11px]'

export default function SalesList<T extends { id: string; number: string; status: string; client_id: string; issued_at?: string; clients: { name: string } | null }>({
  title,
  subtitle,
  rows,
  loading,
  statuses,
  kpis,
  cols,
  link,
  newLabel,
  newTo,
  dateOf,
  footer,
}: {
  title: string
  subtitle?: string
  rows: T[]
  loading: boolean
  statuses: { value: string; label: string; badge: string }[]
  kpis: (shown: T[]) => Kpi[]
  cols: Col<T>[]
  link: (r: T) => string
  newLabel?: string
  newTo?: string
  dateOf: (r: T) => string
  footer?: (shown: T[]) => ReactNode
}) {
  const [form, setForm] = useState({ search: '', status: '', client: '', from: '', to: '' })
  const [filter, setFilter] = useState(form)

  const clients = useMemo(() => {
    const m = new Map<string, string>()
    rows.forEach((r) => r.clients && m.set(r.client_id, r.clients.name))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter((r) => {
      const d = dateOf(r)
      return (
        (!q || r.number.toLowerCase().includes(q) || (r.clients?.name ?? '').toLowerCase().includes(q)) &&
        (!filter.status || r.status === filter.status) &&
        (!filter.client || r.client_id === filter.client) &&
        (!filter.from || d >= filter.from) &&
        (!filter.to || d <= filter.to)
      )
    })
  }, [rows, filter])

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }
  const st = (s: string) => statuses.find((x) => x.value === s) ?? { label: s, badge: 'bg-gray-100 text-gray-700' }
  const hide = (h?: 'md' | 'lg') => (h === 'md' ? 'hidden md:table-cell' : h === 'lg' ? 'hidden lg:table-cell' : '')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis(shown).map((k) => (
          <div key={k.label} className="bg-white rounded-[4px] border border-gray-300 px-3 py-1.5">
            <p className="text-xs text-gray-500">{k.label}</p>
            <p className={`text-lg font-bold tabular-nums ${k.cls ?? 'text-gray-900'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle ?? `${rows.length} document(s)`}</p>
        </div>
        {newTo && (
          <Link to={newTo} className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-3 py-1.5 rounded-[4px] flex items-center gap-2 self-start">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {newLabel}
          </Link>
        )}
      </div>

      <form onSubmit={onFilter} className="bg-white rounded-[4px] border border-gray-300 p-3 sm:p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="Numéro, client..." className={`${fInput} col-span-2 sm:col-span-1`} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={fInput}>
            <option value="">Tous les statuts</option>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className={fInput}>
            <option value="">Tous les clients</option>
            {clients.map(([id, n]) => (
              <option key={id} value={id}>
                {n}
              </option>
            ))}
          </select>
          <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={fInput} title="Du" />
          <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={fInput} title="Au" />
          <button type="submit" className="col-span-2 sm:col-span-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-3 py-1.5 rounded-[4px]">
            Filtrer
          </button>
        </div>
      </form>

      <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#eef5f0] text-emerald-900 border-b border-gray-300">
                <th className={`${th} text-left`}>N°</th>
                {cols.map((c) => (
                  <th key={c.label} className={`${th} ${c.cls?.includes('text-right') ? 'text-right' : c.cls?.includes('text-center') ? 'text-center' : 'text-left'} ${hide(c.hide)}`}>
                    {c.label}
                  </th>
                ))}
                <th className={`${th} text-center`}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const s = st(r.status)
                return (
                  <tr key={r.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50">
                    <td className="px-3 py-1.5 font-mono text-emerald-800 whitespace-nowrap">
                      <Link to={link(r)} className="hover:underline font-semibold">
                        {r.number}
                      </Link>
                    </td>
                    {cols.map((c) => (
                      <td key={c.label} className={`px-3 py-1.5 ${c.cls ?? ''} ${hide(c.hide)}`}>
                        {c.cell(r)}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${s.badge}`}>{s.label}</span>
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 2} className="px-3 py-8 text-center text-gray-400">
                    Aucun document.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {footer && <div className="px-3 py-2 border-t border-gray-200 bg-[#f7faf8] text-xs text-gray-500">{footer(shown)}</div>}
      </div>
    </div>
  )
}
