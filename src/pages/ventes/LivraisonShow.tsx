import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Delivery, dFr, deliveryStatus, dtFr, loadDelivery, profileNames } from './salesData'
import { Ask, Confirm, DocHeader, Info, Lines, Msg, btn, danger, outline, pdf, primary } from './DocParts'
import { printDelivery } from './printSales'

export default function LivraisonShow() {
  const { id } = useParams()
  const ctx = useOutletContext<AppContext>()
  const [d, setD] = useState<Delivery | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [ask, setAsk] = useState<Ask | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function reload() {
    const x = await loadDelivery(id!)
    setD(x)
    if (x) setNames(await profileNames([x.created_by, x.validated_by]))
  }
  useEffect(() => {
    reload()
  }, [id])
  if (!d) return null

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
  const validate = async () => {
    const r = await supabase.rpc('validate_delivery', { p_delivery: d.id })
    if (r.error) throw new Error(r.error.message)
    setMsg({ ok: true, text: 'Bon de livraison validé : la marchandise est sortie du stock.' })
  }
  const cancel = async () => {
    const r = await supabase.from('deliveries').update({ status: 'annulee' }).eq('id', d.id)
    if (r.error) throw new Error(r.error.message)
  }

  return (
    <div className="space-y-3">
      <DocHeader number={d.number} badge={deliveryStatus(d.status)} sub={d.clients?.name}>
        {d.status === 'brouillon' && ctx.can('deliveries.edit') && (
          <Link to={`/ventes/livraisons/${d.id}/modifier`} className={`${btn} ${outline}`}>
            Modifier
          </Link>
        )}
        {d.status === 'brouillon' && ctx.can('deliveries.validate') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAsk({ question: `Valider le bon de livraison ${d.number} ? Les quantités sortent du stock du dépôt ${d.warehouses?.code}.`, run: validate })}
            className={`${btn} ${primary}`}
          >
            Valider la livraison
          </button>
        )}
        {d.status === 'brouillon' && ctx.can('deliveries.edit') && (
          <button type="button" disabled={busy} onClick={() => setAsk({ question: 'Annuler ce bon de livraison ?', run: cancel })} className={`${btn} ${danger}`}>
            Annuler
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            printDelivery({
              number: d.number,
              date: d.delivered_at,
              client: d.clients,
              orderNumber: d.sales_orders?.number,
              address: d.sales_orders?.delivery_address,
              carrier: d.carrier,
              vehicle: d.vehicle,
              lines: d.document_lines,
              notes: d.notes,
            })
          }
          className={`${btn} ${pdf}`}
        >
          PDF
        </button>
        <Link to={`/ventes/commandes/${d.order_id}`} className={`${btn} ${outline}`}>
          Commande {d.sales_orders?.number}
        </Link>
      </DocHeader>

      {ask && <Confirm ask={ask} busy={busy} note={note} setNote={setNote} onCancel={() => setAsk(null)} onOk={() => run(ask)} />}
      <Msg msg={msg} />

      <Info
        items={[
          ['Client', d.clients ? <Link to={`/ventes/clients/${d.client_id}`} className="font-semibold text-emerald-700 hover:underline">{d.clients.name}</Link> : null],
          ['Commande', <Link to={`/ventes/commandes/${d.order_id}`} className="font-mono text-emerald-700 hover:underline">{d.sales_orders?.number}</Link>],
          ['Date de livraison', dFr(d.delivered_at)],
          ['Dépôt', d.warehouses ? `${d.warehouses.code} — ${d.warehouses.name}` : null],
          ['Adresse', d.sales_orders?.delivery_address],
          ['Transport', [d.carrier, d.vehicle].filter(Boolean).join(' · ')],
          ['Créé par', d.created_by ? names[d.created_by] : null],
          ['Validé', d.validated_at ? `${dtFr(d.validated_at)}${d.validated_by ? ' · ' + (names[d.validated_by] ?? '') : ''}` : null],
          ['Observations', d.notes],
        ]}
      />
      <Lines lines={d.document_lines} title="Articles livrés" priced={false} />
    </div>
  )
}
