import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { btnPrimary, btnSecondary, card, humanize, input, label } from '../../lib/ui'

type Form = {
  full_name: string
  email: string
  phone: string
  job_title: string
  role: string
  is_active: boolean
  password: string
  password_confirmation: string
}

const EMPTY: Form = { full_name: '', email: '', phone: '', job_title: '', role: '', is_active: true, password: '', password_confirmation: '' }

// Création (pas d'id) ou modification (id dans l'adresse) d'un utilisateur
export default function UserForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const [f, setF] = useState<Form>(EMPTY)
  const [roles, setRoles] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('roles')
      .select('code')
      .order('code')
      .then(({ data }) => setRoles(((data as { code: string }[]) ?? []).map((r) => r.code)))
    if (id) {
      supabase
        .from('profiles')
        .select('full_name, email, phone, job_title, role, is_active')
        .eq('id', id)
        .maybeSingle()
        .then(({ data }) => {
          const p = data as Partial<Form> | null
          if (p) setF({ ...EMPTY, ...p, phone: p.phone ?? '', job_title: p.job_title ?? '', email: p.email ?? '' })
        })
    }
  }, [id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!editing && f.password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.')
    if (f.password && f.password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.')
    if (f.password !== f.password_confirmation) return setError('La confirmation ne correspond pas au mot de passe.')

    setSaving(true)
    const { data, error } = await supabase.functions.invoke('admin-users', {
      body: {
        action: editing ? 'update' : 'create',
        id,
        full_name: f.full_name.trim(),
        email: f.email.trim(),
        phone: f.phone.trim() || null,
        job_title: f.job_title.trim() || null,
        role: f.role,
        is_active: f.is_active,
        password: f.password || undefined,
      },
    })
    setSaving(false)
    if (error || (data as { error?: string } | null)?.error) {
      let msg = (data as { error?: string } | null)?.error
      if (!msg && error && 'context' in error) {
        try {
          msg = ((await (error as { context: Response }).context.json()) as { error?: string }).error
        } catch {
          /* réponse illisible */
        }
      }
      return setError(msg ?? "L'enregistrement a échoué. Vérifiez que la fonction « admin-users » est déployée.")
    }
    navigate(`/parametres/utilisateurs/${(data as { id: string }).id}`)
  }

  return (
    <div>
      <div className="space-y-1 mb-5">
        <h1 className="text-[16px] font-bold text-gray-900">
          {editing ? (
            <>
              Modifier <span className="text-emerald-700">{f.full_name}</span>
            </>
          ) : (
            'Nouvel utilisateur'
          )}
        </h1>
      </div>

      <form onSubmit={onSubmit}>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}

        <div className="space-y-3">
          <div className={`${card} p-5 space-y-3`}>
            <h2 className="text-base font-semibold text-gray-900">Informations personnelles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={label}>
                  Nom complet <span className="text-red-500">*</span>
                </label>
                <input type="text" value={f.full_name} onChange={(e) => set('full_name', e.target.value)} required className={input} />
              </div>
              <div>
                <label className={label}>
                  Adresse e-mail <span className="text-red-500">*</span>
                </label>
                <input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} required className={input} />
              </div>
              <div>
                <label className={label}>Téléphone</label>
                <input type="text" value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+226 XX XX XX XX" className={input} />
              </div>
              <div>
                <label className={label}>Poste / Fonction</label>
                <input
                  type="text"
                  value={f.job_title}
                  onChange={(e) => set('job_title', e.target.value)}
                  placeholder="Ex: Directeur commercial"
                  className={input}
                />
              </div>
              <div>
                <label className={label}>
                  Rôle <span className="text-red-500">*</span>
                </label>
                <select value={f.role} onChange={(e) => set('role', e.target.value)} required className={input}>
                  <option value="">Sélectionner un rôle...</option>
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-1 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-700" />
                </label>
                <span className="text-sm text-gray-700">Compte actif</span>
              </div>
            </div>
          </div>

          <div className={`${card} p-5 space-y-4`}>
            <h2 className="text-base font-semibold text-gray-900">
              Mot de passe
              {editing && <span className="text-xs font-normal text-gray-400 ml-2">Laisser vide pour ne pas modifier</span>}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label}>Mot de passe {!editing && <span className="text-red-500">*</span>}</label>
                <input
                  type="password"
                  value={f.password}
                  onChange={(e) => set('password', e.target.value)}
                  autoComplete="new-password"
                  required={!editing}
                  className={input}
                />
              </div>
              <div>
                <label className={label}>Confirmation {!editing && <span className="text-red-500">*</span>}</label>
                <input
                  type="password"
                  value={f.password_confirmation}
                  onChange={(e) => set('password_confirmation', e.target.value)}
                  autoComplete="new-password"
                  className={input}
                />
              </div>
            </div>
            {!editing && <p className="text-xs text-gray-400">Minimum 8 caractères.</p>}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <Link to={editing ? `/parametres/utilisateurs/${id}` : '/parametres/utilisateurs'} className={`${btnSecondary} px-5`}>
            Annuler
          </Link>
          <button type="submit" disabled={saving} className={`${btnPrimary} px-5`}>
            {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : "Créer l'utilisateur"}
          </button>
        </div>
      </form>
    </div>
  )
}
