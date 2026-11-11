import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AppContext } from '../../lib/session'
import { CLIENT_TYPES, Client, fcfa, loadBalances, loadClients } from './salesData'

const fInput = 'h-8 border border-gray-300 rounded-[4px] px-2.5 text-[12.5px] focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'
const th = 'px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'
const EYE = 'M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
const PEN = 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'

export default function Clients() {
  const ctx = useOutletContext<AppContext>()
  const [rows, setRows] = useState<Client[]>([])
  const [bal, setBal] = useState(new Map<string, number>())
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ search: '', type: '', status: '' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    Promise.all([loadClients(), loadBalances()]).then(([c, b]) => {
      setRows(c)
      setBal(b)
      setLoading(false)
    })
  }, [])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter(
      (c) =>
        (!q || [c.name, c.code ?? '', c.phone ?? '', c.email ?? '', c.trade_name ?? ''].some((v) => v.toLowerCase().includes(q))) &&
        (!filter.type || c.type === filter.type) &&
        (!filter.status || (filter.status === '1') === c.is_active),
    )
  }, [rows, filter])
  const totalDue = rows.reduce((s, c) => s + (bal.get(c.id) ?? 0), 0)

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(
      shown.map((c) => ({
        Code: c.code,
        'Raison sociale': c.name,
        Type: CLIENT_TYPES.find(([k]) => k === c.type)?.[1] ?? c.type,
        Téléphone: c.phone ?? '',
        Email: c.email ?? '',
        Ville: c.city ?? '',
        IFU: c.ifu ?? '',
        'Solde dû': bal.get(c.id) ?? 0,
        Statut: c.is_active ? 'Actif' : 'Inactif',
      })),
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clients')
    XLSX.writeFile(wb, `clients-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1">
          <p className="text-xs text-gray-500">Total clients</p>
          <p className="text-[16px] font-bold text-gray-900 tabular-nums">{rows.length}</p>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1">
          <p className="text-xs text-gray-500">Actifs</p>
          <p className="text-[16px] font-bold text-emerald-600 tabular-nums">{rows.filter((c) => c.is_active).length}</p>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1">
          <p className="text-xs text-gray-500">Solde dû (factures)</p>
          <p className={`text-[16px] font-bold tabular-nums ${totalDue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{fcfa(totalDue)} FCFA</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} client(s)</p>
        </div>
        <div className="flex items-center gap-2 self-start flex-wrap">
          <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 px-3 py-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-sm font-medium rounded-[4px]">
            Exporter Excel
          </button>
          {ctx.can('clients.create') && (
            <Link to="/ventes/clients/nouveau" className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-700 text-white rounded-[4px] text-sm font-medium hover:bg-emerald-800">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau client
            </Link>
          )}
        </div>
      </div>

      <form onSubmit={onFilter} className="bg-white rounded-[4px] border border-gray-300 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="Nom, code, téléphone, email..." className={fInput} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={fInput}>
            <option value="">Tous les types</option>
            {CLIENT_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={fInput}>
            <option value="">Tous les statuts</option>
            <option value="1">Actif</option>
            <option value="0">Inactif</option>
          </select>
          <button type="submit" className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px]">
            Filtrer
          </button>
        </div>
      </form>

      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-[#eef5f0] border-b border-gray-300">
                <th className={`${th} text-left`}>Code client</th>
                <th className={`${th} text-left`}>Raison sociale</th>
                <th className={`${th} text-left hidden md:table-cell`}>Type</th>
                <th className={`${th} text-left hidden lg:table-cell`}>Téléphone</th>
                <th className={`${th} text-right`}>Solde dû</th>
                <th className={`${th} text-center`}>Statut</th>
                <th className="px-3 py-1" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const due = bal.get(c.id) ?? 0
                return (
                  <tr key={c.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50">
                    <td className="px-3 py-1 font-mono text-emerald-800">{c.code}</td>
                    <td className="px-3 py-1">
                      <Link to={`/ventes/clients/${c.id}`} className="font-medium text-gray-900 hover:text-emerald-700">
                        {c.name}
                      </Link>
                      {c.is_blocked && <span className="ml-2 text-[10.5px] font-semibold text-red-600">BLOQUÉ</span>}
                    </td>
                    <td className="px-3 py-1 text-gray-600 hidden md:table-cell">{CLIENT_TYPES.find(([k]) => k === c.type)?.[1]}</td>
                    <td className="px-3 py-1 text-gray-600 hidden lg:table-cell">{c.phone ?? '—'}</td>
                    <td className={`px-3 py-1 text-right tabular-nums font-medium ${due > 0 ? 'text-red-600' : 'text-gray-400'}`}>{due > 0 ? fcfa(due) : '—'}</td>
                    <td className="px-3 py-1 text-center">
                      {c.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-green-100 text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-gray-100 text-gray-500">Inactif</span>
                      )}
                    </td>
                    <td className="px-3 py-1">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/ventes/clients/${c.id}`} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded" title="Voir">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={EYE} />
                          </svg>
                        </Link>
                        {ctx.can('clients.edit') && (
                          <Link to={`/ventes/clients/${c.id}/modifier`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Modifier">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={PEN} />
                            </svg>
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                    Aucun client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-gray-200 bg-[#f7faf8] text-[11.5px] text-gray-500">{shown.length} client(s)</div>
      </div>
    </div>
  )
}
