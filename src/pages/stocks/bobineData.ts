import { supabase } from '../../lib/supabase'
import { WarehouseType, defaultWarehouse } from '../../lib/depots'

export type CoilStatus = 'disponible' | 'en_production' | 'epuisee' | 'bloquee'

export type Coil = {
  id: string
  reference: string
  lot_number: string | null
  product_id: string
  supplier_id: string | null
  warehouse_id: string
  supplier_coil_no: string | null
  thickness_mm: number | null
  width_mm: number | null
  initial_weight_kg: number
  remaining_weight_kg: number
  gross_weight_kg: number | null
  length_m: number | null
  cost_per_kg: number
  status: CoilStatus
  received_at: string
  notes: string | null
  products: { code: string; name: string } | null
  warehouses: { code: string; name: string; type: WarehouseType } | null
}

export const STATUSES: { value: CoilStatus; label: string; badge: string }[] = [
  { value: 'disponible', label: 'En stock', badge: 'bg-green-100 text-green-700' },
  { value: 'en_production', label: 'En production', badge: 'bg-blue-100 text-blue-700' },
  { value: 'epuisee', label: 'Fin', badge: 'bg-gray-200 text-gray-600' },
  { value: 'bloquee', label: 'Bloquée', badge: 'bg-red-100 text-red-700' },
]
export const statusInfo = (s: CoilStatus) => STATUSES.find((x) => x.value === s) ?? STATUSES[0]

export const COIL_COLUMNS =
  'id, reference, lot_number, product_id, supplier_id, warehouse_id, supplier_coil_no, thickness_mm, width_mm, initial_weight_kg, remaining_weight_kg, gross_weight_kg, length_m, cost_per_kg, status, received_at, notes, products(code, name), warehouses(code, name, type)'

export async function loadCoils(): Promise<Coil[]> {
  const { data } = await supabase.from('coils').select(COIL_COLUMNS).order('reference')
  return (data as unknown as Coil[]) ?? []
}

// Masse linéaire réelle de la bobine : poids net ÷ métrage
export const massPerMeter = (c: { initial_weight_kg: number; length_m: number | null }) =>
  c.length_m ? Number(c.initial_weight_kg) / Number(c.length_m) : null

// Prochain numéro BO-OA-xxxx
export function nextReference(existing: string[]): string {
  const max = existing.reduce((m, r) => {
    const n = Number(/BO-OA-(\d+)/.exec(r)?.[1] ?? 0)
    return n > m ? n : m
  }, 0)
  return `BO-OA-${String(max + 1).padStart(4, '0')}`
}

// Les bobines reçues entrent au dépôt matières premières
export const defaultWarehouseId = () => defaultWarehouse('matiere_premiere')

export const fmt = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n).replace(/[  ]/g, ' ')
