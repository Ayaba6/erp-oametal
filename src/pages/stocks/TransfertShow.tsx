import { ReactNode, useEffect, useState } from 'react'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Transfer, kg, lineKg, loadTransfer, profileNames, trfStatus } from './transfertData'
import { printTransfer } from './printTransfert'

const STEPS = [
  { key: 'brouillon', label: 'Demande', icon: '📝' },
  { key: 'soumise', label: 'À valider', icon: '⏳' },
  { key: 'validee', label: 'Transférée', icon: '🏭' },
]
const dt = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const dateFr = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR')

export default function TransfertShow() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const ctx = useOutletContext<AppContext>()
  const [t, setT] = useState<Transfer | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [ask, setAsk] = useState<null | 'submit' | 'approve' | 'reject' | 'back' | 'cancel'>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(params.get('erreur') ? { ok: false, text: params.get('erreur')! } : null)

  async function reload() {
    const x = await loadTransfer(id!)
    setT(x)
    if (x) setNames(await profileNames([x.created_by, x.submitted_by, x.decided_by]))
  }
  useEffect(() => {
    reload()
  }, [id])

  if (!t) return null
  const st = trfStatus(t.status)
  const total = t.stock_transfer_lines.reduce((s, l) => s + lineKg(l), 0)
  const idx = STEPS.findIndex((s) => s.key === t.status)
  const canEdit = t.status === 'brouillon' && ctx.can('stocks.transfer')
  const canDecide = t.status === 'soumise' && ctx.can('stocks.transfer.approve')

  async function act(kind: NonNullable<typeof ask>) {
    if ((kind === 'reject' || kind === 'back') && !note.trim()) return setMsg({ ok: false, text: 'Indiquez le motif.' })
    setBusy(true)
    setMsg(null)
    const res =
      kind === 'submit'
        ? await supabase.rpc('submit_transfer', { p_transfer: t!.id })
        : kind === 'approve'
          ? await supabase.rpc('approve_transfer', { p_transfer: t!.id })
          : kind === 'cancel'
            ? await supabase.rpc('cancel_transfer', { p_transfer: t!.id })
            : await supabase.rpc('reject_transfer', { p_transfer: t!.id, p_note: note.trim(), p_back: kind === 'back' })
    await reload()
    setBusy(false)
    setAsk(null)
    setNote('')
    if (res.error) return setMsg({ ok: false, text: res.error.message })
    const texts = {
      submit: 'Demande soumise à la direction.',
      approve: `${res.data} bobine(s) transférée(s) au dépôt ${t!.dest?.name}.`,
      cancel: 'Demande annulée.',
      reject: 'Demande refusée.',
      back: 'Demande renvoyée au magasinier pour correction.',
    }
    setMsg({ ok: true, text: texts[kind] })
  }

  const questions = {
    submit: `Soumettre la demande (${t.stock_transfer_lines.length} bobine(s), ${kg(total)} kg) à la direction ?`,
    approve: `Valider le transfert de ${t.stock_transfer_lines.length} bobine(s) (${kg(total)} kg) de ${t.source?.name} vers ${t.dest?.name} ? Le mouvement de stock est immédiat.`,
    reject: 'Refuser cette demande ? Indiquez le motif :',
    back: 'Renvoyer la demande au magasinier pour correction ? Indiquez le motif :',
    cancel: 'Annuler cette demande ?',
  }

  const info = (label: string, value: ReactNode) => (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className="mt-0.5 text-gray-800">{value || '—'}</dd>
    </div>
  )
  const btn = 'px-3 py-2 rounded-[4px] text-sm font-medium disabled:opacity-60'
  const outline = 'border border-gray-300 text-gray-700 hover:bg-gray-50'

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-[4px] border border-gray-300 px-5 py-4">
        <div className="flex items-start justify-between max-w-xl mx-auto">
          {STEPS.map((s, i) => {
            const done = idx >= 0 && i < idx
            const current = i === idx
            return (
              <div key={s.key} className="flex flex-col items-center relative" style={{ flex: 1 }}>
                {i > 0 && <div className={`absolute left-0 right-1/2 h-0.5 ${idx >= 0 && i <= idx ? 'bg-emerald-600' : 'bg-gray-200'}`} style={{ top: 14 }} />}
                {i < STEPS.length - 1 && <div className={`absolute left-1/2 right-0 h-0.5 ${idx >= 0 && i < idx ? 'bg-emerald-600' : 'bg-gray-200'}`} style={{ top: 14 }} />}
                <div
                  className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center ring-2 text-sm ${
                    done ? 'bg-emerald-700 ring-emerald-700 text-white' : current ? 'bg-white ring-emerald-600 shadow-md' : 'bg-white ring-gray-200 grayscale opacity-60'
                  }`}
                >
                  {done ? '✓' : s.icon}
                </div>
                <span className={`mt-1.5 text-xs font-medium ${current ? 'text-emerald-800' : 'text-gray-500'}`}>{s.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-[4px] border border-gray-300 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-gray-900 font-mono">{t.number}</h1>
            <span className={`inline-flex px-2.5 py-1 rounded-[3px] text-xs font-semibold ${st.badge}`}>{st.label}</span>
            <span className="text-gray-500 text-sm">
              {t.source?.name} → {t.dest?.name}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <Link to={`/stocks/transferts/${t.id}/modifier`} className={`${btn} ${outline}`}>
                  Modifier
                </Link>
                <button type="button" disabled={busy} onClick={() => setAsk('submit')} className={`${btn} bg-blue-600 hover:bg-blue-700 text-white`}>
                  Soumettre à la direction
                </button>
              </>
            )}
            {canDecide && (
              <>
                <button type="button" disabled={busy} onClick={() => setAsk('back')} className={`${btn} border border-amber-400 text-amber-800 hover:bg-amber-50`}>
                  Renvoyer au magasinier
                </button>
                <button type="button" disabled={busy} onClick={() => setAsk('reject')} className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}>
                  Refuser
                </button>
                <button type="button" disabled={busy} onClick={() => setAsk('approve')} className={`${btn} bg-emerald-700 hover:bg-emerald-800 text-white`}>
                  Valider le transfert
                </button>
              </>
            )}
            {(t.status === 'brouillon' || t.status === 'soumise') && ctx.can('stocks.transfer') && (
              <button type="button" disabled={busy} onClick={() => setAsk('cancel')} className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}>
                Annuler la demande
              </button>
            )}
            <button type="button" onClick={() => printTransfer(t, names)} className={`${btn} ${outline}`}>
              Imprimer
            </button>
            <Link to="/stocks/mouvements?tab=demandes" className={`${btn} ${outline}`}>
              Retour
            </Link>
          </div>
        </div>
      </div>

      {t.status === 'soumise' && !canDecide && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-[4px] px-4 py-2">
          Demande soumise le {dt(t.submitted_at)}. En attente de la validation de la direction : les bobines sont encore au dépôt {t.source?.name}.
        </div>
      )}
      {canDecide && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 text-sm rounded-[4px] px-4 py-2">
          <b>Validation de la direction attendue.</b> Demande de {t.submitted_by ? names[t.submitted_by] : 'magasin'} le {dt(t.submitted_at)}.
        </div>
      )}
      {t.decision_note && t.status !== 'validee' && (
        <div className={`text-sm rounded-[4px] px-4 py-2 border ${t.status === 'refusee' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <b>{t.status === 'refusee' ? 'Refusée par la direction' : 'Renvoyée par la direction'}</b>
          {t.decided_by ? ` (${names[t.decided_by] ?? ''}, ${dt(t.decided_at)})` : ''} : {t.decision_note}
        </div>
      )}

      {ask && (
        <div className="bg-amber-50 rounded-[4px] border border-amber-300 p-4 space-y-2">
          <p className="text-sm text-gray-800">{questions[ask]}</p>
          {(ask === 'reject' || ask === 'back') && (
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-[4px] px-3 py-1.5 text-sm" />
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAsk(null)} className={`px-3 py-1.5 rounded-[4px] text-sm ${outline}`}>
              Non
            </button>
            <button type="button" disabled={busy} onClick={() => act(ask)} className="px-3 py-1.5 rounded-[4px] text-sm font-medium bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60">
              Oui, confirmer
            </button>
          </div>
        </div>
      )}
      {msg && (
        <div className={`text-sm rounded-[4px] px-4 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
          {msg.ok && t.status === 'validee' && (
            <Link to="/stocks/bobines" className="ml-2 underline">
              Voir les bobines
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[4px] border border-gray-300 p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Demande</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {info('Date', dateFr(t.transfer_date))}
            {info('Motif', t.reason)}
            {info('Dépôt source', `${t.source?.code} — ${t.source?.name}`)}
            {info('Dépôt destination', `${t.dest?.code} — ${t.dest?.name}`)}
            {t.comment && <div className="sm:col-span-2">{info('Commentaire', t.comment)}</div>}
          </dl>
        </div>
        <div className="bg-white rounded-[4px] border border-gray-300 p-5 space-y-3 h-fit text-sm">
          <h2 className="text-base font-semibold text-gray-900">Suivi</h2>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Demandée par</span>
            <span className="font-medium text-right">{t.created_by ? names[t.created_by] : '—'}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Soumise</span>
            <span className="font-medium text-right">{dt(t.submitted_at)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-gray-500">Décision</span>
            <span className="font-medium text-right">{t.decided_at ? `${dt(t.decided_at)} · ${t.decided_by ? names[t.decided_by] ?? '' : ''}` : '—'}</span>
          </div>
          <div className="border-t border-gray-200 pt-3 flex justify-between">
            <span className="font-bold text-gray-900">Total</span>
            <span className="font-bold text-emerald-700 tabular-nums">
              {t.stock_transfer_lines.length} bobine(s) · {kg(total)} kg
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Bobines demandées</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                <th className="px-3 py-1.5 text-left">#</th>
                <th className="px-3 py-1.5 text-left">N° bobine</th>
                <th className="px-3 py-1.5 text-left">Article</th>
                <th className="px-3 py-1.5 text-left">N° lot</th>
                <th className="px-3 py-1.5 text-right">Poids (kg)</th>
                <th className="px-3 py-1.5 text-right">Métrage (m)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {t.stock_transfer_lines.map((l, i) => (
                <tr key={l.id}>
                  <td className="px-3 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono font-semibold whitespace-nowrap">{l.coils?.reference}</td>
                  <td className="px-3 py-1.5">
                    <span className="font-mono text-gray-500 text-xs">{l.products?.code}</span> {l.products?.name}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-600 whitespace-nowrap">{l.coils?.lot_number ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{kg(lineKg(l))}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{l.coils?.length_m ? kg(Number(l.coils.length_m)) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-300 font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-1.5">
                  Total
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{kg(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
