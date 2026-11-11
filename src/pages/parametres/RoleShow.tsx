import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { initials } from '../../lib/session'
import { btnPrimary, btnSecondary, card } from '../../lib/ui'
import { Permission, Role, groupPermissions, loadPermissions } from './roles'

type Member = { id: string; full_name: string; email: string | null }
const PEN = 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'

export default function RoleShow() {
  const { code } = useParams()
  const [role, setRole] = useState<Role | null>(null)
  const [perms, setPerms] = useState<Permission[]>([])
  const [granted, setGranted] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    if (!code) return
    Promise.all([
      supabase.from('roles').select('*').eq('code', code).maybeSingle(),
      loadPermissions(),
      supabase.from('role_permissions').select('permission_code').eq('role_code', code),
      supabase.from('profiles').select('id, full_name, email').eq('role', code).order('full_name'),
    ]).then(([r, all, rp, m]) => {
      const ro = r.data as Role | null
      setRole(ro)
      setPerms(all)
      setGranted(ro?.is_super ? new Set(all.map((p) => p.code)) : new Set(((rp.data as { permission_code: string }[]) ?? []).map((x) => x.permission_code)))
      setMembers((m.data as Member[]) ?? [])
    })
  }, [code])

  if (!role) return <p className="text-sm text-gray-400">Chargement…</p>

  const grantedGroups = groupPermissions(perms.filter((p) => granted.has(p.code)))
  const notGranted = perms.filter((p) => !granted.has(p.code))

  return (
    <div className="space-y-3">
      <div className={`${card} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">{role.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {role.is_super ? 'Toutes les permissions' : `${granted.size} permissions`} • {members.length} utilisateur(s)
          </p>
        </div>
        <div className="flex gap-2">
          {!role.is_super && (
            <Link to={`/parametres/roles/${role.code}/permissions`} className={btnPrimary}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={PEN} />
              </svg>
              Modifier les permissions
            </Link>
          )}
          <Link to="/parametres/roles" className={btnSecondary}>
            Retour
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Permissions accordées</h2>
          {grantedGroups.map(([group, items]) => (
            <div key={group} className={`${card} p-4`}>
              <h3 className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide mb-3">{group}</h3>
              <div className="flex flex-wrap gap-2">
                {items.map((p) => (
                  <span
                    key={p.code}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-xs font-medium bg-green-50 text-green-700 border border-green-200"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {p.code}
                  </span>
                ))}
              </div>
            </div>
          ))}

          {notGranted.length > 0 && (
            <div className={`${card} p-4`}>
              <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">Permissions non accordées</h3>
              <div className="flex flex-wrap gap-2">
                {notGranted.map((p) => (
                  <span key={p.code} className="inline-flex items-center px-2.5 py-1 rounded-[4px] text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200">
                    {p.code}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Utilisateurs avec ce rôle</h2>
          <div className={`${card} divide-y divide-gray-100`}>
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-3 py-1.5">
                <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-emerald-100 text-emerald-800 font-bold text-xs">
                  {initials(m.full_name)}
                </div>
                <div className="min-w-0">
                  <Link to={`/parametres/utilisateurs/${m.id}`} className="text-sm font-medium text-gray-900 hover:text-emerald-700 truncate block">
                    {m.full_name}
                  </Link>
                  <p className="text-xs text-gray-500 truncate">{m.email}</p>
                </div>
              </div>
            ))}
            {members.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">Aucun utilisateur.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
