import { supabase } from '../../lib/supabase'
import { WarehouseType } from '../../lib/depots'

export type TrfStatus = 'brouillon' | 'soumise' | 'validee' | 'refusee' | 'annule' | 'en_transit' | 'recu'

export type TrfLine = {
  id: string
  coil_id: string
  product_id: string
  quantity_kg: number
  position: number
  coils: {
    reference: string
    lot_number: string | null
    supplier_coil_no: string | null
    remaining_weight_kg: number
    length_m: number | null
    thickness_mm: number | null
    width_mm: number | null
    status: string
    warehouse_id: string
  } | null
  products: { code: string; name: string } | null
}

export type Transfer = {
  id: string
  number: string
  transfer_date: string
  source_warehouse_id: string
  dest_warehouse_id: string
  type: string
  priority: string
  reason: string
  reference: string | null
  manager_id: string | null
  comment: string | null
  transport_mode: string
  vehicle: string | null
  driver: string | null
  status: TrfStatus
  shipped_by: string | null
  shipped_at: string | null
  received_by: string | null
  received_at: string | null
  receive_note: string | null
  submitted_by: string | null
  submitted_at: string | null
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_by: string | null
  created_at: string
  source: { code: string; name: string; type: WarehouseType } | null
  dest: { code: string; name: string; type: WarehouseType } | null
  stock_transfer_lines: TrfLine[]
}

export const TRF_STATUSES: { value: TrfStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'Brouillon', badge: 'bg-gray-100 text-gray-700' },
  { value: 'soumise', label: 'À valider (direction)', badge: 'bg-blue-100 text-blue-700' },
  { value: 'validee', label: 'Validée — transférée', badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'refusee', label: 'Refusée', badge: 'bg-red-100 text-red-700' },
  { value: 'annule', label: 'Annulée', badge: 'bg-gray-100 text-gray-500' },
]
export const trfStatus = (s: TrfStatus) =>
  TRF_STATUSES.find((x) => x.value === s) ?? { value: s, label: s === 'recu' ? 'Reçu' : s === 'en_transit' ? 'En transit' : s, badge: 'bg-gray-100 text-gray-600' }

export const TRF_TYPES: [string, string][] = [
  ['standard', 'Standard'],
  ['urgent', 'Urgent'],
  ['retour', 'Retour'],
  ['regularisation', 'Régularisation'],
]
export const TRF_PRIORITIES: [string, string][] = [
  ['basse', 'Basse'],
  ['normale', 'Normale'],
  ['haute', 'Haute'],
  ['urgente', 'Urgente'],
]
export const REASONS = ['Alimentation de la production', 'Retour de bobine non utilisée', 'Mise de côté au magasin', 'Régularisation']

const COLUMNS =
  '*, source:warehouses!stock_transfers_source_warehouse_id_fkey(code, name, type), dest:warehouses!stock_transfers_dest_warehouse_id_fkey(code, name, type), stock_transfer_lines(id, coil_id, product_id, quantity_kg, position, coils(reference, lot_number, supplier_coil_no, remaining_weight_kg, length_m, thickness_mm, width_mm, status, warehouse_id), products(code, name))'

const sortLines = (t: Transfer) => ({ ...t, stock_transfer_lines: [...t.stock_transfer_lines].sort((a, b) => a.position - b.position) })

export async function loadTransfers(): Promise<Transfer[]> {
  const { data } = await supabase.from('stock_transfers').select(COLUMNS).order('created_at', { ascending: false })
  return ((data as unknown as Transfer[]) ?? []).map(sortLines)
}

export async function loadTransfer(id: string): Promise<Transfer | null> {
  const { data } = await supabase.from('stock_transfers').select(COLUMNS).eq('id', id).maybeSingle()
  const t = data as unknown as Transfer | null
  return t ? sortLines(t) : null
}

// Poids d'une ligne : figé à l'expédition, sinon poids restant actuel de la bobine
export const lineKg = (l: TrfLine) => (Number(l.quantity_kg) > 0 ? Number(l.quantity_kg) : Number(l.coils?.remaining_weight_kg ?? 0))

export const kg = (n: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n).replace(/[  ]/g, ' ')
export const labelOf = (list: [string, string][], v: string | null | undefined) => list.find(([k]) => k === v)?.[1] ?? v ?? '—'

export async function profileNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(ids.filter(Boolean) as string[])]
  if (!list.length) return {}
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', list)
  const m: Record<string, string> = {}
  ;((data as { id: string; full_name: string }[]) ?? []).forEach((p) => (m[p.id] = p.full_name))
  return m
}
