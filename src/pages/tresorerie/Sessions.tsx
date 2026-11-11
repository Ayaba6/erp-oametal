import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CashSession, Payment, dtFr, fcfa, loadPayments, loadSessions, profileNames } from '../ventes/salesData'

// Journal des sessions de caisse : ouverture, clôture, écarts
export default function Sessions() {
  const [rows, setRows] = useState<CashSession[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [live, setLive] = useState<Record<string, number>>({})
  const [open, setOpen] = useState<string | null>(null)
  const [pays, setPays] = useState<Payment[]>([])

  useEffect(() => {
    ;(async () => {
      const s = await loadSessions()
      setRows(s)
      setNames(await profileNames(s.map((x) => x.cashier_id)))
      // solde théorique en direct pour les caisses encore ouvertes
      const m: Record<string, number> = {}
      for (const x of s.filter((x) => x.status === 'ouverte')) {
        const { data } = await supabase.rpc('cash_session_expected', { p_session: x.id })
        m[x.id] = Number(data ?? 0)
      }
      setLive(m)
    })()
  }, [])

  async function toggle(id: string) {
    if (open === id) return setOpen(null)
    setOpen(id)
    setPays(await loadPayments({ sessionId: id }))
  }

  const th = 'px-3 py-2 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Sessions de caisse</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ouvertures, clôtures et écarts de caisse. Cliquez une ligne pour voir ses encaissements.</p>
        </div>
        <Link to="/tresorerie/caisse" className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-sm font-medium">
          Aller à la caisse
        </Link>
      </div>
      <div className="bg-white border border-gray-300 rounded-[4px] overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[#eef5f0] border-b border-gray-300">
            <tr>
              <th className={`${th} text-left`}>N°</th>
              <th className={`${th} text-left`}>Caisse</th>
              <th className={`${th} text-left`}>Caissier</th>
              <th className={`${th} text-left`}>Ouverture</th>
              <th className={`${th} text-left`}>Clôture</th>
              <th className={`${th} text-right`}>Fond</th>
              <th className={`${th} text-right`}>Théorique</th>
              <th className={`${th} text-right`}>Compté</th>
              <th className={`${th} text-right`}>Écart</th>
              <th className={`${th} text-left`}>Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((s) => {
              const expected = s.status === 'ouverte' ? live[s.id] : s.expected_balance
              const diff = s.counted_balance != null && s.expected_balance != null ? Number(s.counted_balance) - Number(s.expected_balance) : null
              return (
                <Fragment key={s.id}>
                  <tr onClick={() => toggle(s.id)} className={`cursor-pointer ${open === s.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-3 py-1.5 font-mono font-semibold text-emerald-800">{s.number}</td>
                    <td className="px-3 py-1.5">{s.cash_accounts?.name}</td>
                    <td className="px-3 py-1.5">{names[s.cashier_id] ?? ''}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{dtFr(s.opened_at)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{s.closed_at ? dtFr(s.closed_at) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fcfa(s.opening_balance)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{expected == null ? '—' : fcfa(expected)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{s.counted_balance == null ? '—' : fcfa(s.counted_balance)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${diff ? (diff < 0 ? 'text-red-600' : 'text-amber-700') : 'text-gray-500'}`} title={s.difference_reason ?? ''}>
                      {diff == null ? '—' : fcfa(diff)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.status === 'ouverte' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{s.status === 'ouverte' ? 'Ouverte' : 'Clôturée'}</span>
                    </td>
                  </tr>
                  {open === s.id && (
                    <tr>
                      <td colSpan={10} className="bg-gray-50 px-6 py-3">
                        {s.difference_reason && <p className="text-[12px] text-amber-800 mb-2">Motif d'écart : {s.difference_reason}</p>}
                        <table className="w-full text-[12px]">
                          <tbody className="divide-y divide-gray-200">
                            {pays.map((p) => (
                              <tr key={p.id} className={p.status === 'annule' ? 'line-through text-gray-400' : ''}>
                                <td className="py-1 font-mono">{p.number}</td>
                                <td className="py-1">{dtFr(p.paid_at)}</td>
                                <td className="py-1">{p.clients?.name}</td>
                                <td className="py-1 font-mono">{p.invoices?.number ?? p.sales_orders?.number}</td>
                                <td className="py-1">{p.payment_methods?.name}</td>
                                <td className="py-1 text-right tabular-nums font-semibold">{fcfa(p.amount)}</td>
                              </tr>
                            ))}
                            {pays.length === 0 && (
                              <tr>
                                <td className="py-2 text-gray-400">Aucun encaissement dans cette session.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-400">
                  Aucune session de caisse.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
