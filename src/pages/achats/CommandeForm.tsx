import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { Warehouse, loadWarehouses } from '../../lib/depots'
import { Field, FormCard, Section, Select, btnAddSmall, fi, fnum, fta } from '../../components/A3Form'
import { Article, loadArticles } from '../stocks/articleData'
import { CURRENCIES, INCOTERMS, PAYMENT_METHODS, PAYMENT_TERMS, PRIORITIES, PoStatus, Supplier, dateTimeFr, lineHt, lineTax, loadOrder, loadSuppliers, num, poStatus } from './achatsData'

type Line = { key: number; product_id: string; description: string; coils_count: string; quantity: string; unit_price: string; discount_percent: string; tax_rate: string }
type Head = {
  number: string
  status: string
  supplier_id: string
  supplier_contact: string
  delivery_address: string
  currency: string
  buyer_id: string
  issued_at: string
  expected_at: string
  reference: string
  project_reference: string
  warehouse_id: string
  price_list: string
  payment_terms: string
  payment_method: string
  priority: string
  exchange_rate: string
  notes: string
  terms: string
  carrier: string
  vehicle_number: string
  delivery_location: string
  incoterm: string
  total_weight_kg: string
  footer_note: string
  created_at: string
}

let seq = 0
const today = () => new Date().toISOString().slice(0, 10)
const n = (s: string) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}
const newLine = (tva = 18, remise = 0): Line => ({ key: ++seq, product_id: '', description: '', coils_count: '', quantity: '1', unit_price: '0', discount_percent: String(remise), tax_rate: String(tva) })
const cell = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500'
const thc = 'px-2 py-2 text-[11px] font-bold text-emerald-900 uppercase tracking-wide'

const EMPTY: Head = {
  number: '',
  status: 'brouillon',
  supplier_id: '',
  supplier_contact: '',
  delivery_address: '',
  currency: 'XOF',
  buyer_id: '',
  issued_at: today(),
  expected_at: '',
  reference: '',
  project_reference: '',
  warehouse_id: '',
  price_list: 'Tarif fournisseur 2026',
  payment_terms: '',
  payment_method: 'virement',
  priority: 'normale',
  exchange_rate: '1',
  notes: '',
  terms: '',
  carrier: '',
  vehicle_number: '',
  delivery_location: '',
  incoterm: 'EXW',
  total_weight_kg: '',
  footer_note: '',
  created_at: '',
}

export default function CommandeForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [coils, setCoils] = useState<Article[]>([])
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [buyers, setBuyers] = useState<{ id: string; full_name: string }[]>([])
  const [h, setH] = useState<Head>(EMPTY)
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      loadSuppliers(),
      loadArticles(),
      loadWarehouses(),
      supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
      id ? loadOrder(id) : Promise.resolve(null),
    ]).then(([s, a, w, p, o]) => {
      const active = s.filter((x) => x.is_active && !x.blocage_achat)
      setSuppliers(active)
      setCoils(a.filter((x) => x.kind === 'bobine' && x.is_active))
      const wh = w.filter((x) => x.is_active)
      setDepots(wh)
      setBuyers((p.data as { id: string; full_name: string }[]) ?? [])
      const mp = wh.find((x) => x.type === 'matiere_premiere' && x.is_default) ?? wh.find((x) => x.type === 'matiere_premiere')
      if (o) {
        if (o.status !== 'brouillon') return navigate(`/achats/commandes/${o.id}`, { replace: true })
        const str = (v: unknown) => (v == null ? '' : String(v))
        setH({
          number: o.number,
          status: o.status,
          supplier_id: o.supplier_id,
          supplier_contact: str(o.supplier_contact),
          delivery_address: str(o.delivery_address),
          currency: o.currency,
          buyer_id: str(o.buyer_id),
          issued_at: o.issued_at,
          expected_at: str(o.expected_at),
          reference: str(o.reference),
          project_reference: str(o.project_reference),
          warehouse_id: o.warehouse_id,
          price_list: str(o.price_list),
          payment_terms: str(o.payment_terms),
          payment_method: o.payment_method,
          priority: o.priority,
          exchange_rate: str(o.exchange_rate),
          notes: str(o.notes),
          terms: str(o.terms),
          carrier: str(o.carrier),
          vehicle_number: str(o.vehicle_number),
          delivery_location: str(o.delivery_location),
          incoterm: o.incoterm,
          total_weight_kg: str(o.total_weight_kg),
          footer_note: str(o.footer_note),
          created_at: o.created_at,
        })
        setLines(
          o.purchase_order_lines.map((l) => ({
            key: ++seq,
            product_id: l.product_id,
            description: l.description ?? l.products?.name ?? '',
            coils_count: l.coils_count ? String(l.coils_count) : '',
            quantity: String(l.quantity),
            unit_price: String(l.unit_price),
            discount_percent: String(l.discount_percent),
            tax_rate: String(l.tax_rate),
          })),
        )
      } else {
        setH((prev) => ({ ...prev, warehouse_id: mp?.id ?? '', buyer_id: ctx.profile?.id ?? '' }))
        const pre = params.get('fournisseur')
        const sup = active.find((x) => x.id === pre)
        if (sup) applySupplier(sup, mp?.id)
      }
    })
  }, [id])

  const supplier = suppliers.find((x) => x.id === h.supplier_id)
  const set = <K extends keyof Head>(k: K, v: Head[K]) => setH((p) => ({ ...p, [k]: v }))
  const vat = (s?: Supplier) => (s ? (s.soumis_tva ? Number(s.tax_rate ?? 18) : 0) : 18)

  // Le fournisseur choisi pré-remplit conditions, dépôt, transporteur, contact principal, TVA et remise
  function applySupplier(s: Supplier | undefined, mpId?: string) {
    if (!s) return set('supplier_id', '')
    const main = (s.contacts ?? []).find((c) => c.is_primary) ?? (s.contacts ?? [])[0]
    setH((p) => ({
      ...p,
      supplier_id: s.id,
      supplier_contact: main ? [main.first_name, main.last_name].filter(Boolean).join(' ') : '',
      currency: s.currency || 'XOF',
      payment_method: s.payment_mode === 'cheque' ? 'cheque' : s.payment_mode === 'comptant' ? 'especes' : 'virement',
      payment_terms: s.payment_days ? (s.payment_days >= 90 ? '90j' : s.payment_days >= 60 ? '60j' : '30j') : p.payment_terms,
      warehouse_id: s.depot_reception_id || p.warehouse_id || mpId || '',
      carrier: p.carrier || s.transporteur || '',
    }))
    setLines((ls) => ls.map((l) => ({ ...l, tax_rate: String(vat(s)), discount_percent: l.product_id ? l.discount_percent : String(s.default_discount ?? 0) })))
  }

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  function pickProduct(key: number, pid: string) {
    const a = coils.find((c) => c.id === pid)
    setLine(key, { product_id: pid, description: a?.name ?? '', unit_price: a?.purchase_price ? String(a.purchase_price) : '0' })
  }

  // Totaux (mêmes calculs que l'A3 ERP)
  const calc = lines.map((l) => {
    const gross = Math.round(n(l.quantity) * n(l.unit_price))
    const ht = lineHt(n(l.quantity), n(l.unit_price), n(l.discount_percent))
    const tax = lineTax(ht, n(l.tax_rate))
    return { key: l.key, gross, ht, tax, ttc: ht + tax }
  })
  const grossHt = calc.reduce((s, c) => s + c.gross, 0)
  const subtotalHt = calc.reduce((s, c) => s + c.ht, 0)
  const totalTax = calc.reduce((s, c) => s + c.tax, 0)
  const remise = grossHt - subtotalHt
  const c = (k: number) => calc.find((x) => x.key === k)!

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const filled = lines.filter((l) => l.product_id)
    if (!h.supplier_id) return setError('Sélectionnez le fournisseur.')
    if (!h.warehouse_id) return setError('Choisissez le dépôt de réception.')
    if (filled.length === 0) return setError('Ajoutez au moins une ligne avec un article.')
    if (filled.some((l) => n(l.quantity) <= 0)) return setError('Chaque ligne doit avoir une quantité supérieure à 0.')

    setSaving(true)
    const t = (v: string) => v.trim() || null
    const po = {
      supplier_id: h.supplier_id,
      supplier_contact: t(h.supplier_contact),
      delivery_address: t(h.delivery_address),
      currency: h.currency,
      buyer_id: h.buyer_id || null,
      issued_at: h.issued_at || today(),
      expected_at: h.expected_at || null,
      reference: t(h.reference),
      project_reference: t(h.project_reference),
      warehouse_id: h.warehouse_id,
      price_list: t(h.price_list),
      payment_terms: h.payment_terms || null,
      payment_method: h.payment_method,
      priority: h.priority,
      exchange_rate: n(h.exchange_rate) || 1,
      notes: t(h.notes),
      terms: t(h.terms),
      carrier: t(h.carrier),
      vehicle_number: t(h.vehicle_number)?.toUpperCase() ?? null,
      delivery_location: t(h.delivery_location),
      incoterm: h.incoterm,
      total_weight_kg: h.total_weight_kg ? n(h.total_weight_kg) : null,
      footer_note: t(h.footer_note),
    }
    let poId = id
    if (editing) {
      const r = await supabase.from('purchase_orders').update(po).eq('id', id!)
      if (r.error) return fail(r.error.message)
      const d = await supabase.from('purchase_order_lines').delete().eq('purchase_order_id', id!)
      if (d.error) return fail(d.error.message)
    } else {
      const r = await supabase.from('purchase_orders').insert(po).select('id').single()
      if (r.error) return fail(r.error.message)
      poId = (r.data as { id: string }).id
    }
    const rows = filled.map((l, i) => ({
      purchase_order_id: poId,
      product_id: l.product_id,
      description: l.description.trim() || null,
      coils_count: l.coils_count.trim() ? Math.round(n(l.coils_count)) || null : null,
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      discount_percent: n(l.discount_percent),
      tax_rate: n(l.tax_rate),
      position: i + 1,
    }))
    const r = await supabase.from('purchase_order_lines').insert(rows)
    if (r.error) return fail(r.error.message)
    setSaving(false)
    navigate(`/achats/commandes/${poId}`)
  }

  function fail(msg: string) {
    setSaving(false)
    setError("L'enregistrement a échoué : " + msg)
  }

  const st = poStatus((h.status || 'brouillon') as PoStatus)
  const contacts = supplier?.contacts ?? []

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-[16px] font-bold text-gray-900">{editing ? `Modifier la commande ${h.number}` : 'Nouvelle commande fournisseur'}</h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
        <FormCard
          title={editing ? 'Commande fournisseur : Modification' : 'Commande fournisseur : Création'}
          onAbandon={() => navigate(editing ? `/achats/commandes/${id}` : '/achats/commandes')}
          saving={saving}
        >
          <div className="p-4">
            <Section title="Informations générales">
              <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
                <div className="sm:col-span-3 space-y-3">
                  <Field label="Fournisseur" required>
                    <Select value={h.supplier_id} required onChange={(e) => applySupplier(suppliers.find((x) => x.id === e.target.value))}>
                      <option value="">— Sélectionner —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Contact fournisseur">
                    <Select value={h.supplier_contact} onChange={(e) => set('supplier_contact', e.target.value)}>
                      <option value="">—</option>
                      {contacts.map((ct, i) => {
                        const name = [ct.first_name, ct.last_name].filter(Boolean).join(' ')
                        return (
                          <option key={i} value={name}>
                            {name}
                            {ct.job_title ? ` — ${ct.job_title}` : ''}
                          </option>
                        )
                      })}
                      {h.supplier_contact && !contacts.some((ct) => [ct.first_name, ct.last_name].filter(Boolean).join(' ') === h.supplier_contact) && (
                        <option value={h.supplier_contact}>{h.supplier_contact}</option>
                      )}
                    </Select>
                  </Field>
                  <Field label="Adresse de livraison">
                    <textarea rows={2} value={h.delivery_address} onChange={(e) => set('delivery_address', e.target.value)} placeholder="Usine – Ouagadougou" className={fta} />
                  </Field>
                  <Field label="Devise" required>
                    <Select value={h.currency} onChange={(e) => set('currency', e.target.value)}>
                      {CURRENCIES.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Acheteur">
                    <Select value={h.buyer_id} onChange={(e) => set('buyer_id', e.target.value)}>
                      <option value="">—</option>
                      {buyers.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.full_name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="sm:col-span-3 space-y-3">
                  <Field label="Type de document" required>
                    <input value="Bon de commande" readOnly className={`${fi} bg-gray-50 text-gray-600`} />
                  </Field>
                  <Field label="N° BC" required>
                    <input value={h.number || 'Auto à la création'} readOnly className={`${fi} font-mono bg-gray-50 text-gray-500`} />
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      ● {st.label}
                    </span>
                  </Field>
                  <Field label="Date de commande" required>
                    <input type="date" required value={h.issued_at} onChange={(e) => set('issued_at', e.target.value)} className={fi} />
                  </Field>
                  <Field label="Livraison prévue">
                    <input type="date" value={h.expected_at} onChange={(e) => set('expected_at', e.target.value)} className={fi} />
                  </Field>
                  <Field label="Référence interne">
                    <input value={h.reference} maxLength={50} onChange={(e) => set('reference', e.target.value)} placeholder="REF-2026-001" className={`${fi} font-mono`} />
                  </Field>
                  <Field label="Projet">
                    <input value={h.project_reference} maxLength={60} onChange={(e) => set('project_reference', e.target.value)} placeholder="PROJ-2026-0008" className={`${fi} font-mono`} />
                  </Field>
                </div>

                <div className="sm:col-span-3 space-y-3">
                  <Field label="Dépôt de réception" required>
                    <Select value={h.warehouse_id} onChange={(e) => set('warehouse_id', e.target.value)}>
                      <option value="">—</option>
                      {depots.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code} — {d.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Liste de prix">
                    <input value={h.price_list} maxLength={60} onChange={(e) => set('price_list', e.target.value)} className={fi} />
                  </Field>
                  <Field label="Conditions de paiement">
                    <Select value={h.payment_terms} onChange={(e) => set('payment_terms', e.target.value)}>
                      <option value="">— Choisir —</option>
                      {PAYMENT_TERMS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Mode de paiement">
                    <Select value={h.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
                      {PAYMENT_METHODS.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Priorité">
                    <Select value={h.priority} onChange={(e) => set('priority', e.target.value)}>
                      {PRIORITIES.map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="sm:col-span-3 space-y-3">
                  <Field label="Taux de change">
                    <div className="flex gap-1">
                      <input inputMode="decimal" value={h.exchange_rate} onChange={(e) => set('exchange_rate', e.target.value)} className={fnum} />
                      <input value={h.currency} readOnly className={`${fi} w-16 font-mono bg-gray-50 text-gray-500`} />
                    </div>
                  </Field>
                  <Field label="Observations">
                    <textarea rows={4} value={h.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Instructions au fournisseur…" className={fta} />
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
                <button type="button" onClick={() => setLines((ls) => [...ls, newLine(vat(supplier), supplier?.default_discount ?? 0)])} className={btnAddSmall}>
                  + Ajouter une ligne
                </button>
              }
            >
              <div className="grid grid-cols-1 xl:grid-cols-12">
                <div className="xl:col-span-9 overflow-x-auto border-r border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-[#eef5f0] border-b border-gray-300">
                      <tr>
                        <th className={`${thc} text-left w-8`}>#</th>
                        <th className={`${thc} text-left w-40`}>Article</th>
                        <th className={`${thc} text-left`}>Désignation</th>
                        <th className={`${thc} text-right w-16`}>Nb bobines</th>
                        <th className={`${thc} text-right w-24`}>Quantité (kg)</th>
                        <th className={`${thc} text-right w-24`}>Prix unitaire HT</th>
                        <th className={`${thc} text-right w-16`}>Remise (%)</th>
                        <th className={`${thc} text-right w-24`}>Prix net HT</th>
                        <th className={`${thc} text-right w-16`}>TVA (%)</th>
                        <th className={`${thc} text-right w-24`}>Montant TVA</th>
                        <th className={`${thc} text-right w-24`}>Total TTC</th>
                        <th className="px-2 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {lines.map((l, i) => (
                        <tr key={l.key} className="hover:bg-gray-50">
                          <td className="px-2 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-2 py-2">
                            <select value={l.product_id} onChange={(e) => pickProduct(l.key, e.target.value)} className={`${cell} min-w-[150px]`}>
                              <option value="">— Produit —</option>
                              {coils.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} — {a.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <input value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} placeholder="Désignation..." className={`${cell} min-w-[160px]`} />
                          </td>
                          <td className="px-2 py-2">
                            <input inputMode="numeric" value={l.coils_count} onChange={(e) => setLine(l.key, { coils_count: e.target.value })} className={`${cell} text-right`} style={{ minWidth: 52 }} />
                          </td>
                          <td className="px-2 py-2">
                            <input inputMode="decimal" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: e.target.value })} className={`${cell} text-right`} />
                          </td>
                          <td className="px-2 py-2">
                            <input inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} className={`${cell} text-right`} />
                          </td>
                          <td className="px-2 py-2">
                            <input inputMode="decimal" value={l.discount_percent} onChange={(e) => setLine(l.key, { discount_percent: e.target.value })} className={`${cell} text-right`} />
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-gray-700 font-medium text-xs whitespace-nowrap">{num(c(l.key).ht)}</td>
                          <td className="px-2 py-2">
                            <input
                              inputMode="decimal"
                              value={l.tax_rate}
                              onChange={(e) => setLine(l.key, { tax_rate: e.target.value })}
                              className={`${cell} text-right`}
                              style={{ minWidth: 52, paddingLeft: 4, paddingRight: 4 }}
                            />
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-gray-600 text-xs whitespace-nowrap">{num(c(l.key).tax)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-gray-900 font-semibold text-xs whitespace-nowrap">{num(c(l.key).ttc)}</td>
                          <td className="px-2 py-2 text-center">
                            {lines.length > 1 && (
                              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="text-gray-300 hover:text-red-500 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-1.5 border-t border-gray-100">
                    <textarea rows={2} value={h.terms} onChange={(e) => set('terms', e.target.value)} placeholder="Ajouter un commentaire sur les lignes…" className={fta} />
                  </div>
                </div>
                <div className="xl:col-span-3 p-4 bg-[#f7faf8] space-y-2.5">
                  <div className="flex justify-between text-[13px] text-gray-600">
                    <span>Total HT</span>
                    <span className="tabular-nums font-medium">
                      {num(grossHt)} {h.currency}
                    </span>
                  </div>
                  <div className={`flex justify-between text-[13px] ${remise > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    <span>Total remise</span>
                    <span className="tabular-nums font-medium">
                      {remise > 0 ? '- ' : ''}
                      {num(remise)} {h.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-[13px] text-gray-600 border-t border-gray-200 pt-2">
                    <span>Base imposable</span>
                    <span className="tabular-nums font-medium">
                      {num(subtotalHt)} {h.currency}
                    </span>
                  </div>
                  <div className="flex justify-between text-[13px] text-gray-600">
                    <span>Total TVA</span>
                    <span className="tabular-nums font-medium">
                      {num(totalTax)} {h.currency}
                    </span>
                  </div>
                  <div className="border-t-2 border-emerald-200 pt-2.5">
                    <p className="text-[12px] font-bold text-gray-700">Total TTC</p>
                    <p className="text-[17px] font-bold text-emerald-700 tabular-nums">
                      {num(subtotalHt + totalTax)} {h.currency}
                    </p>
                  </div>
                </div>
              </div>
            </Section>
          </div>

          <div className="p-4 pt-0 grid grid-cols-1 xl:grid-cols-12 gap-4">
            <Section title="Informations complémentaires" className="xl:col-span-8">
              <div className="p-4 grid grid-cols-1 sm:grid-cols-6 gap-x-3 gap-y-3">
                <Field label="Transporteur" className="sm:col-span-2">
                  <input value={h.carrier} maxLength={80} onChange={(e) => set('carrier', e.target.value)} placeholder="TRANSPORT PLUS" className={fi} />
                </Field>
                <Field label="N° de véhicule" className="sm:col-span-2">
                  <input value={h.vehicle_number} maxLength={30} onChange={(e) => set('vehicle_number', e.target.value)} placeholder="11 BF 2567" className={`${fi} font-mono uppercase`} />
                </Field>
                <Field label="Lieu de livraison" className="sm:col-span-2">
                  <input value={h.delivery_location} maxLength={100} onChange={(e) => set('delivery_location', e.target.value)} placeholder="Usine – Ouagadougou" className={fi} />
                </Field>
                <Field label="Incoterm" className="sm:col-span-2">
                  <Select value={h.incoterm} onChange={(e) => set('incoterm', e.target.value)}>
                    {INCOTERMS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Poids total (kg)" className="sm:col-span-2">
                  <input inputMode="decimal" value={h.total_weight_kg} onChange={(e) => set('total_weight_kg', e.target.value)} className={fnum} />
                </Field>
                <Field label="Pied de page (PDF)" className="sm:col-span-2">
                  <input value={h.footer_note} maxLength={255} onChange={(e) => set('footer_note', e.target.value)} className={fi} />
                </Field>
              </div>
            </Section>
            <Section title="Suivi" className="xl:col-span-4">
              <div className="p-4 grid grid-cols-2 gap-x-3 gap-y-3">
                <Field label="Statut">
                  <input value={st.label} readOnly className={`${fi} bg-gray-50 text-gray-600`} />
                </Field>
                <Field label="Créée par">
                  <input value={editing ? '—' : ctx.profile?.full_name ?? ''} readOnly className={`${fi} bg-gray-50 text-gray-600`} />
                </Field>
                <Field label="Date de création">
                  <input value={h.created_at ? dateTimeFr(h.created_at) : dateTimeFr(new Date().toISOString())} readOnly className={`${fi} bg-gray-50 text-gray-600 font-mono`} />
                </Field>
              </div>
            </Section>
          </div>

          <div className="mx-4 mb-4 flex items-center gap-2 px-3 py-2 rounded-[4px] bg-[#eef5f0] border border-emerald-100 text-[12px] text-gray-600">
            <span className="text-emerald-700">ⓘ</span>
            La commande passe de <strong className="text-emerald-800">Brouillon</strong> à <strong className="text-emerald-800">Envoyé</strong> puis{' '}
            <strong className="text-emerald-800">Confirmé</strong>, puis <strong className="text-emerald-800">réception</strong> (vérification des bobines et entrée en stock).
          </div>
        </FormCard>
      </form>
    </div>
  )
}
