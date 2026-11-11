import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { initials } from '../../lib/session'
import { btnPrimary, card, humanize, input, roleBadgeClass, th, timeAgo } from '../../lib/ui'

export type UserRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  job_title: string | null
  role: string
  is_active: boolean
  created_at: string
  last_sign_in_at: string | null
}

const EYE = ['M15 12a3 3 0 11-6 0 3 3 0 016 0z', 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z']
const PEN = 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'

export default function Users() {
  const [rows, setRows] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ search: '', role: '', status: '' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    Promise.all([supabase.rpc('list_users'), supabase.from('roles').select('code').order('code')]).then(([u, r]) => {
      setRows((u.data as UserRow[]) ?? [])
      setRoles(((r.data as { code: string }[]) ?? []).map((x) => x.code))
      setLoading(false)
    })
  }, [])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter(
      (u) =>
        (!q || [u.full_name, u.email, u.job_title ?? ''].some((v) => v.toLowerCase().includes(q))) &&
        (!filter.role || u.role === filter.role) &&
        (!filter.status || (filter.status === 'active') === u.is_active),
    )
  }, [rows, filter])

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Utilisateurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">{shown.length} utilisateur(s)</p>
        </div>
        <Link to="/parametres/utilisateurs/nouveau" className={btnPrimary}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouvel utilisateur
        </Link>
      </div>

      <form onSubmit={onFilter} className={`${card} p-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            value={form.search}
            onChange={(e) => setForm({ ...form, search: e.target.value })}
            placeholder="Nom, e-mail, poste..."
            className={input}
          />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input}>
            <option value="">Tous les rôles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
            <option value="">Tous les statuts</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
          <div className="flex gap-2">
            <button type="submit" className={`${btnPrimary} flex-1 justify-center`}>
              Filtrer
            </button>
          </div>
        </div>
      </form>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr>
                <th className={th}>Utilisateur</th>
                <th className={`${th} hidden md:table-cell`}>Poste</th>
                <th className={th}>Rôle</th>
                <th className={`${th} hidden lg:table-cell`}>Dernière connexion</th>
                <th className={`${th} text-center`}>Statut</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-emerald-100 text-emerald-800 font-bold text-xs">
                        {initials(u.full_name)}
                      </div>
                      <div>
                        <Link to={`/parametres/utilisateurs/${u.id}`} className="font-medium text-gray-900 hover:text-emerald-700">
                          {u.full_name}
                        </Link>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-gray-600 hidden md:table-cell">{u.job_title || '—'}</td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium ${roleBadgeClass(u.role)}`}>
                      {humanize(u.role)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-500 text-xs hidden lg:table-cell">{timeAgo(u.last_sign_in_at)}</td>
                  <td className="px-3 py-1.5 text-center">
                    {u.is_active ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium bg-green-100 text-green-700">Actif</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium bg-red-100 text-red-700">Inactif</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/parametres/utilisateurs/${u.id}`}
                        className="p-1.5 text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors"
                        title="Voir"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {EYE.map((d) => (
                            <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
                          ))}
                        </svg>
                      </Link>
                      <Link
                        to={`/parametres/utilisateurs/${u.id}/modifier`}
                        className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                        title="Modifier"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={PEN} />
                        </svg>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                    Aucun utilisateur.
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
