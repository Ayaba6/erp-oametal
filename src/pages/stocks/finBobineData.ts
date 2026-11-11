import { supabase } from '../../lib/supabase'

// ---------- Fiche fin de bobine ----------
export type FdbStatus = 'brouillon' | 'soumise' | 'validee' | 'annulee'

export type FdbLine = {
  id?: string
  position: number
  used_on: string | null
  shift: string | null
  sheet_no: string | null
  ml_produced: number
  scrap_kg: number
  operator: string | null
  notes: string | null
  production_order_id: string | null
}

export type FdbCoil = {
  id: string
  reference: string
  lot_number: string | null
  thickness_mm: number | null
  width_mm: number | null
  color: string | null
  initial_weight_kg: number
  remaining_weight_kg: number
  received_at: string
  status: string
  warehouses: { code: string } | null
  suppliers: { name: string } | null
  products: { code: string; name: string; color: string | null; thickness_mm: number | null } | null
}

export type CoilEndReport = {
  id: string
  number: string
  coil_id: string
  machine: string | null
  supplier_name: string | null
  color: string | null
  thickness_mm: number | null
  width_mm: number | null
  label_weight_kg: number | null
  started_on: string | null
  ended_on: string
  defect_rust: boolean
  defect_paint: boolean
  defect_edges: boolean
  defect_deformed: boolean
  defect_other: boolean
  defect_other_text: string | null
  remaining_kg: number
  measured_thickness_mm: number | null
  total_ml: number
  total_scrap_kg: number
  to_report: boolean
  notes: string | null
  operator_names: string | null
  team_leader: string | null
  status: FdbStatus
  decision_note: string | null
  submitted_by: string | null
  submitted_at: string | null
  decided_by: string | null
  decided_at: string | null
  created_by: string | null
  created_at: string
  coils: FdbCoil | null
  coil_end_report_lines: FdbLine[]
}

export const FDB_STATUSES: { value: FdbStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'Brouillon', badge: 'bg-gray-100 text-gray-700' },
  { value: 'soumise', label: 'À valider (direction)', badge: 'bg-amber-100 text-amber-800' },
  { value: 'validee', label: 'Validée — bobine clôturée', badge: 'bg-emerald-100 text-emerald-800' },
  { value: 'annulee', label: 'Annulée', badge: 'bg-red-100 text-red-700' },
]
export const fdbStatus = (s: FdbStatus) => FDB_STATUSES.find((x) => x.value === s) ?? FDB_STATUSES[0]

export const DEFECTS: [keyof CoilEndReport, string][] = [
  ['defect_rust', 'Rouille / oxydation'],
  ['defect_paint', 'Défaut peinture / revêtement'],
  ['defect_edges', 'Bords (rives) abîmés'],
  ['defect_deformed', 'Bobine déformée / spires télescopées'],
  ['defect_other', 'Autre défaut'],
]

const COIL = 'coils(id, reference, lot_number, thickness_mm, width_mm, color, initial_weight_kg, remaining_weight_kg, received_at, status, warehouses(code), suppliers(name), products(code, name, color, thickness_mm))'
const COLS = `*, ${COIL}, coil_end_report_lines(*)`

export async function loadCoilEndReports(): Promise<CoilEndReport[]> {
  const { data } = await supabase.from('coil_end_reports').select(COLS).eq('is_test', false).order('created_at', { ascending: false }).limit(500)
  return (data as unknown as CoilEndReport[]) ?? []
}
export async function loadCoilEndReport(id: string): Promise<CoilEndReport | null> {
  const { data } = await supabase.from('coil_end_reports').select(COLS).eq('id', id).maybeSingle()
  if (!data) return null
  const r = data as unknown as CoilEndReport
  r.coil_end_report_lines = [...(r.coil_end_report_lines ?? [])].sort((a, b) => a.position - b.position)
  return r
}
export async function loadCoilForReport(id: string): Promise<FdbCoil | null> {
  const { data } = await supabase.from('coils').select(COIL.replace(/^coils\(|\)$/g, '')).eq('id', id).maybeSingle()
  return (data as unknown as FdbCoil | null) ?? null
}
// Bobines pour lesquelles on peut établir une fiche (pas déjà clôturées par une fiche)
export async function loadCoilsForReport(): Promise<FdbCoil[]> {
  const [c, r] = await Promise.all([
    supabase.from('coils').select(COIL.replace(/^coils\(|\)$/g, '')).order('reference'),
    supabase.from('coil_end_reports').select('coil_id').neq('status', 'annulee'),
  ])
  const done = new Set(((r.data as { coil_id: string }[]) ?? []).map((x) => x.coil_id))
  return ((c.data as unknown as FdbCoil[]) ?? []).filter((x) => !done.has(x.id))
}

export type Usage = { production_order_id: string; used_on: string; sheet_no: string; operator: string | null; line_code: string | null; ml: number; kg: number }
export async function loadUsage(coilId: string): Promise<Usage[]> {
  const { data } = await supabase.rpc('coil_usage_history', { p_coil: coilId })
  return (data as Usage[]) ?? []
}

export const nf = (v: number | null | undefined, d = 2) => (v == null ? '' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(Number(v)).replace(/ | /g, ' '))
export const dFr = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '')

export async function loadProductionLinesCodes(): Promise<string[]> {
  const { data } = await supabase.from('production_lines').select('code').eq('is_active', true).order('code')
  return ((data as { code: string }[]) ?? []).map((x) => x.code)
}
