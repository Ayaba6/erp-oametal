import { supabase } from '../../lib/supabase'

// ---------- Clients ----------
export type ClientContact = { last_name: string; first_name: string; job_title: string; phone: string; email: string; is_primary: boolean }
export type Client = {
  id: string
  code: string | null
  name: string
  trade_name: string | null
  type: 'particulier' | 'entreprise' | 'distributeur' | 'minier'
  category: string | null
  ifu: string | null
  rccm: string | null
  phone: string | null
  phone2: string | null
  email: string | null
  address: string | null
  city: string | null
  quartier: string | null
  country: string
  payment_mode: 'comptant' | 'acompte' | 'credit'
  payment_days: number
  credit_limit: number
  default_discount: number
  soumis_tva: boolean
  is_blocked: boolean
  blocked_reason: string | null
  is_active: boolean
  sales_rep_id: string | null
  contacts: ClientContact[]
  notes: string | null
  created_at: string
}

export const CLIENT_TYPES: [Client['type'], string][] = [
  ['particulier', 'Particulier'],
  ['entreprise', 'Entreprise'],
  ['distributeur', 'Distributeur / revendeur'],
  ['minier', 'Société minière'],
]
export const CLIENT_PAYMENT: [Client['payment_mode'], string][] = [
  ['comptant', 'Comptant'],
  ['acompte', 'Acompte à la commande'],
  ['credit', 'Crédit (à terme)'],
]

export async function loadClients(): Promise<Client[]> {
  const { data } = await supabase.from('clients').select('*').eq('is_test', false).order('name')
  return (data as Client[]) ?? []
}
export async function loadClient(id: string): Promise<Client | null> {
  const { data } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()
  return (data as Client | null) ?? null
}
export async function loadBalances(): Promise<Map<string, number>> {
  const { data } = await supabase.from('client_balances').select('client_id, balance_due')
  return new Map(((data as { client_id: string; balance_due: number }[]) ?? []).map((r) => [r.client_id, Number(r.balance_due)]))
}

// ---------- Lignes de documents ----------
export type DocLine = {
  id: string
  position: number
  product_id: string | null
  description: string
  sheets_count: number | null
  length_m: number | null
  quantity: number
  unit_price: number
  discount_pct: number
  vat_rate: number
  total_ht: number
  delivered_qty: number
  source_line_id: string | null
  products: { code: string; name: string; kind: string | null; thickness_mm?: number | null } | null
}
const LINES = 'document_lines(id, position, product_id, description, sheets_count, length_m, quantity, unit_price, discount_pct, vat_rate, total_ht, delivered_qty, source_line_id, products(code, name, kind, thickness_mm))'
const sortLines = <T extends { document_lines: DocLine[] }>(d: T): T => ({ ...d, document_lines: [...d.document_lines].sort((a, b) => a.position - b.position) })

export const lineTva = (l: { total_ht: number; vat_rate: number }) => Math.round((Number(l.total_ht) * Number(l.vat_rate)) / 100)

type ClientRef = { id: string; code: string | null; name: string; phone: string | null; address: string | null; city: string | null; ifu: string | null }
const CLIENT = 'clients(id, code, name, phone, address, city, ifu)'

// ---------- Devis ----------
export type QuoteStatus = 'brouillon' | 'valide' | 'converti' | 'refuse' | 'expire' | 'annule'
export type Quote = {
  id: string
  number: string
  client_id: string
  warehouse_id: string | null
  sales_rep_id: string | null
  issued_at: string
  valid_until: string | null
  status: QuoteStatus
  notes: string | null
  delivery_address: string | null
  payment_terms: string | null
  total_ht: number
  total_tva: number
  total_ttc: number
  created_by: string | null
  created_at: string
  clients: ClientRef | null
  document_lines: DocLine[]
}
export const QUOTE_STATUSES: { value: QuoteStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'Brouillon', badge: 'bg-gray-100 text-gray-700' },
  { value: 'valide', label: 'Validé', badge: 'bg-blue-100 text-blue-700' },
  { value: 'converti', label: 'Converti', badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'refuse', label: 'Refusé', badge: 'bg-red-100 text-red-700' },
  { value: 'expire', label: 'Expiré', badge: 'bg-amber-100 text-amber-800' },
  { value: 'annule', label: 'Annulé', badge: 'bg-gray-100 text-gray-500' },
]
export const quoteStatus = (s: QuoteStatus) => QUOTE_STATUSES.find((x) => x.value === s) ?? QUOTE_STATUSES[0]
const QUOTE_COLS = `*, ${CLIENT}, ${LINES}`
export async function loadQuotes(): Promise<Quote[]> {
  const { data } = await supabase.from('quotes').select(QUOTE_COLS).eq('is_test', false).order('created_at', { ascending: false })
  return ((data as unknown as Quote[]) ?? []).map(sortLines)
}
export async function loadQuote(id: string): Promise<Quote | null> {
  const { data } = await supabase.from('quotes').select(QUOTE_COLS).eq('id', id).maybeSingle()
  const q = data as unknown as Quote | null
  return q ? sortLines(q) : null
}

// ---------- Commandes ----------
export type OrderStatus = 'brouillon' | 'confirmee' | 'en_production' | 'partiellement_livree' | 'livree' | 'facturee' | 'annulee'
export type SalesOrder = {
  id: string
  number: string
  quote_id: string | null
  client_id: string
  warehouse_id: string
  sales_rep_id: string | null
  issued_at: string
  delivery_date: string | null
  delivery_address: string | null
  status: OrderStatus
  notes: string | null
  total_ht: number
  total_tva: number
  total_ttc: number
  amount_paid: number
  created_by: string | null
  created_at: string
  clients: ClientRef | null
  quotes: { number: string } | null
  warehouses: { code: string; name: string } | null
  document_lines: DocLine[]
}
export const ORDER_STATUSES: { value: OrderStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'Brouillon', badge: 'bg-gray-100 text-gray-700' },
  { value: 'confirmee', label: 'Confirmée', badge: 'bg-blue-100 text-blue-700' },
  { value: 'en_production', label: 'En production', badge: 'bg-violet-100 text-violet-700' },
  { value: 'partiellement_livree', label: 'Part. livrée', badge: 'bg-amber-100 text-amber-800' },
  { value: 'livree', label: 'Livrée', badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'facturee', label: 'Facturée', badge: 'bg-purple-100 text-purple-700' },
  { value: 'annulee', label: 'Annulée', badge: 'bg-red-100 text-red-700' },
]
export const orderStatus = (s: OrderStatus) => ORDER_STATUSES.find((x) => x.value === s) ?? ORDER_STATUSES[0]
const ORDER_COLS = `*, ${CLIENT}, quotes(number), warehouses(code, name), ${LINES}`
export async function loadSalesOrders(): Promise<SalesOrder[]> {
  const { data } = await supabase.from('sales_orders').select(ORDER_COLS).eq('is_test', false).order('created_at', { ascending: false })
  return ((data as unknown as SalesOrder[]) ?? []).map(sortLines)
}
export async function loadSalesOrder(id: string): Promise<SalesOrder | null> {
  const { data } = await supabase.from('sales_orders').select(ORDER_COLS).eq('id', id).maybeSingle()
  const o = data as unknown as SalesOrder | null
  return o ? sortLines(o) : null
}

// ---------- Bons de livraison ----------
export type DeliveryStatus = 'brouillon' | 'validee' | 'annulee'
export type Delivery = {
  id: string
  number: string
  order_id: string
  client_id: string
  warehouse_id: string
  delivered_at: string
  status: DeliveryStatus
  carrier: string | null
  vehicle: string | null
  notes: string | null
  validated_by: string | null
  validated_at: string | null
  created_by: string | null
  created_at: string
  clients: ClientRef | null
  sales_orders: { number: string; delivery_address: string | null } | null
  warehouses: { code: string; name: string } | null
  document_lines: DocLine[]
}
export const DELIVERY_STATUSES: { value: DeliveryStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'Brouillon', badge: 'bg-gray-100 text-gray-700' },
  { value: 'validee', label: 'Validé — livré', badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'annulee', label: 'Annulé', badge: 'bg-red-100 text-red-700' },
]
export const deliveryStatus = (s: DeliveryStatus) => DELIVERY_STATUSES.find((x) => x.value === s) ?? DELIVERY_STATUSES[0]
const DELIVERY_COLS = `*, ${CLIENT}, sales_orders(number, delivery_address), warehouses(code, name), ${LINES}`
export async function loadDeliveries(orderId?: string): Promise<Delivery[]> {
  let q = supabase.from('deliveries').select(DELIVERY_COLS).eq('is_test', false).order('created_at', { ascending: false })
  if (orderId) q = q.eq('order_id', orderId)
  const { data } = await q
  return ((data as unknown as Delivery[]) ?? []).map(sortLines)
}
export async function loadDelivery(id: string): Promise<Delivery | null> {
  const { data } = await supabase.from('deliveries').select(DELIVERY_COLS).eq('id', id).maybeSingle()
  const d = data as unknown as Delivery | null
  return d ? sortLines(d) : null
}

// ---------- Factures ----------
export type InvoiceStatus = 'brouillon' | 'emise' | 'partiellement_payee' | 'payee' | 'annulee'
export type Invoice = {
  id: string
  number: string
  order_id: string | null
  client_id: string
  issued_at: string
  due_at: string | null
  status: InvoiceStatus
  total_ht: number
  total_tva: number
  total_ttc: number
  amount_paid: number
  cancel_reason: string | null
  created_by: string | null
  created_at: string
  clients: ClientRef | null
  sales_orders: { number: string } | null
  document_lines: DocLine[]
}
export const INVOICE_STATUSES: { value: InvoiceStatus; label: string; badge: string }[] = [
  { value: 'brouillon', label: 'Brouillon', badge: 'bg-gray-100 text-gray-700' },
  { value: 'emise', label: 'Émise', badge: 'bg-blue-100 text-blue-700' },
  { value: 'partiellement_payee', label: 'Part. payée', badge: 'bg-amber-100 text-amber-800' },
  { value: 'payee', label: 'Payée', badge: 'bg-emerald-100 text-emerald-700' },
  { value: 'annulee', label: 'Annulée', badge: 'bg-red-100 text-red-700' },
]
export const invoiceStatus = (s: InvoiceStatus) => INVOICE_STATUSES.find((x) => x.value === s) ?? INVOICE_STATUSES[0]
const INVOICE_COLS = `*, ${CLIENT}, sales_orders(number), ${LINES}`
export async function loadInvoices(orderId?: string): Promise<Invoice[]> {
  let q = supabase.from('invoices').select(INVOICE_COLS).eq('is_test', false).order('created_at', { ascending: false })
  if (orderId) q = q.eq('order_id', orderId)
  const { data } = await q
  return ((data as unknown as Invoice[]) ?? []).map(sortLines)
}
export async function loadInvoice(id: string): Promise<Invoice | null> {
  const { data } = await supabase.from('invoices').select(INVOICE_COLS).eq('id', id).maybeSingle()
  const i = data as unknown as Invoice | null
  return i ? sortLines(i) : null
}

// ---------- Encaissements ----------
export type Payment = {
  id: string
  number: string
  client_id: string
  order_id: string | null
  invoice_id: string | null
  cash_account_id: string
  cash_session_id: string | null
  payment_method_id: string
  paid_at: string
  amount: number
  reference: string | null
  phone_number: string | null
  notes: string | null
  status: 'confirme' | 'annule'
  cancel_reason: string | null
  created_by: string | null
  clients: { code: string | null; name: string; phone: string | null } | null
  sales_orders: { number: string; total_ttc: number; amount_paid: number } | null
  invoices: { number: string } | null
  cash_accounts: { code: string; name: string } | null
  payment_methods: { code: string; name: string; type: string } | null
  payment_allocations: { amount: number; invoices: { number: string } | null }[]
}
const PAYMENT_COLS =
  '*, clients(code, name, phone), sales_orders(number, total_ttc, amount_paid), invoices!payments_invoice_id_fkey(number), cash_accounts(code, name), payment_methods(code, name, type), payment_allocations(amount, invoices(number))'
export async function loadPayments(filter?: { orderId?: string; sessionId?: string; clientId?: string }): Promise<Payment[]> {
  let q = supabase.from('payments').select(PAYMENT_COLS).eq('is_test', false).order('paid_at', { ascending: false }).limit(1000)
  if (filter?.orderId) q = q.eq('order_id', filter.orderId)
  if (filter?.sessionId) q = q.eq('cash_session_id', filter.sessionId)
  if (filter?.clientId) q = q.eq('client_id', filter.clientId)
  const { data } = await q
  return (data as unknown as Payment[]) ?? []
}

export type CashAccount = { id: string; code: string; name: string; type: 'caisse' | 'banque' | 'mobile_money'; opening_balance: number; is_active: boolean }
export type PaymentMethod = { id: string; code: string; name: string; type: string }
export type CashSession = {
  id: string
  number: string
  cash_account_id: string
  cashier_id: string
  opened_at: string
  opening_balance: number
  closed_at: string | null
  expected_balance: number | null
  counted_balance: number | null
  difference_reason: string | null
  status: 'ouverte' | 'cloturee'
  cash_accounts: { code: string; name: string } | null
}
export async function loadCashSetup() {
  const [a, m] = await Promise.all([
    supabase.from('cash_accounts').select('id, code, name, type, opening_balance, is_active').eq('is_active', true).order('code'),
    supabase.from('payment_methods').select('id, code, name, type').order('code'),
  ])
  return { accounts: (a.data as CashAccount[]) ?? [], methods: (m.data as PaymentMethod[]) ?? [] }
}
export async function loadSessions(): Promise<CashSession[]> {
  const { data } = await supabase.from('cash_sessions').select('*, cash_accounts(code, name)').order('opened_at', { ascending: false }).limit(200)
  return (data as unknown as CashSession[]) ?? []
}

// ---------- Utilitaires ----------
export const fcfa = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n)).replace(/[  ]/g, ' ')
export const qty = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).format(Number(n)).replace(/[  ]/g, ' ')
export const dFr = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('fr-FR') : '—')
export const dtFr = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
export const today = () => new Date().toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T00:00:00')
  x.setDate(x.getDate() + n)
  return x.toISOString().slice(0, 10)
}
export const unitOf = (kind: string | null | undefined) => (kind === 'tole' ? 'm' : kind === 'faitiere' ? 'pce' : '')

export async function profileNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = [...new Set(ids.filter(Boolean) as string[])]
  if (!list.length) return {}
  const { data } = await supabase.from('profiles').select('id, full_name').in('id', list)
  const m: Record<string, string> = {}
  ;((data as { id: string; full_name: string }[]) ?? []).forEach((p) => (m[p.id] = p.full_name))
  return m
}
