import { FormEvent, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { btnPrimary, btnSecondary, card, input, label } from '../../lib/ui'
import { WAREHOUSE_TYPES, Warehouse, WarehouseType, loadWarehouses, typeInfo } from '../../lib/depots'

type Stat = { coils: number; kg: number }
type Form = Omit<Warehouse, 'id'> & { id?: string }

const EMPTY: Form = {
  code: '',
  name: '',
  type: 'matiere_premiere',
  can_purchase: true,
  can_production: false,
  can_sale: false,
  is_default: false,
  is_active: true,
  notes: null,
}
// Usages proposés selon le type
const USES: Record<WarehouseType, Pick<Form, 'can_purchase' | 'can_production' | 'can_sale'>> = {
  matiere_premiere: { can_purchase: true, can_production: false, can_sale: false },
  production: { can_purchase: false, can_production: true, can_sale: true },
  magasin: { can_purchase: false, can_production: false, can_sale: true },
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n).replace(/[  ]/g, ' ')

export default function Depots() {
  const ctx = useOutletContext<AppContext>()
  const canEdit = ctx.can('settings.manage')
  const [rows, setRows] = useState<Warehouse[]>([])
  const [stats, setStats] = useState(new Map<string, Stat>())
  const [f, setF] = useState<Form | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function reload() {
    const [w, c] = await Promise.all([
      loadWarehouses(),
      supabase.from('coils').select('warehouse_id, remaining_weight_kg').gt('remaining_weight_kg', 0),
    ])
    const m = new Map<string, Stat>()
    ;((c.data as { warehouse_id: string; remaining_weight_kg: number }[]) ?? []).forEach((x) => {
      const s = m.get(x.warehouse_id) ?? { coils: 0, kg: 0 }
      s.coils += 1
      s.kg += Number(x.remaining_weight_kg)
      m.set(x.warehouse_id, s)
    })
    setRows(w)
    setStats(m)
  }
  useEffect(() => {
    reload()
  }, [])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => (p ? { ...p, [k]: v } : p))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!f) return
    setError(null)
    setSaving(true)
    const { id, ...row } = f
    row.code = row.code.trim().toUpperCase()
    row.name = row.name.trim()
    row.notes = row.notes?.trim() || null
    // Un seul dépôt par défaut par type : on retire l'ancien
    if (row.is_default) {
      let q = supabase.from('warehouses').update({ is_default: false }).eq('type', row.type).eq('is_default', true)
      if (id) q = q.neq('id', id)
      await q
    }
    const res = id ? await supabase.from('warehouses').update(row).eq('id', id) : await supabase.from('warehouses').insert(row)
    setSaving(false)
    if (res.error) {
      if (res.error.code === '23505') return setError(`Le code ${row.code} existe déjà.`)
      return setError("L'enregistrement a échoué : " + res.error.message)
    }
    setF(null)
    reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Dépôts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Les bobines arrivent au dépôt matières premières, puis sont transférées au dépôt production pour être transformées en tôles. Le magasin garde les avariés et les surproductions.</p>
        </div>
        {canEdit && !f && (
          <button type="button" onClick={() => setF(EMPTY)} className={btnPrimary}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouveau dépôt
          </button>
        )}
      </div>

      {/* Circuit : fournisseur -> matières premières -> production */}
      <div className={`${card} p-4 flex flex-wrap items-center gap-2 text-sm text-gray-600`}>
        <span className="px-2 py-1 rounded-[3px] bg-gray-100">Fournisseur</span>
        <span className="text-gray-400">→ réception →</span>
        <span className="px-2 py-1 rounded-[3px] bg-amber-100 text-amber-800 font-medium">Matières premières (bobines)</span>
        <span className="text-gray-400">→ transfert →</span>
        <span className="px-2 py-1 rounded-[3px] bg-blue-100 text-blue-700 font-medium">Production (transformation en tôles)</span>
        <span className="text-gray-400">→ avariés, surproductions →</span>
        <span className="px-2 py-1 rounded-[3px] bg-violet-100 text-violet-700 font-medium">Magasin</span>
      </div>

      {f && (
        <form onSubmit={onSubmit} className={`${card} p-5 space-y-4`}>
          <h2 className="text-base font-semibold text-gray-900">{f.id ? `Modifier ${f.code}` : 'Nouveau dépôt'}</h2>
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {WAREHOUSE_TYPES.map((t) => {
              const on = f.type === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setF((p) => (p ? { ...p, type: t.value, ...USES[t.value] } : p))}
                  className={`p-3 rounded-[4px] border text-left transition-colors ${
                    on ? 'bg-[#eef5f0] border-emerald-500 ring-1 ring-emerald-500' : 'bg-white border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="block text-sm font-semibold text-gray-900">{t.label}</span>
                  <span className="block text-xs text-gray-500">{t.hint}</span>
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>
                Code <span className="text-red-500">*</span>
              </label>
              <input value={f.code} onChange={(e) => set('code', e.target.value)} required placeholder="Ex : DEPMP" className={`${input} font-mono`} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>
                Nom <span className="text-red-500">*</span>
              </label>
              <input value={f.name} onChange={(e) => set('name', e.target.value)} required className={input} />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-700">
            {(
              [
                ['can_purchase', 'Reçoit les achats'],
                ['can_production', 'Alimente la production'],
                ['can_sale', 'Sert les ventes'],
                ['is_default', 'Dépôt par défaut de ce type'],
                ['is_active', 'Actif'],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="inline-flex items-center gap-2">
                <input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} className="rounded border-gray-300 text-emerald-700" />
                {l}
              </label>
            ))}
          </div>
          <div>
            <label className={label}>Remarques</label>
            <textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} className={input} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setF(null)} className={btnSecondary}>
              Annuler
            </button>
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((d) => {
          const t = typeInfo(d.type)
          const s = stats.get(d.id) ?? { coils: 0, kg: 0 }
          const uses = [d.can_purchase && 'Achats', d.can_production && 'Production', d.can_sale && 'Ventes'].filter(Boolean).join(' · ')
          return (
            <div key={d.id} className={`${card} p-4 ${d.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-gray-500">{d.code}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-medium ${t.badge}`}>{t.label}</span>
                    {d.is_default && <span className="inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-medium bg-emerald-100 text-emerald-800">Par défaut</span>}
                    {!d.is_active && <span className="inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-medium bg-gray-100 text-gray-500">Inactif</span>}
                  </div>
                  <h3 className="text-[14px] font-semibold text-gray-900 mt-1">{d.name}</h3>
                  <p className="text-xs text-gray-500">{uses || '—'}</p>
                </div>
                {canEdit && (
                  <button type="button" onClick={() => setF({ ...d })} className={btnSecondary}>
                    Modifier
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-gray-50 rounded-[4px] px-3 py-2">
                  <p className="text-[11px] text-gray-500">Bobines en stock</p>
                  <p className="text-[16px] font-bold text-gray-900 tabular-nums">{s.coils}</p>
                </div>
                <div className="bg-gray-50 rounded-[4px] px-3 py-2">
                  <p className="text-[11px] text-gray-500">Poids restant</p>
                  <p className="text-[16px] font-bold text-gray-900 tabular-nums">{fmt(s.kg)} kg</p>
                </div>
              </div>
              {s.coils > 0 && (
                <Link to="/stocks/bobines" className="inline-block mt-2 text-xs text-emerald-700 hover:underline">
                  Voir les bobines →
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
