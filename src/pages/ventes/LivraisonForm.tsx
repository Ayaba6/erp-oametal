import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Field, FormCard, Section, fi, fta } from '../../components/A3Form'
import { DocLine, SalesOrder, loadDelivery, loadSalesOrder, qty, today, unitOf } from './salesData'

// Bon de livraison : on reprend les lignes de la commande restant à livrer
type Row = { line: DocLine; rest: number; value: string; sheets: string }
const n = (s: string) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

export default function LivraisonForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<SalesOrder | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [stock, setStock] = useState(new Map<string, number>())
  const [h, setH] = useState({ number: '', delivered_at: today(), carrier: '', vehicle: '', notes: '' })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      const bl = id ? await loadDelivery(id) : null
      if (bl && bl.status !== 'brouillon') return navigate(`/ventes/livraisons/${bl.id}`, { replace: true })
      const o = await loadSalesOrder(bl?.order_id ?? params.get('commande') ?? '')
      if (!o) return setError('Commande introuvable.')
      setOrder(o)
      const { data } = await supabase.from('stock_levels').select('product_id, quantity').eq('warehouse_id', o.warehouse_id)
      setStock(new Map(((data as { product_id: string; quantity: number }[]) ?? []).map((r) => [r.product_id, Number(r.quantity)])))
      if (bl) setH({ number: bl.number, delivered_at: bl.delivered_at, carrier: bl.carrier ?? '', vehicle: bl.vehicle ?? '', notes: bl.notes ?? '' })
      setRows(
        o.document_lines
          .map((l) => {
            const rest = Math.max(0, Number(l.quantity) - Number(l.delivered_qty))
            const existing = bl?.document_lines.find((x) => x.source_line_id === l.id)
            return {
              line: l,
              rest,
              value: existing ? String(existing.quantity) : rest ? String(rest) : '',
              sheets: existing?.sheets_count ? String(existing.sheets_count) : l.sheets_count && rest === Number(l.quantity) ? String(l.sheets_count) : '',
            }
          })
          .filter((r) => r.rest > 0),
      )
    })()
  }, [id])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!order) return
    setError(null)
    const chosen = rows.filter((r) => n(r.value) > 0)
    if (chosen.length === 0) return setError('Indiquez au moins une quantité à livrer.')
    const over = chosen.find((r) => n(r.value) > r.rest + 0.0005)
    if (over) return setError(`« ${over.line.description} » : on ne peut pas livrer plus que le reste (${qty(over.rest, 3)}).`)
    setSaving(true)
    const head = { delivered_at: h.delivered_at, carrier: h.carrier.trim() || null, vehicle: h.vehicle.trim().toUpperCase() || null, notes: h.notes.trim() || null }
    let blId = id
    if (id) {
      const r = await supabase.from('deliveries').update(head).eq('id', id)
      if (r.error) return fail(r.error.message)
      const d = await supabase.from('document_lines').delete().eq('delivery_id', id)
      if (d.error) return fail(d.error.message)
    } else {
      const r = await supabase.from('deliveries').insert({ ...head, order_id: order.id, client_id: order.client_id, warehouse_id: order.warehouse_id }).select('id').single()
      if (r.error) return fail(r.error.message)
      blId = (r.data as { id: string }).id
    }
    const lines = chosen.map((r, i) => ({
      delivery_id: blId,
      source_line_id: r.line.id,
      position: i + 1,
      product_id: r.line.product_id,
      description: r.line.description,
      sheets_count: n(r.sheets) > 0 ? Math.round(n(r.sheets)) : null,
      length_m: r.line.length_m,
      quantity: n(r.value),
      unit_price: r.line.unit_price,
      discount_pct: r.line.discount_pct,
      vat_rate: r.line.vat_rate,
    }))
    const r = await supabase.from('document_lines').insert(lines)
    if (r.error) return fail(r.error.message)
    setSaving(false)
    navigate(`/ventes/livraisons/${blId}`)
  }
  function fail(m: string) {
    setSaving(false)
    setError("L'enregistrement a échoué : " + m)
  }

  const thc = 'px-2 py-2 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'

  return (
    <form onSubmit={onSubmit} className="space-y-3 max-w-6xl">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
      <FormCard
        title={id ? `Bon de livraison : Modification — ${h.number}` : `Bon de livraison : Création${order ? ` — commande ${order.number}` : ''}`}
        onAbandon={() => navigate(id ? `/ventes/livraisons/${id}` : order ? `/ventes/commandes/${order.id}` : '/ventes/livraisons')}
        saving={saving}
      >
        <div className="p-4 space-y-4">
          <Section title="Livraison">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
              <Field label="Client" className="sm:col-span-4">
                <input value={order?.clients?.name ?? ''} readOnly className={`${fi} bg-gray-50`} />
              </Field>
              <Field label="Date de livraison" required className="sm:col-span-2">
                <input type="date" required value={h.delivered_at} onChange={(e) => setH({ ...h, delivered_at: e.target.value })} className={fi} />
              </Field>
              <Field label="Transporteur" className="sm:col-span-3">
                <input value={h.carrier} onChange={(e) => setH({ ...h, carrier: e.target.value })} className={fi} />
              </Field>
              <Field label="Véhicule" className="sm:col-span-3">
                <input value={h.vehicle} onChange={(e) => setH({ ...h, vehicle: e.target.value })} placeholder="11 BF 2567" className={`${fi} font-mono uppercase`} />
              </Field>
              <Field label="Dépôt" className="sm:col-span-4">
                <input value={order?.warehouses ? `${order.warehouses.code} — ${order.warehouses.name}` : ''} readOnly className={`${fi} bg-gray-50`} />
              </Field>
              <Field label="Observations" className="sm:col-span-8">
                <textarea rows={1} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} placeholder={order?.delivery_address ?? ''} className={fta} />
              </Field>
            </div>
          </Section>
          <Section title="Articles à livrer" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#eef5f0] border-b border-gray-300">
                  <tr>
                    <th className={`${thc} text-left`}>Article</th>
                    <th className={`${thc} text-right`}>Commandé</th>
                    <th className={`${thc} text-right`}>Déjà livré</th>
                    <th className={`${thc} text-right`}>Reste</th>
                    <th className={`${thc} text-right`}>Stock dépôt</th>
                    <th className={`${thc} text-right w-24`}>Nb tôles</th>
                    <th className={`${thc} text-right w-32`}>À livrer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r, i) => {
                    const st = r.line.product_id ? stock.get(r.line.product_id) ?? 0 : null
                    const short = st != null && n(r.value) > st
                    return (
                      <tr key={r.line.id}>
                        <td className="px-2 py-1.5">
                          {r.line.description}
                          <p className="text-xs text-gray-400 font-mono">{r.line.products?.code}</p>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{qty(r.line.quantity, 3)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{qty(r.line.delivered_qty, 3)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                          {qty(r.rest, 3)} <span className="text-xs text-gray-400">{unitOf(r.line.products?.kind)}</span>
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${short ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{st == null ? '—' : qty(st, 3)}</td>
                        <td className="px-2 py-1.5">
                          <input inputMode="numeric" value={r.sheets} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, sheets: e.target.value } : x)))} className={`${fi} text-right`} />
                        </td>
                        <td className="px-2 py-1.5">
                          <input inputMode="decimal" value={r.value} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} className={`${fi} text-right font-semibold`} />
                        </td>
                      </tr>
                    )
                  })}
                  {order && rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                        Tout est déjà livré pour cette commande.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {rows.some((r) => r.line.product_id && n(r.value) > (stock.get(r.line.product_id) ?? 0)) && (
              <p className="px-3 py-1.5 text-[12px] text-amber-800 bg-amber-50 border-t border-amber-200">
                ⚠ Stock insuffisant au dépôt pour certaines lignes (en rouge). La livraison reste possible, mais le stock deviendra négatif.
              </p>
            )}
          </Section>
        </div>
      </FormCard>
    </form>
  )
}
