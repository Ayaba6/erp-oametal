import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Warehouse, loadWarehouses } from '../../lib/depots'
import { Field, FormCard, Section, Select, Tabs, btnAddSmall, fcheck, fi, fnum, fta } from '../../components/A3Form'
import { Address, CURRENCIES, Contact, Supplier, loadSupplier } from './achatsData'

type Tab = 'general' | 'adresses' | 'achats' | 'finance' | 'reception' | 'contacts' | 'compta'
const TABS: [Tab, string][] = [
  ['general', 'Général'],
  ['adresses', 'Adresses'],
  ['achats', 'Achats'],
  ['finance', 'Finance'],
  ['reception', 'Réception'],
  ['contacts', 'Contacts'],
  ['compta', 'Comptabilité'],
]

type F = Partial<Supplier>
const EMPTY: F = {
  type: 'entreprise',
  is_active: true,
  currency: 'XOF',
  language: 'FR',
  country: 'BF',
  soumis_tva: true,
  blocage_achat: false,
  default_discount: 0,
  payment_mode: 'virement',
  payment_days: 0,
  tax_rate: 18,
  addresses: [],
  contacts: [],
}
const NUMS = new Set(['gps_lat', 'gps_lng', 'default_discount', 'payment_days', 'tax_rate', 'rating', 'avg_delivery_days', 'credit_limit', 'delai_livraison'])
const READONLY = new Set(['id', 'created_at'])

export default function FournisseurForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [f, setF] = useState<F>(EMPTY)
  const [tab, setTab] = useState<Tab>('general')
  const [depots, setDepots] = useState<Warehouse[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadWarehouses().then((w) => setDepots(w.filter((d) => d.is_active)))
    if (id) loadSupplier(id).then((s) => s && setF(s))
  }, [id])

  const set = (k: keyof Supplier, v: unknown) => setF((p) => ({ ...p, [k]: v }))
  // Props d'un champ texte ou numérique
  const t = (k: keyof Supplier) => ({
    value: (f[k] as string | number | null | undefined) ?? '',
    onChange: (e: { target: { value: string } }) => {
      const v = e.target.value
      set(k, NUMS.has(k) ? (v.trim() === '' ? null : Number(v.replace(',', '.'))) : v)
    },
  })
  const chk = (k: 'soumis_tva' | 'blocage_achat', l: string) => (
    <label className="inline-flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={Boolean(f[k])} onChange={(e) => set(k, e.target.checked)} className={fcheck} />
      <span className="text-[12.5px] font-semibold text-gray-700 select-none">{l}</span>
    </label>
  )

  const contacts = f.contacts ?? []
  const addresses = f.addresses ?? []
  const setContact = (i: number, patch: Partial<Contact>) => set('contacts', contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  const setAddress = (i: number, patch: Partial<Address>) => set('addresses', addresses.map((a, j) => (j === i ? { ...a, ...patch } : a)))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!f.name?.trim()) return setError('La raison sociale est obligatoire.')
    setSaving(true)
    const row: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(f)) {
      if (READONLY.has(k)) continue
      row[k] = typeof v === 'string' ? v.trim() || null : v
    }
    row.name = (f.name ?? '').trim()
    row.contacts = contacts.filter((c) => c.last_name || c.first_name || c.phone || c.email)
    row.addresses = addresses.filter((a) => a.label || a.address)
    const res = id ? await supabase.from('suppliers').update(row).eq('id', id) : await supabase.from('suppliers').insert(row).select('id').single()
    setSaving(false)
    if (res.error) {
      if (res.error.code === '23505') return setError(`Le code ${row.code} existe déjà.`)
      return setError("L'enregistrement a échoué : " + res.error.message)
    }
    const newId = id ?? (res.data as { id: string } | null)?.id
    navigate(newId ? `/achats/fournisseurs/${newId}` : '/achats/fournisseurs')
  }

  const ct = 'w-full h-7 px-2 border border-[#c3d3c9] rounded-[3px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400'
  const tblHead = 'text-left font-bold px-2 py-1.5 border-b border-gray-200'

  return (
    <div className="max-w-6xl">
      <form onSubmit={onSubmit} className="space-y-3">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
        <FormCard
          title={id ? `Fournisseurs : Modification — ${f.code ?? ''}` : 'Fournisseurs : Création complète'}
          onAbandon={() => navigate(id ? `/achats/fournisseurs/${id}` : '/achats/fournisseurs')}
          saving={saving}
        >
          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === 'general' && (
            <div className="p-4 space-y-4">
              <Section title="1. Identification">
                <div className="p-4 grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-3">
                  <Field label="Code fournisseur" className="sm:col-span-2">
                    <input {...t('code')} maxLength={30} placeholder="Auto si vide" className={`${fi} font-mono uppercase`} />
                  </Field>
                  <Field label="Type tiers" className="sm:col-span-2">
                    <Select value={f.type} onChange={(e) => set('type', e.target.value)}>
                      <option value="entreprise">Entreprise</option>
                      <option value="particulier">Particulier</option>
                    </Select>
                  </Field>
                  <Field label="Catégorie" className="sm:col-span-2">
                    <input {...t('category')} maxLength={60} className={fi} />
                  </Field>
                  <Field label="Raison sociale" required className="sm:col-span-6">
                    <input {...t('name')} maxLength={150} required className={`${fi} font-medium`} />
                  </Field>
                  <Field label="Sigle / Nom court" className="sm:col-span-3">
                    <input {...t('trade_name')} maxLength={100} className={fi} />
                  </Field>
                  <Field label="Statut" className="sm:col-span-2">
                    <Select value={f.is_active ? '1' : '0'} onChange={(e) => set('is_active', e.target.value === '1')}>
                      <option value="1">Actif</option>
                      <option value="0">Inactif</option>
                    </Select>
                  </Field>
                  <Field label="NIF / IFU" className="sm:col-span-2">
                    <input {...t('ifu')} maxLength={50} className={`${fi} font-mono`} />
                  </Field>
                  <Field label="RCCM" className="sm:col-span-2">
                    <input {...t('rccm')} maxLength={50} className={`${fi} font-mono`} />
                  </Field>
                  <Field label="Numéro contribuable" className="sm:col-span-3">
                    <input {...t('numero_contribuable')} maxLength={30} className={`${fi} font-mono`} />
                  </Field>
                  <Field label="Groupe fournisseur" className="sm:col-span-3">
                    <input {...t('groupe_fournisseur')} maxLength={60} className={fi} />
                  </Field>
                  <Field label="Secteur d'activité" className="sm:col-span-3">
                    <input {...t('secteur_activite')} maxLength={100} className={fi} />
                  </Field>
                  <Field label="Devise" className="sm:col-span-2">
                    <Select value={f.currency} onChange={(e) => set('currency', e.target.value)}>
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Langue" className="sm:col-span-2">
                    <Select value={f.language} onChange={(e) => set('language', e.target.value)}>
                      <option>FR</option>
                      <option>EN</option>
                    </Select>
                  </Field>
                  <Field label="Pays" className="sm:col-span-2">
                    <input {...t('country')} maxLength={100} className={fi} />
                  </Field>
                  <div className="sm:col-span-3 flex flex-wrap items-end gap-x-6 gap-y-2 pb-1">
                    {chk('soumis_tva', 'Soumis TVA')}
                    {chk('blocage_achat', 'Blocage achat')}
                  </div>
                </div>
              </Section>
              <Section title="2. Coordonnées">
                <div className="p-4 grid grid-cols-1 sm:grid-cols-5 gap-4">
                  <Field label="Téléphone principal">
                    <input {...t('phone')} maxLength={20} className={fi} />
                  </Field>
                  <Field label="Téléphone secondaire">
                    <input {...t('phone2')} maxLength={20} className={fi} />
                  </Field>
                  <Field label="Mobile">
                    <input {...t('mobile')} maxLength={20} className={fi} />
                  </Field>
                  <Field label="Email">
                    <input type="email" {...t('email')} maxLength={150} className={fi} />
                  </Field>
                  <Field label="Site web">
                    <input {...t('website')} maxLength={150} className={fi} />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {tab === 'adresses' && (
            <div className="p-4 space-y-4">
              <Section title="3. Adresse principale">
                <div className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <Field label="Adresse ligne 1" className="sm:col-span-2">
                    <input {...t('address')} maxLength={255} className={fi} />
                  </Field>
                  <Field label="Adresse ligne 2" className="sm:col-span-2">
                    <input {...t('address_line2')} maxLength={200} className={fi} />
                  </Field>
                  <Field label="Boîte postale">
                    <input {...t('boite_postale')} className={fi} />
                  </Field>
                  <Field label="Code postal">
                    <input {...t('postal_code')} className={fi} />
                  </Field>
                  <Field label="Ville">
                    <input {...t('city')} className={fi} />
                  </Field>
                  <Field label="Quartier">
                    <input {...t('quartier')} className={fi} />
                  </Field>
                  <Field label="Région">
                    <input {...t('region')} className={fi} />
                  </Field>
                  <Field label="Pays">
                    <input {...t('country')} className={fi} />
                  </Field>
                  <Field label="GPS latitude">
                    <input type="number" step="0.000001" {...t('gps_lat')} className={fnum} />
                  </Field>
                  <Field label="GPS longitude">
                    <input type="number" step="0.000001" {...t('gps_lng')} className={fnum} />
                  </Field>
                </div>
              </Section>
              <Section
                title="Adresses secondaires"
                right={
                  <button type="button" onClick={() => set('addresses', [...addresses, { label: '', address: '', city: '', country: '', is_default: false }])} className={btnAddSmall}>
                    + Ajouter
                  </button>
                }
              >
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-[12.5px] border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className={`${tblHead} w-8`}>#</th>
                        <th className={tblHead}>Intitulé</th>
                        <th className={tblHead}>Adresse</th>
                        <th className={tblHead}>Ville</th>
                        <th className={tblHead}>Pays</th>
                        <th className={`${tblHead} text-center w-16`}>Défaut</th>
                        <th className="w-8 border-b border-gray-200" />
                      </tr>
                    </thead>
                    <tbody>
                      {addresses.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-3 text-center text-gray-400 text-[12px]">
                            Aucune adresse secondaire.
                          </td>
                        </tr>
                      )}
                      {addresses.map((a, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                          {(['label', 'address', 'city', 'country'] as const).map((k) => (
                            <td key={k} className="px-2 py-1">
                              <input value={a[k]} onChange={(e) => setAddress(i, { [k]: e.target.value } as Partial<Address>)} className={ct} />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-center">
                            <input type="checkbox" checked={a.is_default} onChange={(e) => setAddress(i, { is_default: e.target.checked })} className={fcheck} />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <button type="button" onClick={() => set('addresses', addresses.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
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

          {tab === 'achats' && (
            <div className="p-4">
              <Section title="4. Paramètres d'achat">
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Canal">
                    <input {...t('canal')} className={fi} />
                  </Field>
                  <Field label="Famille tarifaire">
                    <input {...t('famille_tarifaire')} className={fi} />
                  </Field>
                  <Field label="Remise par défaut (%)">
                    <input type="number" step="0.01" min="0" max="100" {...t('default_discount')} className={fnum} />
                  </Field>
                  <Field label="Mode de règlement">
                    <Select value={f.payment_mode} onChange={(e) => set('payment_mode', e.target.value)}>
                      <option value="virement">Virement</option>
                      <option value="cash">Comptant</option>
                      <option value="cheque">Chèque</option>
                    </Select>
                  </Field>
                  <Field label="Délai de règlement (jours)">
                    <input type="number" min="0" max="365" {...t('payment_days')} className={fnum} />
                  </Field>
                  <Field label="TVA applicable (%)">
                    <Select value={String(f.tax_rate ?? 18)} onChange={(e) => set('tax_rate', Number(e.target.value))}>
                      <option value="18">18.00 %</option>
                      <option value="0">0.00 %</option>
                    </Select>
                  </Field>
                  <Field label="Note qualité (0-5)">
                    <input type="number" step="0.1" min="0" max="5" {...t('rating')} className={fnum} />
                  </Field>
                  <Field label="Délai livr. moyen (j)">
                    <input type="number" min="0" {...t('avg_delivery_days')} className={fnum} />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {tab === 'finance' && (
            <div className="p-4">
              <Section title="Finance">
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Plafond crédit">
                    <input type="number" min="0" step="1" {...t('credit_limit')} className={fnum} />
                  </Field>
                  <Field label="Banque">
                    <input {...t('banque')} className={fi} />
                  </Field>
                  <Field label="SWIFT">
                    <input {...t('swift')} className={`${fi} font-mono`} />
                  </Field>
                  <div />
                  <Field label="RIB / IBAN" className="sm:col-span-2">
                    <input {...t('rib_iban')} className={`${fi} font-mono`} />
                  </Field>
                  <Field label="Numéro de compte" className="sm:col-span-2">
                    <input {...t('numero_compte')} className={`${fi} font-mono`} />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {tab === 'reception' && (
            <div className="p-4">
              <Section title="5. Réception">
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Dépôt de réception par défaut">
                    <Select value={f.depot_reception_id ?? ''} onChange={(e) => set('depot_reception_id', e.target.value || null)} className="font-mono">
                      <option value="">—</option>
                      {depots.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.code}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Mode de livraison">
                    <input {...t('mode_livraison')} className={fi} />
                  </Field>
                  <Field label="Transporteur">
                    <input {...t('transporteur')} className={fi} />
                  </Field>
                  <Field label="Délai de livraison (jours)">
                    <input type="number" min="0" max="365" {...t('delai_livraison')} className={fnum} />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {tab === 'contacts' && (
            <div className="p-4">
              <Section
                title="Contacts"
                right={
                  <button
                    type="button"
                    onClick={() => set('contacts', [...contacts, { last_name: '', first_name: '', job_title: '', phone: '', email: '', is_primary: contacts.length === 0 }])}
                    className={btnAddSmall}
                  >
                    + Ajouter
                  </button>
                }
              >
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-[12.5px] border border-gray-200">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className={`${tblHead} w-8`}>#</th>
                        <th className={tblHead}>Nom</th>
                        <th className={tblHead}>Prénom</th>
                        <th className={tblHead}>Fonction</th>
                        <th className={tblHead}>Téléphone</th>
                        <th className={tblHead}>Email</th>
                        <th className={`${tblHead} text-center w-16`}>Principal</th>
                        <th className="w-8 border-b border-gray-200" />
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-3 py-3 text-center text-gray-400 text-[12px]">
                            Aucun contact.
                          </td>
                        </tr>
                      )}
                      {contacts.map((c, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-2 py-1 text-gray-400">{i + 1}</td>
                          {(['last_name', 'first_name', 'job_title', 'phone', 'email'] as const).map((k) => (
                            <td key={k} className="px-2 py-1">
                              <input value={c[k]} onChange={(e) => setContact(i, { [k]: e.target.value } as Partial<Contact>)} className={ct} />
                            </td>
                          ))}
                          <td className="px-2 py-1 text-center">
                            <input
                              type="checkbox"
                              checked={c.is_primary}
                              onChange={(e) => set('contacts', contacts.map((x, j) => ({ ...x, is_primary: j === i ? e.target.checked : e.target.checked ? false : x.is_primary })))}
                              className={fcheck}
                            />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <button type="button" onClick={() => set('contacts', contacts.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700">
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

          {tab === 'compta' && (
            <div className="p-4">
              <Section title="6. Comptabilité">
                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Field label="Compte tiers (401)">
                    <input {...t('compte_tiers')} placeholder="40110000" className={`${fi} font-mono`} />
                  </Field>
                  <Field label="Compte collectif">
                    <input {...t('compte_collectif')} placeholder="40100000" className={`${fi} font-mono`} />
                  </Field>
                  <Field label="Condition de paiement">
                    <input {...t('condition_paiement')} placeholder="30J FDM" className={fi} />
                  </Field>
                  <Field label="Échéance">
                    <input {...t('echeance')} placeholder="Fin de mois" className={fi} />
                  </Field>
                  <Field label="Notes" className="col-span-2 sm:col-span-4">
                    <textarea {...t('notes')} rows={2} className={fta} />
                  </Field>
                </div>
              </Section>
            </div>
          )}
        </FormCard>
      </form>
    </div>
  )
}
