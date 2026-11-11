import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { btnPrimary, btnSecondary, card, input, label } from '../../lib/ui'
import { Article, loadArticles } from './articleData'
import { Warehouse, loadWarehouses, typeInfo } from '../../lib/depots'
import { COIL_COLUMNS, Coil, CoilStatus, STATUSES, defaultWarehouseId, fmt, loadCoils, nextReference } from './bobineData'

type Form = {
  reference: string
  lot_number: string
  product_id: string
  warehouse_id: string
  supplier_coil_no: string
  thickness_mm: string
  width_mm: string
  initial_weight_kg: string
  gross_weight_kg: string
  length_m: string
  remaining_weight_kg: string
  cost_per_kg: string
  status: CoilStatus
  received_at: string
  notes: string
}

const today = () => new Date().toISOString().slice(0, 10)
const EMPTY: Form = {
  reference: '',
  lot_number: '',
  product_id: '',
  warehouse_id: '',
  supplier_coil_no: '',
  thickness_mm: '',
  width_mm: '',
  initial_weight_kg: '',
  gross_weight_kg: '',
  length_m: '',
  remaining_weight_kg: '',
  cost_per_kg: '',
  status: 'disponible',
  received_at: today(),
  notes: '',
}
const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\s/g, '').replace(',', '.')))
const str = (n: number | null | undefined) => (n == null ? '' : String(n))

export default function BobineForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [f, setF] = useState<Form>(EMPTY)
  const [articles, setArticles] = useState<Article[]>([])
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadArticles().then((all) => setArticles(all.filter((a) => a.kind === 'bobine' && a.is_active)))
    loadWarehouses().then((w) => {
      const active = w.filter((d) => d.is_active)
      setDepots(active)
      // Nouvelle bobine : dépôt matières premières par défaut
      const mp = active.find((d) => d.type === 'matiere_premiere' && d.is_default) ?? active.find((d) => d.type === 'matiere_premiere')
      if (!id && mp) setF((p) => ({ ...p, warehouse_id: p.warehouse_id || mp.id }))
    })
    if (id) {
      supabase
        .from('coils')
        .select(COIL_COLUMNS)
        .eq('id', id)
        .maybeSingle()
        .then(({ data }) => {
          const c = data as unknown as Coil | null
          if (!c) return
          setF({
            reference: c.reference,
            lot_number: c.lot_number ?? '',
            product_id: c.product_id,
            warehouse_id: c.warehouse_id,
            supplier_coil_no: c.supplier_coil_no ?? '',
            thickness_mm: str(c.thickness_mm),
            width_mm: str(c.width_mm),
            initial_weight_kg: str(c.initial_weight_kg),
            gross_weight_kg: str(c.gross_weight_kg),
            length_m: str(c.length_m),
            remaining_weight_kg: str(c.remaining_weight_kg),
            cost_per_kg: str(c.cost_per_kg),
            status: c.status,
            received_at: c.received_at,
            notes: c.notes ?? '',
          })
        })
    } else {
      loadCoils().then((all) => setF((p) => ({ ...p, reference: nextReference(all.map((c) => c.reference)) })))
    }
  }, [id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  // L'article choisi pré-remplit épaisseur, largeur et prix au kg
  function pickArticle(pid: string) {
    const a = articles.find((x) => x.id === pid)
    setF((p) => ({
      ...p,
      product_id: pid,
      thickness_mm: a?.thickness_mm != null ? String(a.thickness_mm) : p.thickness_mm,
      width_mm: a?.width_mm != null ? String(a.width_mm) : p.width_mm,
      cost_per_kg: p.cost_per_kg || (a?.purchase_price ? String(a.purchase_price) : ''),
    }))
  }

  const net = toNum(f.initial_weight_kg)
  const len = toNum(f.length_m)
  const mass = net && len ? net / len : null
  const readOnly = editing ? !ctx.can('stocks.adjust') : !ctx.can('receptions.create')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!f.product_id) return setError("Choisissez l'article (code MPTBC...).")
    if (!net || net <= 0) return setError('Indiquez le poids net de la bobine.')

    setSaving(true)
    const remaining = editing ? toNum(f.remaining_weight_kg) ?? net : f.status === 'epuisee' ? 0 : net
    const row: Record<string, unknown> = {
      reference: f.reference.trim().toUpperCase(),
      lot_number: f.lot_number.trim() || null,
      product_id: f.product_id,
      supplier_coil_no: f.supplier_coil_no.trim() || null,
      thickness_mm: toNum(f.thickness_mm),
      width_mm: toNum(f.width_mm),
      initial_weight_kg: net,
      gross_weight_kg: toNum(f.gross_weight_kg),
      length_m: len,
      remaining_weight_kg: remaining,
      cost_per_kg: toNum(f.cost_per_kg) ?? 0,
      status: f.status,
      received_at: f.received_at || today(),
      notes: f.notes.trim() || null,
    }
    const wh = f.warehouse_id || (await defaultWarehouseId())
    if (!wh) {
      setSaving(false)
      return setError("Aucun dépôt actif n'est défini.")
    }
    row.warehouse_id = wh
    const res = editing ? await supabase.from('coils').update(row).eq('id', id!) : await supabase.from('coils').insert(row)
    setSaving(false)
    if (res.error) {
      if (res.error.code === '23505') return setError(`Le numéro ${row.reference} existe déjà.`)
      return setError("L'enregistrement a échoué : " + res.error.message)
    }
    navigate('/stocks/bobines')
  }

  return (
    <div>
      <div className="space-y-1 mb-5">
        <h1 className="text-[16px] font-bold text-gray-900">
          {editing ? (
            <>
              Bobine <span className="text-emerald-700">{f.reference}</span>
            </>
          ) : (
            'Nouvelle bobine'
          )}
        </h1>
        <p className="text-sm text-gray-500">Saisie d'une bobine reçue, avec les valeurs réelles de l'étiquette.</p>
      </div>

      <form onSubmit={onSubmit}>
        {error && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
        <fieldset disabled={readOnly} className="space-y-3">
          <div className={`${card} p-5 space-y-3`}>
            <h2 className="text-base font-semibold text-gray-900">1. Identification</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={label}>
                  N° bobine OA <span className="text-red-500">*</span>
                </label>
                <input value={f.reference} onChange={(e) => set('reference', e.target.value)} required className={`${input} font-mono`} />
              </div>
              <div>
                <label className={label}>N° de lot</label>
                <input value={f.lot_number} onChange={(e) => set('lot_number', e.target.value)} placeholder="Ex : LOT-261013-0001" className={`${input} font-mono`} />
              </div>
              <div>
                <label className={label}>N° coil fournisseur</label>
                <input value={f.supplier_coil_no} onChange={(e) => set('supplier_coil_no', e.target.value)} placeholder="Ex : 1-1" className={input} />
              </div>
              <div>
                <label className={label}>Date de réception</label>
                <input type="date" value={f.received_at} onChange={(e) => set('received_at', e.target.value)} className={input} />
              </div>
              <div className="sm:col-span-2">
                <label className={label}>
                  Article <span className="text-red-500">*</span>
                </label>
                <select value={f.product_id} onChange={(e) => pickArticle(e.target.value)} required className={input}>
                  <option value="">— Choisir l'article —</option>
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>Dépôt</label>
                <select value={f.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)} className={input}>
                  {depots.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({typeInfo(d.type).label})
                    </option>
                  ))}
                </select>
                {editing && <p className="text-[11px] text-gray-400 mt-1">Changer de dépôt enregistre un transfert de stock.</p>}
              </div>
              <div>
                <label className={label}>Épaisseur (mm)</label>
                <input inputMode="decimal" value={f.thickness_mm} onChange={(e) => set('thickness_mm', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Largeur (mm)</label>
                <input inputMode="decimal" value={f.width_mm} onChange={(e) => set('width_mm', e.target.value)} className={input} />
              </div>
            </div>
          </div>

          <div className={`${card} p-5 space-y-3`}>
            <h2 className="text-base font-semibold text-gray-900">2. Poids et métrage</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className={label}>
                  Poids net (kg) <span className="text-red-500">*</span>
                </label>
                <input inputMode="decimal" value={f.initial_weight_kg} onChange={(e) => set('initial_weight_kg', e.target.value)} required className={input} />
              </div>
              <div>
                <label className={label}>Poids brut (kg)</label>
                <input inputMode="decimal" value={f.gross_weight_kg} onChange={(e) => set('gross_weight_kg', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Métrage bobine (m)</label>
                <input inputMode="decimal" value={f.length_m} onChange={(e) => set('length_m', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Masse (kg/m)</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-[4px] text-sm text-gray-700 tabular-nums">{mass ? fmt(mass, 3) : '—'}</div>
                <p className="text-[11px] text-gray-400 mt-1">Calculée : poids net ÷ métrage.</p>
              </div>
              {editing && (
                <div>
                  <label className={label}>Poids restant (kg)</label>
                  <input inputMode="decimal" value={f.remaining_weight_kg} onChange={(e) => set('remaining_weight_kg', e.target.value)} className={input} />
                  <p className="text-[11px] text-gray-400 mt-1">Toute correction crée un ajustement de stock.</p>
                </div>
              )}
              <div>
                <label className={label}>Prix d'achat (F / kg)</label>
                <input inputMode="decimal" value={f.cost_per_kg} onChange={(e) => set('cost_per_kg', e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Statut</label>
                <select value={f.status} onChange={(e) => set('status', e.target.value as CoilStatus)} className={input}>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={label}>Remarques</label>
              <textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={input} />
            </div>
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 mt-4">
          <Link to="/stocks/bobines" className={btnSecondary}>
            {readOnly ? 'Retour' : 'Annuler'}
          </Link>
          {!readOnly && (
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
