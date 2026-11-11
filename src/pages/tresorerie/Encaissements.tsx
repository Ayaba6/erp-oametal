import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Payment, dtFr, fcfa, loadPayments } from '../ventes/salesData'
import { printReceipt } from '../ventes/printSales'

// Historique de tous les encaissements, avec annulation motivée
export default function Encaissements() {
  const ctx = useOutletContext<AppContext>()
  const [rows, setRows] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('confirme')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cancel, setCancel] = useState<{ p: Payment; reason: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function reload() {
    setLoading(true)
    setRows(await loadPayments())
    setLoading(false)
  }
  useEffect(() => {
    reload()
  }, [])

  const methods = useMemo(() => [...new Set(rows.map((r) => r.payment_methods?.name).filter(Boolean) as string[])].sort(), [rows])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (status && r.status !== status) return false
      if (method && r.payment_methods?.name !== method) return false
      const d = r.paid_at.slice(0, 10)
      if (from && d < from) return false
      if (to && d > to) return false
      if (!q) return true
      return [r.number, r.clients?.name, r.clients?.code, r.sales_orders?.number, r.invoices?.number, r.reference, r.phone_number].some((x) => (x ?? '').toLowerCase().includes(q))
    })
  }, [rows, search, method, status, from, to])
  const total = shown.filter((r) => r.status === 'confirme').reduce((s, r) => s + Number(r.amount), 0)
  const todayStr = new Date().toISOString().slice(0, 10)
  const todayTotal = rows.filter((r) => r.status === 'confirme' && r.paid_at.slice(0, 10) === todayStr).reduce((s, r) => s + Number(r.amount), 0)

  async function doCancel() {
    if (!cancel) return
    if (!cancel.reason.trim()) return setMsg({ ok: false, text: 'Le motif est obligatoire.' })
    setBusy(true)
    const { error } = await supabase.rpc('cancel_payment', { p_payment: cancel.p.id, p_reason: cancel.reason.trim() })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `Encaissement ${cancel.p.number} annulé.` })
    setCancel(null)
    reload()
  }

  async function exportXlsx() {
    const XLSX = await import('xlsx')
    const data = shown.map((r) => ({
      'N°': r.number,
      Date: dtFr(r.paid_at),
      Client: r.clients?.name ?? '',
      Commande: r.sales_orders?.number ?? '',
      Facture: r.invoices?.number ?? '',
      Compte: r.cash_accounts?.name ?? '',
      Mode: r.payment_methods?.name ?? '',
      Référence: r.reference ?? r.phone_number ?? '',
      Montant: Number(r.amount),
      Statut: r.status === 'confirme' ? 'Confirmé' : 'Annulé',
      Motif: r.cancel_reason ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Encaissements')
    XLSX.writeFile(wb, `encaissements_${todayStr}.xlsx`)
  }

  const fs = 'h-9 border border-gray-300 rounded-[4px] px-2.5 text-sm bg-white'
  const th = 'px-3 py-2 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Encaissements</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historique des règlements clients.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportXlsx} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-[4px] text-sm hover:bg-gray-50">
            Export Excel
          </button>
          {ctx.can('payments.create') && (
            <Link to="/tresorerie/caisse" className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-sm font-medium">
              + Encaisser
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-300 rounded-[4px] p-3">
          <p className="text-xs text-gray-500">Encaissé aujourd'hui</p>
          <p className="text-lg font-bold tabular-nums text-emerald-700">{fcfa(todayTotal)} F</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-[4px] p-3">
          <p className="text-xs text-gray-500">Total de la sélection</p>
          <p className="text-lg font-bold tabular-nums">{fcfa(total)} F</p>
        </div>
        <div className="bg-white border border-gray-300 rounded-[4px] p-3">
          <p className="text-xs text-gray-500">Nombre</p>
          <p className="text-lg font-bold tabular-nums">{shown.length}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-300 rounded-[4px] p-3 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N°, client, commande, facture, référence…" className={`${fs} flex-1 min-w-[200px]`} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={fs}>
          <option value="">Tous les modes</option>
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={fs}>
          <option value="">Tous statuts</option>
          <option value="confirme">Confirmés</option>
          <option value="annule">Annulés</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fs} title="Du" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fs} title="Au" />
      </div>

      {msg && <div className={`text-sm rounded-[4px] px-4 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}
      {cancel && (
        <div className="bg-red-50 border border-red-200 rounded-[4px] p-4 space-y-2">
          <p className="text-sm font-semibold text-red-800">
            Annuler l'encaissement {cancel.p.number} de {fcfa(cancel.p.amount)} F ({cancel.p.clients?.name}) ? Le montant sera retiré de la commande / facture.
          </p>
          <input value={cancel.reason} onChange={(e) => setCancel({ ...cancel, reason: e.target.value })} placeholder="Motif de l'annulation (obligatoire)" className="w-full h-9 px-2.5 border border-red-300 rounded-[3px] text-sm bg-white" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancel(null)} className="px-3 py-1.5 border border-gray-300 rounded-[4px] text-sm bg-white">
              Retour
            </button>
            <button type="button" disabled={busy} onClick={doCancel} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-[4px] text-sm font-medium">
              Confirmer l'annulation
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-300 rounded-[4px] overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[#eef5f0] border-b border-gray-300">
            <tr>
              <th className={`${th} text-left`}>N°</th>
              <th className={`${th} text-left`}>Date</th>
              <th className={`${th} text-left`}>Client</th>
              <th className={`${th} text-left`}>Document</th>
              <th className={`${th} text-left`}>Compte</th>
              <th className={`${th} text-left`}>Mode</th>
              <th className={`${th} text-left`}>Référence</th>
              <th className={`${th} text-right`}>Montant</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                  Chargement…
                </td>
              </tr>
            )}
            {!loading &&
              shown.map((r) => (
                <tr key={r.id} className={r.status === 'annule' ? 'text-gray-400' : 'hover:bg-gray-50'}>
                  <td className={`px-3 py-1.5 font-mono font-semibold ${r.status === 'annule' ? 'line-through' : 'text-emerald-800'}`}>{r.number}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{dtFr(r.paid_at)}</td>
                  <td className="px-3 py-1.5">
                    <Link to={`/ventes/clients/${r.client_id}`} className="hover:underline">
                      {r.clients?.name}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 font-mono">
                    {r.invoice_id ? (
                      <Link to={`/ventes/factures/${r.invoice_id}`} className="text-emerald-700 hover:underline">
                        {r.invoices?.number}
                      </Link>
                    ) : r.order_id ? (
                      <Link to={`/ventes/commandes/${r.order_id}`} className="text-emerald-700 hover:underline">
                        {r.sales_orders?.number}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-1.5">{r.cash_accounts?.name}</td>
                  <td className="px-3 py-1.5">{r.payment_methods?.name}</td>
                  <td className="px-3 py-1.5 text-gray-600">{r.status === 'annule' ? <span className="italic">Annulé : {r.cancel_reason}</span> : r.reference ?? r.phone_number ?? ''}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fcfa(r.amount)}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap space-x-3">
                    {r.status === 'confirme' && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            printReceipt({
                              number: r.number,
                              paid_at: r.paid_at,
                              amount: Number(r.amount),
                              method: r.payment_methods?.name ?? '',
                              account: r.cash_accounts?.name ?? '',
                              reference: r.reference ?? r.phone_number,
                              client: r.clients,
                              document: r.invoices?.number ?? r.sales_orders?.number,
                              rest: r.sales_orders ? Number(r.sales_orders.total_ttc) - Number(r.sales_orders.amount_paid) : null,
                              cashier: ctx.profile?.full_name,
                            })
                          }
                          className="text-emerald-700 hover:underline font-semibold"
                        >
                          Reçu
                        </button>
                        {ctx.can('payments.cancel') && (
                          <button type="button" onClick={() => setCancel({ p: r, reason: '' })} className="text-red-600 hover:underline">
                            Annuler
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                  Aucun encaissement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
