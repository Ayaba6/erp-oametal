import { supabase } from './supabase'

// ---------------------------------------------------------------------
// Chargement des indicateurs du tableau de bord.
// Chaque requête est tolérante : en cas d'erreur, l'indicateur vaut 0.
// ---------------------------------------------------------------------

export type Activity = { at: string; type: string; description: string; reference: string; user: string }
export type Alert = { date: string; level: 'Critique' | 'Avertissement' | 'Information'; message: string; module: string; link: string }

export type DashboardData = {
  caMonth: number
  treasury: number
  cashInMonth: number
  cashOutMonth: number
  pendingOrders: { count: number; amount: number }
  ofInProgress: { count: number; late: number }
  criticalStock: number
  overdue: { count: number; amount: number }
  caByMonth: { previous: number[]; current: number[] }
  treasury30: { labels: string[]; values: number[] }
  caByFamily: { labels: string[]; values: number[] }
  activities: Activity[]
  alerts: Alert[]
}

type Invoice = { number: string; issued_at: string; due_at: string | null; status: string; total_ht: number; total_ttc: number; amount_paid: number; is_test: boolean; created_at: string; clients: { name: string } | null }
type Payment = { number: string; paid_at: string; amount: number; is_test: boolean; created_at: string; clients: { name: string } | null }
type CashOp = { occurred_at: string; direction: 'entree' | 'sortie'; amount: number }
type Order = { number: string; status: string; total_ttc: number; is_test: boolean; created_at: string; clients: { name: string } | null }
type OF = { number: string; status: string; planned_date: string | null; is_test: boolean }
type Line = { total_ht: number; invoices: { issued_at: string; status: string; is_test: boolean } | null; products: { categories: { name: string } | null } | null }

const VALID_INVOICE = ['emise', 'partiellement_payee', 'payee']
const OPEN_ORDER = ['confirmee', 'en_production', 'partiellement_livree']
const ACTIVE_OF = ['autorise', 'matiere_allouee', 'en_cours']

async function rows<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q
  if (error) {
    console.warn('Tableau de bord :', error)
    return []
  }
  return (data as T[]) ?? []
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

export async function loadDashboard(includeTest: boolean): Promise<DashboardData> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthStart = ymd(new Date(year, month, 1))
  const today = ymd(now)
  const keep = (r: { is_test?: boolean }) => includeTest || !r.is_test

  const [invoices, payments, cashOps, accounts, orders, ofs, products, stock, lines] = await Promise.all([
    rows<Invoice>(
      supabase
        .from('invoices')
        .select('number, issued_at, due_at, status, total_ht, total_ttc, amount_paid, is_test, created_at, clients(name)')
        .gte('issued_at', `${year - 1}-01-01`),
    ),
    rows<Payment>(supabase.from('payments').select('number, paid_at, amount, is_test, created_at, clients(name)').eq('status', 'confirme')),
    rows<CashOp>(supabase.from('cash_operations').select('occurred_at, direction, amount')),
    rows<{ opening_balance: number }>(supabase.from('cash_accounts').select('opening_balance').eq('is_active', true)),
    rows<Order>(supabase.from('sales_orders').select('number, status, total_ttc, is_test, created_at, clients(name)')),
    rows<OF>(supabase.from('production_orders').select('number, status, planned_date, is_test')),
    rows<{ id: string; stock_min: number }>(supabase.from('products').select('id, stock_min').eq('is_active', true)),
    rows<{ product_id: string; quantity: number }>(supabase.from('stock_levels').select('product_id, quantity')),
    rows<Line>(
      supabase
        .from('document_lines')
        .select('total_ht, invoices!inner(issued_at, status, is_test), products(categories(name))')
        .not('invoice_id', 'is', null),
    ),
  ])

  const inv = invoices.filter(keep).filter((i) => VALID_INVOICE.includes(i.status))
  const pay = payments.filter(keep)
  const ord = orders.filter(keep)
  const of = ofs.filter(keep)

  // Chiffre d'affaires
  const caMonth = inv.filter((i) => i.issued_at >= monthStart).reduce((s, i) => s + Number(i.total_ht), 0)
  const caByMonth = { previous: Array(12).fill(0) as number[], current: Array(12).fill(0) as number[] }
  for (const i of inv) {
    const d = new Date(i.issued_at)
    if (d.getFullYear() === year) caByMonth.current[d.getMonth()] += Number(i.total_ht)
    if (d.getFullYear() === year - 1) caByMonth.previous[d.getMonth()] += Number(i.total_ht)
  }

  // Trésorerie
  const opening = accounts.reduce((s, a) => s + Number(a.opening_balance), 0)
  const flows: { date: string; amount: number }[] = [
    ...pay.map((p) => ({ date: p.paid_at.slice(0, 10), amount: Number(p.amount) })),
    ...cashOps.map((o) => ({ date: o.occurred_at.slice(0, 10), amount: (o.direction === 'entree' ? 1 : -1) * Number(o.amount) })),
  ]
  const treasury = opening + flows.reduce((s, f) => s + f.amount, 0)
  const cashInMonth =
    pay.filter((p) => p.paid_at.slice(0, 10) >= monthStart).reduce((s, p) => s + Number(p.amount), 0) +
    cashOps.filter((o) => o.direction === 'entree' && o.occurred_at.slice(0, 10) >= monthStart).reduce((s, o) => s + Number(o.amount), 0)
  const cashOutMonth = cashOps
    .filter((o) => o.direction === 'sortie' && o.occurred_at.slice(0, 10) >= monthStart)
    .reduce((s, o) => s + Number(o.amount), 0)

  const labels: string[] = []
  const values: number[] = []
  const start = new Date(now)
  start.setDate(start.getDate() - 29)
  let running = opening + flows.filter((f) => f.date < ymd(start)).reduce((s, f) => s + f.amount, 0)
  for (let k = 0; k < 30; k++) {
    const d = new Date(start)
    d.setDate(start.getDate() + k)
    const key = ymd(d)
    running += flows.filter((f) => f.date === key).reduce((s, f) => s + f.amount, 0)
    labels.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`)
    values.push(running)
  }

  // Commandes, OF, stock
  const openOrders = ord.filter((o) => OPEN_ORDER.includes(o.status))
  const activeOf = of.filter((o) => ACTIVE_OF.includes(o.status))
  const lateOf = activeOf.filter((o) => o.planned_date && o.planned_date < today).length
  const stockBy = new Map<string, number>()
  for (const s of stock) stockBy.set(s.product_id, (stockBy.get(s.product_id) ?? 0) + Number(s.quantity))
  const criticalStock = products.filter((p) => Number(p.stock_min) > 0 && (stockBy.get(p.id) ?? 0) < Number(p.stock_min)).length
  const zeroStockLines = stock.filter((s) => Number(s.quantity) <= 0).length

  // Échéances dépassées
  const overdueInv = inv.filter((i) => i.status !== 'payee' && i.due_at && i.due_at < today)
  const overdue = {
    count: overdueInv.length,
    amount: overdueInv.reduce((s, i) => s + Number(i.total_ttc) - Number(i.amount_paid), 0),
  }

  // CA par famille (catégorie) sur l'année
  const fam = new Map<string, number>()
  for (const l of lines) {
    if (!l.invoices || !VALID_INVOICE.includes(l.invoices.status)) continue
    if (!includeTest && l.invoices.is_test) continue
    if (new Date(l.invoices.issued_at).getFullYear() !== year) continue
    const name = l.products?.categories?.name ?? 'Autres'
    fam.set(name, (fam.get(name) ?? 0) + Number(l.total_ht))
  }

  // Activités récentes (derniers documents créés)
  const activities: Activity[] = [
    ...inv.map((i) => ({ at: i.created_at, type: 'Facture ventes', description: `Facture ${statusLabel(i.status)}`, reference: i.number, user: i.clients?.name ?? '' })),
    ...pay.map((p) => ({ at: p.created_at, type: 'Encaissement', description: 'Encaissement enregistré', reference: p.number, user: p.clients?.name ?? '' })),
    ...ord.map((o) => ({ at: o.created_at, type: 'Commande', description: `Commande ${statusLabel(o.status)}`, reference: o.number, user: o.clients?.name ?? '' })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 6)

  // Alertes
  const alerts: Alert[] = []
  const d = now.toLocaleDateString('fr-FR')
  if (lateOf > 0) alerts.push({ date: d, level: 'Critique', message: `${lateOf} OF en retard sur la date de fin prévue`, module: 'Production', link: '/production/of' })
  if (overdue.count > 0) alerts.push({ date: d, level: 'Avertissement', message: `${overdue.count} facture(s) client échue(s) non réglée(s)`, module: 'Ventes', link: '/ventes/factures' })
  if (criticalStock > 0) alerts.push({ date: d, level: 'Avertissement', message: `${criticalStock} article(s) sous le stock minimum`, module: 'Stocks', link: '/stocks/niveaux' })
  if (zeroStockLines > 0) alerts.push({ date: d, level: 'Information', message: `${zeroStockLines} ligne(s) de stock à zéro ou négative(s)`, module: 'Stocks', link: '/stocks/niveaux' })

  return {
    caMonth,
    treasury,
    cashInMonth,
    cashOutMonth,
    pendingOrders: { count: openOrders.length, amount: openOrders.reduce((s, o) => s + Number(o.total_ttc), 0) },
    ofInProgress: { count: activeOf.length, late: lateOf },
    criticalStock,
    overdue,
    caByMonth,
    treasury30: { labels, values },
    caByFamily: { labels: [...fam.keys()], values: [...fam.values()] },
    activities,
    alerts,
  }
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    brouillon: 'créée',
    emise: 'émise',
    partiellement_payee: 'partiellement payée',
    payee: 'payée',
    confirmee: 'confirmée',
    en_production: 'en production',
    partiellement_livree: 'partiellement livrée',
    livree: 'livrée',
    facturee: 'facturée',
    annulee: 'annulée',
  }
  return map[s] ?? s
}

export function money(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/[  ]/g, ' ') + ' F'
}
