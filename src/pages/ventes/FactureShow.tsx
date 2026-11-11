import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Invoice, dFr, dtFr, fcfa, invoiceStatus, loadInvoice } from './salesData'
import { Ask, Confirm, DocHeader, Info, Lines, Msg, Recap, amber, btn, danger, outline, pdf } from './DocParts'
import { printPriced } from './printSales'

type Alloc = { amount: number; payments: { id: string; number: string; paid_at: string; status: string; payment_methods: { name: string } | null } | null }

export default function FactureShow() {
  const { id } = useParams()
  const ctx = useOutletContext<AppContext>()
  const [inv, setInv] = useState<Invoice | null>(null)
  const [allocs, setAllocs] = useState<Alloc[]>([])
  const [ask, setAsk] = useState<Ask | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function reload() {
    const [x, a] = await Promise.all([
      loadInvoice(id!),
      supabase.from('payment_allocations').select('amount, payments(id, number, paid_at, status, payment_methods(name))').eq('invoice_id', id!),
    ])
    setInv(x)
    setAllocs((a.data as unknown as Alloc[]) ?? [])
  }
  useEffect(() => {
    reload()
  }, [id])
  if (!inv) return null

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
  const rest = Number(inv.total_ttc) - Number(inv.amount_paid)
  const open = inv.status === 'emise' || inv.status === 'partiellement_payee'
  const late = open && rest > 0 && inv.due_at && inv.due_at < new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <DocHeader number={inv.number} badge={invoiceStatus(inv.status)} sub={inv.clients?.name}>
        {open && rest > 0 && ctx.can('payments.create') && (
          <Link to={`/tresorerie/caisse?facture=${inv.id}`} className={`${btn} ${amber}`}>
            Encaisser
          </Link>
        )}
        {inv.status !== 'annulee' && ctx.can('invoices.delete') && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setAsk({
                question: 'Annuler cette facture ? Les encaissements seront désimputés et la commande pourra être refacturée.',
                note: true,
                noteLabel: 'Motif de l’annulation (obligatoire)',
                run: async (reason) => {
                  const r = await supabase.rpc('cancel_invoice', { p_invoice: inv.id, p_reason: reason })
                  if (r.error) throw new Error(r.error.message)
                },
              })
            }
            className={`${btn} ${danger}`}
          >
            Annuler
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            printPriced({
              title: 'FACTURE',
              number: inv.number,
              date: inv.issued_at,
              client: inv.clients,
              infos: [
                ['Commande', inv.sales_orders?.number],
                ['Échéance', dFr(inv.due_at)],
              ],
              lines: inv.document_lines,
              totals: { ht: Number(inv.total_ht), tva: Number(inv.total_tva), ttc: Number(inv.total_ttc), paid: Number(inv.amount_paid) },
            })
          }
          className={`${btn} ${pdf}`}
        >
          PDF
        </button>
        <Link to="/ventes/factures" className={`${btn} ${outline}`}>
          Retour
        </Link>
      </DocHeader>

      {late && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-[4px] px-4 py-2">Facture en retard : échéance au {dFr(inv.due_at)}, reste {fcfa(rest)} FCFA.</div>}
      {inv.status === 'annulee' && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-[4px] px-4 py-2">Facture annulée : {inv.cancel_reason}</div>}
      {ask && <Confirm ask={ask} busy={busy} note={note} setNote={setNote} onCancel={() => setAsk(null)} onOk={() => run(ask)} />}
      <Msg msg={msg} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <Info
            items={[
              ['Client', inv.clients ? <Link to={`/ventes/clients/${inv.client_id}`} className="font-semibold text-emerald-700 hover:underline">{inv.clients.name}</Link> : null],
              ['Numéro', <span className="font-mono font-semibold">{inv.number}</span>],
              ['Date d’émission', dFr(inv.issued_at)],
              ['Échéance', dFr(inv.due_at)],
              ['Commande', inv.order_id ? <Link to={`/ventes/commandes/${inv.order_id}`} className="font-mono text-emerald-700 hover:underline">{inv.sales_orders?.number}</Link> : null],
            ]}
          />
          <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 font-semibold text-gray-900">Règlements imputés (lettrage)</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {allocs.map((a, i) => (
                  <tr key={i} className={a.payments?.status === 'annule' ? 'line-through text-gray-400' : ''}>
                    <td className="px-4 py-1.5 font-mono">{a.payments?.number}</td>
                    <td className="px-4 py-1.5 text-gray-600">{dtFr(a.payments?.paid_at)}</td>
                    <td className="px-4 py-1.5 text-gray-600">{a.payments?.payment_methods?.name}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums font-semibold">{fcfa(a.amount)} F</td>
                  </tr>
                ))}
                {allocs.length === 0 && (
                  <tr>
                    <td className="px-4 py-4 text-center text-gray-400">Aucun règlement imputé.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <Recap ht={Number(inv.total_ht)} tva={Number(inv.total_tva)} ttc={Number(inv.total_ttc)} paid={Number(inv.amount_paid)} />
      </div>
      <Lines lines={inv.document_lines} title="Lignes de la facture" />
    </div>
  )
}
