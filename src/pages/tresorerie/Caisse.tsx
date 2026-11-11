import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { CashAccount, CashSession, Payment, PaymentMethod, dtFr, fcfa, loadCashSetup, loadPayments } from '../ventes/salesData'
import { printReceipt } from '../ventes/printSales'

// Document à encaisser : commande ou facture avec un reste à payer
type Due = { kind: 'commande' | 'facture'; id: string; number: string; client_id: string; client: string; client_code: string | null; phone: string | null; date: string; ttc: number; paid: number }

const fi = 'w-full h-9 px-2.5 border border-[#c3d3c9] rounded-[3px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400'
const lbl = 'block text-[11px] font-bold text-gray-700 mb-1'
const n = (s: string) => {
  const v = Number(String(s).replace(/[\s  ]/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

export default function Caisse() {
  const ctx = useOutletContext<AppContext>()
  const [params] = useSearchParams()
  const [accounts, setAccounts] = useState<CashAccount[]>([])
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [accountId, setAccountId] = useState('')
  const [session, setSession] = useState<CashSession | null>(null)
  const [expected, setExpected] = useState(0)
  const [dues, setDues] = useState<Due[]>([])
  const [today, setToday] = useState<Payment[]>([])
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<Due | null>(null)
  const [f, setF] = useState({ amount: '', method: '', reference: '', phone: '', notes: '' })
  const [opening, setOpening] = useState('0')
  const [closing, setClosing] = useState<null | { counted: string; reason: string }>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; payment?: Payment } | null>(null)

  async function loadDues() {
    const [o, i] = await Promise.all([
      supabase
        .from('sales_orders')
        .select('id, number, client_id, issued_at, total_ttc, amount_paid, status, clients(name, code, phone)')
        .in('status', ['confirmee', 'en_production', 'partiellement_livree', 'livree'])
        .eq('is_test', false),
      supabase
        .from('invoices')
        .select('id, number, client_id, issued_at, total_ttc, amount_paid, status, order_id, clients(name, code, phone)')
        .in('status', ['emise', 'partiellement_payee'])
        .eq('is_test', false),
    ])
    type R = { id: string; number: string; client_id: string; issued_at: string; total_ttc: number; amount_paid: number; order_id?: string | null; clients: { name: string; code: string | null; phone: string | null } | null }
    const toDue = (kind: Due['kind']) => (r: R): Due => ({ kind, id: r.id, number: r.number, client_id: r.client_id, client: r.clients?.name ?? '', client_code: r.clients?.code ?? null, phone: r.clients?.phone ?? null, date: r.issued_at, ttc: Number(r.total_ttc), paid: Number(r.amount_paid) })
    const list = [...((i.data as unknown as R[]) ?? []).map(toDue('facture')), ...((o.data as unknown as R[]) ?? []).map(toDue('commande'))].filter((d) => d.ttc - d.paid > 0.5)
    setDues(list)
    return list
  }
  async function loadSession(acc: string) {
    const { data } = await supabase.from('cash_sessions').select('*, cash_accounts(code, name)').eq('cash_account_id', acc).eq('status', 'ouverte').maybeSingle()
    const s = (data as unknown as CashSession | null) ?? null
    setSession(s)
    if (s) {
      const { data: e } = await supabase.rpc('cash_session_expected', { p_session: s.id })
      setExpected(Number(e ?? 0))
    }
  }
  async function loadToday() {
    const all = await loadPayments()
    const d = new Date().toISOString().slice(0, 10)
    setToday(all.filter((p) => p.paid_at.slice(0, 10) === d))
  }

  useEffect(() => {
    ;(async () => {
      const { accounts: a, methods: m } = await loadCashSetup()
      setAccounts(a)
      setMethods(m)
      const caisse = a.find((x) => x.type === 'caisse') ?? a[0]
      if (caisse) {
        setAccountId(caisse.id)
        await loadSession(caisse.id)
      }
      setF((p) => ({ ...p, method: m.find((x) => x.type === 'especes')?.id ?? m[0]?.id ?? '' }))
      const list = await loadDues()
      await loadToday()
      const pre = list.find((d) => (d.kind === 'commande' && d.id === params.get('commande')) || (d.kind === 'facture' && d.id === params.get('facture')))
      if (pre) choose(pre)
    })()
  }, [])

  const account = accounts.find((a) => a.id === accountId)
  const method = methods.find((m) => m.id === f.method)
  const needSession = account?.type === 'caisse'
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dues.filter((d) => !q || d.number.toLowerCase().includes(q) || d.client.toLowerCase().includes(q) || (d.client_code ?? '').toLowerCase().includes(q)).slice(0, 12)
  }, [dues, search])

  function choose(d: Due) {
    setSel(d)
    setMsg(null)
    setF((p) => ({ ...p, amount: String(Math.round(d.ttc - d.paid)), phone: d.phone ?? '', reference: '', notes: '' }))
  }

  async function onPay(e: FormEvent) {
    e.preventDefault()
    if (!sel) return
    const amount = n(f.amount)
    if (amount <= 0) return setMsg({ ok: false, text: 'Saisissez le montant reçu.' })
    if (amount > sel.ttc - sel.paid + 0.5) return setMsg({ ok: false, text: `Le montant dépasse le reste à payer (${fcfa(sel.ttc - sel.paid)} F).` })
    if (method?.type === 'mobile_money' && !f.phone.trim()) return setMsg({ ok: false, text: 'Indiquez le numéro Mobile Money.' })
    if ((method?.type === 'cheque' || method?.type === 'virement') && !f.reference.trim()) return setMsg({ ok: false, text: 'Indiquez le n° de chèque ou la référence du virement.' })
    setBusy(true)
    const { data, error } = await supabase.rpc('record_payment', {
      p_client: sel.client_id,
      p_order: sel.kind === 'commande' ? sel.id : null,
      p_invoice: sel.kind === 'facture' ? sel.id : null,
      p_account: accountId,
      p_method: f.method,
      p_amount: amount,
      p_reference: f.reference,
      p_phone: method?.type === 'mobile_money' ? f.phone : '',
      p_notes: f.notes,
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    const pays = await loadPayments({ clientId: sel.client_id })
    const p = pays.find((x) => x.id === (data as string))
    setMsg({ ok: true, text: `Encaissement ${p?.number ?? ''} enregistré : ${fcfa(amount)} FCFA.`, payment: p })
    setSel(null)
    await Promise.all([loadDues(), loadToday(), loadSession(accountId)])
  }

  function receipt(p: Payment, rest?: number | null) {
    printReceipt({
      number: p.number,
      paid_at: p.paid_at,
      amount: Number(p.amount),
      method: p.payment_methods?.name ?? '',
      account: p.cash_accounts?.name ?? '',
      reference: p.reference ?? p.phone_number,
      client: p.clients,
      document: p.invoices?.number ?? p.sales_orders?.number,
      rest: rest ?? (p.sales_orders ? Number(p.sales_orders.total_ttc) - Number(p.sales_orders.amount_paid) : null),
      cashier: ctx.profile?.full_name,
    })
  }

  async function openSession() {
    setBusy(true)
    const { error } = await supabase.rpc('open_cash_session', { p_account: accountId, p_opening: n(opening) })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: 'Caisse ouverte.' })
    await loadSession(accountId)
  }
  async function closeSession() {
    if (!session || !closing) return
    setBusy(true)
    const { data, error } = await supabase.rpc('close_cash_session', { p_session: session.id, p_counted: n(closing.counted), p_reason: closing.reason })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    const diff = Number(data ?? 0)
    setMsg({ ok: true, text: `Caisse clôturée${diff ? ` avec un écart de ${fcfa(diff)} F` : ' sans écart'}.` })
    setClosing(null)
    await loadSession(accountId)
  }

  const byMethod = useMemo(() => {
    const m = new Map<string, number>()
    today.filter((p) => p.status === 'confirme').forEach((p) => m.set(p.payment_methods?.name ?? '?', (m.get(p.payment_methods?.name ?? '?') ?? 0) + Number(p.amount)))
    return [...m.entries()]
  }, [today])
  const canPay = ctx.can('payments.create')

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Encaissement client</h1>
          <p className="text-sm text-gray-500 mt-0.5">Recherchez la commande ou la facture, encaissez, imprimez le reçu.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value)
              loadSession(e.target.value)
            }}
            className="h-9 border border-gray-300 rounded-[4px] px-2.5 text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Link to="/tresorerie/encaissements" className="px-3 py-2 border border-gray-300 text-gray-700 rounded-[4px] text-sm hover:bg-gray-50">
            Historique
          </Link>
        </div>
      </div>

      {/* État de la caisse */}
      {needSession &&
        (session ? (
          <div className="bg-white border border-emerald-300 rounded-[4px] p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
            <div>
              <p className="text-xs text-gray-500">Caisse ouverte</p>
              <p className="font-semibold text-emerald-800">
                {session.number} · depuis {dtFr(session.opened_at)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Fond d'ouverture</p>
              <p className="font-semibold tabular-nums">{fcfa(session.opening_balance)} F</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Solde théorique (espèces)</p>
              <p className="font-bold tabular-nums text-emerald-700">{fcfa(expected)} F</p>
            </div>
            {canPay && !closing && (
              <button type="button" onClick={() => setClosing({ counted: String(Math.round(expected)), reason: '' })} className="ml-auto px-3 py-2 border border-red-300 text-red-700 hover:bg-red-50 rounded-[4px] text-sm font-medium">
                Clôturer la caisse
              </button>
            )}
            {closing && (
              <div className="w-full grid grid-cols-1 sm:grid-cols-4 gap-3 items-end border-t border-gray-100 pt-3">
                <div>
                  <label className={lbl}>Montant compté (espèces) *</label>
                  <input inputMode="numeric" value={closing.counted} onChange={(e) => setClosing({ ...closing, counted: e.target.value })} className={`${fi} text-right font-semibold`} />
                </div>
                <div className="sm:col-span-2">
                  <label className={lbl}>Motif d'écart {n(closing.counted) !== Math.round(expected) ? `(écart ${fcfa(n(closing.counted) - expected)} F) *` : ''}</label>
                  <input value={closing.reason} onChange={(e) => setClosing({ ...closing, reason: e.target.value })} className={fi} />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setClosing(null)} className="flex-1 h-9 border border-gray-300 rounded-[4px] text-sm">
                    Annuler
                  </button>
                  <button type="button" disabled={busy} onClick={closeSession} className="flex-1 h-9 bg-red-600 hover:bg-red-700 text-white rounded-[4px] text-sm font-medium">
                    Clôturer
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-300 rounded-[4px] p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <p className="font-semibold text-amber-900">La caisse « {account?.name} » est fermée.</p>
              <p className="text-sm text-amber-800">Ouvrez-la avec le fond de caisse pour pouvoir encaisser en espèces.</p>
            </div>
            {canPay && (
              <>
                <div>
                  <label className={lbl}>Fond d'ouverture (F)</label>
                  <input inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value)} className={`${fi} w-40 text-right`} />
                </div>
                <button type="button" disabled={busy} onClick={openSession} className="h-9 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-sm font-medium">
                  Ouvrir la caisse
                </button>
              </>
            )}
          </div>
        ))}

      {msg && (
        <div className={`text-sm rounded-[4px] px-4 py-2 border flex flex-wrap items-center gap-3 ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span>{msg.text}</span>
          {msg.payment && (
            <button type="button" onClick={() => receipt(msg.payment!)} className="px-3 py-1 bg-emerald-700 text-white rounded-[4px] text-xs font-semibold">
              Imprimer le reçu
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Recherche du document */}
        <div className="lg:col-span-2 bg-white border border-gray-300 rounded-[4px] overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-[#eef5f0] text-[13px] font-bold text-emerald-900">Rechercher une commande ou une facture</div>
          <div className="p-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° CMD / FA, client…" className={fi} autoFocus />
          </div>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-emerald-900 uppercase border-y border-gray-200 bg-gray-50">
                <th className="px-3 py-1 text-left">N°</th>
                <th className="px-3 py-1 text-left">Client</th>
                <th className="px-3 py-1 text-right">Reste</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((d) => (
                <tr key={d.kind + d.id} onClick={() => choose(d)} className={`cursor-pointer ${sel?.id === d.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-1.5 font-mono font-semibold text-emerald-800 whitespace-nowrap">{d.number}</td>
                  <td className="px-3 py-1.5 text-gray-800">{d.client}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-red-600">{fcfa(d.ttc - d.paid)}</td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-gray-400">
                    Aucune commande ou facture à encaisser.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Saisie de l'encaissement */}
        <form onSubmit={onPay} className="lg:col-span-3 bg-white border border-gray-300 rounded-[4px] overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 bg-[#eef5f0] text-[13px] font-bold text-emerald-900">Saisie de l'encaissement</div>
          {!sel ? (
            <p className="p-8 text-center text-gray-400 text-sm">Choisissez une commande ou une facture dans la liste.</p>
          ) : (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">{sel.kind === 'commande' ? 'Commande' : 'Facture'}</p>
                  <Link to={sel.kind === 'commande' ? `/ventes/commandes/${sel.id}` : `/ventes/factures/${sel.id}`} className="font-mono font-semibold text-emerald-700 hover:underline">
                    {sel.number}
                  </Link>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Client</p>
                  <p className="font-semibold">{sel.client}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total TTC / déjà payé</p>
                  <p className="tabular-nums">
                    {fcfa(sel.ttc)} / {fcfa(sel.paid)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Reste à payer</p>
                  <p className="font-bold text-red-600 tabular-nums">{fcfa(sel.ttc - sel.paid)} F</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className={lbl}>Montant reçu (F) *</label>
                  <input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className={`${fi} text-right text-[15px] font-bold`} />
                </div>
                <div>
                  <label className={lbl}>Mode de règlement *</label>
                  <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className={fi}>
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>{method?.type === 'mobile_money' ? 'Tél. Mobile Money *' : method?.type === 'cheque' ? 'N° de chèque *' : method?.type === 'virement' ? 'Référence virement *' : 'Référence'}</label>
                  {method?.type === 'mobile_money' ? (
                    <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={fi} />
                  ) : (
                    <input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className={fi} />
                  )}
                </div>
                {method?.type === 'mobile_money' && (
                  <div>
                    <label className={lbl}>ID de transaction</label>
                    <input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className={fi} />
                  </div>
                )}
                <div className={method?.type === 'mobile_money' ? 'sm:col-span-2' : 'sm:col-span-3'}>
                  <label className={lbl}>Commentaire</label>
                  <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className={fi} />
                </div>
              </div>
              {n(f.amount) > 0 && n(f.amount) < sel.ttc - sel.paid && <p className="text-[12px] text-amber-800">Paiement partiel : il restera {fcfa(sel.ttc - sel.paid - n(f.amount))} F à payer.</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setSel(null)} className="px-4 py-2 border border-gray-300 rounded-[4px] text-sm">
                  Annuler
                </button>
                <button type="submit" disabled={busy || !canPay || (needSession && !session)} className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-sm font-semibold disabled:opacity-50">
                  {busy ? 'Enregistrement…' : 'Encaisser'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3 bg-white border border-gray-300 rounded-[4px] overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200 text-[13px] font-bold text-gray-800">Encaissements du jour</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-[#eef5f0] text-emerald-900 text-[11px] uppercase">
                  <th className="px-3 py-1.5 text-left">N°</th>
                  <th className="px-3 py-1.5 text-left">Heure</th>
                  <th className="px-3 py-1.5 text-left">Client</th>
                  <th className="px-3 py-1.5 text-left">Document</th>
                  <th className="px-3 py-1.5 text-left">Mode</th>
                  <th className="px-3 py-1.5 text-right">Montant</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {today.map((p) => (
                  <tr key={p.id} className={p.status === 'annule' ? 'text-gray-400 line-through' : ''}>
                    <td className="px-3 py-1.5 font-mono">{p.number}</td>
                    <td className="px-3 py-1.5">{new Date(p.paid_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="px-3 py-1.5">{p.clients?.name}</td>
                    <td className="px-3 py-1.5 font-mono">{p.invoices?.number ?? p.sales_orders?.number}</td>
                    <td className="px-3 py-1.5">{p.payment_methods?.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fcfa(p.amount)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {p.status === 'confirme' && (
                        <button type="button" onClick={() => receipt(p)} className="text-emerald-700 hover:underline text-[12px] font-semibold">
                          Reçu
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {today.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                      Aucun encaissement aujourd'hui.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white border border-gray-300 rounded-[4px] p-4 space-y-2 h-fit text-sm">
          <h2 className="font-bold text-gray-800">Du jour par moyen</h2>
          {byMethod.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-gray-600">{k}</span>
              <span className="tabular-nums font-semibold">{fcfa(v)} F</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-gray-200 pt-2 font-bold">
            <span>Total</span>
            <span className="tabular-nums text-emerald-700">{fcfa(byMethod.reduce((s, [, v]) => s + v, 0))} F</span>
          </div>
        </div>
      </div>
    </div>
  )
}
