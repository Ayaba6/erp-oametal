import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Supplier, loadSuppliers } from './achatsData'

const EYE = 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
const PEN = 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
const BIN = 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
const th = 'px-3 py-1 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'
const inp = 'h-8 border border-gray-300 rounded-[4px] px-2.5 text-[12.5px] focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'

const Ico = ({ d }: { d: string }) => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
)

export default function Fournisseurs() {
  const ctx = useOutletContext<AppContext>()
  const [rows, setRows] = useState<Supplier[]>([])
  const [form, setForm] = useState({ search: '', active: '' })
  const [filter, setFilter] = useState(form)
  const [toDelete, setToDelete] = useState<Supplier | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => loadSuppliers().then(setRows)
  useEffect(() => {
    reload()
  }, [])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter(
      (s) =>
        (!q || [s.code, s.name, s.phone, s.email, s.trade_name].some((v) => (v ?? '').toLowerCase().includes(q))) &&
        (filter.active === '' || String(s.is_active) === filter.active),
    )
  }, [rows, filter])

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(
      shown.map((s) => ({
        Code: s.code,
        'Raison sociale': s.name,
        Type: s.type,
        Pays: s.country,
        Ville: s.city,
        Téléphone: s.phone,
        Email: s.email,
        'NIF / IFU': s.ifu,
        RCCM: s.rccm,
        Devise: s.currency,
        Statut: s.is_active ? 'Actif' : 'Inactif',
      })),
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fournisseurs')
    XLSX.writeFile(wb, 'fournisseurs.xlsx')
  }

  async function remove(s: Supplier) {
    setError(null)
    const r = await supabase.from('suppliers').delete().eq('id', s.id)
    setToDelete(null)
    if (r.error) {
      return setError(
        r.error.code === '23503'
          ? `Impossible de supprimer « ${s.name} » : il a déjà des commandes. Passez-le plutôt en Inactif.`
          : 'La suppression a échoué : ' + r.error.message,
      )
    }
    reload()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1">
          <p className="text-xs text-gray-500">Total fournisseurs</p>
          <p className="text-[16px] font-bold text-gray-900 tabular-nums">{rows.length}</p>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 px-3 py-1">
          <p className="text-xs text-gray-500">Actifs</p>
          <p className="text-[16px] font-bold text-emerald-600 tabular-nums">{rows.filter((r) => r.is_active).length}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Fournisseurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{shown.length} fournisseur(s)</p>
        </div>
        <div className="flex items-center gap-2 self-start flex-wrap">
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-sm font-medium rounded-[4px] transition-colors"
          >
            <Ico d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            Exporter Excel
          </button>
          {ctx.can('suppliers.create') && (
            <Link
              to="/achats/fournisseurs/nouveau"
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-700 text-white rounded-[4px] text-sm font-medium hover:bg-emerald-800 transition-colors"
            >
              <Ico d="M12 4v16m8-8H4" />
              Nouveau fournisseur
            </Link>
          )}
        </div>
      </div>

      <form onSubmit={onFilter} className="bg-white rounded-[4px] border border-gray-300 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} placeholder="Nom, code, téléphone, email..." className={inp} />
          <select value={form.active} onChange={(e) => setForm({ ...form, active: e.target.value })} className={inp}>
            <option value="">Tous les statuts</option>
            <option value="true">Actif</option>
            <option value="false">Inactif</option>
          </select>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-2">
            <button type="submit" className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px] transition-colors">
              Filtrer
            </button>
          </div>
        </div>
      </form>

      {toDelete && (
        <div className="bg-amber-50 border border-amber-300 rounded-[4px] p-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>Supprimer le fournisseur « {toDelete.name} » ?</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setToDelete(null)} className="px-3 py-1.5 border border-gray-300 rounded-[4px] bg-white">
              Non
            </button>
            <button type="button" onClick={() => remove(toDelete)} className="px-3 py-1.5 bg-red-600 text-white rounded-[4px]">
              Oui, supprimer
            </button>
          </div>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}

      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="bg-[#eef5f0] border-b border-gray-300">
                <th className={`${th} text-left`}>Code</th>
                <th className={`${th} text-left`}>Nom</th>
                <th className={`${th} text-left hidden md:table-cell`}>Email</th>
                <th className={`${th} text-left hidden lg:table-cell`}>Téléphone</th>
                <th className={`${th} text-center hidden sm:table-cell`}>Contacts</th>
                <th className={`${th} text-left hidden lg:table-cell`}>Pays</th>
                <th className={`${th} text-center`}>Statut</th>
                <th className="px-3 py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50 transition-colors">
                  <td className="px-3 py-1 font-mono text-emerald-800">{s.code}</td>
                  <td className="px-3 py-1">
                    <Link to={`/achats/fournisseurs/${s.id}`} className="font-medium text-gray-900 hover:text-emerald-700 transition-colors">
                      {s.name}
                    </Link>
                    {s.blocage_achat && <span className="ml-2 text-[10.5px] font-semibold text-red-600">Achat bloqué</span>}
                  </td>
                  <td className="px-3 py-1 text-sm text-gray-600 hidden md:table-cell">{s.email || <span className="text-gray-400">—</span>}</td>
                  <td className="px-3 py-1 text-sm text-gray-600 hidden lg:table-cell">{s.phone || '—'}</td>
                  <td className="px-3 py-1 text-center hidden sm:table-cell">
                    {s.contacts?.length ? <span className="text-sm">{s.contacts.length}</span> : <span className="text-gray-400 text-sm">—</span>}
                  </td>
                  <td className="px-3 py-1 text-sm text-gray-600 hidden lg:table-cell">{s.country || '—'}</td>
                  <td className="px-3 py-1 text-center">
                    {s.is_active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-green-100 text-green-700 border border-green-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/achats/fournisseurs/${s.id}`} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Voir">
                        <Ico d={EYE} />
                      </Link>
                      {ctx.can('suppliers.edit') && (
                        <Link to={`/achats/fournisseurs/${s.id}/modifier`} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Modifier">
                          <Ico d={PEN} />
                        </Link>
                      )}
                      {ctx.can('suppliers.delete') && (
                        <button type="button" onClick={() => setToDelete(s)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Supprimer">
                          <Ico d={BIN} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                    Aucun fournisseur.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-[#f7faf8] text-[11.5px] text-gray-500">
          <span>{shown.length} fournisseur(s)</span>
        </div>
      </div>
    </div>
  )
}
