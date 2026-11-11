import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { AppContext } from '../../lib/session'
import { CoilEndReport, FDB_STATUSES, dFr, fdbStatus, loadCoilEndReports, nf } from './finBobineData'
import { printCoilEnd } from './printFinBobine'

const th = 'font-bold px-3 py-2 uppercase tracking-wide text-[11px] text-emerald-900'

// Liste des fiches fin de bobine : le magasinier les établit, la direction les valide
export default function FinsBobine() {
  const ctx = useOutletContext<AppContext>()
  const navigate = useNavigate()
  const [rows, setRows] = useState<CoilEndReport[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadCoilEndReports().then((r) => {
      setRows(r)
      setLoading(false)
    })
  }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => (!status || r.status === status) && (!q || [r.number, r.coils?.reference, r.machine, r.operator_names].some((x) => (x ?? '').toLowerCase().includes(q))))
  }, [rows, status, search])
  const count = (s: string) => rows.filter((r) => r.status === s).length

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Fiches fin de bobine</h1>
          <p className="text-sm text-gray-500 mt-0.5">Le magasinier signale à la direction une bobine utilisée jusqu'à la fin ; la validation clôture la bobine.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => printCoilEnd(null, null)} className="px-3 py-2 border border-gray-300 text-gray-700 rounded-[4px] text-sm hover:bg-gray-50">
            Fiche vierge
          </button>
          {ctx.can('stocks.coil_end') && (
            <Link to="/stocks/fins-bobine/nouvelle" className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[4px] text-sm font-medium">
              + Nouvelle fiche
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ['Brouillons', count('brouillon'), 'text-gray-800', 'brouillon'],
          ['À valider (direction)', count('soumise'), 'text-amber-700', 'soumise'],
          ['Bobines clôturées', count('validee'), 'text-emerald-700', 'validee'],
        ].map(([l, v, cls, s]) => (
          <button key={l as string} type="button" onClick={() => setStatus(status === s ? '' : (s as string))} className={`text-left bg-white border rounded-[4px] p-3 ${status === s ? 'border-emerald-500' : 'border-gray-300'}`}>
            <p className="text-xs text-gray-500">{l}</p>
            <p className={`text-xl font-bold tabular-nums ${cls}`}>{v}</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-300 rounded-[4px] p-3 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° fiche, n° bobine, machine, opérateur…" className="flex-1 min-w-[200px] h-9 border border-gray-300 rounded-[4px] px-3 text-sm" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 border border-gray-300 rounded-[4px] px-2.5 text-sm">
          <option value="">Tous les statuts</option>
          {FDB_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-gray-300 rounded-[4px] overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-[#eef5f0] border-b border-gray-300">
            <tr>
              <th className={`${th} text-left`}>N° fiche</th>
              <th className={`${th} text-left`}>Bobine</th>
              <th className={`${th} text-left`}>Machine</th>
              <th className={`${th} text-left`}>Début → fin</th>
              <th className={`${th} text-right`}>Poids étiq.</th>
              <th className={`${th} text-right`}>ml produits</th>
              <th className={`${th} text-right`}>Chutes</th>
              <th className={`${th} text-right`}>Reste</th>
              <th className={`${th} text-center`}>À signaler</th>
              <th className={`${th} text-left`}>Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shown.map((r) => {
              const s = fdbStatus(r.status)
              const ml = r.total_ml || r.coil_end_report_lines.reduce((t, l) => t + Number(l.ml_produced), 0)
              return (
                <tr key={r.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/stocks/fins-bobine/${r.id}`)}>
                  <td className="px-3 py-2 font-mono font-semibold text-emerald-800">{r.number}</td>
                  <td className="px-3 py-2 font-mono">{r.coils?.reference}</td>
                  <td className="px-3 py-2">{r.machine ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {dFr(r.started_on) || '—'} → {dFr(r.ended_on)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{nf(r.label_weight_kg, 0)} kg</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{nf(ml)} ml</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nf(r.total_scrap_kg)} kg</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nf(r.remaining_kg)} kg</td>
                  <td className="px-3 py-2 text-center">{r.to_report ? <span className="text-red-600 font-semibold">⚠ Oui</span> : <span className="text-gray-400">Non</span>}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${s.badge}`}>{s.label}</span>
                  </td>
                </tr>
              )
            })}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-gray-400">
                  Aucune fiche fin de bobine.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
