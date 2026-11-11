import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Warehouse, loadWarehouses } from '../../lib/depots'
import { Field, FormCard, Section, Select, btnAddSmall, fi, fta } from '../../components/A3Form'
import { Article, loadArticles } from '../stocks/articleData'
import { Client, addDays, fcfa, loadClients, loadQuote, loadSalesOrder, today } from './salesData'

// Formulaire commun Devis / Commande client (modèle A3 ERP : Nb tôles × Longueur = mètres)
type Kind = 'quote' | 'order'
type Line = { key: number; product_id: string; description: string; sheets: string; length: string; quantity: string; unit_price: string; discount: string; vat: string }

let seq = 0
const n = (s: string) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}
const blank = (vat = 18, discount = 0): Line => ({ key: ++seq, product_id: '', description: '', sheets: '', length: '', quantity: '', unit_price: '', discount: String(discount), vat: String(vat) })
const lineHt = (l: Line) => Math.round(n(l.quantity) * n(l.unit_price) * (1 - n(l.discount) / 100))
const lineTva = (l: Line) => Math.round((lineHt(l) * n(l.vat)) / 100)
const cell = 'w-full border border-gray-300 rounded px-1.5 py-1.5 text-[12.5px] focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'
const thc = 'px-1.5 py-2 text-[10.5px] font-bold text-emerald-900 uppercase tracking-wide whitespace-nowrap'

export default function SalesDocForm({ kind }: { kind: Kind }) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const base = kind === 'quote' ? '/ventes/devis' : '/ventes/commandes'
  const [clients, setClients] = useState<Client[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [reps, setReps] = useState<{ id: string; full_name: string }[]>([])
  const [h, setH] = useState({
    number: '',
    client_id: '',
    issued_at: today(),
    second_date: kind === 'quote' ? addDays(today(), 30) : '',
    delivery_address: '',
    warehouse_id: '',
    sales_rep_id: '',
    payment_terms: '',
    notes: '',
  })
  const [lines, setLines] = useState<Line[]>([blank()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      loadClients(),
      loadArticles(),
      loadWarehouses(),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      id ? (kind === 'quote' ? loadQuote(id) : loadSalesOrder(id)) : Promise.resolve(null),
    ]).then(([c, a, w, p, doc]) => {
      setClients(c.filter((x) => x.is_active))
      setArticles(a.filter((x) => (x.kind === 'tole' || x.kind === 'faitiere') && x.is_active))
      const wh = w.filter((d) => d.is_active)
      setDepots(wh)
      setReps((p.data as { id: string; full_name: string }[]) ?? [])
      const prod = wh.find((d) => d.type === 'production' && d.is_default) ?? wh.find((d) => d.type === 'production')
      if (doc) {
        const editable = kind === 'quote' ? ['brouillon', 'valide'].includes(doc.status) : doc.status === 'brouillon'
        if (!editable) return navigate(`${base}/${doc.id}`, { replace: true })
        const isQuote = 'valid_until' in doc
        setH({
          number: doc.number,
          client_id: doc.client_id,
          issued_at: doc.issued_at,
          second_date: (isQuote ? (doc as { valid_until: string | null }).valid_until : (doc as { delivery_date: string | null }).delivery_date) ?? '',
          delivery_address: doc.delivery_address ?? '',
          warehouse_id: doc.warehouse_id ?? prod?.id ?? '',
          sales_rep_id: doc.sales_rep_id ?? '',
          payment_terms: isQuote ? (doc as { payment_terms: string | null }).payment_terms ?? '' : '',
          notes: doc.notes ?? '',
        })
        setLines(
          doc.document_lines.map((l) => ({
            key: ++seq,
            product_id: l.product_id ?? '',
            description: l.description,
            sheets: l.sheets_count ? String(l.sheets_count) : '',
            length: l.length_m ? String(l.length_m) : '',
            quantity: String(l.quantity),
            unit_price: String(l.unit_price),
            discount: String(l.discount_pct),
            vat: String(l.vat_rate),
          })),
        )
      } else {
        setH((prev) => ({ ...prev, warehouse_id: prod?.id ?? '' }))
        const pre = c.find((x) => x.id === params.get('client'))
        if (pre) pickClient(pre)
      }
    })
  }, [id])

  const client = clients.find((c) => c.id === h.client_id)
  const vatOf = (c?: Client) => (c && !c.soumis_tva ? 0 : 18)

  function pickClient(c?: Client) {
    setH((p) => ({ ...p, client_id: c?.id ?? '', delivery_address: p.delivery_address || [c?.address, c?.quartier, c?.city].filter(Boolean).join(', '), sales_rep_id: p.sales_rep_id || c?.sales_rep_id || '' }))
    if (c) setLines((ls) => ls.map((l) => ({ ...l, vat: String(vatOf(c)), discount: l.product_id ? l.discount : String(c.default_discount ?? 0) })))
  }
  const setLine = (key: number, patch: Partial<Line>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l
        const nl = { ...l, ...patch }
        // Tôle : quantité (m) = nombre de tôles × longueur
        if (('sheets' in patch || 'length' in patch) && n(nl.sheets) > 0 && n(nl.length) > 0) nl.quantity = String(Math.round(n(nl.sheets) * n(nl.length) * 1000) / 1000)
        return nl
      }),
    )
  function pickArticle(key: number, pid: string) {
    const a = articles.find((x) => x.id === pid)
    setLine(key, { product_id: pid, description: a?.name ?? '', unit_price: a?.sale_price ? String(a.sale_price) : '' })
  }
  const kindOf = (pid: string) => articles.find((a) => a.id === pid)?.kind

  const totalHt = lines.reduce((s, l) => s + lineHt(l), 0)
  const totalTva = lines.reduce((s, l) => s + lineTva(l), 0)
  const gross = lines.reduce((s, l) => s + Math.round(n(l.quantity) * n(l.unit_price)), 0)
  const belowFloor = lines.filter((l) => {
    const a = articles.find((x) => x.id === l.product_id)
    return a?.min_sale_price && n(l.unit_price) * (1 - n(l.discount) / 100) < Number(a.min_sale_price)
  })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const filled = lines.filter((l) => l.product_id || l.description.trim())
    if (!h.client_id) return setError('Sélectionnez le client.')
    if (client?.is_blocked) return setError(`Client bloqué : ${client.blocked_reason}`)
    if (filled.length === 0) return setError('Ajoutez au moins une ligne.')
    if (filled.some((l) => !l.description.trim() || n(l.quantity) <= 0)) return setError('Chaque ligne doit avoir une désignation et une quantité.')
    if (kind === 'order' && !h.warehouse_id) return setError('Choisissez le dépôt de livraison.')
    setSaving(true)
    const t = (v: string) => v.trim() || null
    const head =
      kind === 'quote'
        ? { client_id: h.client_id, issued_at: h.issued_at, valid_until: h.second_date || null, delivery_address: t(h.delivery_address), warehouse_id: h.warehouse_id || null, sales_rep_id: h.sales_rep_id || null, payment_terms: t(h.payment_terms), notes: t(h.notes) }
        : { client_id: h.client_id, issued_at: h.issued_at, delivery_date: h.second_date || null, delivery_address: t(h.delivery_address), warehouse_id: h.warehouse_id, sales_rep_id: h.sales_rep_id || null, notes: t(h.notes) }
    const table = kind === 'quote' ? 'quotes' : 'sales_orders'
    const fk = kind === 'quote' ? 'quote_id' : 'order_id'
    let docId = id
    if (editing) {
      const r = await supabase.from(table).update(head).eq('id', id!)
      if (r.error) return fail(r.error.message)
      const d = await supabase.from('document_lines').delete().eq(fk, id!)
      if (d.error) return fail(d.error.message)
    } else {
      const r = await supabase.from(table).insert(head).select('id').single()
      if (r.error) return fail(r.error.message)
      docId = (r.data as { id: string }).id
    }
    const rows = filled.map((l, i) => ({
      [fk]: docId,
      position: i + 1,
      product_id: l.product_id || null,
      description: l.description.trim(),
      sheets_count: n(l.sheets) > 0 ? Math.round(n(l.sheets)) : null,
      length_m: n(l.length) > 0 ? n(l.length) : null,
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      discount_pct: n(l.discount),
      vat_rate: n(l.vat),
    }))
    const r = await supabase.from('document_lines').insert(rows)
    if (r.error) return fail(r.error.message)
    setSaving(false)
    navigate(`${base}/${docId}`)
  }
  function fail(m: string) {
    setSaving(false)
    setError("L'enregistrement a échoué : " + m)
  }

  const label = kind === 'quote' ? 'Devis' : 'Commande client'

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
      <FormCard title={`${label} : ${editing ? `Modification — ${h.number}` : 'Création'}`} onAbandon={() => navigate(editing ? `${base}/${id}` : base)} saving={saving}>
        <div className="p-4">
          <Section title="Informations générales">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
              <div className="sm:col-span-4 space-y-3">
                <Field label="Client" required>
                  <Select value={h.client_id} required onChange={(e) => pickClient(clients.find((c) => c.id === e.target.value))}>
                    <option value="">— Sélectionner —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                        {c.is_blocked ? ' (bloqué)' : ''}
                      </option>
                    ))}
                  </Select>
                  {client?.is_blocked && <p className="text-[11px] text-red-600 mt-1">Client bloqué : {client.blocked_reason}</p>}
                </Field>
                <Field label="Adresse de livraison">
                  <textarea rows={2} value={h.delivery_address} onChange={(e) => setH({ ...h, delivery_address: e.target.value })} className={fta} />
                </Field>
              </div>
              <div className="sm:col-span-4 space-y-3">
                <Field label={kind === 'quote' ? 'N° devis' : 'N° commande'}>
                  <input value={h.number || 'Auto à la création'} readOnly className={`${fi} font-mono bg-gray-50 text-gray-500`} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={kind === 'quote' ? 'Date du devis' : 'Date de commande'} required>
                    <input type="date" required value={h.issued_at} onChange={(e) => setH({ ...h, issued_at: e.target.value })} className={fi} />
                  </Field>
                  <Field label={kind === 'quote' ? 'Date de validité' : 'Livraison prévue'}>
                    <input type="date" value={h.second_date} onChange={(e) => setH({ ...h, second_date: e.target.value })} className={fi} />
                  </Field>
                </div>
                <Field label="Commercial">
                  <Select value={h.sales_rep_id} onChange={(e) => setH({ ...h, sales_rep_id: e.target.value })}>
                    <option value="">—</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="sm:col-span-4 space-y-3">
                <Field label="Dépôt de livraison" required={kind === 'order'}>
                  <Select value={h.warehouse_id} onChange={(e) => setH({ ...h, warehouse_id: e.target.value })}>
                    <option value="">—</option>
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                {kind === 'quote' && (
                  <Field label="Conditions de paiement">
                    <input value={h.payment_terms} onChange={(e) => setH({ ...h, payment_terms: e.target.value })} placeholder="Ex : 50 % à la commande, solde à la livraison" className={fi} />
                  </Field>
                )}
                <Field label="Observations">
                  <textarea rows={kind === 'quote' ? 1 : 3} value={h.notes} onChange={(e) => setH({ ...h, notes: e.target.value })} className={fta} />
                </Field>
              </div>
            </div>
          </Section>
        </div>

        <div className="p-4 pt-0">
          <Section
            title="Détail des articles"
            className="overflow-hidden"
            right={
              <button type="button" onClick={() => setLines((ls) => [...ls, blank(vatOf(client), client?.default_discount ?? 0)])} className={btnAddSmall}>
                + Ajouter une ligne
              </button>
            }
          >
            <div className="grid grid-cols-1 xl:grid-cols-12">
              <div className="xl:col-span-9 overflow-x-auto border-r border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-[#eef5f0] border-b border-gray-300">
                    <tr>
                      <th className={`${thc} text-left w-6`}>N°</th>
                      <th className={`${thc} text-left`}>Article</th>
                      <th className={`${thc} text-left`}>Désignation</th>
                      <th className={`${thc} text-right w-16`}>Nb tôles</th>
                      <th className={`${thc} text-right w-16`}>Long. m</th>
                      <th className={`${thc} text-right w-20`}>Qté / ml</th>
                      <th className={`${thc} text-right w-20`}>P.U. HT</th>
                      <th className={`${thc} text-right w-14`}>Rem. %</th>
                      <th className={`${thc} text-right w-20`}>Net HT</th>
                      <th className={`${thc} text-right w-12`}>TVA</th>
                      <th className={`${thc} text-right w-20`}>Total TTC</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l, i) => {
                      const isTole = kindOf(l.product_id) === 'tole'
                      return (
                        <tr key={l.key} className="hover:bg-gray-50">
                          <td className="px-1.5 py-1.5 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-1.5 py-1.5 min-w-[150px]">
                            <select value={l.product_id} onChange={(e) => pickArticle(l.key, e.target.value)} className={cell}>
                              <option value="">— Article —</option>
                              {articles.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} — {a.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-1.5 py-1.5 min-w-[170px]">
                            <input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} className={cell} />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input inputMode="numeric" disabled={!isTole} value={l.sheets} onChange={(e) => setLine(l.key, { sheets: e.target.value })} className={`${cell} text-right disabled:bg-gray-50`} />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input inputMode="decimal" disabled={!isTole} value={l.length} onChange={(e) => setLine(l.key, { length: e.target.value })} className={`${cell} text-right disabled:bg-gray-50`} />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input inputMode="decimal" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className={`${cell} text-right font-semibold`} />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} className={`${cell} text-right`} />
                          </td>
                          <td className="px-1.5 py-1.5">
                            <input inputMode="decimal" value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} className={`${cell} text-right`} />
                          </td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-xs font-medium whitespace-nowrap">{fcfa(lineHt(l))}</td>
                          <td className="px-1.5 py-1.5">
                            <input inputMode="decimal" value={l.vat} onChange={(e) => setLine(l.key, { vat: e.target.value })} className={`${cell} text-right`} style={{ minWidth: 44 }} />
                          </td>
                          <td className="px-1.5 py-1.5 text-right tabular-nums text-xs font-semibold whitespace-nowrap">{fcfa(lineHt(l) + lineTva(l))}</td>
                          <td className="px-1 py-1.5 text-center">
                            {lines.length > 1 && (
                              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-gray-300 hover:text-red-500">
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {belowFloor.length > 0 && (
                  <p className="px-3 py-1.5 text-[12px] text-amber-800 bg-amber-50 border-t border-amber-200">
                    ⚠ {belowFloor.length} ligne(s) sous le prix plancher de l'article.
                  </p>
                )}
              </div>
              <div className="xl:col-span-3 p-4 bg-[#f7faf8] space-y-2.5">
                <div className="flex justify-between text-[13px] text-gray-600">
                  <span>Total HT brut</span>
                  <span className="tabular-nums font-medium">{fcfa(gross)} F</span>
                </div>
                <div className={`flex justify-between text-[13px] ${gross > totalHt ? 'text-red-600' : 'text-gray-400'}`}>
                  <span>Remise</span>
                  <span className="tabular-nums font-medium">
                    {gross > totalHt ? '- ' : ''}
                    {fcfa(gross - totalHt)} F
                  </span>
                </div>
                <div className="flex justify-between text-[13px] text-gray-600 border-t border-gray-200 pt-2">
                  <span>Total HT</span>
                  <span className="tabular-nums font-medium">{fcfa(totalHt)} F</span>
                </div>
                <div className="flex justify-between text-[13px] text-gray-600">
                  <span>Total TVA</span>
                  <span className="tabular-nums font-medium">{fcfa(totalTva)} F</span>
                </div>
                <div className="border-t-2 border-emerald-200 pt-2.5">
                  <p className="text-[12px] font-bold text-gray-700">Total TTC</p>
                  <p className="text-[17px] font-bold text-emerald-700 tabular-nums">{fcfa(totalHt + totalTva)} FCFA</p>
                </div>
              </div>
            </div>
          </Section>
        </div>
      </FormCard>
    </form>
  )
}
