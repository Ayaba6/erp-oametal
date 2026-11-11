// Informations société communes à tous les documents imprimés
// (devis, commande, BL, facture, reçu, bon de commande fournisseur, fiches internes).
// Elles se règlent dans Paramètres › Société (mêmes rubriques que l'ancien A3 ERP).
import { supabase } from './supabase'

export type BankAccount = {
  id: string
  bank_name: string
  account_holder: string
  account_number: string
  branch: string | null
  iban: string | null
  swift_bic: string | null
  is_default: boolean
  cash_account_id: string | null
}

export type CompanyInfo = {
  company_code: string | null
  name: string
  trade_name: string | null
  sigle: string | null
  legal_form: string | null
  ifu: string | null
  rccm: string | null
  cnss_number: string | null
  main_activity: string | null
  currency: string
  language: string
  country: string | null
  city: string | null
  timezone: string
  opened_at: string | null
  status: string
  email: string | null
  phone: string | null
  website: string | null
  notes: string | null
  logo_url: string | null
  address: string | null
  district: string | null
  postal_code: string | null
  po_box: string | null
  main_contact: string | null
  accounting_email: string | null
  phone2: string | null
  slogan: string | null
  fiscal_regime: string | null
  vat_mode: string
  default_vat: number
  minimum_margin_rate: number
  tax_center: string | null
  withholding_regime: string | null
  taxpayer_type: string | null
  nif: string | null
  vat_number: string | null
  share_capital: number | null
  is_vat_subject: boolean
  primary_color: string
  font_family: string
  page_size: string
  orientation: string
  show_logo: boolean
  show_watermark: boolean
  watermark_text: string | null
  product_columns: string[]
  footer_text: string | null
  terms_conditions: string | null
  penalty_mentions: string | null
  signature_name: string | null
  signature_title: string | null
  stamp_url: string | null
  signature_url: string | null
  pdf_header_url: string | null
  pdf_footer_url: string | null
  multi_sites: boolean
  vat_management: boolean
  validation_workflow: boolean
  electronic_signature: boolean
  auto_pdf_print: boolean
  email_notifications: boolean
  secondary_currency: boolean
  maintenance_mode: boolean
  created_by_name: string | null
  created_at: string | null
  updated_at: string | null
  banks: BankAccount[]
}

// Listes reprises à l'identique de l'ancien ERP
export const LEGAL_FORMS: [string, string][] = [
  ['SARL', 'SARL'],
  ['SA', 'Société Anonyme (SA)'],
  ['SAS', 'Société par Actions Simplifiée (SAS)'],
  ['EI', 'Entreprise Individuelle'],
  ['SUARL', 'SUARL'],
  ['GIE', 'GIE'],
  ['Association', 'Association'],
]
export const FISCAL_REGIMES: [string, string][] = [
  ['reel_normal', 'Régime réel normal'],
  ['reel_simplifie', 'Régime réel simplifié'],
  ['cme', 'Contribution micro-entreprise'],
]
export const VAT_MODES: [string, string][] = [
  ['collectee', 'Collectée'],
  ['exoneree', 'Exonérée'],
]
export const WITHHOLDING: [string, string][] = [
  ['source_tva', 'À la source / TVA'],
  ['aucun', 'Aucun'],
]
export const TAXPAYER: [string, string][] = [
  ['personne_morale', 'Personne morale'],
  ['personne_physique', 'Personne physique'],
]
export const LANGUAGES: [string, string][] = [
  ['fr', 'Français (France)'],
  ['en', 'English'],
]
export const TIMEZONES: [string, string][] = [
  ['GMT', "(GMT) Afrique de l'Ouest — Ouagadougou / Dakar"],
  ['GMT+1', '(GMT+1) Afrique centrale'],
]
export const CURRENCIES: [string, string][] = [['XOF', 'XOF – Franc CFA BCEAO']]
export const FONTS: [string, string][] = [
  ['DejaVu Sans', 'DejaVu Sans (défaut)'],
  ['DejaVu Serif', 'DejaVu Serif'],
  ['Helvetica', 'Helvetica'],
  ['Times New Roman', 'Times New Roman'],
]
export const PAGE_SIZES: [string, string][] = [
  ['A4', 'A4'],
  ['A5', 'A5'],
  ['Letter', 'Letter'],
]
export const ORIENTATIONS: [string, string][] = [
  ['portrait', 'Portrait'],
  ['landscape', 'Paysage'],
]
export const PRODUCT_COLUMNS: [string, string][] = [
  ['reference', 'Référence'],
  ['description', 'Description'],
  ['longueur', 'Longueur'],
  ['epaisseur', 'Épaisseur'],
  ['quantity', 'Quantité'],
  ['unit_price', 'Prix unitaire'],
  ['discount', 'Remise %'],
  ['tax', 'TVA %'],
  ['total_ht', 'Total HT'],
  ['total_ttc', 'Total TTC'],
]
export const OPTIONS: [keyof CompanyInfo, string][] = [
  ['multi_sites', 'Multi-sites'],
  ['vat_management', 'Gestion TVA'],
  ['validation_workflow', 'Validation workflow'],
  ['electronic_signature', 'Signature électronique'],
  ['auto_pdf_print', 'Impression auto PDF'],
  ['email_notifications', 'Notifications email'],
  ['secondary_currency', 'Devise secondaire'],
  ['maintenance_mode', 'Mode maintenance'],
]

// Mention légale utilisée quand le champ « pénalités de retard » est vide
export const OHADA_PENALTY =
  "En cas de retard de paiement, des pénalités de retard sont exigibles de plein droit au taux d'intérêt légal en vigueur, conformément à l'Acte uniforme OHADA relatif au droit commercial général, ainsi qu'une indemnité pour frais de recouvrement."

export const labelOf = (list: [string, string][], v: string | null | undefined) => list.find(([k]) => k === v)?.[1] ?? v ?? ''

const DEFAULTS: Omit<CompanyInfo, 'banks'> = {
  company_code: null, name: 'OA METAL INDUSTRIE', trade_name: null, sigle: null, legal_form: null, ifu: null, rccm: null, cnss_number: null,
  main_activity: null, currency: 'XOF', language: 'fr', country: 'Burkina Faso', city: null, timezone: 'GMT', opened_at: null, status: 'active',
  email: null, phone: null, website: null, notes: null, logo_url: null, address: null, district: null, postal_code: null, po_box: null,
  main_contact: null, accounting_email: null, phone2: null, slogan: null, fiscal_regime: null, vat_mode: 'collectee', default_vat: 18,
  minimum_margin_rate: 0, tax_center: null, withholding_regime: null, taxpayer_type: null, nif: null, vat_number: null, share_capital: null,
  is_vat_subject: true, primary_color: '#047857', font_family: 'DejaVu Sans', page_size: 'A4', orientation: 'portrait', show_logo: true,
  show_watermark: false, watermark_text: 'CONFIDENTIEL', product_columns: ['description', 'longueur', 'quantity', 'unit_price', 'tax', 'total_ht', 'total_ttc'],
  footer_text: null, terms_conditions: null, penalty_mentions: null, signature_name: null, signature_title: null, stamp_url: null,
  signature_url: null, pdf_header_url: null, pdf_footer_url: null, multi_sites: false, vat_management: true, validation_workflow: false,
  electronic_signature: false, auto_pdf_print: false, email_notifications: false, secondary_currency: false, maintenance_mode: false,
  created_by_name: null, created_at: null, updated_at: null,
}

export async function loadCompany(): Promise<CompanyInfo> {
  const [c, b] = await Promise.all([
    supabase.from('company').select('*').eq('id', 1).maybeSingle(),
    supabase.from('company_bank_accounts').select('*').order('is_default', { ascending: false }).order('created_at'),
  ])
  const row = (c.data as Partial<CompanyInfo> | null) ?? {}
  const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined))
  return { ...DEFAULTS, ...clean, banks: (b.data as BankAccount[] | null) ?? [] } as CompanyInfo
}

export const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const money = (n: number) => new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ')
const join = (parts: (string | null | undefined | false)[], sep: string) => parts.filter(Boolean).join(sep)
const isImage = (u: string | null) => !!u && /^data:image\/|\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u)

export const displayName = (c: CompanyInfo) => c.name || c.trade_name || 'OA METAL INDUSTRIE'
export const hasCol = (c: CompanyInfo, k: string) => c.product_columns.includes(k)

const FONT_STACK: Record<string, string> = {
  'DejaVu Sans': "'DejaVu Sans', Verdana, Arial, sans-serif",
  'DejaVu Serif': "'DejaVu Serif', Georgia, 'Times New Roman', serif",
  Helvetica: 'Helvetica, Arial, sans-serif',
  'Times New Roman': "'Times New Roman', Times, serif",
}

// Remplace la couleur verte par défaut des feuilles de style par la couleur principale de la société
export function themed(css: string, c: CompanyInfo) {
  const pc = /^#[0-9a-f]{6}$/i.test(c.primary_color) ? c.primary_color : '#047857'
  return css.replace(/#047857/gi, pc).replace(/#064e3b/gi, pc)
}

// Styles de base : couleur, police, format et orientation de page (page = false pour les fiches internes)
export function docCss(c: CompanyInfo, opts: { page?: boolean } = { page: true }) {
  const pc = /^#[0-9a-f]{6}$/i.test(c.primary_color) ? c.primary_color : '#047857'
  return `
  ${opts.page !== false ? `@page { size: ${c.page_size || 'A4'} ${c.orientation === 'landscape' ? 'landscape' : 'portrait'}; margin: 12mm }` : ''}
  body { font-family: ${FONT_STACK[c.font_family] ?? FONT_STACK['DejaVu Sans']} }
  .ch { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid ${pc}; padding-bottom: 8px }
  .ch .id { display: flex; gap: 12px; align-items: flex-start }
  .ch .logo { max-height: 62px; max-width: 170px; object-fit: contain }
  .ch .nm { font-size: 16px; font-weight: 800; color: ${pc}; line-height: 1.2 }
  .ch .sl { font-style: italic; color: ${pc}; font-size: 10px; margin: 1px 0 3px }
  .ch .ad { color: #444; line-height: 1.5; font-size: 10.5px }
  .ch .doc { text-align: right; white-space: nowrap } .ch .doc h1 { margin: 0; font-size: 20px; color: ${pc} } .ch .doc .n { font: 700 14px monospace }
  .ch.small { border-bottom-width: 2px; padding-bottom: 6px } .ch.small .logo { max-height: 40px } .ch.small .nm { font-size: 13px } .ch.small .doc h1 { font-size: 16px }
  .himg { width: 100%; max-height: 120px; object-fit: contain; display: block; margin-bottom: 6px }
  .fimg { width: 100%; max-height: 90px; object-fit: contain; display: block; margin-top: 8px }
  .cgv { margin-top: 14px; font-size: 9px; color: #555; white-space: pre-line; border-top: 1px dashed #c3d3c9; padding-top: 6px }
  .cgv b { color: #333 }
  .legal { margin-top: 22px; border-top: 1px solid #c3d3c9; padding-top: 6px; text-align: center; color: #555; font-size: 9px; line-height: 1.5 }
  .wm { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 90px; font-weight: 800; color: rgba(0,0,0,.06); transform: rotate(-30deg); z-index: 0; pointer-events: none }
  .sigimg { max-height: 60px; max-width: 160px; object-fit: contain; display: block; margin: 4px auto 0 }
`
}

// En-tête : image d'en-tête PDF si fournie, sinon logo + raison sociale + coordonnées ; titre du document à droite
export function companyHeader(c: CompanyInfo, title: string, number?: string, dateLine?: string, opts: { small?: boolean } = {}) {
  const docBlock = `<div class="doc"><h1>${esc(title)}</h1>${number ? `<div class="n">${esc(number)}</div>` : ''}${dateLine ? `<div>${esc(dateLine)}</div>` : ''}</div>`
  const wm = c.show_watermark && c.watermark_text ? `<div class="wm">${esc(c.watermark_text)}</div>` : ''
  if (!opts.small && isImage(c.pdf_header_url)) return `${wm}<img class="himg" src="${esc(c.pdf_header_url)}" alt=""><div class="ch"><div></div>${docBlock}</div>`
  const logo = c.show_logo && c.logo_url ? `<img class="logo" src="${esc(c.logo_url)}" alt="">` : ''
  const address = join([c.address, c.district, c.po_box && 'BP ' + c.po_box, join([c.postal_code, c.city], ' '), c.country], ' – ')
  const phones = join([c.phone && 'Tél : ' + c.phone, c.phone2], ' / ')
  const contact = join([phones, c.email, c.website], ' · ')
  const ids = join([c.ifu && 'IFU : ' + c.ifu, c.rccm && 'RCCM : ' + c.rccm, c.nif && 'NIF : ' + c.nif], ' · ')
  const nm = esc(displayName(c)) + (c.sigle ? ` <span style="font-weight:600">(${esc(c.sigle)})</span>` : '')
  return `${wm}<div class="ch${opts.small ? ' small' : ''}">
    <div class="id">${logo}<div>
      <div class="nm">${nm}</div>
      ${c.slogan && !opts.small ? `<div class="sl">${esc(c.slogan)}</div>` : ''}
      <div class="ad">${esc(address)}${contact ? '<br>' + esc(contact) : ''}${ids && !opts.small ? '<br>' + esc(ids) : ''}</div>
    </div></div>
    ${docBlock}
  </div>`
}

// Pied de page légal + coordonnées bancaires + CGV / pénalités de retard
export function companyFooter(c: CompanyInfo, opts: { bank?: boolean; terms?: boolean; penalties?: boolean } = {}) {
  const l1 = join(
    [
      esc(displayName(c)),
      c.legal_form && esc(c.legal_form) + (c.share_capital ? ` au capital de ${money(Number(c.share_capital))} FCFA` : ''),
      c.fiscal_regime && esc(labelOf(FISCAL_REGIMES, c.fiscal_regime)),
    ],
    ' — ',
  )
  const l2 = join(
    [
      c.ifu && 'IFU : ' + esc(c.ifu),
      c.rccm && 'RCCM : ' + esc(c.rccm),
      c.nif && 'NIF : ' + esc(c.nif),
      c.vat_number && 'N° TVA : ' + esc(c.vat_number),
      c.cnss_number && 'CNSS : ' + esc(c.cnss_number),
      c.tax_center && 'Centre des impôts : ' + esc(c.tax_center),
    ],
    ' · ',
  )
  const l3 = join([esc(join([c.address, c.po_box && 'BP ' + c.po_box, c.city, c.country], ', ')), (c.phone || c.phone2) && 'Tél : ' + esc(join([c.phone, c.phone2], ' / ')), c.email && esc(c.email), c.website && esc(c.website)], ' · ')
  const bank = opts.bank
    ? c.banks
        .map((b) => join([esc(b.bank_name) + (b.branch ? ' (' + esc(b.branch) + ')' : ''), 'Titulaire : ' + esc(b.account_holder), 'Compte : ' + esc(b.account_number), b.iban && 'IBAN : ' + esc(b.iban), b.swift_bic && 'SWIFT : ' + esc(b.swift_bic)], ' · '))
        .join('<br>')
    : ''
  const blocks = [
    opts.terms && c.terms_conditions ? `<b>Conditions générales de vente</b>\n${esc(c.terms_conditions)}` : '',
    opts.penalties ? `<b>Pénalités de retard</b>\n${esc(c.penalty_mentions || OHADA_PENALTY)}` : '',
  ].filter(Boolean)
  const img = isImage(c.pdf_footer_url) ? `<img class="fimg" src="${esc(c.pdf_footer_url)}" alt="">` : ''
  return `${blocks.length ? `<div class="cgv">${blocks.join('\n\n')}</div>` : ''}
  <div class="legal">${join([l1, l2, l3, bank && 'Coordonnées bancaires : ' + bank, c.footer_text && esc(c.footer_text)], '<br>')}</div>${img}`
}

// Bloc signature côté société : nom, titre, image de signature et cachet
export function companySigner(c: CompanyInfo, fallback = '') {
  const who = join([c.signature_name, c.signature_title], ', ')
  const imgs = [c.signature_url, c.stamp_url].filter((u) => isImage(u)).map((u) => `<img class="sigimg" src="${esc(u)}" alt="">`).join('')
  return `Pour ${esc(displayName(c))}${who ? '<br>' + esc(who) : fallback ? '<br>' + esc(fallback) : ''}${imgs ? `<div style="display:flex;gap:8px;justify-content:center">${imgs}</div>` : ''}`
}

// Impression automatique (option « Impression auto PDF ») : sinon l'aperçu reste affiché
export const autoPrintScript = (c: CompanyInfo) =>
  c.auto_pdf_print
    ? '<script>window.onload = () => setTimeout(() => window.print(), 300)</script>'
    : '<style>@media print { .noprint { display: none } }</style><button class="noprint" onclick="window.print()" style="position:fixed;top:10px;right:10px;padding:8px 16px;background:#047857;color:#fff;border:0;border-radius:4px;font-weight:600;cursor:pointer;z-index:9">Imprimer / PDF</button>'
