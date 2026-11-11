import { supabase } from '../../lib/supabase'

// ---------- Ordres de fabrication ----------
export type OfStatus = 'cree' | 'en_production' | 'soumis' | 'confirme' | 'annule'

export type OfLine = {
  id: string
  production_order_id: string
  order_line_id: string | null
  position: number
  product_id: string
  description: string
  sheets_count: number | null
  length_m: number | null
  quantity: number
  produced_sheets: number | null
  produced_qty: number
  damaged_sheets: number | null
  damaged_qty: number
  is_checked: boolean
  notes: string | null
  products: { code: string; name: string; kind: string | null; color: string | null; thickness_mm: number | null; kg_per_meter: number | null; coil_product_id: string | null } | null
}

export type Allocation = { id: string; coil_id: string; weight_kg: number; coils: { reference: string; lot_number: string | null; remaining_weight_kg: number; products: { code: string; name: string } | null } | null }

export type ProductionOrder = {
  id: string
  number: string
  order_id: string | null
  client_id: string
  warehouse_id: string
  production_line_id: string | null
  parent_id: string | null
  status: OfStatus
  planned_date: string | null
  priority: string
  operator_name: string | null
  printed_at: string | null
  started_at: string | null
  finished_at: string | null
  submitted_by: string | null
  submitted_at: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  decision_note: string | null
  cancel_reason: string | null
  delivery_id: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  clients: { code: string | null; name: string; phone: string | null } | null
  sales_orders: { number: string; delivery_date: string | null; delivery_address: string | null } | null
  warehouses: { code: string; name: string } | null
  production_lines: { code: string; name: string } | null
  deliveries: { number: string; status: string } | null
  parent: { number: string } | null
  production_order_lines: OfLine[]
  coil_allocations: Allocation[]
}

export const OF_STATUSES: { value: OfStatus; label: string; badge: string }[] = [
  { value: 'cree', label: 'À lancer', badge: 'bg-gray-100 text-gray-700' },
  { value: 'en_production', label: 'En production', badge: 'bg-blue-100 text-blue-800' },
  { value: 'soumis', label: 'À confirmer (direction)', badge: 'bg-amber-100 text-amber-800' },
  { value: 'confirme', label: 'Confirmé', badge: 'bg-emerald-100 text-emerald-800' },
  { value: 'annule', label: 'Annulé', badge: 'bg-red-100 text-red-700' },
]
export const ofStatus = (s: OfStatus) => OF_STATUSES.find((x) => x.value === s) ?? OF_STATUSES[0]

const LINES =
  'production_order_lines(*, products(code, name, kind, color, thickness_mm, kg_per_meter, coil_product_id))'
const COLS = `*, clients(code, name, phone), sales_orders(number, delivery_date, delivery_address), warehouses(code, name),
  production_lines(code, name), deliveries!production_orders_delivery_id_fkey(number, status), parent:production_orders!parent_id(number),
  ${LINES}, coil_allocations(id, coil_id, weight_kg, coils(reference, lot_number, remaining_weight_kg, products(code, name)))`

export async function loadProductionOrders(orderId?: string): Promise<ProductionOrder[]> {
  let q = supabase.from('production_orders').select(COLS).eq('is_test', false).order('created_at', { ascending: false }).limit(500)
  if (orderId) q = q.eq('order_id', orderId)
  const { data } = await q
  return ((data as unknown as ProductionOrder[]) ?? []).map(sortLines)
}
export async function loadProductionOrder(id: string): Promise<ProductionOrder | null> {
  const { data } = await supabase.from('production_orders').select(COLS).eq('id', id).maybeSingle()
  return data ? sortLines(data as unknown as ProductionOrder) : null
}
function sortLines(o: ProductionOrder): ProductionOrder {
  o.production_order_lines = [...(o.production_order_lines ?? [])].sort((a, b) => a.position - b.position)
  return o
}

// ---------- Commandes prêtes pour la production ----------
export type Eligible = {
  id: string
  number: string
  client_id: string
  status: string
  issued_at: string
  delivery_date: string | null
  total_ttc: number
  amount_paid: number
  clients: { name: string; payment_mode: 'comptant' | 'acompte' | 'credit' } | null
  document_lines: { id: string; quantity: number; delivered_qty: number; products: { kind: string | null } | null }[]
  blocked: string | null
}

export const PAYMENT_RULE: Record<string, string> = {
  comptant: 'Paie avant production (100 %)',
  acompte: 'Paie un acompte avant production',
  credit: 'Paie après livraison',
}

// Même règle que la fonction SQL order_production_block (affichage seulement : le serveur revérifie)
export async function loadEligibleOrders(): Promise<Eligible[]> {
  const [o, c, active] = await Promise.all([
    supabase
      .from('sales_orders')
      .select('id, number, client_id, status, issued_at, delivery_date, total_ttc, amount_paid, clients(name, payment_mode), document_lines(id, quantity, delivered_qty, products(kind))')
      .in('status', ['confirmee', 'en_production', 'partiellement_livree', 'facturee'])
      .eq('is_test', false)
      .order('issued_at'),
    supabase.from('company').select('deposit_rate_before_production').eq('id', 1).maybeSingle(),
    supabase.from('production_orders').select('order_id').in('status', ['cree', 'en_production', 'soumis']),
  ])
  const rate = Number((c.data as { deposit_rate_before_production: number } | null)?.deposit_rate_before_production ?? 100)
  const busy = new Set(((active.data as { order_id: string }[]) ?? []).map((x) => x.order_id))
  return ((o.data as unknown as Eligible[]) ?? [])
    .filter((x) => !busy.has(x.id))
    .filter((x) => x.document_lines.some((l) => ['tole', 'faitiere'].includes(l.products?.kind ?? '') && Number(l.delivered_qty) < Number(l.quantity)))
    .map((x) => {
      const mode = x.clients?.payment_mode ?? 'comptant'
      const need = mode === 'credit' ? 0 : Math.round((Number(x.total_ttc) * (mode === 'acompte' ? rate : 100)) / 100)
      return { ...x, blocked: Number(x.amount_paid) + 0.5 < need ? `Encaissé ${fmt(x.amount_paid)} F sur ${fmt(need)} F requis` : null }
    })
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(Number(n))).replace(/ | /g, ' ')

// Bobines disponibles dans un dépôt (pour la consommation)
export type CoilOption = { id: string; reference: string; lot_number: string | null; remaining_weight_kg: number; product_id: string; products: { code: string; name: string } | null }
export async function loadCoilsIn(warehouseId: string): Promise<CoilOption[]> {
  const { data } = await supabase
    .from('coils')
    .select('id, reference, lot_number, remaining_weight_kg, product_id, products(code, name)')
    .eq('warehouse_id', warehouseId)
    .gt('remaining_weight_kg', 0)
    .order('reference')
  return (data as unknown as CoilOption[]) ?? []
}

export async function loadProductionLines(): Promise<{ id: string; code: string; name: string }[]> {
  const { data } = await supabase.from('production_lines').select('id, code, name').eq('is_active', true).order('code')
  return (data as { id: string; code: string; name: string }[]) ?? []
}
