import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Ask, Confirm, DocHeader, Msg, Steps, amber, btn, danger, outline, pdf, primary } from '../ventes/DocParts'
import { profileNames } from '../ventes/salesData'
import { CoilEndReport, DEFECTS, FdbCoil, FdbLine, dFr, fdbStatus, loadCoilEndReport, loadCoilForReport, loadCoilsForReport, loadProductionLinesCodes, loadUsage, nf } from './finBobineData'
import { printCoilEnd } from './printFinBobine'

// Fiche fin de bobine : saisie par le magasinier (brouillon), soumission, décision de la direction

type Head = {
  coil_id: string
  machine: string
  supplier_name: string
  color: string
  thickness_mm: string
  width_mm: string
  label_weight_kg: string
  started_on: string
  ended_on: string
  defect_rust: boolean
  defect_paint: boolean
  defect_edges: boolean
  defect_deformed: boolean
  defect_other: boolean
  defect_other_text: string
  remaining_kg: string
  measured_thickness_mm: string
  total_scrap_kg: string
  to_report: boolean
  notes: string
  operator_names: string
  team_leader: string
}
type Row = { used_on: string; shift: string; sheet_no: string; ml: string; scrap: string; operator: string; notes: string; production_order_id: string | null }

const num = (s: string) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(v) ? 0 : v
}
const opt = (s: string) => (s.trim() === '' ? null : num(s))
const str = (v: unknown) => (v == null ? '' : String(v))
const today = () => new Date().toISOString().slice(0, 10)
const emptyRow = (): Row => ({ used_on: today(), shift: '', sheet_no: '', ml: '', scrap: '', operator: '', notes: '', production_order_id: null })

const fi = 'w-full h-9 px-2.5 border border-[#c3d3c9] rounded-[3px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400 disabled:bg-gray-50'
const ci = 'w-full h-8 px-2 border border-[#c3d3c9] rounded-[3px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 disabled:bg-gray-50'
const lbl = 'block text-[11px] font-bold text-gray-700 mb-1'
const sec = 'px-4 py-1.5 border-b border-gray-200 bg-[#eef5f0] text-[13px] font-bold text-emerald-900 uppercase'

function headFrom(c: FdbCoil): Partial<Head> {
  return {
    coil_id: c.id,
    supplier_name: c.suppliers?.name ?? '',
    color: c.color ?? c.products?.color ?? '',
    thickness_mm: str(c.thickness_mm ?? c.products?.thickness_mm ?? ''),
    width_mm: str(c.width_mm ?? ''),
    label_weight_kg: str(c.initial_weight_kg ?? ''),
  }
}

export default function FinBobine() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [rep, setRep] = useState<CoilEndReport | null>(null)
  const [coil, setCoil] = useState<FdbCoil | null>(null)
  const [coils, setCoils] = useState<FdbCoil[]>([])
  const [machines, setMachines] = useState<string[]>([])
  const [h, setH] = useState<Head>({
    coil_id: '', machine: '', supplier_name: '', color: '', thickness_mm: '', width_mm: '', label_weight_kg: '', started_on: '', ended_on: today(),
    defect_rust: false, defect_paint: false, defect_edges: false, defect_deformed: false, defect_other: false, defect_other_text: '',
    remaining_kg: '', measured_thickness_mm: '', total_scrap_kg: '', to_report: false, notes: '', operator_names: '', team_leader: '',
  })
  const [rows, setRows] = useState<Row[]>([emptyRow()])
  const [names, setNames] = useState<Record<string, string>>({})
  const [ask, setAsk] = useState<Ask | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function pickCoil(coilId: string, withHistory: boolean) {
    const c = await loadCoilForReport(coilId)
    setCoil(c)
    if (!c) return
    setH((p) => ({ ...p, ...headFrom(c) }))
    if (withHistory) await fillHistory(coilId)
  }
  async function fillHistory(coilId: string) {
    const u = await loadUsage(coilId)
    if (u.length === 0) return setMsg({ ok: false, text: "Aucun OF confirmé n'a encore consommé cette bobine : saisissez l'historique à la main." })
    setRows(u.map((x) => ({ used_on: x.used_on, shift: '', sheet_no: x.sheet_no, ml: str(x.ml), scrap: '', operator: x.operator ?? '', notes: '', production_order_id: x.production_order_id })))
    setH((p) => ({ ...p, started_on: p.started_on || u[0].used_on, machine: p.machine || u.find((x) => x.line_code)?.line_code || '' }))
    setMsg({ ok: true, text: `Historique repris de ${u.length} OF confirmé(s). Complétez le poste, les chutes et les opérateurs.` })
  }

  async function reload() {
    setMachines(await loadProductionLinesCodes())
    if (!id) {
      setCoils(await loadCoilsForReport())
      const b = params.get('bobine')
      if (b) await pickCoil(b, true)
      return
    }
    const r = await loadCoilEndReport(id)
    setRep(r)
    if (!r) return
    setCoil(r.coils)
    setH({
      coil_id: r.coil_id, machine: r.machine ?? '', supplier_name: r.supplier_name ?? '', color: r.color ?? '', thickness_mm: str(r.thickness_mm), width_mm: str(r.width_mm),
      label_weight_kg: str(r.label_weight_kg), started_on: r.started_on ?? '', ended_on: r.ended_on, defect_rust: r.defect_rust, defect_paint: r.defect_paint,
      defect_edges: r.defect_edges, defect_deformed: r.defect_deformed, defect_other: r.defect_other, defect_other_text: r.defect_other_text ?? '',
      remaining_kg: str(r.remaining_kg), measured_thickness_mm: str(r.measured_thickness_mm), total_scrap_kg: str(r.total_scrap_kg), to_report: r.to_report,
      notes: r.notes ?? '', operator_names: r.operator_names ?? '', team_leader: r.team_leader ?? '',
    })
    setRows(
      r.coil_end_report_lines.length
        ? r.coil_end_report_lines.map((l) => ({ used_on: l.used_on ?? '', shift: l.shift ?? '', sheet_no: l.sheet_no ?? '', ml: str(l.ml_produced), scrap: Number(l.scrap_kg) ? str(l.scrap_kg) : '', operator: l.operator ?? '', notes: l.notes ?? '', production_order_id: l.production_order_id }))
        : [emptyRow()],
    )
    setNames(await profileNames([r.created_by, r.submitted_by, r.decided_by]))
  }
  useEffect(() => {
    reload()
  }, [id])

  const editable = (!rep || rep.status === 'brouillon') && ctx.can('stocks.coil_end')
  const totMl = rows.reduce((s, r) => s + num(r.ml), 0)
  const totScrap = rows.reduce((s, r) => s + num(r.scrap), 0)
  const erpLeft = Number(coil?.remaining_weight_kg ?? 0)
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)))

  async function save(): Promise<string> {
    if (!h.coil_id) throw new Error('Choisissez la bobine.')
    const lines = rows.filter((r) => num(r.ml) > 0 || r.sheet_no.trim() || num(r.scrap) > 0)
    const head = {
      coil_id: h.coil_id,
      machine: h.machine.trim() || null,
      supplier_name: h.supplier_name.trim() || null,
      color: h.color.trim() || null,
      thickness_mm: opt(h.thickness_mm),
      width_mm: opt(h.width_mm),
      label_weight_kg: opt(h.label_weight_kg),
      started_on: h.started_on || null,
      ended_on: h.ended_on || today(),
      defect_rust: h.defect_rust,
      defect_paint: h.defect_paint,
      defect_edges: h.defect_edges,
      defect_deformed: h.defect_deformed,
      defect_other: h.defect_other,
      defect_other_text: h.defect_other ? h.defect_other_text.trim() || null : null,
      remaining_kg: num(h.remaining_kg),
      measured_thickness_mm: opt(h.measured_thickness_mm),
      total_ml: lines.reduce((s, r) => s + num(r.ml), 0),
      total_scrap_kg: h.total_scrap_kg.trim() ? num(h.total_scrap_kg) : lines.reduce((s, r) => s + num(r.scrap), 0),
      to_report: h.to_report,
      notes: h.notes.trim() || null,
      operator_names: h.operator_names.trim() || null,
      team_leader: h.team_leader.trim() || null,
      updated_at: new Date().toISOString(),
    }
    let rid = id
    if (rid) {
      const u = await supabase.from('coil_end_reports').update(head).eq('id', rid)
      if (u.error) throw new Error(u.error.message)
      const d = await supabase.from('coil_end_report_lines').delete().eq('report_id', rid)
      if (d.error) throw new Error(d.error.message)
    } else {
      const ins = await supabase.from('coil_end_reports').insert(head).select('id').single()
      if (ins.error) throw new Error(ins.error.message.includes('one_active') ? 'Une fiche fin de bobine existe déjà pour cette bobine.' : ins.error.message)
      rid = (ins.data as { id: string }).id
    }
    if (lines.length) {
      const l: Omit<FdbLine, 'id'>[] = lines.map((r, i) => ({
        position: i + 1,
        used_on: r.used_on || null,
        shift: r.shift.trim() || null,
        sheet_no: r.sheet_no.trim() || null,
        ml_produced: num(r.ml),
        scrap_kg: num(r.scrap),
        operator: r.operator.trim() || null,
        notes: r.notes.trim() || null,
        production_order_id: r.production_order_id,
      }))
      const i = await supabase.from('coil_end_report_lines').insert(l.map((x) => ({ ...x, report_id: rid })))
      if (i.error) throw new Error(i.error.message)
    }
    return rid!
  }

  async function onSave() {
    setBusy(true)
    setMsg(null)
    try {
      const rid = await save()
      if (!id) return navigate(`/stocks/fins-bobine/${rid}`, { replace: true })
      setMsg({ ok: true, text: 'Fiche enregistrée.' })
      await reload()
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
    setBusy(false)
  }

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

  const s = rep ? fdbStatus(rep.status) : { label: 'Nouvelle', badge: 'bg-gray-100 text-gray-700' }
  const steps = [
    { key: 'brouillon', label: 'Saisie magasinier', icon: '📝' },
    { key: 'soumise', label: 'Soumise', icon: '📨' },
    { key: 'validee', label: 'Validée — bobine clôturée', icon: '✅' },
  ]
  const cur = !rep ? 0 : rep.status === 'annulee' ? -1 : steps.findIndex((x) => x.key === rep.status)
  const field = (k: keyof Head, label: string, extra: Record<string, unknown> = {}) => (
    <div>
      <label className={lbl}>{label}</label>
      <input value={h[k] as string} disabled={!editable} onChange={(e) => setH({ ...h, [k]: e.target.value })} className={fi} {...extra} />
    </div>
  )
  const yesNo = (k: keyof Head) => (
    <div className="flex items-center gap-4 text-[13px]">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" checked={h[k] === true} disabled={!editable} onChange={() => setH({ ...h, [k]: true })} /> Oui
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" checked={h[k] === false} disabled={!editable} onChange={() => setH({ ...h, [k]: false })} /> Non
      </label>
    </div>
  )

  return (
    <div className="space-y-3 max-w-6xl">
      <Steps steps={steps} current={cur} />
      <DocHeader number={rep?.number ?? 'Fiche fin de bobine'} badge={s} sub={coil ? `Bobine ${coil.reference}` : ''}>
        {editable && (
          <button type="button" disabled={busy} onClick={onSave} className={`${btn} ${outline}`}>
            Enregistrer
          </button>
        )}
        {editable && rep && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setAsk({
                question: 'Soumettre la fiche fin de bobine à la direction ?',
                run: async () => {
                  await save()
                  const r = await supabase.rpc('submit_coil_end', { p_report: rep.id })
                  if (r.error) throw new Error(r.error.message)
                  setMsg({ ok: true, text: 'Fiche soumise à la direction.' })
                },
              })
            }
            className={`${btn} ${amber}`}
          >
            Soumettre à la direction
          </button>
        )}
        {rep?.status === 'soumise' && ctx.can('stocks.coil_end.approve') && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAsk({
                  question: `Valider la fin de la bobine ${coil?.reference} ? Elle passe « Épuisée » et les ${nf(erpLeft, 1)} kg encore en stock dans l'ERP sortent du stock.`,
                  run: async () => {
                    const r = await supabase.rpc('validate_coil_end', { p_report: rep.id })
                    if (r.error) throw new Error(r.error.message)
                    setMsg({ ok: true, text: 'Fin de bobine validée : la bobine est clôturée.' })
                  },
                })
              }
              className={`${btn} ${primary}`}
            >
              Valider la fin de bobine
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setAsk({
                  question: 'Renvoyer la fiche au magasinier ?',
                  note: true,
                  noteLabel: 'Motif du renvoi (obligatoire)',
                  run: async (n) => {
                    const r = await supabase.rpc('return_coil_end', { p_report: rep.id, p_note: n })
                    if (r.error) throw new Error(r.error.message)
                  },
                })
              }
              className={`${btn} ${outline}`}
            >
              Renvoyer au magasinier
            </button>
          </>
        )}
        {rep && ['brouillon', 'soumise'].includes(rep.status) && ctx.can('stocks.coil_end') && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setAsk({
                question: 'Annuler cette fiche fin de bobine ?',
                run: async () => {
                  const r = await supabase.rpc('cancel_coil_end', { p_report: rep.id })
                  if (r.error) throw new Error(r.error.message)
                },
              })
            }
            className={`${btn} ${danger}`}
          >
            Annuler
          </button>
        )}
        {rep && (
          <button type="button" onClick={() => printCoilEnd(rep, coil)} className={`${btn} ${pdf}`}>
            Imprimer
          </button>
        )}
        <Link to="/stocks/fins-bobine" className={`${btn} ${outline}`}>
          Retour
        </Link>
      </DocHeader>

      {rep?.status === 'brouillon' && rep.decision_note && <div className="bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-[4px] px-4 py-2">↩ Renvoyée par la direction : {rep.decision_note}</div>}
      {ask && <Confirm ask={ask} busy={busy} note={note} setNote={setNote} onCancel={() => setAsk(null)} onOk={() => run(ask)} />}
      <Msg msg={msg} />

      {/* Bobine */}
      <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
        <div className={sec}>Bobine</div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-3">
          <div>
            <label className={lbl}>N° bobine *</label>
            {!rep && editable ? (
              <select value={h.coil_id} onChange={(e) => pickCoil(e.target.value, true)} className={fi}>
                <option value="">— Choisir la bobine —</option>
                {coils.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.reference} · {c.products?.code} · {c.warehouses?.code} · reste {nf(c.remaining_weight_kg, 0)} kg
                  </option>
                ))}
              </select>
            ) : (
              <input value={coil ? `${coil.reference}${coil.lot_number ? ' · ' + coil.lot_number : ''}` : ''} readOnly className={`${fi} bg-gray-50 font-mono`} />
            )}
          </div>
          {field('supplier_name', 'Fournisseur')}
          {field('color', 'Couleur')}
          {field('thickness_mm', 'Épaisseur (mm)', { inputMode: 'decimal' })}
          {field('width_mm', 'Largeur (mm)', { inputMode: 'decimal' })}
          {field('label_weight_kg', 'Poids étiquette (kg)', { inputMode: 'decimal' })}
          <div>
            <label className={lbl}>Machine</label>
            <input list="fdb-machines" value={h.machine} disabled={!editable} onChange={(e) => setH({ ...h, machine: e.target.value })} className={fi} />
            <datalist id="fdb-machines">
              {machines.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          {field('started_on', 'Date début', { type: 'date' })}
          {field('ended_on', 'Date fin', { type: 'date' })}
        </div>
        {coil && (
          <p className="px-4 pb-3 text-[12px] text-gray-500">
            Dans l'ERP : {coil.products?.code} — {coil.products?.name} · dépôt {coil.warehouses?.code} · poids restant enregistré <b>{nf(coil.remaining_weight_kg, 1)} kg</b>
          </p>
        )}
      </div>

      {/* Historique */}
      <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
        <div className={`${sec} flex items-center justify-between normal-case`}>
          <span className="uppercase">Historique d'utilisation (une ligne par poste)</span>
          {editable && h.coil_id && (
            <button type="button" onClick={() => fillHistory(h.coil_id)} className="text-[12px] font-semibold text-emerald-700 hover:underline normal-case">
              ↻ Reprendre depuis les OF
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase text-gray-600">
              <tr>
                <th className="px-2 py-1.5 text-left w-36">Date</th>
                <th className="px-2 py-1.5 text-left w-24">Poste</th>
                <th className="px-2 py-1.5 text-left w-32">N° fiche</th>
                <th className="px-2 py-1.5 text-right w-28">ml produits</th>
                <th className="px-2 py-1.5 text-right w-24">Chutes (kg)</th>
                <th className="px-2 py-1.5 text-left">Opérateur</th>
                <th className="px-2 py-1.5 text-left">Observations</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">
                    <input type="date" value={r.used_on} disabled={!editable} onChange={(e) => setRow(i, { used_on: e.target.value })} className={ci} />
                  </td>
                  <td className="px-2 py-1">
                    <input value={r.shift} disabled={!editable} onChange={(e) => setRow(i, { shift: e.target.value })} className={ci} />
                  </td>
                  <td className="px-2 py-1">
                    <input value={r.sheet_no} disabled={!editable} onChange={(e) => setRow(i, { sheet_no: e.target.value })} className={`${ci} font-mono`} />
                  </td>
                  <td className="px-2 py-1">
                    <input inputMode="decimal" value={r.ml} disabled={!editable} onChange={(e) => setRow(i, { ml: e.target.value })} className={`${ci} text-right font-semibold`} />
                  </td>
                  <td className="px-2 py-1">
                    <input inputMode="decimal" value={r.scrap} disabled={!editable} onChange={(e) => setRow(i, { scrap: e.target.value })} className={`${ci} text-right`} />
                  </td>
                  <td className="px-2 py-1">
                    <input value={r.operator} disabled={!editable} onChange={(e) => setRow(i, { operator: e.target.value })} className={ci} />
                  </td>
                  <td className="px-2 py-1">
                    <input value={r.notes} disabled={!editable} onChange={(e) => setRow(i, { notes: e.target.value })} className={ci} />
                  </td>
                  <td className="px-1 text-center">
                    {editable && (
                      <button type="button" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyRow()]))} className="text-red-500 hover:text-red-700" title="Supprimer la ligne">
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-bold">
              <tr>
                <td className="px-2 py-1.5" colSpan={3}>
                  {editable && (
                    <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="text-[12px] font-semibold text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-[3px]">
                      + Ajouter une ligne
                    </button>
                  )}
                  <span className="float-right">TOTAL</span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{nf(totMl)} ml</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{nf(totScrap)} kg</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Contrôle visuel */}
        <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
          <div className={sec}>Contrôle visuel de la bobine</div>
          <div className="divide-y divide-gray-100">
            {DEFECTS.map(([k, l]) => (
              <div key={k} className="px-4 py-2 flex items-center justify-between gap-3">
                <span className="text-[13px] text-gray-800">{l}</span>
                {yesNo(k as keyof Head)}
              </div>
            ))}
            {h.defect_other && (
              <div className="px-4 py-2">
                <input value={h.defect_other_text} disabled={!editable} onChange={(e) => setH({ ...h, defect_other_text: e.target.value })} placeholder="Préciser l'autre défaut" className={fi} />
              </div>
            )}
          </div>
        </div>

        {/* Fin de bobine */}
        <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
          <div className={sec}>Fin de bobine</div>
          <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {field('remaining_kg', 'Reste / queue de bobine (kg)', { inputMode: 'decimal' })}
            {field('measured_thickness_mm', 'Épaisseur mesurée (mm)', { inputMode: 'decimal' })}
            <div>
              <label className={lbl}>Total ml produits</label>
              <input value={`${nf(totMl)} ml`} readOnly className={`${fi} bg-gray-50 font-semibold`} />
            </div>
            {field('total_scrap_kg', 'Total chutes (kg)', { inputMode: 'decimal', placeholder: totScrap ? nf(totScrap) : '' })}
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-gray-800">Bobine à signaler ?</span>
              {yesNo('to_report')}
            </div>
          </div>
          {coil && rep?.status !== 'validee' && (
            <p className="px-4 pb-3 text-[12px] text-gray-600">
              À la validation, les <b>{nf(erpLeft, 1)} kg</b> encore enregistrés sur la bobine sortent du stock (reste déclaré {nf(num(h.remaining_kg), 1)} kg, chutes {nf(h.total_scrap_kg.trim() ? num(h.total_scrap_kg) : totScrap, 1)} kg).
            </p>
          )}
        </div>
      </div>

      <div className="bg-white border border-gray-300 rounded-[4px] overflow-hidden">
        <div className={sec}>Observations et signatures</div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
          <div className="sm:col-span-2">
            <label className={lbl}>Observations</label>
            <textarea rows={2} value={h.notes} disabled={!editable} onChange={(e) => setH({ ...h, notes: e.target.value })} className={`${fi} h-auto py-2`} />
          </div>
          {field('operator_names', 'Opérateur(s)')}
          {field('team_leader', "Chef d'équipe")}
        </div>
        {rep && (
          <p className="px-4 pb-3 text-[12px] text-gray-500">
            Établie par {rep.created_by ? names[rep.created_by] ?? '' : '—'}
            {rep.submitted_at && ` · soumise le ${dFr(rep.submitted_at)}${rep.submitted_by ? ' par ' + (names[rep.submitted_by] ?? '') : ''}`}
            {rep.decided_at && ` · validée le ${dFr(rep.decided_at)}${rep.decided_by ? ' par ' + (names[rep.decided_by] ?? '') : ''}`}
          </p>
        )}
      </div>

      {editable && (
        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={onSave} className={`${btn} ${primary}`}>
            {rep ? 'Enregistrer' : 'Créer la fiche'}
          </button>
        </div>
      )}
    </div>
  )
}
