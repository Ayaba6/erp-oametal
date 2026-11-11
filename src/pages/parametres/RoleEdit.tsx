import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { btnPrimary, btnSecondary } from '../../lib/ui'
import { Permission, Role, actionTone, groupPermissions, loadPermissions } from './roles'

export default function RoleEdit() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role | null>(null)
  const [perms, setPerms] = useState<Permission[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    Promise.all([
      supabase.from('roles').select('*').eq('code', code).maybeSingle(),
      loadPermissions(),
      supabase.from('role_permissions').select('permission_code').eq('role_code', code),
    ]).then(([r, all, rp]) => {
      setRole(r.data as Role | null)
      setPerms(all)
      setChecked(new Set(((rp.data as { permission_code: string }[]) ?? []).map((x) => x.permission_code)))
    })
  }, [code])

  const toggle = (c: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })

  const toggleGroup = (items: Permission[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      items.forEach((p) => (on ? next.add(p.code) : next.delete(p.code)))
      return next
    })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!code) return
    setSaving(true)
    setError(null)
    const del = await supabase.from('role_permissions').delete().eq('role_code', code)
    const ins = checked.size
      ? await supabase.from('role_permissions').insert([...checked].map((c) => ({ role_code: code, permission_code: c })))
      : { error: null }
    setSaving(false)
    if (del.error || ins.error) return setError("L'enregistrement a échoué : vous n'avez peut-être pas la permission « roles.manage ».")
    navigate(`/parametres/roles/${code}`)
  }

  if (!role) return <p className="text-sm text-gray-400">Chargement…</p>
  if (role.is_super)
    return (
      <div className="bg-white rounded-[4px] border border-gray-300 p-5 text-sm text-gray-600">
        Le rôle <strong>{role.name}</strong> a accès à tout : ses permissions ne se modifient pas.{' '}
        <Link to="/parametres/roles" className="text-emerald-700 font-medium">
          Retour
        </Link>
      </div>
    )

  return (
    <div>
      <div className="space-y-1 mb-5">
        <h1 className="text-[16px] font-bold text-gray-900">
          Permissions — <span className="text-emerald-700">{role.name}</span>
        </h1>
        <p className="text-sm text-gray-500">Cochez les permissions à accorder à ce rôle.</p>
      </div>

      <form onSubmit={onSubmit}>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
        <div className="space-y-4">
          {groupPermissions(perms).map(([group, items]) => {
            const all = items.every((p) => checked.has(p.code))
            return (
              <div key={group} className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700">{group}</h3>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 hover:text-gray-700 select-none">
                    <input
                      type="checkbox"
                      checked={all}
                      onChange={(e) => toggleGroup(items, e.target.checked)}
                      className="rounded border-gray-300 text-emerald-700 accent-emerald-700 focus:ring-emerald-500"
                    />
                    Tout cocher / décocher
                  </label>
                </div>
                <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {items.map((p) => {
                    const on = checked.has(p.code)
                    const tone = actionTone(p.code)
                    const parts = p.label.split(' · ')
                    const action = parts.pop()
                    return (
                      <label
                        key={p.code}
                        className={`flex items-center gap-2.5 p-2.5 rounded-[4px] border cursor-pointer transition-colors ${
                          on ? 'bg-[#eef5f0] border-emerald-200' : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(p.code)}
                          className="rounded border-gray-300 text-emerald-700 accent-emerald-700 focus:ring-emerald-500 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tone.dot}`} />
                            {parts.length > 0 && <span className="text-xs font-medium text-gray-400">{parts.join(' · ')} ·</span>}
                            <span className={`text-xs font-semibold ${tone.text}`}>{action}</span>
                          </div>
                          <p className="text-xs text-gray-400 font-mono truncate mt-0.5">{p.code}</p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <Link to={`/parametres/roles/${role.code}`} className={`${btnSecondary} px-5`}>
            Annuler
          </Link>
          <button type="submit" disabled={saving} className={`${btnPrimary} px-5`}>
            {saving ? 'Enregistrement…' : 'Enregistrer les permissions'}
          </button>
        </div>
      </form>
    </div>
  )
}
