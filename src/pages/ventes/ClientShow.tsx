import { ReactNode, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { CLIENT_PAYMENT, CLIENT_TYPES, Client, dFr, fcfa, invoiceStatus, loadClient, orderStatus, InvoiceStatus, OrderStatus } from './salesData'

type Doc = { id: string; number: string; issued_at: string; total_ttc: number; status: string; amount_paid: number }

export default function ClientShow() {
  const { id } = useParams()
  const ctx = useOutletContext<AppContext>()
  const [c, setC] = useState<Client | null>(null)
  const [orders, setOrders] = useState<Doc[]>([])
  const [invoices, setInvoices] = useState<Doc[]>([])
  const [paid, setPaid] = useState(0)

  useEffect(() => {
    loadClient(id!).then(setC)
    supabase
      .from('sales_orders')
      .select('id, number, issued_at, total_ttc, status, amount_paid')
      .eq('client_id', id!)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data as Doc[]) ?? []))
    supabase
      .from('invoices')
      .select('id, number, issued_at, total_ttc, status, amount_paid')
      .eq('client_id', id!)
      .order('created_at', { ascending: false })
      .then(({ data }) => setInvoices((data as Doc[]) ?? []))
    supabase
      .from('payments')
      .select('amount')
      .eq('client_id', id!)
      .eq('status', 'confirme')
      .then(({ data }) => setPaid(((data as { amount: number }[]) ?? []).reduce((s, p) => s + Number(p.amount), 0)))
  }, [id])

  if (!c) return null
  const ordered = orders.filter((o) => o.status !== 'annulee').reduce((s, o) => s + Number(o.total_ttc), 0)
  const due = invoices.filter((i) => i.status === 'emise' || i.status === 'partiellement_payee').reduce((s, i) => s + Number(i.total_ttc) - Number(i.amount_paid), 0)
  const initials = c.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const row = (label: string, value: ReactNode) => (
    <div>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="mt-0.5 text-gray-800">{value || '—'}</p>
    </div>
  )
  const stat = (label: string, value: ReactNode, cls = 'text-gray-900') => (
    <div className="flex justify-between items-center">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-semibold tabular-nums ${cls}`}>{value}</dd>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-[4px] border border-gray-300 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-emerald-800 font-bold text-xl">{initials}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[16px] font-bold text-gray-900">{c.name}</h1>
                <span className="inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-emerald-50 text-emerald-800 font-mono">{c.code}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-semibold ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.is_active ? 'Actif' : 'Inactif'}
                </span>
                <span className="inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-blue-100 text-blue-700">{CLIENT_TYPES.find(([k]) => k === c.type)?.[1]}</span>
                {c.is_blocked && <span className="inline-flex px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-red-100 text-red-700">Bloqué</span>}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{[c.trade_name, c.city, c.phone].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ctx.can('quotes.create') && !c.is_blocked && (
              <Link to={`/ventes/devis/nouveau?client=${c.id}`} className="px-3 py-1.5 bg-amber-600 text-white rounded-[4px] text-sm font-medium hover:bg-amber-700">
                + Devis
              </Link>
            )}
            {ctx.can('orders.create') && !c.is_blocked && (
              <Link to={`/ventes/commandes/nouvelle?client=${c.id}`} className="px-3 py-1.5 bg-amber-600 text-white rounded-[4px] text-sm font-medium hover:bg-amber-700">
                + Commande
              </Link>
            )}
            {ctx.can('clients.edit') && (
              <Link to={`/ventes/clients/${c.id}/modifier`} className="px-3 py-1.5 bg-emerald-700 text-white rounded-[4px] text-sm font-medium hover:bg-emerald-800">
                Modifier
              </Link>
            )}
            <Link to="/ventes/clients" className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-[4px] text-sm font-medium hover:bg-gray-50">
              Retour
            </Link>
          </div>
        </div>
        {c.is_blocked && <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-[4px] px-3 py-1.5">Client bloqué : {c.blocked_reason}</p>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white rounded-[4px] border border-gray-300 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Coordonnées</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {row('Téléphone', [c.phone, c.phone2].filter(Boolean).join(' / '))}
              {row('Email', c.email)}
              {row('Adresse', [c.address, c.quartier, c.city, c.country].filter(Boolean).join(', '))}
              {row('IFU / RCCM', [c.ifu, c.rccm].filter(Boolean).join(' · '))}
              {row('Règlement', `${CLIENT_PAYMENT.find(([k]) => k === c.payment_mode)?.[1]}${c.payment_days ? ` · ${c.payment_days} jours` : ''}`)}
              {row('Remise par défaut', c.default_discount ? `${c.default_discount} %` : '')}
            </div>
            {c.contacts.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3 text-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Contacts</p>
                {c.contacts.map((ct, i) => (
                  <p key={i} className="text-gray-700">
                    {[ct.first_name, ct.last_name].filter(Boolean).join(' ')}
                    {ct.is_primary && <span className="text-emerald-700 text-xs"> · principal</span>}
                    {ct.job_title && <span className="text-gray-500"> · {ct.job_title}</span>}
                    {ct.phone && <span className="text-gray-500"> · {ct.phone}</span>}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 font-semibold text-gray-900">Commandes</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {orders.slice(0, 10).map((o) => {
                  const s = orderStatus(o.status as OrderStatus)
                  return (
                    <tr key={o.id}>
                      <td className="px-4 py-1.5 font-mono">
                        <Link to={`/ventes/commandes/${o.id}`} className="text-emerald-700 hover:underline">
                          {o.number}
                        </Link>
                      </td>
                      <td className="px-4 py-1.5 text-gray-600">{dFr(o.issued_at)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{fcfa(o.total_ttc)}</td>
                      <td className="px-4 py-1.5 text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.badge}`}>{s.label}</span>
                      </td>
                    </tr>
                  )
                })}
                {orders.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-400">Aucune commande.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 font-semibold text-gray-900">Factures</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {invoices.slice(0, 10).map((i) => {
                  const s = invoiceStatus(i.status as InvoiceStatus)
                  const rest = Number(i.total_ttc) - Number(i.amount_paid)
                  return (
                    <tr key={i.id}>
                      <td className="px-4 py-1.5 font-mono">
                        <Link to={`/ventes/factures/${i.id}`} className="text-emerald-700 hover:underline">
                          {i.number}
                        </Link>
                      </td>
                      <td className="px-4 py-1.5 text-gray-600">{dFr(i.issued_at)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{fcfa(i.total_ttc)}</td>
                      <td className={`px-4 py-1.5 text-right tabular-nums ${rest > 0 && i.status !== 'annulee' ? 'text-red-600' : 'text-gray-400'}`}>
                        {rest > 0 && i.status !== 'annulee' ? `reste ${fcfa(rest)}` : '—'}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.badge}`}>{s.label}</span>
                      </td>
                    </tr>
                  )
                })}
                {invoices.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-400">Aucune facture.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-[4px] border border-gray-300 p-5 space-y-3">
            <h2 className="text-base font-semibold text-gray-900">Statistiques</h2>
            <dl className="space-y-3 text-sm">
              {stat('Commandes', orders.filter((o) => o.status !== 'annulee').length)}
              {stat('Montant commandé', `${fcfa(ordered)} F`)}
              {stat('Total encaissé', `${fcfa(paid)} F`, 'text-emerald-700')}
              {stat('Plafond crédit', c.credit_limit ? `${fcfa(c.credit_limit)} F` : '—')}
              <div className="pt-2 border-t border-gray-100">{stat('Solde dû (factures)', `${fcfa(due)} F`, due > 0 ? 'text-red-600' : 'text-gray-400')}</div>
            </dl>
          </div>
          {c.notes && (
            <div className="bg-white rounded-[4px] border border-gray-300 p-5 text-sm text-gray-700 whitespace-pre-line">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Notes</h2>
              {c.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
