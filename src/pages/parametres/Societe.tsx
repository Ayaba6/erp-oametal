import { FormEvent, ReactNode, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import {
  BankAccount, CURRENCIES, CompanyInfo, FISCAL_REGIMES, FONTS, LANGUAGES, LEGAL_FORMS, OPTIONS, ORIENTATIONS, PAGE_SIZES, PRODUCT_COLUMNS,
  TAXPAYER, TIMEZONES, VAT_MODES, WITHHOLDING, autoPrintScript, companyFooter, companyHeader, companySigner, docCss, loadCompany,
} from '../../lib/companyPrint'

// Paramètres › Société — reproduction de la page « Paramétrage de la société » de l'ancien A3 ERP :
// Informations générales, Adresse, Fiscalité, Banques, Numérotation, Branding, Options globales,
// Suivi, Mentions légales, Documents. Chaque bloc a son propre bouton d'enregistrement.

type Company = Omit<CompanyInfo, 'banks'>
type Seq = { doc_type: string; prefix: string; last_number: number }

// Mêmes documents que la numérotation de l'ancien ERP ; table = document de la nouvelle base
const NUMBERING: [string, string, string | null][] = [
  ['Devis', 'DEV', 'quotes'],
  ['Commandes clients', 'CMD', 'sales_orders'],
  ['Bons de préparation', 'BP', null],
  ['Bons de livraison', 'BL', 'deliveries'],
  ['Factures clients', 'FA', 'invoices'],
  ['Avoirs clients', 'AV', 'credit_notes'],
  ['Contrats', 'CT', null],
  ['Contentieux', 'CTX', null],
  ["Demandes d'achat", 'DA', null],
  ['Bons de commande fourn.', 'CA', 'purchase_orders'],
  ['Réceptions fournisseurs', 'REC', 'receptions'],
  ['Factures fournisseurs', 'FF', null],
  ['Retours fournisseurs', 'RF', null],
  ['Ordres de fabrication', 'OF', 'production_orders'],
  ['Mouvements de stock', 'MVT', null],
  ['Transferts de stock', 'TRF', 'stock_transfers'],
  ['Inventaires', 'INV', null],
  ['Encaissements clients', 'ENC', 'payments'],
  ['Décaissements fournisseurs', 'DEC', null],
  ['Sessions de caisse', 'CAI', 'cash_sessions'],
  ['Opérations de caisse', 'OPC', 'cash_operations'],
  ['Clôtures de caisse', 'CLC', null],
  ['Virements internes', 'VIR', null],
  ['Demandes de paiement', 'DP', null],
  ['Remises en banque', 'RB', null],
  ['Effets de commerce', 'EFF', null],
  ['Prévisions de trésorerie', 'PT', null],
  ['Écritures comptables', 'EC', null],
  ['Rapprochements bancaires', 'RBQ', null],
  ['Déclarations de TVA', 'TVA', null],
  ['Immobilisations', 'IMB', null],
]

const GENERAL: (keyof Company)[] = ['logo_url', 'company_code', 'name', 'sigle', 'legal_form', 'ifu', 'rccm', 'cnss_number', 'main_activity', 'currency', 'language', 'country', 'city', 'timezone', 'opened_at', 'status', 'email', 'phone', 'website', 'notes']
const ADRESSE: (keyof Company)[] = ['address', 'district', 'postal_code', 'po_box', 'main_contact', 'accounting_email', 'phone2', 'trade_name', 'slogan']
const FISCAL: (keyof Company)[] = ['fiscal_regime', 'vat_mode', 'default_vat', 'minimum_margin_rate', 'tax_center', 'withholding_regime', 'taxpayer_type']
const LEGAL: (keyof Company)[] = ['nif', 'vat_number', 'share_capital', 'is_vat_subject']
const DOCS: (keyof Company)[] = ['primary_color', 'font_family', 'page_size', 'orientation', 'show_logo', 'show_watermark', 'watermark_text', 'product_columns', 'footer_text', 'terms_conditions', 'penalty_mentions', 'signature_name', 'signature_title', 'signature_url', 'stamp_url']
const OPTION_KEYS = OPTIONS.map(([k]) => k as keyof Company)
const NUMERIC: (keyof Company)[] = ['default_vat', 'minimum_margin_rate', 'share_capital']

const input = 'w-full h-9 px-3 border border-gray-300 rounded-[4px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400 disabled:bg-gray-50'
const area = 'w-full px-3 py-2 border border-gray-300 rounded-[4px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400 disabled:bg-gray-50'
const lab = 'block text-[13px] font-medium text-gray-700 mb-1'
const card = 'bg-white rounded-[4px] border border-gray-300 scroll-mt-24'
const h2 = 'text-base font-semibold text-gray-900'
const saveBtn = 'bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-4 py-1.5 rounded-[4px] transition-colors disabled:opacity-50'

const dtFr = (s: string | null) => (s ? new Date(s).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '—')

// Lit une image (réduite) ou un PDF en data URL — 2 Mo max. comme l'ancien ERP
function readFile(file: File, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 2_000_000) return reject(new Error('Fichier trop lourd : 2 Mo maximum.'))
    if (file.type === 'application/pdf') {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(new Error('Fichier illisible'))
      return r.readAsDataURL(file)
    }
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, maxW / img.width, maxH / img.height)
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      const png = c.toDataURL('image/png')
      URL.revokeObjectURL(img.src)
      resolve(png.length > 400_000 ? c.toDataURL('image/webp', 0.9) : png)
    }
    img.onerror = () => reject(new Error('Image illisible'))
    img.src = URL.createObjectURL(file)
  })
}

function F({ label, req, className = '', children }: { label: string; req?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label className={lab}>
        {label} {req && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  )
}
function Opts({ list, empty }: { list: [string, string][]; empty?: string }) {
  return (
    <>
      {empty !== undefined && <option value="">{empty}</option>}
      {list.map(([k, l]) => (
        <option key={k} value={k}>
          {l}
        </option>
      ))}
    </>
  )
}

export default function Societe() {
  const ctx = useOutletContext<AppContext>()
  const canEdit = ctx.can('company.edit')
  const [c, setC] = useState<Company | null>(null)
  const [banks, setBanks] = useState<BankAccount[]>([])
  const [seqs, setSeqs] = useState<Seq[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [active, setActive] = useState('adresse')
  const [bankForm, setBankForm] = useState<(Partial<BankAccount> & { sync_treasury?: boolean }) | null>(null)

  async function reload() {
    const info = await loadCompany()
    const { banks: b, ...rest } = info
    setC(rest)
    setBanks(b)
    const { data } = await supabase.from('document_sequences').select('doc_type, prefix, last_number').eq('year', new Date().getFullYear())
    setSeqs((data as Seq[] | null) ?? [])
  }
  useEffect(() => {
    reload()
  }, [])
  if (!c) return null

  const set = <K extends keyof Company>(k: K, v: Company[K]) => setC((p) => (p ? { ...p, [k]: v } : p))
  const tx = (k: keyof Company, type = 'text') => ({
    type,
    value: (c[k] as string | number | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, e.target.value as never),
    disabled: !canEdit,
    className: input,
  })
  const sel = (k: keyof Company) => ({
    value: (c[k] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => set(k, (e.target.value || null) as never),
    disabled: !canEdit,
    className: input,
  })

  async function save(section: string, keys: (keyof Company)[], extra?: Partial<Company>) {
    if (!canEdit || !c) return
    if (keys.includes('name') && !c.name?.trim()) return setMsg({ ok: false, text: 'La raison sociale est obligatoire.' })
    setBusy(section)
    setMsg(null)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const src = { ...c, ...extra }
    for (const k of keys) {
      const v = src[k]
      if (NUMERIC.includes(k)) patch[k] = v === null || String(v).trim() === '' ? (k === 'share_capital' ? null : 0) : Number(String(v).replace(/\s/g, '').replace(',', '.'))
      else patch[k] = typeof v === 'string' ? v.trim() || null : v
    }
    const { error } = await supabase.from('company').update(patch).eq('id', 1)
    setBusy(null)
    if (error) return setMsg({ ok: false, text: "L'enregistrement a échoué : " + error.message })
    setMsg({ ok: true, text: 'Paramètres enregistrés.' })
    await reload()
  }
  const submit = (section: string, keys: (keyof Company)[]) => (e: FormEvent) => {
    e.preventDefault()
    save(section, keys)
  }

  async function upload(key: keyof Company, file: File | undefined, maxW: number, maxH: number) {
    if (!file || !canEdit) return
    try {
      const url = await readFile(file, maxW, maxH)
      set(key, url as never)
      await save('branding', [key], { [key]: url } as Partial<Company>)
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }

  async function saveBank(e: FormEvent) {
    e.preventDefault()
    if (!bankForm) return
    const b = bankForm
    if (!b.bank_name?.trim() || !b.account_holder?.trim() || !b.account_number?.trim()) return setMsg({ ok: false, text: 'Banque, titulaire et numéro de compte sont obligatoires.' })
    setBusy('bank')
    let cashId = b.cash_account_id ?? null
    if (b.sync_treasury && !cashId) {
      const code = 'BQ-' + b.bank_name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 8) + '-' + b.account_number.trim().slice(-4)
      const r = await supabase.from('cash_accounts').insert({ code, name: `${b.bank_name.trim()} ${b.account_number.trim()}`, type: 'banque', opening_balance: 0 }).select('id').single()
      if (r.error) {
        setBusy(null)
        return setMsg({ ok: false, text: 'Création du compte de trésorerie impossible : ' + r.error.message })
      }
      cashId = (r.data as { id: string }).id
    }
    const row = {
      bank_name: b.bank_name.trim(),
      account_holder: b.account_holder.trim(),
      account_number: b.account_number.trim(),
      branch: b.branch?.trim() || null,
      iban: b.iban?.trim() || null,
      swift_bic: b.swift_bic?.trim() || null,
      is_default: !!b.is_default || banks.length === 0,
      cash_account_id: cashId,
    }
    const r = b.id ? await supabase.from('company_bank_accounts').update(row).eq('id', b.id) : await supabase.from('company_bank_accounts').insert(row)
    setBusy(null)
    if (r.error) return setMsg({ ok: false, text: "L'enregistrement a échoué : " + r.error.message })
    setBankForm(null)
    setMsg({ ok: true, text: 'Compte bancaire enregistré.' })
    reload()
  }
  async function deleteBank(b: BankAccount) {
    if (!window.confirm(`Supprimer le compte ${b.bank_name} ${b.account_number} ?`)) return
    const r = await supabase.from('company_bank_accounts').delete().eq('id', b.id)
    if (r.error) return setMsg({ ok: false, text: r.error.message })
    reload()
  }

  function go(id: string) {
    setActive(id)
    document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function preview() {
    if (!c) return
    const info: CompanyInfo = { ...c, banks }
    const w = window.open('', '_blank')
    if (!w) return alert('Autorisez les fenêtres pop-up pour voir l’aperçu.')
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Aperçu des documents</title>
      <style>* { box-sizing: border-box } body { font-size: 11px; color: #111; margin: 0 }
      .sign { display: flex; justify-content: space-between; margin-top: 36px } .sign div { width: 45%; border-top: 1px solid #999; padding-top: 6px; text-align: center; color: #555 }
      ${docCss(info)}</style></head><body>
      ${companyHeader(info, 'FACTURE', 'FA-2026-XXXX', 'Date : ' + new Date().toLocaleDateString('fr-FR'))}
      <p style="color:#999;text-align:center;margin:60px 0">… lignes du document …</p>
      <div class="sign"><div>Le client</div><div>${companySigner(info)}</div></div>
      ${companyFooter(info, { bank: true, terms: true, penalties: true })}${autoPrintScript({ ...info, auto_pdf_print: false })}</body></html>`)
    w.document.close()
  }

  const actives = NUMBERING.filter(([, , t]) => t && seqs.some((s) => s.doc_type === t)).length
  const isImg = (u: string | null) => !!u && u.startsWith('data:image')
  const Brand = ({ label, k, accept, maxW, maxH }: { label: string; k: keyof Company; accept: string; maxW: number; maxH: number }) => {
    const v = c[k] as string | null
    return (
      <div className="border border-gray-200 rounded-[4px] p-2 text-center flex flex-col">
        <p className="text-[10.5px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
        <div className="flex-1 flex items-center justify-center py-2 min-h-[52px]">
          {v ? isImg(v) ? <img src={v} alt="" className="max-h-10 object-contain" /> : <span className="text-[11px] font-semibold text-gray-600">PDF</span> : <span className="text-[12px] text-gray-300">—</span>}
        </div>
        {k === 'logo_url' ? (
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="text-[12px] text-emerald-700 font-semibold hover:underline">
            Remplacer
          </button>
        ) : canEdit ? (
          <label className="text-[12px] text-emerald-700 font-semibold hover:underline cursor-pointer">
            {v ? 'Remplacer' : k === 'pdf_header_url' || k === 'pdf_footer_url' ? 'Ajouter' : 'Remplacer'}
            <input type="file" accept={accept} className="hidden" onChange={(e) => upload(k, e.target.files?.[0], maxW, maxH)} />
          </label>
        ) : null}
        {v && canEdit && k !== 'logo_url' && (
          <button type="button" onClick={() => save('branding', [k], { [k]: null } as Partial<Company>)} className="text-[11px] text-red-600 hover:underline">
            Retirer
          </button>
        )}
      </div>
    )
  }

  const nav: [string, string][] = [
    ['adresse', 'Adresse'],
    ['fiscalite', 'Fiscalité'],
    ['banques', 'Banques'],
    ['documents', 'Documents'],
    ['numerotation', 'Numérotation'],
    ['branding', 'Branding'],
    ['options', 'Paramètres avancés'],
    ['suivi', 'Suivi'],
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Paramétrage de la société</h1>
          <p className="text-sm text-gray-500 mt-1">Configurez les informations de votre entreprise</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button type="submit" form="form-general" disabled={!!busy} className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold px-5 py-1.5 rounded-[4px] transition-colors">
              Enregistrer
            </button>
          )}
          <button type="button" onClick={() => reload()} className="text-sm font-semibold text-gray-500 hover:text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 px-5 py-1.5 rounded-[4px] transition-colors">
            Annuler
          </button>
          <button type="button" onClick={preview} className="text-sm font-semibold text-emerald-700 border border-emerald-500 bg-white hover:bg-emerald-50 px-4 py-1.5 rounded-[4px]">
            Aperçu document
          </button>
        </div>
        {c.logo_url && <img src={c.logo_url} alt="Logo" className="h-14 rounded-[4px] object-contain border border-gray-200 p-1 bg-white" />}
      </div>

      {!canEdit && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-[4px] px-4 py-2">Lecture seule : il faut la permission « Société – Modifier » pour changer ces paramètres.</div>}
      {msg && <div className={`text-sm rounded-[4px] px-4 py-2 border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      {/* Informations générales */}
      <div className="bg-white rounded-[4px] border border-gray-300">
        <form id="form-general" onSubmit={submit('general', GENERAL)} className="p-6 space-y-3">
          <h2 className="text-base font-semibold text-emerald-800 mb-1">Informations générales</h2>
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-56 flex-shrink-0">
              <div className="border border-gray-200 rounded-[4px] p-4 flex flex-col items-center gap-3">
                {c.logo_url ? <img src={c.logo_url} alt="Logo" className="max-h-28 object-contain" /> : <div className="h-24 w-full flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded">Aucun logo</div>}
                {canEdit && (
                  <label className="w-full text-center cursor-pointer border border-dashed border-emerald-400 text-emerald-700 font-semibold text-sm rounded-[4px] py-2 hover:bg-emerald-50">
                    ⇪ Changer le logo
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        try {
                          set('logo_url', await readFile(f, 480, 240))
                          setMsg({ ok: true, text: 'Logo chargé : cliquez sur Enregistrer pour le garder.' })
                        } catch (err) {
                          setMsg({ ok: false, text: (err as Error).message })
                        }
                      }}
                    />
                  </label>
                )}
                <p className="text-xs text-gray-400 self-start">PNG, JPG — 2 Mo max.</p>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <F label="Code société">
                <input {...tx('company_code')} placeholder="OMA-BF-001" />
              </F>
              <F label="Raison sociale" req>
                <input {...tx('name')} required />
              </F>
              <F label="Sigle">
                <input {...tx('sigle')} placeholder="OAMI" />
              </F>
              <F label="Forme juridique">
                <select {...sel('legal_form')}>
                  <Opts list={LEGAL_FORMS} empty="— Sélectionner —" />
                </select>
              </F>
              <F label="IFU">
                <input {...tx('ifu')} />
              </F>
              <F label="RCCM">
                <input {...tx('rccm')} />
              </F>
              <F label="CNSS / N° employeur">
                <input {...tx('cnss_number')} />
              </F>
              <F label="Activité principale">
                <input {...tx('main_activity')} placeholder="Fabrication de structures métalliques" />
              </F>
              <F label="Devise de base">
                <select {...sel('currency')}>
                  <Opts list={CURRENCIES} />
                </select>
              </F>
              <F label="Langue">
                <select {...sel('language')}>
                  <Opts list={LANGUAGES} />
                </select>
              </F>
              <F label="Pays">
                <input {...tx('country')} />
              </F>
              <F label="Ville">
                <input {...tx('city')} />
              </F>
              <F label="Fuseau horaire">
                <select {...sel('timezone')}>
                  <Opts list={TIMEZONES} />
                </select>
              </F>
              <F label="Date d'ouverture">
                <input {...tx('opened_at', 'date')} />
              </F>
              <F label="Statut">
                <select {...sel('status')}>
                  <Opts list={[['active', 'Active'], ['inactive', 'Inactive']]} />
                </select>
              </F>
              <F label="Email principal">
                <input {...tx('email', 'email')} />
              </F>
              <F label="Téléphone">
                <input {...tx('phone')} />
              </F>
              <F label="Site web">
                <input {...tx('website', 'url')} placeholder="https://www.oametal.bf" />
              </F>
              <F label="Commentaire" className="md:col-span-3">
                <textarea rows={2} value={c.notes ?? ''} disabled={!canEdit} onChange={(e) => set('notes', e.target.value)} placeholder="Société spécialisée dans la fabrication et la construction métallique…" className={area} />
              </F>
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button type="submit" disabled={busy === 'general'} className={saveBtn}>
                Enregistrer les modifications
              </button>
            </div>
          )}
        </form>
        <div className="border-t border-gray-200 px-6">
          <nav className="-mb-px flex gap-6 overflow-x-auto">
            {nav.map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => go(k)}
                className={`whitespace-nowrap py-3 px-1 border-b-2 text-sm transition-colors ${active === k ? 'border-emerald-600 text-emerald-800 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {l}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Adresse / Fiscalité / Banques */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div id="sec-adresse" className={`${card} xl:col-span-4`}>
          <form onSubmit={submit('adresse', ADRESSE)} className="p-6 space-y-3">
            <h2 className={h2}>Adresse et contacts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F label="Adresse complète" className="md:col-span-2">
                <textarea rows={2} value={c.address ?? ''} disabled={!canEdit} onChange={(e) => set('address', e.target.value)} className={area} />
              </F>
              <F label="Secteur / Quartier">
                <input {...tx('district')} />
              </F>
              <F label="Code postal">
                <input {...tx('postal_code')} />
              </F>
              <F label="BP">
                <input {...tx('po_box')} />
              </F>
              <F label="Contact principal">
                <input {...tx('main_contact')} />
              </F>
              <F label="Email comptable">
                <input {...tx('accounting_email', 'email')} />
              </F>
              <F label="Téléphone secondaire">
                <input {...tx('phone2')} />
              </F>
              <F label="Nom commercial">
                <input {...tx('trade_name')} />
              </F>
              <F label="Slogan">
                <input {...tx('slogan')} />
              </F>
            </div>
            {canEdit && (
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button type="submit" disabled={busy === 'adresse'} className={saveBtn}>
                  Enregistrer les modifications
                </button>
              </div>
            )}
          </form>
        </div>

        <div id="sec-fiscalite" className={`${card} xl:col-span-4`}>
          <form onSubmit={submit('fiscalite', FISCAL)} className="p-6 space-y-3">
            <h2 className={h2}>Fiscalité et obligations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F label="Régime fiscal">
                <select {...sel('fiscal_regime')}>
                  <Opts list={FISCAL_REGIMES} empty="—" />
                </select>
              </F>
              <F label="TVA par défaut">
                <select {...sel('vat_mode')}>
                  <Opts list={VAT_MODES} />
                </select>
              </F>
              <F label="Taux TVA (%)">
                <input {...tx('default_vat', 'number')} step="0.01" />
              </F>
              <F label="Marge minimale par défaut (%) sur coût">
                <input {...tx('minimum_margin_rate', 'number')} step="0.01" placeholder="0 = plancher au coût" />
              </F>
              <F label="Centre des impôts">
                <input {...tx('tax_center')} placeholder="Ouagadougou - Centre" />
              </F>
              <F label="Régime retenue">
                <select {...sel('withholding_regime')}>
                  <Opts list={WITHHOLDING} empty="—" />
                </select>
              </F>
              <F label="Nature contribuable">
                <select {...sel('taxpayer_type')}>
                  <Opts list={TAXPAYER} empty="—" />
                </select>
              </F>
            </div>
            <p className="text-[12px] text-gray-500">Exercice fiscal en cours : géré dans Paramètres → Exercices fiscaux. Adresse et contacts : onglet Adresse.</p>
            {canEdit && (
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button type="submit" disabled={busy === 'fiscalite'} className={saveBtn}>
                  Enregistrer les modifications
                </button>
              </div>
            )}
          </form>
        </div>

        <div id="sec-banques" className={`${card} xl:col-span-4`}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
            <h2 className={h2}>Coordonnées bancaires</h2>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setBankForm({ is_default: banks.length === 0 })
                  setTimeout(() => document.getElementById('sec-banque-complet')?.scrollIntoView({ behavior: 'smooth' }), 50)
                }}
                className="text-[13px] font-semibold text-emerald-700 hover:underline"
              >
                + Ajouter un compte
              </button>
            )}
          </div>
          <div className="p-3 space-y-2">
            {banks.length === 0 && <p className="text-[13px] text-gray-400 text-center py-4">Aucun compte bancaire — utilisez « + Ajouter un compte ».</p>}
            {banks.map((b) => (
              <div key={b.id} className="border border-gray-200 rounded-[4px] p-2 text-[13px]">
                <div className="flex items-center justify-between">
                  <b>{b.bank_name}</b>
                  {b.is_default && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">Principal</span>}
                </div>
                <p className="font-mono text-gray-700">{b.account_number}</p>
                <p className="text-gray-500 text-[12px]">{[b.account_holder, b.branch].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Numérotation / Branding / Options / Suivi */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div id="sec-numerotation" className={`${card} xl:col-span-3 overflow-hidden`}>
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-gray-200">
            <h2 className={h2}>Numérotation des documents</h2>
          </div>
          <p className="px-3 pt-2 text-[11.5px] text-gray-500">
            {actives} actif(s), {NUMBERING.length - actives} non initialisé(s) — exercice courant
          </p>
          <div className="px-2 pb-2 max-h-[420px] overflow-y-auto">
            <table className="w-full table-fixed text-[11.5px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="px-1 py-1.5 w-[38%]">Document</th>
                  <th className="px-1 py-1.5 text-right w-[14%]">N°</th>
                  <th className="px-1 py-1.5 w-[30%]">Format</th>
                  <th className="px-1 py-1.5">Statut</th>
                </tr>
              </thead>
              <tbody>
                {NUMBERING.map(([label, prefix, table]) => {
                  const s = table ? seqs.find((x) => x.doc_type === table) : undefined
                  return (
                    <tr key={label} className="border-b border-gray-100 even:bg-gray-50/40">
                      <td className="px-1 py-1.5 truncate" title={label}>
                        {label}
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono tabular-nums truncate">{s ? String(s.last_number).padStart(4, '0') : '—'}</td>
                      <td className="px-1 py-1.5 font-mono text-[10px] truncate" title={`${s?.prefix ?? prefix}-YYYY-####`}>
                        {s?.prefix ?? prefix}-YYYY-####
                      </td>
                      <td className={`px-1 py-1.5 text-[10.5px] ${s ? 'text-emerald-700' : 'text-gray-400'}`}>{s ? 'Actif' : 'Non initialisé'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div id="sec-branding" className={`${card} xl:col-span-3`}>
          <div className="px-3 py-1.5 border-b border-gray-200">
            <h2 className={h2}>Branding &amp; documents</h2>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              <Brand label="Logo" k="logo_url" accept="image/*" maxW={480} maxH={240} />
              <Brand label="Cachet" k="stamp_url" accept="image/*" maxW={300} maxH={300} />
              <Brand label="Signature DG" k="signature_url" accept="image/*" maxW={400} maxH={200} />
              <Brand label="En-tête PDF" k="pdf_header_url" accept="image/*,application/pdf" maxW={1600} maxH={400} />
              <Brand label="Pied de page PDF" k="pdf_footer_url" accept="image/*,application/pdf" maxW={1600} maxH={300} />
            </div>
            <p className="text-[11.5px] text-gray-400 mt-2">Formats acceptés : PNG, JPG, PDF — 2 Mo max. par fichier.</p>
          </div>
        </div>

        <div id="sec-options" className={`${card} xl:col-span-4`}>
          <div className="px-3 py-1.5 border-b border-gray-200">
            <h2 className={h2}>Options globales</h2>
          </div>
          <form onSubmit={submit('options', OPTION_KEYS)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-4 px-1 py-1">
              {OPTIONS.map(([k, l]) => (
                <label key={k} className="flex items-center justify-between gap-3 cursor-pointer px-3 py-2 rounded-[3px] hover:bg-gray-50">
                  <span className="text-[13px] text-gray-800">{l}</span>
                  <input type="checkbox" className="sr-only peer" checked={!!c[k as keyof Company]} disabled={!canEdit} onChange={(e) => set(k as keyof Company, e.target.checked as never)} />
                  <span className="relative w-8 h-[18px] flex-shrink-0 bg-gray-200 peer-checked:bg-emerald-600 rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-[14px] after:h-[14px] after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-[14px]" />
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-t border-gray-200 bg-gray-50/60">
              <p className="text-[11.5px] text-gray-400 leading-tight">Le mode maintenance bloque l'accès aux utilisateurs non administrateurs.</p>
              {canEdit && (
                <button type="submit" disabled={busy === 'options'} className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px] font-medium px-4 py-1.5 rounded-full transition-colors whitespace-nowrap">
                  Enregistrer
                </button>
              )}
            </div>
          </form>
        </div>

        <div id="sec-suivi" className={`${card} xl:col-span-2`}>
          <div className="px-3 py-1.5 border-b border-gray-200">
            <h2 className={h2}>Suivi</h2>
          </div>
          <div className="divide-y divide-gray-100">
            <div className="px-3 py-2.5">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Statut</p>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[12px] font-semibold ${c.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'}`}>{c.status === 'active' ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Créée par</p>
              <p className="text-[13px] text-gray-700">{c.created_by_name ?? '—'}</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Date de création</p>
              <p className="text-[13px] text-gray-700 font-mono tabular-nums">{dtFr(c.created_at)}</p>
            </div>
            <div className="px-3 py-2.5">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">Dernière modification</p>
              <p className="text-[13px] text-gray-700 font-mono tabular-nums">{dtFr(c.updated_at)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Mentions légales */}
      <div id="sec-legal" className={card}>
        <form onSubmit={submit('legal', LEGAL)} className="p-6 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <F label="NIF">
              <input {...tx('nif')} />
            </F>
            <F label="N° TVA (identifiant)">
              <input {...tx('vat_number')} />
            </F>
            <F label="Capital social (FCFA)">
              <input {...tx('share_capital', 'number')} />
            </F>
            <div>
              <label className={lab}>Assujetti à la TVA</label>
              <div className="flex items-center gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                  <input type="radio" name="is_vat_subject" checked={c.is_vat_subject} disabled={!canEdit} onChange={() => set('is_vat_subject', true)} /> Oui
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-[13px]">
                  <input type="radio" name="is_vat_subject" checked={!c.is_vat_subject} disabled={!canEdit} onChange={() => set('is_vat_subject', false)} /> Non
                </label>
              </div>
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button type="submit" disabled={busy === 'legal'} className={saveBtn}>
                Enregistrer
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Documents */}
      <div id="sec-documents" className={card}>
        <form onSubmit={submit('documents', DOCS)} className="p-6 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Mise en page</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <F label="Couleur principale">
                <div className="flex items-center gap-3">
                  <input type="color" value={c.primary_color} disabled={!canEdit} onChange={(e) => set('primary_color', e.target.value)} className="h-9 w-12 border border-gray-300 rounded cursor-pointer" />
                  <input value={c.primary_color} disabled={!canEdit} onChange={(e) => set('primary_color', e.target.value)} placeholder="#1e40af" className={`${input} font-mono`} />
                </div>
              </F>
              <F label="Police">
                <select {...sel('font_family')}>
                  <Opts list={FONTS} />
                </select>
              </F>
              <F label="Format page">
                <select {...sel('page_size')}>
                  <Opts list={PAGE_SIZES} />
                </select>
              </F>
              <F label="Orientation">
                <select {...sel('orientation')}>
                  <Opts list={ORIENTATIONS} />
                </select>
              </F>
              <div className="flex items-center gap-3 pt-6">
                <input id="show_logo" type="checkbox" className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" checked={c.show_logo} disabled={!canEdit} onChange={(e) => set('show_logo', e.target.checked)} />
                <label htmlFor="show_logo" className="text-[13px] text-gray-700">
                  Afficher le logo
                </label>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 pt-6">
                  <input id="show_watermark" type="checkbox" className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500" checked={c.show_watermark} disabled={!canEdit} onChange={(e) => set('show_watermark', e.target.checked)} />
                  <label htmlFor="show_watermark" className="text-[13px] text-gray-700">
                    Afficher un filigrane
                  </label>
                </div>
                <input {...tx('watermark_text')} placeholder="Texte du filigrane" />
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Colonnes affichées sur les documents</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PRODUCT_COLUMNS.map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer text-[13px]">
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-emerald-600 rounded"
                    checked={c.product_columns.includes(k)}
                    disabled={!canEdit}
                    onChange={(e) => set('product_columns', e.target.checked ? [...c.product_columns, k] : c.product_columns.filter((x) => x !== k))}
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-100 pt-5 grid grid-cols-1 gap-4">
            <h3 className="text-sm font-semibold text-gray-700">Textes</h3>
            <F label="Pied de page personnalisé">
              <textarea rows={2} value={c.footer_text ?? ''} disabled={!canEdit} onChange={(e) => set('footer_text', e.target.value)} className={area} />
            </F>
            <F label="Conditions générales de vente (CGV)">
              <textarea rows={3} value={c.terms_conditions ?? ''} disabled={!canEdit} onChange={(e) => set('terms_conditions', e.target.value)} className={area} />
            </F>
            <F label="Mentions de pénalités de retard">
              <textarea rows={2} value={c.penalty_mentions ?? ''} disabled={!canEdit} onChange={(e) => set('penalty_mentions', e.target.value)} placeholder="Laisser vide pour utiliser la mention légale OHADA par défaut" className={area} />
              <p className="text-[12px] text-gray-500 mt-1">Affiché en bas des factures (bloc pénalités). Vide = texte OHADA standard.</p>
            </F>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Signature &amp; cachet</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <F label="Nom signataire">
                <input {...tx('signature_name')} />
              </F>
              <F label="Titre du signataire">
                <input {...tx('signature_title')} />
              </F>
              <F label="Image de signature">
                <div className="flex items-center gap-3">
                  {c.signature_url && <img src={c.signature_url} alt="" className="h-10 object-contain border border-gray-200 rounded p-1" />}
                  {canEdit && <input type="file" accept="image/*" onChange={(e) => upload('signature_url', e.target.files?.[0], 400, 200)} className="text-[12px]" />}
                </div>
              </F>
              <F label="Cachet (tampon)">
                <div className="flex items-center gap-3">
                  {c.stamp_url && <img src={c.stamp_url} alt="" className="h-10 object-contain border border-gray-200 rounded p-1" />}
                  {canEdit && <input type="file" accept="image/*" onChange={(e) => upload('stamp_url', e.target.files?.[0], 300, 300)} className="text-[12px]" />}
                </div>
              </F>
            </div>
          </div>
          {canEdit && (
            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button type="submit" disabled={busy === 'documents'} className={saveBtn}>
                Enregistrer
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Comptes bancaires (détail) */}
      <div id="sec-banque-complet" className="space-y-4 scroll-mt-24">
        {canEdit && (
          <div className="flex justify-end">
            <button type="button" onClick={() => setBankForm({ is_default: banks.length === 0 })} className="bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px] transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter un compte
            </button>
          </div>
        )}
        {bankForm && (
          <div className="bg-white rounded-[4px] border border-emerald-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">{bankForm.id ? 'Modifier le compte bancaire' : 'Nouveau compte bancaire'}</h3>
            <form onSubmit={saveBank} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(
                [
                  ['bank_name', 'Banque', true],
                  ['account_holder', 'Titulaire', true],
                  ['account_number', 'Numéro de compte', true],
                  ['branch', 'Agence', false],
                  ['iban', 'IBAN', false],
                  ['swift_bic', 'SWIFT/BIC', false],
                ] as [keyof BankAccount, string, boolean][]
              ).map(([k, l, r]) => (
                <F key={k} label={l} req={r}>
                  <input value={(bankForm[k] as string) ?? ''} required={r} onChange={(e) => setBankForm({ ...bankForm, [k]: e.target.value })} className={input} />
                </F>
              ))}
              <div className="flex items-center gap-3">
                <input id="is_default" type="checkbox" className="w-4 h-4 text-emerald-600 rounded" checked={!!bankForm.is_default} onChange={(e) => setBankForm({ ...bankForm, is_default: e.target.checked })} />
                <label htmlFor="is_default" className="text-[13px] text-gray-700">
                  Compte principal
                </label>
              </div>
              {!bankForm.cash_account_id && (
                <div className="md:col-span-2 flex items-start gap-3 bg-[#eef5f0] border border-emerald-100 rounded-[4px] p-3">
                  <input id="sync_treasury" type="checkbox" className="w-4 h-4 mt-0.5 text-emerald-700 rounded" checked={!!bankForm.sync_treasury} onChange={(e) => setBankForm({ ...bankForm, sync_treasury: e.target.checked })} />
                  <label htmlFor="sync_treasury" className="text-[13px] text-gray-700">
                    <b>Créer le compte de trésorerie associé</b>
                    <br />
                    <span className="text-gray-500">Rend ce compte opérationnel (rapprochement bancaire, soldes, transactions) — évite la double saisie.</span>
                  </label>
                </div>
              )}
              <div className="md:col-span-2 flex gap-3 justify-end">
                <button type="button" onClick={() => setBankForm(null)} className="text-sm font-semibold text-gray-500 border border-gray-300 bg-white hover:bg-gray-50 px-4 py-1.5 rounded-[4px]">
                  Annuler
                </button>
                <button type="submit" disabled={busy === 'bank'} className={saveBtn}>
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="bg-white rounded-[4px] border border-gray-300 overflow-x-auto">
          {banks.length === 0 ? (
            <p className="p-6 text-center text-[13px] text-gray-400">Aucun compte bancaire enregistré.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[#eef5f0] text-emerald-900 text-[11px] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Banque</th>
                  <th className="px-3 py-2 text-left">Titulaire</th>
                  <th className="px-3 py-2 text-left">N° de compte</th>
                  <th className="px-3 py-2 text-left">Agence</th>
                  <th className="px-3 py-2 text-left">IBAN</th>
                  <th className="px-3 py-2 text-left">SWIFT/BIC</th>
                  <th className="px-3 py-2 text-left">Trésorerie</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {banks.map((b) => (
                  <tr key={b.id}>
                    <td className="px-3 py-2 font-semibold">
                      {b.bank_name} {b.is_default && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Principal</span>}
                    </td>
                    <td className="px-3 py-2">{b.account_holder}</td>
                    <td className="px-3 py-2 font-mono">{b.account_number}</td>
                    <td className="px-3 py-2">{b.branch}</td>
                    <td className="px-3 py-2 font-mono">{b.iban}</td>
                    <td className="px-3 py-2 font-mono">{b.swift_bic}</td>
                    <td className="px-3 py-2">{b.cash_account_id ? 'Lié' : '—'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-3">
                      {canEdit && (
                        <>
                          <button type="button" onClick={() => setBankForm({ ...b })} className="text-emerald-700 hover:underline">
                            Modifier
                          </button>
                          <button type="button" onClick={() => deleteBank(b)} className="text-red-600 hover:underline">
                            Supprimer
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
