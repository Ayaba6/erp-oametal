import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { initials } from '../../lib/session'
import { btnPrimary, btnSecondary, card, dateTime, humanize, roleBadgeClass, timeAgo } from '../../lib/ui'
import type { UserRow } from './Users'

const PEN = 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'

export default function UserShow() {
  const { id } = useParams()
  const [u, setU] = useState<UserRow | null>(null)
  const [perms, setPerms] = useState<string[]>([])

  useEffect(() => {
    supabase.rpc('list_users').then(async ({ data }) => {
      const found = ((data as UserRow[]) ?? []).find((x) => x.id === id) ?? null
      setU(found)
      if (!found) return
      const role = await supabase.from('roles').select('is_super').eq('code', found.role).maybeSingle()
      if ((role.data as { is_super: boolean } | null)?.is_super) {
        const all = await supabase.from('permissions').select('code').order('code')
        setPerms(((all.data as { code: string }[]) ?? []).map((p) => p.code))
      } else {
        const rp = await supabase.from('role_permissions').select('permission_code').eq('role_code', found.role)
        setPerms(((rp.data as { permission_code: string }[]) ?? []).map((p) => p.permission_code).sort())
      }
    })
  }, [id])

  if (!u) return <p className="text-sm text-gray-400">Chargement…</p>

  return (
    <div className="space-y-3">
      <div className={`${card} p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 text-emerald-800 font-bold text-xl">
              {initials(u.full_name)}
            </div>
            <div>
              <h1 className="text-[16px] font-bold text-gray-900">{u.full_name}</h1>
              <p className="text-sm text-gray-500">{u.job_title || '—'}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-[3px] text-[11px] font-medium ${roleBadgeClass(u.role)}`}>
                  {humanize(u.role)}
                </span>
                {u.is_active ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-[3px] text-[11px] font-medium bg-green-100 text-green-700">Actif</span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-[3px] text-[11px] font-medium bg-red-100 text-red-700">Inactif</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/parametres/utilisateurs/${u.id}/modifier`} className={`${btnPrimary} py-2`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={PEN} />
              </svg>
              Modifier
            </Link>
            <Link to="/parametres/utilisateurs" className={`${btnSecondary} py-2`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Retour
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${card} p-5 space-y-4`}>
          <h2 className="text-base font-semibold text-gray-900">Coordonnées</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">E-mail</dt>
              <dd className="font-medium text-gray-900">
                <a href={`mailto:${u.email}`} className="hover:text-emerald-700">
                  {u.email}
                </a>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Téléphone</dt>
              <dd className="font-medium text-gray-900">{u.phone || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Poste</dt>
              <dd className="font-medium text-gray-900">{u.job_title || '—'}</dd>
            </div>
          </dl>
        </div>
        <div className={`${card} p-5 space-y-4`}>
          <h2 className="text-base font-semibold text-gray-900">Activité</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Compte créé le</dt>
              <dd className="font-medium text-gray-900">{dateTime(u.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Dernière connexion</dt>
              <dd className="font-medium text-gray-900">
                {dateTime(u.last_sign_in_at)}
                {u.last_sign_in_at && <span className="text-xs text-gray-400 ml-1">({timeAgo(u.last_sign_in_at)})</span>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Statut</dt>
              <dd>
                {u.is_active ? <span className="text-green-600 font-medium">Actif</span> : <span className="text-red-600 font-medium">Inactif</span>}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Permissions</h2>
        <div className="flex flex-wrap gap-2">
          {perms.map((p) => (
            <span key={p} className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 font-mono">
              {p}
            </span>
          ))}
          {perms.length === 0 && <span className="text-sm text-gray-400">Aucune permission.</span>}
        </div>
      </div>
    </div>
  )
}
