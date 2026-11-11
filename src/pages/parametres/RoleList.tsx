import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Role, loadRoles } from './roles'

const th = 'px-3 py-1.5 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'

export default function RoleList() {
  const [roles, setRoles] = useState<Role[]>([])
  const [permCount, setPermCount] = useState(new Map<string, number>())
  const [userCount, setUserCount] = useState(new Map<string, number>())

  useEffect(() => {
    loadRoles().then((r) => {
      setRoles(r.roles)
      setPermCount(r.permCount)
      setUserCount(r.userCount)
    })
  }, [])

  const assignments = [...userCount.values()].reduce((s, n) => s + n, 0)
  const groups = [...new Set(roles.map((r) => r.group_name))]

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-b from-[#eef5f0] to-white border border-gray-300 rounded-[4px] px-3 py-2.5 flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold text-emerald-900">Rôles &amp; Permissions</h1>
          <p className="text-[11.5px] text-gray-500">
            {roles.length} rôles — {assignments} affectation(s) utilisateur
          </p>
        </div>
        <Link
          to="/parametres/utilisateurs"
          className="text-[13px] font-semibold text-emerald-700 border border-emerald-300 bg-white hover:bg-emerald-50 px-4 py-1.5 rounded-full transition-colors"
        >
          Gérer les utilisateurs
        </Link>
      </div>

      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[#eef5f0] border-b border-gray-300">
                <th className={`${th} text-left w-[34%]`}>Rôle</th>
                <th className={`${th} text-left`}>Code technique</th>
                <th className={`${th} text-right w-28`}>Permissions</th>
                <th className={`${th} text-right w-28`}>Utilisateurs</th>
                <th className={`${th} text-right w-44`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <td colSpan={5} className="px-3 py-1 text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                      {g}
                    </td>
                  </tr>
                  {roles
                    .filter((r) => r.group_name === g)
                    .map((r) => {
                      const users = userCount.get(r.code) ?? 0
                      return (
                        <tr key={r.code} className="border-b border-gray-100 last:border-0 odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50">
                          <td className="px-3 py-1.5">
                            <Link to={`/parametres/roles/${r.code}`} className="font-semibold text-emerald-800 hover:underline">
                              {r.name}
                            </Link>
                            {r.is_super && (
                              <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold bg-purple-100 text-purple-700 align-middle">
                                accès total
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-[12px] text-gray-500">{r.code}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">{r.is_super ? 'toutes' : permCount.get(r.code) ?? 0}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">
                            {users > 0 ? <span className="font-semibold text-gray-800">{users}</span> : <span className="text-gray-400">0</span>}
                          </td>
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            <Link to={`/parametres/roles/${r.code}`} className="text-[12px] font-medium text-gray-500 hover:text-emerald-700 hover:underline">
                              Détail
                            </Link>
                            <span className="text-gray-300 mx-1">|</span>
                            <Link to={`/parametres/roles/${r.code}/permissions`} className="text-[12px] font-semibold text-emerald-700 hover:underline">
                              Gérer les permissions
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11.5px] text-gray-400 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Les rôles définissent les permissions d'accès aux modules. L'affectation d'un rôle à un utilisateur se fait depuis la fiche utilisateur.
      </p>
    </div>
  )
}
