import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AppContext } from '../../lib/session'
import SalesList from './SalesList'
import {
  DELIVERY_STATUSES,
  Delivery,
  INVOICE_STATUSES,
  Invoice,
  ORDER_STATUSES,
  QUOTE_STATUSES,
  Quote,
  SalesOrder,
  dFr,
  fcfa,
  loadDeliveries,
  loadInvoices,
  loadQuotes,
  loadSalesOrders,
  qty,
} from './salesData'

function useRows<T>(loader: () => Promise<T[]>) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    loader().then((r) => {
      setRows(r)
      setLoading(false)
    })
  }, [])
  return { rows, loading }
}
const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0)
const money = (n: number) => `${fcfa(n)} FCFA`

export function DevisList() {
  const ctx = useOutletContext<AppContext>()
  const { rows, loading } = useRows<Quote>(loadQuotes)
  return (
    <SalesList
      title="Devis"
      rows={rows}
      loading={loading}
      statuses={QUOTE_STATUSES}
      newLabel="Nouveau devis"
      newTo={ctx.can('quotes.create') ? '/ventes/devis/nouveau' : undefined}
      link={(r) => `/ventes/devis/${r.id}`}
      dateOf={(r) => r.issued_at}
      kpis={(s) => [
        { label: 'Total', value: `${s.length} devis · ${money(sum(s, (r) => Number(r.total_ttc)))}` },
        { label: 'Brouillons', value: String(s.filter((r) => r.status === 'brouillon').length), cls: 'text-gray-600' },
        { label: 'Validés', value: String(s.filter((r) => r.status === 'valide').length), cls: 'text-blue-600' },
        { label: 'Convertis en commande', value: String(s.filter((r) => r.status === 'converti').length), cls: 'text-emerald-600' },
      ]}
      cols={[
        { label: 'Date', cell: (r) => dFr(r.issued_at), cls: 'text-gray-600 whitespace-nowrap' },
        { label: 'Client', cell: (r) => r.clients?.name, cls: 'font-medium text-gray-900' },
        { label: 'Validité', cell: (r) => dFr(r.valid_until), cls: 'text-gray-600 whitespace-nowrap', hide: 'lg' },
        { label: 'Montant HT', cell: (r) => fcfa(r.total_ht), cls: 'text-right tabular-nums text-gray-700', hide: 'md' },
        { label: 'TTC', cell: (r) => fcfa(r.total_ttc), cls: 'text-right tabular-nums font-semibold' },
      ]}
      footer={(s) => <>{s.length} devis · Total TTC <b className="text-emerald-700">{money(sum(s, (r) => Number(r.total_ttc)))}</b></>}
    />
  )
}

export function CommandesList() {
  const ctx = useOutletContext<AppContext>()
  const { rows, loading } = useRows<SalesOrder>(loadSalesOrders)
  return (
    <SalesList
      title="Commandes clients"
      rows={rows}
      loading={loading}
      statuses={ORDER_STATUSES}
      newLabel="Nouvelle commande"
      newTo={ctx.can('orders.create') ? '/ventes/commandes/nouvelle' : undefined}
      link={(r) => `/ventes/commandes/${r.id}`}
      dateOf={(r) => r.issued_at}
      kpis={(s) => [
        { label: 'Total TTC filtré', value: money(sum(s, (r) => (r.status === 'annulee' ? 0 : Number(r.total_ttc)))) },
        { label: 'Encaissé', value: money(sum(s, (r) => Number(r.amount_paid))), cls: 'text-emerald-600' },
        { label: 'En cours', value: `${s.filter((r) => ['confirmee', 'en_production', 'partiellement_livree'].includes(r.status)).length} commande(s)`, cls: 'text-amber-600' },
        { label: 'Facturées', value: `${s.filter((r) => r.status === 'facturee').length} commande(s)`, cls: 'text-purple-600' },
      ]}
      cols={[
        { label: 'Client', cell: (r) => r.clients?.name, cls: 'font-medium text-gray-900' },
        { label: 'Date', cell: (r) => dFr(r.issued_at), cls: 'text-gray-600 whitespace-nowrap', hide: 'md' },
        { label: 'Livraison prévue', cell: (r) => dFr(r.delivery_date), cls: 'text-gray-600 whitespace-nowrap', hide: 'lg' },
        { label: 'Montant TTC', cell: (r) => fcfa(r.total_ttc), cls: 'text-right tabular-nums font-semibold' },
        {
          label: 'Reste à payer',
          cell: (r) => {
            const rest = Number(r.total_ttc) - Number(r.amount_paid)
            return rest > 0 && r.status !== 'annulee' ? <span className="text-red-600">{fcfa(rest)}</span> : <span className="text-gray-300">—</span>
          },
          cls: 'text-right tabular-nums',
        },
      ]}
      footer={(s) => <>{s.length} commande(s) · Total TTC <b className="text-emerald-700">{money(sum(s, (r) => (r.status === 'annulee' ? 0 : Number(r.total_ttc))))}</b></>}
    />
  )
}

export function LivraisonsList() {
  const { rows, loading } = useRows<Delivery>(() => loadDeliveries())
  return (
    <SalesList
      title="Bons de livraison"
      subtitle={`${rows.length} bon(s) — un BL se crée depuis la commande client`}
      rows={rows}
      loading={loading}
      statuses={DELIVERY_STATUSES}
      link={(r) => `/ventes/livraisons/${r.id}`}
      dateOf={(r) => r.delivered_at}
      kpis={(s) => [
        { label: 'Bons de livraison', value: String(s.length) },
        { label: 'Brouillons', value: String(s.filter((r) => r.status === 'brouillon').length), cls: 'text-gray-600' },
        { label: 'Validés — livrés', value: String(s.filter((r) => r.status === 'validee').length), cls: 'text-emerald-600' },
        { label: 'Annulés', value: String(s.filter((r) => r.status === 'annulee').length), cls: 'text-red-600' },
      ]}
      cols={[
        { label: 'Client', cell: (r) => r.clients?.name, cls: 'font-medium text-gray-900' },
        { label: 'Commande', cell: (r) => r.sales_orders?.number, cls: 'font-mono text-gray-600' },
        { label: 'Date', cell: (r) => dFr(r.delivered_at), cls: 'text-gray-600 whitespace-nowrap' },
        { label: 'Dépôt', cell: (r) => r.warehouses?.code, cls: 'font-mono text-gray-600', hide: 'md' },
        { label: 'Quantité', cell: (r) => qty(sum(r.document_lines, (l) => Number(l.quantity))), cls: 'text-right tabular-nums', hide: 'lg' },
      ]}
    />
  )
}

export function FacturesList() {
  const { rows, loading } = useRows<Invoice>(() => loadInvoices())
  const due = (r: Invoice) => (r.status === 'emise' || r.status === 'partiellement_payee' ? Number(r.total_ttc) - Number(r.amount_paid) : 0)
  const late = (r: Invoice) => due(r) > 0 && !!r.due_at && r.due_at < new Date().toISOString().slice(0, 10)
  return (
    <SalesList
      title="Factures clients"
      subtitle={`${rows.length} facture(s) — une facture se crée depuis la commande client`}
      rows={rows}
      loading={loading}
      statuses={INVOICE_STATUSES}
      link={(r) => `/ventes/factures/${r.id}`}
      dateOf={(r) => r.issued_at}
      kpis={(s) => [
        { label: 'Total facturé TTC', value: money(sum(s, (r) => (r.status === 'annulee' ? 0 : Number(r.total_ttc)))) },
        { label: 'Encaissé', value: money(sum(s, (r) => (r.status === 'annulee' ? 0 : Number(r.amount_paid)))), cls: 'text-emerald-600' },
        { label: 'Reste à encaisser', value: money(sum(s, due)), cls: 'text-red-600' },
        { label: 'En retard', value: `${s.filter(late).length} facture(s)`, cls: 'text-amber-600' },
      ]}
      cols={[
        { label: 'Client', cell: (r) => r.clients?.name, cls: 'font-medium text-gray-900' },
        { label: 'Émission', cell: (r) => dFr(r.issued_at), cls: 'text-gray-600 whitespace-nowrap', hide: 'md' },
        { label: 'Échéance', cell: (r) => <span className={late(r) ? 'text-red-600 font-semibold' : 'text-gray-600'}>{dFr(r.due_at)}</span>, cls: 'whitespace-nowrap', hide: 'lg' },
        { label: 'Montant TTC', cell: (r) => fcfa(r.total_ttc), cls: 'text-right tabular-nums font-semibold' },
        { label: 'Reste à payer', cell: (r) => (due(r) > 0 ? <span className="text-red-600">{fcfa(due(r))}</span> : <span className="text-gray-300">—</span>), cls: 'text-right tabular-nums' },
      ]}
    />
  )
}
