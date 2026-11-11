import { ReactNode } from 'react'
import { DocLine, fcfa, lineTva, qty, unitOf } from './salesData'

// Éléments communs des fiches de vente (en-tête, lignes, récapitulatif, confirmation)

export const btn = 'inline-flex items-center gap-2 px-3 py-2 rounded-[4px] text-sm font-medium transition-colors disabled:opacity-60'
export const outline = 'border border-gray-300 text-gray-700 hover:bg-gray-50'
export const primary = 'bg-emerald-700 text-white hover:bg-emerald-800'
export const amber = 'bg-amber-600 text-white hover:bg-amber-700'
export const danger = 'border border-red-300 text-red-700 hover:bg-red-50'
export const pdf = 'bg-red-600 text-white hover:bg-red-700'

export function DocHeader({ number, badge, sub, children }: { number: string; badge: { label: string; badge: string }; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white rounded-[4px] border border-gray-300 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-bold text-gray-900 font-mono">{number}</h1>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-[3px] text-xs font-semibold ${badge.badge}`}>{badge.label}</span>
          <span className="text-gray-500 text-sm">{sub}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </div>
  )
}

export function Steps({ steps, current }: { steps: { key: string; label: string; icon: string }[]; current: number }) {
  return (
    <div className="bg-white rounded-[4px] border border-gray-300 px-5 py-4 overflow-x-auto">
      <div className="flex items-start justify-between px-1 py-1" style={{ minWidth: 480 }}>
        {steps.map((s, i) => {
          const done = current >= 0 && i < current
          const cur = i === current
          return (
            <div key={s.key} className="flex flex-col items-center relative" style={{ flex: 1 }}>
              {i > 0 && <div className={`absolute left-0 right-1/2 h-0.5 ${current >= 0 && i <= current ? 'bg-emerald-600' : 'bg-gray-200'}`} style={{ top: 14 }} />}
              {i < steps.length - 1 && <div className={`absolute left-1/2 right-0 h-0.5 ${current >= 0 && i < current ? 'bg-emerald-600' : 'bg-gray-200'}`} style={{ top: 14 }} />}
              <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center ring-2 text-sm ${done ? 'bg-emerald-700 ring-emerald-700 text-white' : cur ? 'bg-white ring-emerald-600 shadow-md' : 'bg-white ring-gray-200 grayscale opacity-60'}`}>
                {done ? '✓' : s.icon}
              </div>
              <span className={`mt-1.5 text-xs font-medium ${cur ? 'text-emerald-800' : 'text-gray-500'}`}>{s.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Info({ title = 'Informations', items }: { title?: string; items: [string, ReactNode][] }) {
  return (
    <div className="bg-white rounded-[4px] border border-gray-300 p-4 sm:p-5 space-y-4">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:gap-4 text-sm">
        {items
          .filter(([, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{k}</dt>
              <dd className="mt-0.5 text-gray-800">{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  )
}

export function Recap({ ht, tva, ttc, paid, extra }: { ht: number; tva: number; ttc: number; paid?: number; extra?: ReactNode }) {
  return (
    <div className="bg-white rounded-[4px] border border-gray-300 p-5 space-y-3 h-fit text-sm">
      <h2 className="text-base font-semibold text-gray-900">Récapitulatif</h2>
      <div className="flex justify-between text-gray-600">
        <span>Total HT</span>
        <span className="font-medium tabular-nums">{fcfa(ht)} FCFA</span>
      </div>
      <div className="flex justify-between text-gray-600">
        <span>Total TVA</span>
        <span className="font-medium tabular-nums">{fcfa(tva)} FCFA</span>
      </div>
      <div className="border-t border-gray-200 pt-3 flex justify-between">
        <span className="text-base font-bold text-gray-900">Total TTC</span>
        <span className="text-base font-bold text-amber-700 tabular-nums">{fcfa(ttc)} FCFA</span>
      </div>
      {paid != null && (
        <>
          <div className="flex justify-between text-emerald-700">
            <span>Encaissé</span>
            <span className="font-semibold tabular-nums">{fcfa(paid)} FCFA</span>
          </div>
          <div className={`flex justify-between ${ttc - paid > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            <span>Reste à payer</span>
            <span className="font-bold tabular-nums">{fcfa(Math.max(0, ttc - paid))} FCFA</span>
          </div>
        </>
      )}
      {extra}
    </div>
  )
}

export function Lines({ lines, title = 'Lignes', priced = true, delivered = false }: { lines: DocLine[]; title?: string; priced?: boolean; delivered?: boolean }) {
  const thc = 'px-3 py-1.5 text-xs font-bold text-emerald-900 uppercase tracking-wide'
  return (
    <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-[#eef5f0] border-b border-gray-300">
            <tr>
              <th className={`${thc} text-left`}>#</th>
              <th className={`${thc} text-left`}>Description</th>
              <th className={`${thc} text-right`}>Nb tôles</th>
              <th className={`${thc} text-right`}>Long. m</th>
              <th className={`${thc} text-right`}>Qté</th>
              {delivered && <th className={`${thc} text-right`}>Livré</th>}
              {priced && (
                <>
                  <th className={`${thc} text-right`}>Prix unit.</th>
                  <th className={`${thc} text-right`}>Remise</th>
                  <th className={`${thc} text-right`}>TVA</th>
                  <th className={`${thc} text-right`}>Total HT</th>
                  <th className={`${thc} text-right`}>Total TTC</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l, i) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-3 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                <td className="px-3 py-1.5 text-gray-900">
                  {l.description}
                  {l.products?.code && <p className="text-xs text-gray-400 font-mono">{l.products.code}</p>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{l.sheets_count ?? '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{l.length_m != null ? qty(l.length_m, 3) : '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-medium whitespace-nowrap">
                  {qty(l.quantity, 3)} <span className="text-gray-400 text-xs">{unitOf(l.products?.kind)}</span>
                </td>
                {delivered && (
                  <td className={`px-3 py-1.5 text-right tabular-nums ${Number(l.delivered_qty) >= Number(l.quantity) ? 'text-emerald-700' : 'text-amber-700'}`}>{qty(l.delivered_qty, 3)}</td>
                )}
                {priced && (
                  <>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fcfa(l.unit_price)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{Number(l.discount_pct) ? `${qty(l.discount_pct)} %` : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{qty(l.vat_rate, 0)} %</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fcfa(l.total_ht)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fcfa(Number(l.total_ht) + lineTva(l))}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export type Ask = { question: string; run: (note: string) => Promise<void>; note?: boolean; noteLabel?: string }
export function Confirm({ ask, busy, note, setNote, onCancel, onOk }: { ask: Ask; busy: boolean; note: string; setNote: (s: string) => void; onCancel: () => void; onOk: () => void }) {
  return (
    <div className="bg-amber-50 rounded-[4px] border border-amber-300 p-4 space-y-2">
      <p className="text-sm text-gray-800">{ask.question}</p>
      {ask.note && <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={ask.noteLabel} className="w-full border border-gray-300 rounded-[4px] px-3 py-1.5 text-sm" />}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`px-3 py-1.5 rounded-[4px] text-sm ${outline}`}>
          Non
        </button>
        <button type="button" disabled={busy || (ask.note && !note.trim())} onClick={onOk} className={`px-3 py-1.5 rounded-[4px] text-sm font-medium ${primary} disabled:opacity-60`}>
          Oui, confirmer
        </button>
      </div>
    </div>
  )
}

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return <div className={`text-sm rounded-[4px] px-4 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>
}
