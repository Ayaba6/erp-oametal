import { supabase } from '../../lib/supabase'

export type Contact = { last_name: string; first_name: string; job_title: string; phone: string; email: string; is_primary: boolean }
export type Address = { label: string; address: string; city: string; country: string; is_default: boolean }

export type Supplier = {
  id: string
  code: string | null
  name: string
  type: 'entreprise' | 'particulier'
  category: string | null
  trade_name: string | null
  is_active: boolean
  ifu: string | null
  rccm: string | null
  numero_contribuable: string | null
  groupe_fournisseur: string | null
  secteur_activite: string | null
  currency: string
  language: string
  country: string | null
  soumis_tva: boolean
  blocage_achat: boolean
  phone: string | null
  phone2: string | null
  mobile: string | null
  email: string | null
  website: string | null
  address: string | null
  address_line2: string | null
  boite_postale: string | null
  postal_code: string | null
  city: string | null
  quartier: string | null
  region: string | null
  gps_lat: number | null
  gps_lng: number | null
  addresses: Address[]
  contacts: Contact[]
  canal: string | null
  famille_tarifaire: string | null
  default_discount: number
  payment_mode: string
  payment_days: number
  tax_rate: number
  rating: number | null
  avg_delivery_days: number | null
  credit_limit: number | null
  banque: string | null
  swift: string | null
  rib_iban: string | null
  numero_compte: string | null
  depot_reception_id: string | null
  mode_livraison: string | null
  transporteur: string | null
  delai_livraison: number | null
  compte_tiers: string | null
  compte_collectif: string | null
  condition_paiement: string | null
  echeance: string | null
  notes: string | null
  created_at: string
}

export async function loadSuppliers(): Promise<Supplier[]> {
  const { data } = await supabase.from('suppliers').select('*').order('code')
  return (data as Supplier[]) ?? []
}

export async function loadSupplier(id: string): Promise<Supplier | null> {
  const { data } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle()
  return (data as Supplier | null) ?? null
}

export type PoStatus = 'brouillon' | 'envoyee' | 'confirmee' | 'partiellement_recue' | 'recue' | 'cloturee' | 'annulee'

export type PoLine = {
  id: string
  product_id: string
  description: string | null
  quantity: number
  unit_price: number
  discount_percent: number
  tax_rate: number
  received_qty: number
  coils_count: number | null
  position: number
  products: { code: string; name: string; thickness_mm: number | null; width_mm: number | null } | null
}

export type PurchaseOrder = {
  id: string
  number: string
  supplier_id: string
  warehouse_id: string
  supplier_contact: string | null
  delivery_address: string | null
  currency: string
  exchange_rate: number
  buyer_id: string | null
  issued_at: string
  expected_at: string | null
  reference: string | null
  project_reference: string | null
  price_list: string | null
  payment_terms: string | null
  payment_method: string
  priority: string
  notes: string | null
  terms: string | null
  carrier: string | null
  vehicle_number: string | null
  delivery_location: string | null
  incoterm: string
  total_weight_kg: number | null
  footer_note: string | null
  status: PoStatus
  total_ht: number
  total_tax: number
  total_ttc: number
  sent_at: string | null
  confirmed_at: string | null
  closed_at: string | null
  created_at: string
  created_by: string | null
  suppliers: { name: string; code: string | null; address: string | null; city: string | null; country: string | null; phone: string | null; email: string | null } | null
  warehouses: { code: string; name: string } | null
  purchase_order_lines: PoLine[]
}

// Statuts et couleurs de l'A3 ERP
export const PO_STATUSES: { value: PoStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'Brouillon', badge: 'bg-gray-100 text-gray-700' },
  { value: 'envoyee', label: 'Envoyé', badge: 'bg-blue-100 text-blue-700' },
  { value: 'confirmee', label: 'Confirmé', badge: 'bg-emerald-100 text-emerald-800' },
  { value: 'partiellement_recue', label: 'Partiellement reçu', badge: 'bg-amber-100 text-amber-800' },
  { value: 'recue', label: 'Reçu', badge: 'bg-green-100 text-green-700' },
  { value: 'cloturee', label: 'Clôturé', badge: 'bg-slate-200 text-slate-700' },
  { value: 'annulee', label: 'Annulé', badge: 'bg-red-100 text-red-700' },
]
export const poStatus = (s: PoStatus) => PO_STATUSES.find((x) => x.value === s) ?? PO_STATUSES[0]

const PO_COLUMNS =
  '*, suppliers(name, code, address, city, country, phone, email), warehouses(code, name), purchase_order_lines(id, product_id, description, quantity, unit_price, discount_percent, tax_rate, received_qty, coils_count, position, products(code, name, thickness_mm, width_mm))'

const sortLines = (o: PurchaseOrder) => ({ ...o, purchase_order_lines: [...o.purchase_order_lines].sort((a, b) => a.position - b.position) })

export async function loadOrders(): Promise<PurchaseOrder[]> {
  const { data } = await supabase.from('purchase_orders').select(PO_COLUMNS).order('created_at', { ascending: false })
  return ((data as unknown as PurchaseOrder[]) ?? []).map(sortLines)
}

export async function loadOrder(id: string): Promise<PurchaseOrder | null> {
  const { data } = await supabase.from('purchase_orders').select(PO_COLUMNS).eq('id', id).maybeSingle()
  const o = data as unknown as PurchaseOrder | null
  return o ? sortLines(o) : null
}

// Calculs d'une ligne (identiques au formulaire A3)
export const lineHt = (q: number, pu: number, remise: number) => Math.round(q * pu * (1 - remise / 100))
export const lineTax = (ht: number, tva: number) => Math.round((ht * tva) / 100)

export const PAYMENT_METHODS: [string, string][] = [
  ['virement', 'Virement bancaire'],
  ['cheque', 'Chèque'],
  ['especes', 'Espèces'],
]
export const PAYMENT_TERMS: [string, string][] = [
  ['immediate', 'Paiement immédiat'],
  ['30j', '30 jours'],
  ['60j', '60 jours'],
  ['90j', '90 jours'],
  ['end_of_month', 'Fin de mois'],
]
export const PRIORITIES: [string, string][] = [
  ['normale', 'Normale'],
  ['haute', 'Haute'],
  ['basse', 'Basse'],
]
export const labelOf = (list: [string, string][], v: string | null | undefined) => list.find(([k]) => k === v)?.[1] ?? v ?? '—'
export const INCOTERMS: [string, string][] = [
  ['EXW', 'EXW – Ex Works'],
  ['FCA', 'FCA – Free Carrier'],
  ['CIF', 'CIF – Cost Insurance Freight'],
  ['DAP', 'DAP – Delivered At Place'],
]
export const CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD']
export const num = (n: number | null | undefined, d = 0) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n).replace(/[\u202f\u00a0]/g, ' ')

// Réceptions
export type Quality = 'en_attente' | 'quarantaine' | 'libere' | 'refuse'
export const QUALITY: { value: Quality; label: string; badge: string }[] = [
  { value: 'en_attente', label: 'À vérifier', badge: 'bg-amber-100 text-amber-800' },
  { value: 'libere', label: 'Conforme', badge: 'bg-green-100 text-green-700' },
  { value: 'refuse', label: 'Refusée', badge: 'bg-red-100 text-red-700' },
]
export const qualityInfo = (q: Quality) => QUALITY.find((x) => x.value === q) ?? QUALITY[0]

export type RecStatus = 'brouillon' | 'soumise' | 'validee' | 'refusee' | 'annulee'
export const REC_STATUSES: { value: RecStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'En vérification', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'soumise', label: 'À valider (direction)', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'validee', label: 'Validé — en stock', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { value: 'refusee', label: 'Refusé', badge: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'annulee', label: 'Annulé', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
]
export const recStatus = (s: RecStatus) => REC_STATUSES.find((x) => x.value === s) ?? REC_STATUSES[0]

export type RecLine = {
  id: string
  po_line_id: string | null
  product_id: string
  quantity: number
  unit_cost: number
  lot_number: string | null
  quality_status: Quality
  coil_reference: string | null
  supplier_coil_no: string | null
  thickness_mm: number | null
  width_mm: number | null
  gross_weight_kg: number | null
  length_m: number | null
  quality_note: string | null
}

export type Reception = {
  id: string
  number: string
  purchase_order_id: string | null
  supplier_id: string
  warehouse_id: string
  received_at: string
  status: RecStatus
  notes: string | null
  validated_at: string | null
  submitted_by: string | null
  submitted_at: string | null
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  suppliers: { name: string } | null
  purchase_orders: { number: string; status: PoStatus } | null
  reception_lines: RecLine[]
}

const REC_COLUMNS =
  'id, number, purchase_order_id, supplier_id, warehouse_id, received_at, status, notes, validated_at, submitted_by, submitted_at, decided_by, decided_at, decision_note, created_at, suppliers(name), purchase_orders(number, status), reception_lines(id, po_line_id, product_id, quantity, unit_cost, lot_number, quality_status, coil_reference, supplier_coil_no, thickness_mm, width_mm, gross_weight_kg, length_m, quality_note)'

export async function loadReceptions(poId?: string): Promise<Reception[]> {
  let q = supabase.from('receptions').select(REC_COLUMNS).order('created_at', { ascending: false })
  if (poId) q = q.eq('purchase_order_id', poId)
  const { data } = await q
  return (data as unknown as Reception[]) ?? []
}

export async function loadReception(id: string): Promise<Reception | null> {
  const { data } = await supabase.from('receptions').select(REC_COLUMNS).eq('id', id).maybeSingle()
  return (data as unknown as Reception | null) ?? null
}

export const money = (n: number | null | undefined) => (n == null ? '—' : num(n) + ' FCFA')
export const dateFr = (d: string | null) => (d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('fr-FR') : '—')
export const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(/[\s  ]/g, '').replace(',', '.')))
export const dateTimeFr = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
