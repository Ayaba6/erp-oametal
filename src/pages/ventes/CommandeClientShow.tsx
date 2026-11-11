import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Delivery, Invoice, Payment, SalesOrder, dFr, deliveryStatus, dtFr, fcfa, invoiceStatus, loadDeliveries, loadInvoices, loadPayments, loadSalesOrder, orderStatus, profileNames } from './salesData'
import { Ask, Confirm, DocHeader, Info, Lines, Msg, Recap, Steps, amber, btn, danger, outline, pdf, primary } from './DocParts'
import { printPriced } from './printSales'
import { ProductionOrder, loadProductionOrders, ofStatus } from '../production/prodData'

export default function CommandeClientShow() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [o, setO] = useState<SalesOrder | null>(null)
  const [pays, setPays] = useState<Payment[]>([])
  const [bls, setBls] = useState<Delivery[]>([])
  const [invs, setInvs] = useState<Invoice[]>([])
  const [ofs, setOfs] = useState<ProductionOrder[]>([])
  const [prodBlock, setProdBlock] = useState<string | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [ask, setAsk] = useState<Ask | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function reload() {
    const [x, p, d, i, f, b] = await Promise.all([
      loadSalesOrder(id!),
      loadPayments({ orderId: id! }),
      loadDeliveries(id!),
      loadInvoices(id!),
      loadProductionOrders(id!),
      supabase.rpc('order_production_block', { p_order: id! }),
    ])
    setOfs(f)
    setProdBlock((b.data as string | null) ?? null)
    setO(x)
    setPays(p)
    setBls(d)
    setInvs(i)
    if (x) setNames(await profileNames([x.created_by, x.sales_rep_id]))
  }
  useEffect(() => {
    reload()
  }, [id])
  if (!o) return null

  async function run(a: Ask) {
    setBusy(true)
    setMsg(null)
    try {
      await a.run(note)
      setAsk(null)
      setNote('')
      await reload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }
  const update = async (patch: Record<string, unknown>) => {
    const r = await supabase.from('sales_orders').update(patch).eq('id', o.id)
    if (r.error) throw new Error(r.error.message)
  }
  const makeOf = async () => {
    const r = await supabase.rpc('create_production_order', { p_order: o.id })
    if (r.error) throw new Error(r.error.message)
    navigate(`/production/of/${r.data as string}`)
  }
  const invoice = async () => {
    const r = await supabase.rpc('invoice_order', { p_order: o.id })
    if (r.error) throw new Error(r.error.message)
    navigate(`/ventes/factures/${r.data as string}`)
  }

  const active = !['brouillon', 'annulee'].includes(o.status)
  const toDeliver = o.document_lines.some((l) => Number(l.delivered_qty) < Number(l.quantity))
  const hasInvoice = invs.some((i) => i.status !== 'annulee')
  const draftBl = bls.find((b) => b.status === 'brouillon')
  const rest = Number(o.total_ttc) - Number(o.amount_paid)
  const steps = [
    { key: 'brouillon', label: 'Brouillon', icon: '📝' },
    { key: 'confirmee', label: 'Confirmée', icon: '✅' },
    { key: 'livree', label: 'Livrée', icon: '🚚' },
    { key: 'facturee', label: 'Facturée', icon: '🧾' },
  ]
  const cur = o.status === 'partiellement_livree' || o.status === 'en_production' ? 1 : steps.findIndex((s) => s.key === o.status)

  return (
    <div className="space-y-3">
      <Steps steps={steps} current={cur} />
      <DocHeader number={o.number} badge={orderStatus(o.status)} sub={o.clients?.name}>
        {o.status === 'brouillon' && ctx.can('orders.edit') && (
          <Link to={`/ventes/commandes/${o.id}/modifier`} className={`${btn} ${outline}`}>
            Modifier
          </Link>
        )}
        {o.status === 'brouillon' && ctx.can('orders.validate') && (
          <button type="button" disabled={busy} onClick={() => setAsk({ question: 'Confirmer cette commande ?', run: () => update({ status: 'confirmee' }) })} className={`${btn} ${primary}`}>
            Confirmer
          </button>
        )}
        {active && rest > 0 && ctx.can('payments.create') && (
          <Link to={`/tresorerie/caisse?commande=${o.id}`} className={`${btn} ${amber}`}>
            Encaisser
          </Link>
        )}
        {active && toDeliver && ctx.can('production.create') && !ofs.some((f) => ['cree', 'en_production', 'soumis'].includes(f.status)) && (
          <button
            type="button"
            disabled={busy || !!prodBlock}
            title={prodBlock ?? ''}
            onClick={() => setAsk({ question: `Transformer la commande ${o.number} en ordre de fabrication ?`, run: makeOf })}
            className={`${btn} ${primary}`}
          >
            Créer l'OF
          </button>
        )}
        {active && toDeliver && ctx.can('deliveries.create') && (
          <Link to={draftBl ? `/ventes/livraisons/${draftBl.id}` : `/ventes/livraisons/nouveau?commande=${o.id}`} className={`${btn} ${outline}`}>
            {draftBl ? `Ouvrir ${draftBl.number}` : 'Créer un BL'}
          </Link>
        )}
        {active && !hasInvoice && ctx.can('invoices.create') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsk({ question: `Facturer la commande ${o.number} (${fcfa(o.total_ttc)} FCFA) ? Les encaissements déjà reçus seront imputés sur la facture.`, run: invoice })}
            className={`${btn} ${outline}`}
          >
            Facturer
          </button>
        )}
        {['brouillon', 'confirmee'].includes(o.status) && Number(o.amount_paid) === 0 && !bls.some((b) => b.status === 'validee') && ctx.can('sales.cancel') && (
          <button type="button" disabled={busy} onClick={() => setAsk({ question: 'Annuler cette commande ?', run: () => update({ status: 'annulee' }) })} className={`${btn} ${danger}`}>
            Annuler
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            printPriced({
              title: 'BON DE COMMANDE',
              number: o.number,
              date: o.issued_at,
              client: o.clients,
              infos: [
                ['Devis', o.quotes?.number],
                ['Livraison prévue', o.delivery_date ? dFr(o.delivery_date) : null],
                ['Adresse de livraison', o.delivery_address],
                ['Commercial', o.sales_rep_id ? names[o.sales_rep_id] : null],
              ],
              lines: o.document_lines,
              totals: { ht: Number(o.total_ht), tva: Number(o.total_tva), ttc: Number(o.total_ttc), paid: Number(o.amount_paid) },
              notes: o.notes,
            })
          }
          className={`${btn} ${pdf}`}
        >
          PDF
        </button>
        <Link to="/ventes/commandes" className={`${btn} ${outline}`}>
          Retour
        </Link>
      </DocHeader>

      {ask && <Confirm ask={ask} busy={busy} note={note} setNote={setNote} onCancel={() => setAsk(null)} onOk={() => run(ask)} />}
      <Msg msg={msg} />
      {active && toDeliver && prodBlock && ctx.can('production.create') && !ofs.length && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[4px] px-4 py-2">Production : {prodBlock}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Info
            items={[
              ['Client', o.clients ? <Link to={`/ventes/clients/${o.client_id}`} className="font-semibold text-emerald-700 hover:underline">{o.clients.name}</Link> : null],
              ['Numéro', <span className="font-mono font-semibold">{o.number}</span>],
              ['Date de commande', dFr(o.issued_at)],
              ['Livraison prévue', o.delivery_date ? dFr(o.delivery_date) : null],
              ['Devis d’origine', o.quote_id ? <Link to={`/ventes/devis/${o.quote_id}`} className="font-mono text-emerald-700 hover:underline">{o.quotes?.number}</Link> : null],
              ['Dépôt de livraison', o.warehouses ? `${o.warehouses.code} — ${o.warehouses.name}` : null],
              ['Adresse de livraison', o.delivery_address],
              ['Commercial', o.sales_rep_id ? names[o.sales_rep_id] : null],
              ['Observations', o.notes],
            ]}
          />
        </div>
        <Recap ht={Number(o.total_ht)} tva={Number(o.total_tva)} ttc={Number(o.total_ttc)} paid={Number(o.amount_paid)} />
      </div>

      <Lines lines={o.document_lines} title="Lignes de commande" delivered />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-900">Ordres de fabrication ({ofs.length})</div>
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-gray-100">
              {ofs.map((f) => {
                const st = ofStatus(f.status)
                return (
                  <tr key={f.id}>
                    <td className="px-3 py-1.5 font-mono">
                      <Link to={`/production/of/${f.id}`} className="text-emerald-700 hover:underline">
                        {f.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${st.badge}`}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
              {ofs.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-400">Aucun OF.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-900">Encaissements ({pays.filter((p) => p.status === 'confirme').length})</div>
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-gray-100">
              {pays.map((p) => (
                <tr key={p.id} className={p.status === 'annule' ? 'line-through text-gray-400' : ''}>
                  <td className="px-3 py-1.5 font-mono">{p.number}</td>
                  <td className="px-3 py-1.5 text-gray-600">{dtFr(p.paid_at)}</td>
                  <td className="px-3 py-1.5 text-gray-600">{p.payment_methods?.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fcfa(p.amount)}</td>
                </tr>
              ))}
              {pays.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-400">Aucun encaissement.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-900">Bons de livraison ({bls.length})</div>
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-gray-100">
              {bls.map((b) => {
                const s = deliveryStatus(b.status)
                return (
                  <tr key={b.id}>
                    <td className="px-3 py-1.5 font-mono">
                      <Link to={`/ventes/livraisons/${b.id}`} className="text-emerald-700 hover:underline">
                        {b.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{dFr(b.delivered_at)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.badge}`}>{s.label}</span>
                    </td>
                  </tr>
                )
              })}
              {bls.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-400">Aucun BL.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 font-semibold text-gray-900">Factures ({invs.length})</div>
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-gray-100">
              {invs.map((i) => {
                const s = invoiceStatus(i.status)
                return (
                  <tr key={i.id}>
                    <td className="px-3 py-1.5 font-mono">
                      <Link to={`/ventes/factures/${i.id}`} className="text-emerald-700 hover:underline">
                        {i.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fcfa(i.total_ttc)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.badge}`}>{s.label}</span>
                    </td>
                  </tr>
                )
              })}
              {invs.length === 0 && (
                <tr>
                  <td className="px-3 py-4 text-center text-gray-400">Aucune facture.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
