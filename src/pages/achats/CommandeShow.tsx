import { ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { INCOTERMS, PAYMENT_METHODS, PAYMENT_TERMS, PRIORITIES, PoStatus, PurchaseOrder, Reception, dateFr, labelOf, lineHt, lineTax, loadOrder, loadReceptions, num, poStatus, recStatus } from './achatsData'
import { printPurchaseOrder } from './printBC'

// Étapes affichées en haut de la commande (comme l'A3 ERP)
const STEPS: { key: PoStatus; label: string; icon: string }[] = [
  { key: 'brouillon', label: 'Brouillon', icon: '📝' },
  { key: 'envoyee', label: 'Envoyé', icon: '📤' },
  { key: 'confirmee', label: 'Confirmé', icon: '✅' },
  { key: 'partiellement_recue', label: 'Partiel', icon: '📦' },
  { key: 'recue', label: 'Reçu', icon: '🏭' },
  { key: 'cloturee', label: 'Clôturé', icon: '🔒' },
]
const CHECK = 'M5 13l4 4L19 7'

type Action = { key: string; label: string; question?: string; cls: string; run: () => Promise<void> }

export default function CommandeShow() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [po, setPo] = useState<PurchaseOrder | null>(null)
  const [recs, setRecs] = useState<Reception[]>([])
  const [buyer, setBuyer] = useState('')
  const [ask, setAsk] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const [o, r] = await Promise.all([loadOrder(id!), loadReceptions(id!)])
    setPo(o)
    setRecs(r)
    if (o?.buyer_id) {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', o.buyer_id).maybeSingle()
      setBuyer((data as { full_name: string } | null)?.full_name ?? '')
    }
  }
  useEffect(() => {
    reload()
  }, [id])

  if (!po) return null
  const st = poStatus(po.status)
  const draftRec = recs.find((r) => r.status === 'brouillon' || r.status === 'soumise')
  const received = po.purchase_order_lines.reduce((s, l) => s + Number(l.received_qty), 0)
  const gross = po.purchase_order_lines.reduce((s, l) => s + Math.round(Number(l.quantity) * Number(l.unit_price)), 0)
  const remise = gross - Number(po.total_ht)

  async function update(patch: Record<string, unknown>) {
    const r = await supabase.from('purchase_orders').update(patch).eq('id', po!.id)
    if (r.error) throw new Error(r.error.message)
  }
  async function startReception() {
    if (draftRec) return navigate(`/achats/receptions/${draftRec.id}`)
    const r = await supabase.from('receptions').insert({ purchase_order_id: po!.id, supplier_id: po!.supplier_id, warehouse_id: po!.warehouse_id }).select('id').single()
    if (r.error) throw new Error(r.error.message)
    navigate(`/achats/receptions/${(r.data as { id: string }).id}`)
  }

  const now = () => new Date().toISOString()
  const primary = 'bg-emerald-700 text-white hover:bg-emerald-800'
  const amber = 'bg-amber-600 text-white hover:bg-amber-700'
  const outline = 'border border-gray-300 text-gray-700 hover:bg-gray-50'
  const danger = 'border border-red-300 text-red-700 hover:bg-red-50'
  const actions: Action[] = []
  if (po.status === 'brouillon' && ctx.can('purchase_orders.edit'))
    actions.push({ key: 'send', label: 'Marquer envoyé', question: 'Marquer la commande comme envoyée au fournisseur ? Elle ne sera plus modifiable.', cls: outline, run: () => update({ status: 'envoyee', sent_at: now() }) })
  if ((po.status === 'brouillon' || po.status === 'envoyee') && ctx.can('purchase_orders.confirm'))
    actions.push({
      key: 'confirm',
      label: 'Confirmer',
      question: 'Confirmer la commande ? Elle pourra ensuite être réceptionnée.',
      cls: primary,
      run: () => update({ status: 'confirmee', confirmed_at: now(), confirmed_by: ctx.profile?.id ?? null, sent_at: po.sent_at ?? now() }),
    })
  if ((po.status === 'confirmee' || po.status === 'partiellement_recue') && ctx.can('receptions.create'))
    actions.push({ key: 'rec', label: draftRec ? `Ouvrir ${draftRec.number}` : 'Réceptionner', cls: amber, run: startReception })
  if ((po.status === 'partiellement_recue' || po.status === 'recue') && ctx.can('purchase_orders.edit'))
    actions.push({
      key: 'close',
      label: 'Clôturer',
      question: po.status === 'partiellement_recue' ? 'Clôturer la commande ? Le reliquat ne sera plus attendu.' : 'Clôturer la commande ?',
      cls: outline,
      run: () => update({ status: 'cloturee', closed_at: now() }),
    })
  if (['brouillon', 'envoyee', 'confirmee'].includes(po.status) && received === 0 && !draftRec && ctx.can('purchase_orders.cancel'))
    actions.push({ key: 'cancel', label: 'Annuler', question: 'Annuler cette commande ?', cls: danger, run: () => update({ status: 'annulee' }) })

  async function run(a: Action) {
    setBusy(true)
    setError(null)
    try {
      await a.run()
      setAsk(null)
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  // Étape courante dans le fil (Annulé : aucune)
  const idx = STEPS.findIndex((s) => s.key === po.status)

  const info = (label: string, value: ReactNode, cls = 'text-gray-700') => (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className={`mt-0.5 ${cls}`}>{value || '—'}</dd>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Fil des étapes */}
      <div className="bg-white rounded-[4px] border border-gray-300 px-5 py-4">
        <div className="w-full overflow-x-auto">
          <div className="flex items-start justify-between px-1 py-2" style={{ minWidth: 560 }}>
            {STEPS.map((s, i) => {
              const done = idx >= 0 && i < idx
              const current = i === idx
              return (
                <div key={s.key} className="flex flex-col items-center relative" style={{ flex: 1, minWidth: 72 }}>
                  {i > 0 && <div className={`absolute left-0 right-1/2 h-0.5 ${idx >= 0 && i <= idx ? 'bg-emerald-600' : 'bg-gray-200'}`} style={{ top: 14 }} />}
                  {i < STEPS.length - 1 && <div className={`absolute left-1/2 right-0 h-0.5 ${idx >= 0 && i < idx ? 'bg-emerald-600' : 'bg-gray-200'}`} style={{ top: 14 }} />}
                  <div
                    className={`relative z-10 w-7 h-7 text-xs rounded-full flex items-center justify-center ring-2 ${
                      done ? 'bg-emerald-700 ring-emerald-700 text-white' : current ? 'bg-white ring-emerald-600 text-emerald-800 shadow-md' : 'bg-white ring-gray-200 text-gray-400'
                    }`}
                  >
                    {done ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={CHECK} />
                      </svg>
                    ) : (
                      <span className={`text-sm leading-none select-none ${current ? '' : 'grayscale opacity-60'}`}>{s.icon}</span>
                    )}
                  </div>
                  <span className={`mt-1.5 text-xs font-medium ${current ? 'text-emerald-800' : done ? 'text-gray-600' : 'text-gray-400'}`}>{s.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* En-tête */}
      <div className="bg-white rounded-[4px] border border-gray-300 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-gray-900 font-mono">{po.number}</h1>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-[3px] text-xs font-semibold ${st.badge}`}>{st.label}</span>
            <span className="text-gray-500 text-sm">{po.suppliers?.name}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {po.status === 'brouillon' && ctx.can('purchase_orders.edit') && (
              <Link to={`/achats/commandes/${po.id}/modifier`} className={`inline-flex items-center gap-2 px-3 py-2 rounded-[4px] text-sm font-medium transition-colors ${outline}`}>
                Modifier
              </Link>
            )}
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                disabled={busy}
                onClick={() => (a.question ? setAsk(a) : run(a))}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-[4px] text-sm font-medium transition-colors disabled:opacity-60 ${a.cls}`}
              >
                {a.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => printPurchaseOrder(po, buyer)}
              className="inline-flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-[4px] text-sm font-medium hover:bg-red-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF
            </button>
            <Link to="/achats/commandes" className={`inline-flex items-center gap-2 px-3 py-2 rounded-[4px] text-sm font-medium transition-colors ${outline}`}>
              Retour
            </Link>
          </div>
        </div>
      </div>

      {ask && (
        <div className="bg-amber-50 rounded-[4px] border border-amber-300 p-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-gray-800">{ask.question}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAsk(null)} className={`px-3 py-1.5 rounded-[4px] text-sm font-medium ${outline}`}>
              Non
            </button>
            <button type="button" disabled={busy} onClick={() => run(ask)} className={`px-3 py-1.5 rounded-[4px] text-sm font-medium ${primary}`}>
              Oui
            </button>
          </div>
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[4px] border border-gray-300 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Informations</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {info('Fournisseur', po.suppliers?.name, 'font-semibold text-gray-900')}
            {info('Numéro', po.number, 'font-mono font-semibold text-gray-900')}
            {info('Date de commande', dateFr(po.issued_at))}
            {info('Livraison prévue', po.expected_at ? dateFr(po.expected_at) : '')}
            {info('Contact fournisseur', po.supplier_contact)}
            {info('Acheteur', buyer)}
            {info('Dépôt de réception', po.warehouses ? `${po.warehouses.code} — ${po.warehouses.name}` : '')}
            {info('Conditions de paiement', po.payment_terms ? labelOf(PAYMENT_TERMS, po.payment_terms) : '')}
            {info('Mode de paiement', labelOf(PAYMENT_METHODS, po.payment_method))}
            {info('Priorité', labelOf(PRIORITIES, po.priority))}
            {po.reference && info('Référence interne', po.reference, 'font-mono text-gray-700')}
            {po.project_reference && info('Projet', po.project_reference, 'font-mono text-gray-700')}
            {(po.carrier || po.vehicle_number) && info('Transport', [po.carrier, po.vehicle_number].filter(Boolean).join(' · '))}
            {info('Incoterm', labelOf(INCOTERMS, po.incoterm))}
            {po.delivery_location && info('Lieu de livraison', po.delivery_location)}
            {po.notes && <div className="sm:col-span-2">{info('Observations', <span className="whitespace-pre-line">{po.notes}</span>)}</div>}
          </dl>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 p-5 space-y-3 h-fit">
          <h2 className="text-base font-semibold text-gray-900">Récapitulatif</h2>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Sous-total HT</span>
            <span className="font-medium tabular-nums">{num(gross)} FCFA</span>
          </div>
          {remise > 0 && (
            <div className="flex justify-between text-sm text-red-600">
              <span>Remise</span>
              <span className="font-medium tabular-nums">- {num(remise)} FCFA</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-gray-600">
            <span>Total TVA</span>
            <span className="font-medium tabular-nums">{num(po.total_tax)} FCFA</span>
          </div>
          <div className="border-t border-gray-200 pt-3 flex justify-between">
            <span className="text-base font-bold text-gray-900">Total TTC</span>
            <span className="text-base font-bold text-amber-700 tabular-nums">{num(po.total_ttc)} FCFA</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Lignes de commande</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">Description</th>
                <th className="px-3 py-1.5 text-right">Bobines</th>
                <th className="px-3 py-1.5 text-right">Qté (kg)</th>
                <th className="px-3 py-1.5 text-right">Prix Unit.</th>
                <th className="px-3 py-1.5 text-right">Remise%</th>
                <th className="px-3 py-1.5 text-right">TVA%</th>
                <th className="px-3 py-1.5 text-right">Total HT</th>
                <th className="px-3 py-1.5 text-right">Total TTC</th>
                <th className="px-3 py-1.5 text-right">Reçu (kg)</th>
                <th className="px-3 py-1.5 text-right">Reste (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {po.purchase_order_lines.map((l, i) => {
                const ht = lineHt(Number(l.quantity), Number(l.unit_price), Number(l.discount_percent))
                const ttc = ht + lineTax(ht, Number(l.tax_rate))
                const rest = Math.max(0, Number(l.quantity) - Number(l.received_qty))
                return (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-1.5 text-gray-900">
                      {l.description || l.products?.name}
                      <p className="text-xs text-gray-400">{l.products?.code}</p>
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-600 tabular-nums">{l.coils_count ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{num(l.quantity, 2)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums">{num(l.unit_price)} FCFA</td>
                    <td className="px-3 py-1.5 text-right text-gray-600 tabular-nums">{Number(l.discount_percent) ? `${num(l.discount_percent, 2)}%` : '—'}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600 tabular-nums">{num(l.tax_rate, 2)}%</td>
                    <td className="px-3 py-1.5 text-right text-gray-700 tabular-nums font-medium">{num(ht)} FCFA</td>
                    <td className="px-3 py-1.5 text-right text-gray-900 tabular-nums font-semibold">{num(ttc)} FCFA</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-green-700">{num(l.received_qty)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${rest > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{num(rest)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {po.terms && <p className="px-5 py-3 border-t border-gray-200 text-sm text-gray-600 whitespace-pre-line">{po.terms}</p>}
      </div>

      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Réceptions liées</h2>
          <span className="text-sm text-gray-500">{recs.length} réception(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">Numéro</th>
                <th className="px-3 py-1.5 text-left">Date de réception</th>
                <th className="px-3 py-1.5 text-right">Bobines</th>
                <th className="px-3 py-1.5 text-right">Conformes (kg)</th>
                <th className="px-3 py-1.5 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recs.map((r) => {
                const ok = r.reception_lines.filter((x) => x.quality_status === 'libere')
                const s = recStatus(r.status)
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono font-semibold">
                      <Link to={`/achats/receptions/${r.id}`} className="text-emerald-800 hover:underline">
                        {r.number}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{dateFr(r.received_at)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.reception_lines.length}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(ok.reduce((t, x) => t + Number(x.quantity), 0))}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[3px] text-xs font-medium ${s.badge}`}>{s.label}</span>
                    </td>
                  </tr>
                )
              })}
              {recs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    Aucune réception.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
