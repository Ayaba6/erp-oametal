import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { btnPrimary, btnSecondary, card, input, label } from '../../lib/ui'
import { Article, COLORS, FINISHES, KINDS, Kind, kindInfo, loadArticles, suggestCode, suggestName } from './articleData'

type Form = {
  kind: Kind
  finish: string
  color: string
  ral: string
  thickness_mm: string
  width_mm: string
  waves: string
  kg_per_meter: string
  coil_product_id: string
  purchase_price: string
  sale_price: string
  min_sale_price: string
  stock_min: string
  code: string
  name: string
  is_active: boolean
  notes: string
}

const EMPTY: Form = {
  kind: 'tole',
  finish: 'aluzinc',
  color: '',
  ral: '',
  thickness_mm: '0.35',
  width_mm: '',
  waves: '4',
  kg_per_meter: '2.355',
  coil_product_id: '',
  purchase_price: '',
  sale_price: '',
  min_sale_price: '',
  stock_min: '',
  code: '',
  name: '',
  is_active: true,
  notes: '',
}

const THICKNESSES = ['0.30', '0.35', '0.40', '0.45', '0.50']
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
const str = (n: number | null | undefined) => (n == null ? '' : String(n))

const KIND_ICONS: Record<Kind, string> = {
  bobine: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-6a3 3 0 100-6 3 3 0 000 6z',
  tole: 'M3 8c1.5-2 3-2 4.5 0S10.5 10 12 8s3-2 4.5 0 3 2 4.5 0M3 14c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0',
  faitiere: 'M3 17l9-9 9 9M6 17v2h12v-2',
}
const KIND_HINT: Record<Kind, string> = {
  bobine: 'Matière achetée, suivie en kg',
  tole: 'Produite, vendue au mètre',
  faitiere: 'Produite, vendue à la pièce',
}

export default function ArticleForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [f, setF] = useState<Form>(EMPTY)
  const [coils, setCoils] = useState<Article[]>([])
  const [autoCode, setAutoCode] = useState(!editing)
  const [autoName, setAutoName] = useState(!editing)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadArticles().then((all) => {
      setCoils(all.filter((a) => a.kind === 'bobine'))
      if (id) {
        const a = all.find((x) => x.id === id)
        if (a)
          setF({
            kind: a.kind,
            finish: a.finish ?? '',
            color: a.color ?? '',
            ral: a.ral ?? '',
            thickness_mm: str(a.thickness_mm),
            width_mm: str(a.width_mm),
            waves: str(a.waves),
            kg_per_meter: str(a.kg_per_meter),
            coil_product_id: a.coil_product_id ?? '',
            purchase_price: a.purchase_price ? str(a.purchase_price) : '',
            sale_price: a.sale_price ? str(a.sale_price) : '',
            min_sale_price: str(a.min_sale_price),
            stock_min: a.stock_min ? str(a.stock_min) : '',
            code: a.code,
            name: a.name,
            is_active: a.is_active,
            notes: a.notes ?? '',
          })
      }
    })
  }, [id])

  // Code et désignation proposés automatiquement tant qu'on ne les a pas modifiés à la main
  useEffect(() => {
    const base = {
      kind: f.kind,
      finish: (f.finish || null) as Article['finish'],
      color: f.color || null,
      ral: f.ral.trim() || null,
      thickness_mm: toNum(f.thickness_mm),
      waves: f.kind === 'tole' ? toNum(f.waves) : null,
    }
    setF((prev) => ({
      ...prev,
      code: autoCode ? suggestCode(base) : prev.code,
      name: autoName ? suggestName(base) : prev.name,
    }))
  }, [f.kind, f.finish, f.color, f.ral, f.thickness_mm, f.waves, autoCode, autoName])

  // Bobine proposée : même finition et même couleur
  useEffect(() => {
    if (f.kind === 'bobine' || f.coil_product_id) return
    const match = coils.find((c) => c.finish === f.finish && (c.color ?? '').toLowerCase() === f.color.toLowerCase())
    if (match) setF((prev) => ({ ...prev, coil_product_id: match.id }))
  }, [f.kind, f.finish, f.color, coils, f.coil_product_id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((prev) => ({ ...prev, [k]: v }))
  const info = kindInfo(f.kind)
  const isCoil = f.kind === 'bobine'
  const readOnly = editing ? !ctx.can('products.edit') : !ctx.can('products.create')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (f.finish === 'prelaquee' && !f.color.trim()) return setError('Indiquez la couleur pour un article prélaqué.')
    if (!isCoil && !toNum(f.kg_per_meter)) return setError('Indiquez le poids par mètre : il sert à calculer la consommation de bobine.')

    setSaving(true)
    const [cat, unit] = await Promise.all([
      supabase.from('categories').select('id').eq('code', info.category).maybeSingle(),
      supabase.from('units').select('id').eq('code', info.unit).maybeSingle(),
    ])
    const row = {
      kind: f.kind,
      code: f.code.trim().toUpperCase(),
      name: f.name.trim(),
      finish: f.finish || null,
      color: f.finish === 'prelaquee' ? f.color.trim() : null,
      ral: f.finish === 'prelaquee' ? f.ral.trim().replace(/^RAL\s*/i, '') || null : null,
      thickness_mm: toNum(f.thickness_mm),
      width_mm: isCoil ? toNum(f.width_mm) : null,
      waves: f.kind === 'tole' ? toNum(f.waves) : null,
      kg_per_meter: toNum(f.kg_per_meter),
      coil_product_id: isCoil ? null : f.coil_product_id || null,
      purchase_price: isCoil ? toNum(f.purchase_price) ?? 0 : 0,
      sale_price: isCoil ? 0 : toNum(f.sale_price) ?? 0,
      min_sale_price: isCoil ? null : toNum(f.min_sale_price),
      stock_min: toNum(f.stock_min) ?? 0,
      is_active: f.is_active,
      notes: f.notes.trim() || null,
      category_id: (cat.data as { id: string } | null)?.id,
      unit_id: (unit.data as { id: string } | null)?.id,
    }
    const res = editing ? await supabase.from('products').update(row).eq('id', id!) : await supabase.from('products').insert(row)
    setSaving(false)
    if (res.error) {
      if (res.error.code === '23505') return setError(`Le code ${row.code} existe déjà. Choisissez un autre code.`)
      return setError("L'enregistrement a échoué : " + res.error.message)
    }
    navigate('/stocks/articles')
  }

  const coilChoices = coils.filter((c) => c.is_active || c.id === f.coil_product_id)

  return (
    <div>
      <div className="space-y-1 mb-5">
        <h1 className="text-[16px] font-bold text-gray-900">
          {editing ? (
            <>
              Modifier <span className="text-emerald-700">{f.code}</span>
            </>
          ) : (
            'Nouvel article'
          )}
        </h1>
        <p className="text-sm text-gray-500">Bobines achetées et tôles produites à partir de ces bobines.</p>
      </div>

      <form onSubmit={onSubmit}>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
        <fieldset disabled={readOnly} className="space-y-3">
          {/* 1. Type */}
          <div className={`${card} p-5 space-y-3`}>
            <h2 className="text-base font-semibold text-gray-900">1. Type d'article</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {KINDS.map((k) => {
                const on = f.kind === k.value
                return (
                  <button
                    key={k.value}
                    type="button"
                    disabled={editing}
                    onClick={() => setF((prev) => ({ ...prev, kind: k.value, coil_product_id: '', waves: k.value === 'tole' ? prev.waves || '4' : '' }))}
                    className={`flex items-center gap-3 p-3 rounded-[4px] border text-left transition-colors ${
                      on ? 'bg-[#eef5f0] border-emerald-500 ring-1 ring-emerald-500' : 'bg-white border-gray-300 hover:bg-gray-50'
                    } ${editing && !on ? 'opacity-40' : ''}`}
                  >
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${on ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                        <path d={KIND_ICONS[k.value]} />
                      </svg>
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{k.label}</span>
                      <span className="block text-xs text-gray-500">{KIND_HINT[k.value]}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Caractéristiques */}
          <div className={`${card} p-5 space-y-3`}>
            <h2 className="text-base font-semibold text-gray-900">2. Caractéristiques</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={label}>
                  Finition <span className="text-red-500">*</span>
                </label>
                <select value={f.finish} onChange={(e) => set('finish', e.target.value)} required className={input}>
                  {FINISHES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
              {f.finish === 'prelaquee' && (
                <div>
                  <label className={label}>
                    Couleur <span className="text-red-500">*</span>
                  </label>
                  <input list="couleurs" value={f.color} onChange={(e) => set('color', e.target.value)} placeholder="Ex : Bleue" className={input} />
                  <datalist id="couleurs">
                    {COLORS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              )}
              {f.finish === 'prelaquee' && (
                <div>
                  <label className={label}>Code RAL</label>
                  <input value={f.ral} onChange={(e) => set('ral', e.target.value)} placeholder="Ex : 6005" className={input} />
                </div>
              )}
              <div>
                <label className={label}>
                  Épaisseur (mm) <span className="text-red-500">*</span>
                </label>
                <input
                  list="epaisseurs"
                  inputMode="decimal"
                  value={f.thickness_mm}
                  onChange={(e) => set('thickness_mm', e.target.value)}
                  required
                  className={input}
                />
                <datalist id="epaisseurs">
                  {THICKNESSES.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>
              {isCoil && (
                <div>
                  <label className={label}>Largeur (mm)</label>
                  <input inputMode="decimal" value={f.width_mm} onChange={(e) => set('width_mm', e.target.value)} placeholder="Ex : 1200" className={input} />
                </div>
              )}
              {f.kind === 'tole' && (
                <div>
                  <label className={label}>Nombre d'ondes</label>
                  <input inputMode="numeric" value={f.waves} onChange={(e) => set('waves', e.target.value)} className={input} />
                </div>
              )}
              <div>
                <label className={label}>
                  {f.kind === 'faitiere' ? 'Poids (kg / pièce)' : 'Poids (kg / mètre)'} {!isCoil && <span className="text-red-500">*</span>}
                </label>
                <input inputMode="decimal" value={f.kg_per_meter} onChange={(e) => set('kg_per_meter', e.target.value)} placeholder="Ex : 2,355" className={input} />
              </div>
              {!isCoil && (
                <div className="sm:col-span-2">
                  <label className={label}>Bobine utilisée</label>
                  <select value={f.coil_product_id} onChange={(e) => set('coil_product_id', e.target.value)} className={input}>
                    <option value="">— Choisir la bobine —</option>
                    {coilChoices.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* 3. Prix et stock */}
          <div className={`${card} p-5 space-y-3`}>
            <h2 className="text-base font-semibold text-gray-900">3. Prix et stock</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {isCoil ? (
                <div>
                  <label className={label}>Prix d'achat (F / kg)</label>
                  <input inputMode="decimal" value={f.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} className={input} />
                </div>
              ) : (
                <>
                  <div>
                    <label className={label}>Prix de vente HT (F / {info.unitLabel})</label>
                    <input inputMode="decimal" value={f.sale_price} onChange={(e) => set('sale_price', e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className={label}>Prix plancher HT (F / {info.unitLabel})</label>
                    <input inputMode="decimal" value={f.min_sale_price} onChange={(e) => set('min_sale_price', e.target.value)} className={input} />
                    <p className="text-[11px] text-gray-400 mt-1">Vendre en dessous demandera une validation.</p>
                  </div>
                </>
              )}
              <div>
                <label className={label}>Stock minimum ({info.unitLabel})</label>
                <input inputMode="decimal" value={f.stock_min} onChange={(e) => set('stock_min', e.target.value)} className={input} />
                <p className="text-[11px] text-gray-400 mt-1">Alerte sur le tableau de bord en dessous.</p>
              </div>
            </div>
          </div>

          {/* 4. Identification */}
          <div className={`${card} p-5 space-y-3`}>
            <h2 className="text-base font-semibold text-gray-900">4. Identification</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={label}>
                  Code <span className="text-red-500">*</span>
                  {autoCode && <span className="ml-1 text-[10.5px] font-normal text-emerald-700">proposé automatiquement</span>}
                </label>
                <input
                  value={f.code}
                  onChange={(e) => {
                    setAutoCode(false)
                    set('code', e.target.value)
                  }}
                  required
                  className={`${input} font-mono uppercase`}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>
                  Désignation <span className="text-red-500">*</span>
                  {autoName && <span className="ml-1 text-[10.5px] font-normal text-emerald-700">proposée automatiquement</span>}
                </label>
                <input
                  value={f.name}
                  onChange={(e) => {
                    setAutoName(false)
                    set('name', e.target.value)
                  }}
                  required
                  className={input}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Notes</label>
                <input value={f.notes} onChange={(e) => set('notes', e.target.value)} className={input} />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-700" />
                </label>
                <span className="text-sm text-gray-700">Article actif</span>
              </div>
            </div>
          </div>
        </fieldset>

        <div className="mt-4 flex items-center justify-end gap-3">
          <Link to="/stocks/articles" className={`${btnSecondary} px-5`}>
            {readOnly ? 'Retour' : 'Annuler'}
          </Link>
          {!readOnly && (
            <button type="submit" disabled={saving} className={`${btnPrimary} px-5`}>
              {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : "Créer l'article"}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
