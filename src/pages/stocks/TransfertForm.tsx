import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Warehouse, loadWarehouses } from '../../lib/depots'
import { Field, Section, Select, btnAbandon, btnSave, fi, fta } from '../../components/A3Form'
import { Coil, loadCoils } from './bobineData'
import { REASONS, kg, loadTransfer } from './transfertData'

const today = () => new Date().toISOString().slice(0, 10)

// Fiche de demande de transfert : le magasinier choisit le dépôt, coche les bobines et soumet à la direction
export default function TransfertForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [coils, setCoils] = useState<Coil[]>([])
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [number, setNumber] = useState('')
  const [date, setDate] = useState(today())
  const [source, setSource] = useState('')
  const [dest, setDest] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [comment, setComment] = useState('')
  const [article, setArticle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      loadWarehouses(),
      loadCoils(),
      supabase.from('stock_transfer_lines').select('coil_id, transfer_id, stock_transfers!inner(status)').in('stock_transfers.status', ['brouillon', 'soumise']),
      id ? loadTransfer(id) : Promise.resolve(null),
    ]).then(([w, c, open, t]) => {
      const active = w.filter((d) => d.is_active)
      setDepots(active)
      setCoils(c)
      setBusyIds(new Set(((open.data as unknown as { coil_id: string; transfer_id: string }[]) ?? []).filter((x) => x.transfer_id !== id).map((x) => x.coil_id)))
      if (t) {
        if (t.status !== 'brouillon') return navigate(`/stocks/transferts/${t.id}`, { replace: true })
        setNumber(t.number)
        setDate(t.transfer_date)
        setSource(t.source_warehouse_id)
        setDest(t.dest_warehouse_id)
        setReason(t.reason)
        setComment(t.comment ?? '')
        setPicked(new Set(t.stock_transfer_lines.map((l) => l.coil_id)))
      } else {
        const prod = active.find((d) => d.type === 'production' && d.is_default) ?? active.find((d) => d.type === 'production')
        setDest(params.get('dest') || prod?.id || '')
        if (params.get('source')) setSource(params.get('source')!)
        if (params.get('bobines')) setPicked(new Set(params.get('bobines')!.split(',').filter(Boolean)))
      }
    })
  }, [id])

  // Bobines réellement présentes au dépôt choisi
  const available = useMemo(
    () =>
      source ? coils.filter((c) => c.warehouse_id === source && c.status === 'disponible' && Number(c.remaining_weight_kg) > 0 && !busyIds.has(c.id)) : [],
    [coils, source, busyIds],
  )
  const articles = useMemo(() => {
    const m = new Map<string, string>()
    available.forEach((c) => c.products && m.set(c.product_id, `${c.products.code} — ${c.products.name}`))
    return [...m.entries()]
  }, [available])
  const shown = available.filter((c) => !article || c.product_id === article)
  const chosen = available.filter((c) => picked.has(c.id))
  const totalKg = chosen.reduce((s, c) => s + Number(c.remaining_weight_kg), 0)

  function toggle(cid: string) {
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(cid)) n.delete(cid)
      else n.add(cid)
      return n
    })
  }

  async function save(submit: boolean) {
    setError(null)
    if (!source) return setError('Sélectionnez le dépôt source.')
    if (!dest || dest === source) return setError('Choisissez un dépôt destination différent du dépôt source.')
    if (chosen.length === 0) return setError('Cochez au moins une bobine.')
    setSaving(true)
    const row = { transfer_date: date || today(), source_warehouse_id: source, dest_warehouse_id: dest, reason: reason.trim() || REASONS[0], comment: comment.trim() || null }
    let tid = id
    if (editing) {
      const r = await supabase.from('stock_transfers').update(row).eq('id', id!)
      if (r.error) return fail(r.error.message)
      const d = await supabase.from('stock_transfer_lines').delete().eq('transfer_id', id!)
      if (d.error) return fail(d.error.message)
    } else {
      const r = await supabase.from('stock_transfers').insert(row).select('id').single()
      if (r.error) return fail(r.error.message)
      tid = (r.data as { id: string }).id
    }
    const r = await supabase.from('stock_transfer_lines').insert(chosen.map((c, i) => ({ transfer_id: tid, coil_id: c.id, product_id: c.product_id, position: i + 1 })))
    if (r.error) return fail(r.error.message)
    if (submit) {
      const s = await supabase.rpc('submit_transfer', { p_transfer: tid })
      if (s.error) {
        setSaving(false)
        if (!editing) return navigate(`/stocks/transferts/${tid}?erreur=${encodeURIComponent(s.error.message)}`)
        return setError(s.error.message)
      }
    }
    setSaving(false)
    navigate(`/stocks/transferts/${tid}`)
  }
  function fail(m: string) {
    setSaving(false)
    setError("L'enregistrement a échoué : " + m)
  }

  const thc = 'px-2 py-1.5 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        save(false)
      }}
      className="space-y-3 max-w-5xl"
    >
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
      <div className="bg-white border border-gray-300 rounded-[4px]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white">
          <h2 className="text-[15px] font-bold text-gray-900">{editing ? `Demande de transfert ${number}` : 'Nouvelle demande de transfert'}</h2>
          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className={btnSave}>
              Enregistrer
            </button>
            <button
              type="button"
              disabled={saving || chosen.length === 0}
              onClick={() => save(true)}
              className="text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-[4px] disabled:opacity-50"
            >
              Soumettre à la direction
            </button>
            <button type="button" onClick={() => navigate(editing ? `/stocks/transferts/${id}` : '/stocks/mouvements?tab=demandes')} className={btnAbandon}>
              Abandon
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <Section title="1. Demande">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
              <Field label="Dépôt source" required className="sm:col-span-4">
                <Select
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value)
                    setPicked(new Set())
                    setArticle('')
                  }}
                >
                  <option value="">— Sélectionner le dépôt —</option>
                  {depots
                    .filter((d) => d.id !== dest)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Vers" required className="sm:col-span-4">
                <Select value={dest} onChange={(e) => setDest(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {depots
                    .filter((d) => d.id !== source)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Date" className="sm:col-span-2">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fi} />
              </Field>
              <Field label="Motif" className="sm:col-span-2">
                <input list="motifs" value={reason} onChange={(e) => setReason(e.target.value)} className={fi} />
                <datalist id="motifs">
                  {REASONS.map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
              </Field>
              <Field label="Commentaire pour la direction" className="sm:col-span-12">
                <textarea rows={1} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Ex : pour la production de la commande client…" className={fta} />
              </Field>
            </div>
          </Section>

          <Section
            title={`2. Bobines à transférer — ${chosen.length} cochée(s) · ${kg(totalKg)} kg`}
            className="overflow-hidden"
            right={
              source ? (
                <div className="w-56">
                  <Select value={article} onChange={(e) => setArticle(e.target.value)} className="!h-7 text-[12px]">
                    <option value="">Tous les articles</option>
                    {articles.map(([aid, l]) => (
                      <option key={aid} value={aid}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : undefined
            }
          >
            {!source ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">Sélectionnez le dépôt source : la liste des bobines présentes s'affichera ici.</p>
            ) : (
              <div className="overflow-x-auto max-h-[55vh]">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[#eef5f0] border-b border-gray-300 sticky top-0">
                    <tr>
                      <th className={`${thc} w-10 text-center`}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-emerald-600"
                          checked={shown.length > 0 && shown.every((c) => picked.has(c.id))}
                          onChange={(e) =>
                            setPicked((p) => {
                              const n = new Set(p)
                              shown.forEach((c) => (e.target.checked ? n.add(c.id) : n.delete(c.id)))
                              return n
                            })
                          }
                        />
                      </th>
                      <th className={`${thc} text-left`}>N° bobine</th>
                      <th className={`${thc} text-left`}>Article</th>
                      <th className={`${thc} text-left`}>N° lot</th>
                      <th className={`${thc} text-right`}>Poids restant (kg)</th>
                      <th className={`${thc} text-right`}>Métrage (m)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shown.map((c) => {
                      const on = picked.has(c.id)
                      return (
                        <tr key={c.id} onClick={() => toggle(c.id)} className={`cursor-pointer ${on ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-2 py-1.5 text-center">
                            <input type="checkbox" checked={on} onChange={() => toggle(c.id)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-emerald-600" />
                          </td>
                          <td className="px-2 py-1.5 font-mono font-semibold text-gray-800 whitespace-nowrap">{c.reference}</td>
                          <td className="px-2 py-1.5 text-gray-700">
                            <span className="font-mono text-gray-500">{c.products?.code}</span> {c.products?.name}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-gray-600 whitespace-nowrap">{c.lot_number ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{kg(Number(c.remaining_weight_kg))}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-600">{c.length_m ? kg(Number(c.length_m)) : '—'}</td>
                        </tr>
                      )
                    })}
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                          Aucune bobine disponible dans ce dépôt.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {chosen.length > 0 && (
                    <tfoot className="bg-gray-50 border-t border-gray-300 font-semibold">
                      <tr>
                        <td colSpan={4} className="px-2 py-1.5">
                          {chosen.length} bobine(s) cochée(s)
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{kg(totalKg)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Section>
        </div>
        <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-[4px] bg-[#eef5f0] border border-emerald-100 text-[12px] text-gray-600">
          <span className="text-emerald-700">ⓘ</span>
          La demande est soumise à la <strong className="text-emerald-800">direction</strong>. Dès qu'elle est validée, les bobines passent automatiquement au dépôt destination.
        </div>
      </div>
    </form>
  )
}
