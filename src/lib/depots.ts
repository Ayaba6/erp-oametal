import { supabase } from './supabase'

export type WarehouseType = 'matiere_premiere' | 'production' | 'magasin'

export type Warehouse = {
  id: string
  code: string
  name: string
  type: WarehouseType
  can_purchase: boolean
  can_production: boolean
  can_sale: boolean
  is_default: boolean
  is_active: boolean
  notes: string | null
}

export const WAREHOUSE_TYPES: { value: WarehouseType; label: string; short: string; hint: string; badge: string }[] = [
  {
    value: 'matiere_premiere',
    label: 'Matières premières',
    short: 'MP',
    hint: 'Bobines commandées au fournisseur, à la réception',
    badge: 'bg-amber-100 text-amber-800',
  },
  {
    value: 'production',
    label: 'Production',
    short: 'Prod.',
    hint: 'Bobines en transformation et tôles produites',
    badge: 'bg-blue-100 text-blue-700',
  },
  {
    value: 'magasin',
    label: 'Magasin',
    short: 'Mag.',
    hint: 'Produits avariés et surproductions mis de côté',
    badge: 'bg-violet-100 text-violet-700',
  },
]
export const typeInfo = (t: WarehouseType) => WAREHOUSE_TYPES.find((x) => x.value === t) ?? WAREHOUSE_TYPES[0]

export async function loadWarehouses(): Promise<Warehouse[]> {
  const { data } = await supabase
    .from('warehouses')
    .select('id, code, name, type, can_purchase, can_production, can_sale, is_default, is_active, notes')
    .order('type')
    .order('code')
  return (data as Warehouse[]) ?? []
}

// Dépôt par défaut d'un type : réception -> matières premières
export async function defaultWarehouse(type: WarehouseType): Promise<string | null> {
  const { data } = await supabase.rpc('default_warehouse', { p_type: type })
  return (data as string | null) ?? null
}
