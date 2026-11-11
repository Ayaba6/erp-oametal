import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Field, FormCard, Section, Select, Tabs, btnAddSmall, fcheck, fi, fnum, fta } from '../../components/A3Form'
import { CLIENT_PAYMENT, CLIENT_TYPES, Client, ClientContact, loadClient } from './salesData'

type Form = Omit<Client, 'id' | 'created_at'>
type Tab = 'general' | 'adresse' | 'commercial' | 'contacts'

const EMPTY: Form = {
  code: '',
  name: '',
  trade_name: '',
  type: 'particulier',
  category: '',
  ifu: '',
  rccm: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  city: 'Ouagadougou',
  quartier: '',
  country: 'BF',
  payment_mode: 'comptant',
  payment_days: 0,
  credit_limit: 0,
  default_discount: 0,
  soumis_tva: true,
  is_blocked: false,
  blocked_reason: '',
  is_active: true,
  sales_rep_id: null,
  contacts: [],
  notes: '',
}

export default function ClientForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const [f, setF] = useState<Form>(EMPTY)
  const [tab, setTab] = useState<Tab>('general')
  const [reps, setReps] = useState<{ id: string; full_name: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setReps((data as { id: string; full_name: string }[]) ?? []))
    if (id)
      loadClient(id).then((c) => {
        if (!c) return
        const { id: _i, created_at: _c, ...rest } = c
        setF({ ...EMPTY, ...rest, contacts: Array.isArray(rest.contacts) ? rest.contacts : [] })
      })
  }, [id])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))
  const str = (k: keyof Form) => (f[k] as string | null) ?? ''
  const text = (k: keyof Form, label: string, cls = 'sm:col-span-3', extra = {}) => (
    <Field label={label} className={cls}>
      <input value={str(k)} onChange={(e) => set(k, e.target.value as never)} className={fi} {...extra} />
    </Field>
  )

  function setContact(i: number, patch: Partial<ClientContact>) {
    setF((p) => ({ ...p, contacts: p.contacts.map((c, j) => (j === i ? { ...c, ...patch } : patch.is_primary ? { ...c, is_primary: false } : c)) }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!f.name.trim()) {
      setTab('general')
      return setError('La raison sociale est obligatoire.')
    }
    if (f.is_blocked && !(f.blocked_reason ?? '').trim()) {
      setTab('commercial')
      return setError('Indiquez le motif du blocage.')
    }
    setSaving(true)
    const t = (v: string | null) => (v ?? '').trim() || null
    const row = {
      ...f,
      code: t(f.code),
      name: f.name.trim(),
      trade_name: t(f.trade_name),
      category: t(f.category),
      ifu: t(f.ifu),
      rccm: t(f.rccm),
      phone: t(f.phone),
      phone2: t(f.phone2),
      email: t(f.email),
      address: t(f.address),
      city: t(f.city),
      quartier: t(f.quartier),
      blocked_reason: f.is_blocked ? t(f.blocked_reason) : null,
      notes: t(f.notes),
      payment_days: Number(f.payment_days) || 0,
      credit_limit: Number(f.credit_limit) || 0,
      default_discount: Number(f.default_discount) || 0,
      contacts: f.contacts.filter((c) => c.last_name.trim() || c.first_name.trim() || c.phone.trim()),
    }
    const res = editing ? await supabase.from('clients').update(row).eq('id', id!).select('id').single() : await supabase.from('clients').insert(row).select('id').single()
    setSaving(false)
    if (res.error) return setError(res.error.code === '23505' ? 'Ce code client existe déjà.' : "L'enregistrement a échoué : " + res.error.message)
    navigate(`/ventes/clients/${(res.data as { id: string }).id}`)
  }

  return (
    <form onSubmit={onSubmit} className="max-w-6xl space-y-3">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
      <FormCard title={editing ? `Clients : Modification — ${f.name}` : 'Clients : Création complète'} onAbandon={() => navigate(editing ? `/ventes/clients/${id}` : '/ventes/clients')} saving={saving}>
        <Tabs
          tabs={[
            ['general', 'Général'],
            ['adresse', 'Adresse'],
            ['commercial', 'Commercial'],
            ['contacts', 'Contacts'],
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'general' && (
          <div className="p-4 space-y-4">
            <Section title="1. Identification">
              <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
                <Field label="Code client" className="sm:col-span-2">
                  <input value={str('code')} onChange={(e) => set('code', e.target.value)} placeholder="Auto si vide" className={`${fi} font-mono uppercase`} />
                </Field>
                <Field label="Type tiers" required className="sm:col-span-2">
                  <Select value={f.type} onChange={(e) => set('type', e.target.value as Client['type'])}>
                    {CLIENT_TYPES.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Raison sociale" required className="sm:col-span-5">
                  <input value={f.name} required onChange={(e) => set('name', e.target.value)} className={`${fi} font-medium`} />
                </Field>
                <Field label="Statut" className="sm:col-span-3">
                  <Select value={f.is_active ? '1' : '0'} onChange={(e) => set('is_active', e.target.value === '1')}>
                    <option value="1">Actif</option>
                    <option value="0">Inactif</option>
                  </Select>
                </Field>
                {text('trade_name', 'Sigle / Nom court')}
                {text('category', 'Catégorie client')}
                {text('ifu', 'NIF / IFU', 'sm:col-span-3', { className: `${fi} font-mono` })}
                {text('rccm', 'RCCM', 'sm:col-span-3', { className: `${fi} font-mono` })}
                <label className="sm:col-span-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-gray-700">
                  <input type="checkbox" checked={f.soumis_tva} onChange={(e) => set('soumis_tva', e.target.checked)} className={fcheck} />
                  Soumis TVA
                </label>
              </div>
            </Section>
            <Section title="2. Coordonnées">
              <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
                {text('phone', 'Téléphone principal')}
                {text('phone2', 'Téléphone secondaire')}
                {text('email', 'Email', 'sm:col-span-6', { type: 'email' })}
              </div>
            </Section>
          </div>
        )}

        {tab === 'adresse' && (
          <div className="p-4">
            <Section title="3. Adresse principale">
              <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
                {text('address', 'Adresse', 'sm:col-span-6')}
                {text('quartier', 'Quartier')}
                {text('city', 'Ville')}
                {text('country', 'Pays', 'sm:col-span-2')}
              </div>
            </Section>
          </div>
        )}

        {tab === 'commercial' && (
          <div className="p-4 space-y-4">
            <Section title="4. Paramètres commerciaux">
              <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
                <Field label="Représentant commercial" className="sm:col-span-4">
                  <Select value={f.sales_rep_id ?? ''} onChange={(e) => set('sales_rep_id', e.target.value || null)}>
                    <option value="">—</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Mode de règlement" className="sm:col-span-4">
                  <Select value={f.payment_mode} onChange={(e) => set('payment_mode', e.target.value as Client['payment_mode'])}>
                    {CLIENT_PAYMENT.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Délai de règlement (jours)" className="sm:col-span-2">
                  <input inputMode="numeric" value={f.payment_days} onChange={(e) => set('payment_days', Number(e.target.value) || 0)} className={fnum} />
                </Field>
                <Field label="Remise par défaut (%)" className="sm:col-span-2">
                  <input inputMode="decimal" value={f.default_discount} onChange={(e) => set('default_discount', Number(e.target.value.replace(',', '.')) || 0)} className={fnum} />
                </Field>
                <Field label="Plafond crédit (FCFA)" className="sm:col-span-4">
                  <input inputMode="numeric" value={f.credit_limit} onChange={(e) => set('credit_limit', Number(e.target.value.replace(/\s/g, '')) || 0)} className={fnum} />
                </Field>
              </div>
            </Section>
            <Section title="Blocage">
              <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3 items-end">
                <label className="sm:col-span-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-gray-700 pb-2">
                  <input type="checkbox" checked={f.is_blocked} onChange={(e) => set('is_blocked', e.target.checked)} className={fcheck} />
                  Client bloqué
                </label>
                {f.is_blocked && text('blocked_reason', 'Motif de blocage', 'sm:col-span-9')}
              </div>
            </Section>
            <Section title="Notes">
              <div className="p-4">
                <textarea rows={3} value={str('notes')} onChange={(e) => set('notes', e.target.value)} className={fta} />
              </div>
            </Section>
          </div>
        )}

        {tab === 'contacts' && (
          <div className="p-4">
            <Section
              title="5. Contacts"
              right={
                <button
                  type="button"
                  className={btnAddSmall}
                  onClick={() => set('contacts', [...f.contacts, { last_name: '', first_name: '', job_title: '', phone: '', email: '', is_primary: f.contacts.length === 0 }])}
                >
                  + Ajouter
                </button>
              }
            >
              <div className="p-4 overflow-x-auto">
                <table className="w-full text-[12.5px] border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      {['#', 'Nom', 'Prénom', 'Fonction', 'Téléphone', 'Email', 'Principal', ''].map((h) => (
                        <th key={h} className="text-left font-bold px-2 py-1.5 border-b border-gray-200">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {f.contacts.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-3 text-center text-gray-400 text-[12px]">
                          Aucun contact.
                        </td>
                      </tr>
                    )}
                    {f.contacts.map((ct, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                        {(['last_name', 'first_name', 'job_title', 'phone', 'email'] as const).map((k) => (
                          <td key={k} className="px-2 py-1">
                            <input value={ct[k]} onChange={(e) => setContact(i, { [k]: e.target.value })} className={`${fi} h-7`} />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center">
                          <input type="checkbox" checked={ct.is_primary} onChange={(e) => setContact(i, { is_primary: e.target.checked })} className={fcheck} />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button type="button" onClick={() => set('contacts', f.contacts.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}
      </FormCard>
    </form>
  )
}
