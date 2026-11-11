import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Quote, dFr, dtFr, loadQuote, profileNames, quoteStatus } from './salesData'
import { Ask, Confirm, DocHeader, Info, Lines, Msg, Recap, Steps, amber, btn, danger, outline, pdf, primary } from './DocParts'
import { printPriced } from './printSales'

export default function DevisShow() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [q, setQ] = useState<Quote | null>(null)
  const [orderId, setOrderId] = useState<{ id: string; number: string } | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [ask, setAsk] = useState<Ask | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function reload() {
    const x = await loadQuote(id!)
    setQ(x)
    if (!x) return
    setNames(await profileNames([x.created_by, x.sales_rep_id, x.submitted_by ?? null, x.approved_by ?? null]))
    const { data } = await supabase.from('sales_orders').select('id, number').eq('quote_id', x.id).maybeSingle()
    setOrderId((data as { id: string; number: string } | null) ?? null)
  }
  useEffect(() => {
    reload()
  }, [id])
  if (!q) return null

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
  const setStatus = async (status: string) => {
    const r = await supabase.from('quotes').update({ status }).eq('id', q.id)
    if (r.error) throw new Error(r.error.message)
  }
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const r = await supabase.rpc(fn, args)
    if (r.error) throw new Error(r.error.message)
  }
  const convert = async () => {
    const r = await supabase.rpc('convert_quote', { p_quote: q.id })
    if (r.error) throw new Error(r.error.message)
    navigate(`/ventes/commandes/${r.data as string}`)
  }

  const open = q.status === 'brouillon' || q.status === 'valide'
  const steps = [
    { key: 'brouillon', label: 'Brouillon', icon: '📝' },
    { key: 'soumis', label: 'Validation direction', icon: '📨' },
    { key: 'valide', label: 'Envoyé au client', icon: '✅' },
    { key: 'converti', label: 'Commande', icon: '📦' },
  ]
  const isDraft = q.status !== 'valide' && q.status !== 'converti'
  const expired = open && q.valid_until && q.valid_until < new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <Steps steps={steps} current={steps.findIndex((s) => s.key === q.status)} />
      <DocHeader number={q.number} badge={quoteStatus(q.status)} sub={q.clients?.name}>
        {q.status === 'brouillon' && ctx.can('quotes.edit') && (
          <Link to={`/ventes/devis/${q.id}/modifier`} className={`${btn} ${outline}`}>
            Modifier
          </Link>
        )}
        {q.status === 'brouillon' && (ctx.can('quotes.create') || ctx.can('quotes.edit')) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsk({ question: `Soumettre le devis ${q.number} à la direction pour validation ?`, run: () => rpc('submit_quote', { p_quote: q.id }) })}
            className={`${btn} ${amber}`}
          >
            Soumettre à la direction
          </button>
        )}
        {q.status === 'soumis' && ctx.can('quotes.validate') && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsk({ question: `Valider le devis ${q.number} (${q.clients?.name}) ? Le commercial pourra l'envoyer au client.`, run: () => rpc('approve_quote', { p_quote: q.id }) })}
              className={`${btn} ${primary}`}
            >
              Valider le devis
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAsk({
                  question: 'Renvoyer le devis au commercial pour correction ?',
                  note: true,
                  noteLabel: 'Motif du renvoi (obligatoire)',
                  run: (n) => rpc('return_quote', { p_quote: q.id, p_note: n }),
                })
              }
              className={`${btn} ${outline}`}
            >
              Renvoyer au commercial
            </button>
          </>
        )}
        {q.status === 'valide' && (ctx.can('orders.create') || ctx.can('sales.transform')) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsk({ question: `Le client a donné son accord : transformer le devis ${q.number} en commande ?`, run: convert })}
            className={`${btn} ${amber}`}
          >
            Client d'accord → Commande
          </button>
        )}
        {q.status === 'valide' && (ctx.can('quotes.edit') || ctx.can('sales.transform')) && (
          <button type="button" disabled={busy} onClick={() => setAsk({ question: 'Le client refuse ce devis ?', run: () => setStatus('refuse') })} className={`${btn} ${danger}`}>
            Refusé par le client
          </button>
        )}
        {orderId && (
          <Link to={`/ventes/commandes/${orderId.id}`} className={`${btn} ${primary}`}>
            Voir la commande {orderId.number}
          </Link>
        )}
        <button
          type="button"
          onClick={() =>
            printPriced({
              title: isDraft ? 'PROJET DE DEVIS' : 'DEVIS',
              number: q.number,
              date: q.issued_at,
              client: q.clients,
              infos: [
                ['Valable jusqu’au', dFr(q.valid_until)],
                ['Commercial', q.sales_rep_id ? names[q.sales_rep_id] : null],
                ['Conditions de paiement', q.payment_terms],
                ['Livraison', q.delivery_address],
              ],
              lines: q.document_lines,
              totals: { ht: Number(q.total_ht), tva: Number(q.total_tva), ttc: Number(q.total_ttc) },
              notes: q.notes,
              signLeft: 'Bon pour accord — le client',
            })
          }
          className={`${btn} ${pdf}`}
        >
          PDF
        </button>
        <Link to="/ventes/devis" className={`${btn} ${outline}`}>
          Retour
        </Link>
      </DocHeader>

      {q.status === 'brouillon' && q.decision_note && <div className="bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-[4px] px-4 py-2">↩ Renvoyé par la direction : {q.decision_note}</div>}
      {q.status === 'soumis' && !ctx.can('quotes.validate') && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[4px] px-4 py-2">Devis en attente de validation par la direction. Il ne peut pas encore être envoyé au client.</div>}
      {q.status === 'valide' && <div className="bg-blue-50 border border-blue-200 text-blue-900 text-sm rounded-[4px] px-4 py-2">Devis validé par la direction : imprimez-le (PDF) et envoyez-le au client. Quand le client donne son accord, cliquez sur « Client d'accord → Commande ».</div>}
      {expired && <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-[4px] px-4 py-2">Ce devis a dépassé sa date de validité ({dFr(q.valid_until)}). Vérifiez les prix avant de le transformer.</div>}
      {ask && <Confirm ask={ask} busy={busy} note={note} setNote={setNote} onCancel={() => setAsk(null)} onOk={() => run(ask)} />}
      <Msg msg={msg} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Info
            items={[
              ['Client', q.clients ? <Link to={`/ventes/clients/${q.client_id}`} className="font-semibold text-emerald-700 hover:underline">{q.clients.name}</Link> : null],
              ['Numéro', <span className="font-mono font-semibold">{q.number}</span>],
              ['Date du devis', dFr(q.issued_at)],
              ['Validité', dFr(q.valid_until)],
              ['Commercial', q.sales_rep_id ? names[q.sales_rep_id] : null],
              ['Conditions de paiement', q.payment_terms],
              ['Adresse de livraison', q.delivery_address],
              ['Créé par', q.created_by ? names[q.created_by] : null],
              ['Soumis', q.submitted_at ? `${dtFr(q.submitted_at)}${q.submitted_by ? ' · ' + (names[q.submitted_by] ?? '') : ''}` : null],
              ['Validé par la direction', q.approved_at ? `${dtFr(q.approved_at)}${q.approved_by ? ' · ' + (names[q.approved_by] ?? '') : ''}` : null],
              ['Observations', q.notes],
            ]}
          />
        </div>
        <Recap ht={Number(q.total_ht)} tva={Number(q.total_tva)} ttc={Number(q.total_ttc)} />
      </div>
      <Lines lines={q.document_lines} title="Lignes du devis" />
    </div>
  )
}
