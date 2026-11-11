// Impression des documents de vente (devis, commande, BL, facture, reçu) — Imprimer → Enregistrer en PDF
import { DocLine, dFr, dtFr, fcfa, lineTva, qty } from './salesData'
import { CompanyInfo, autoPrintScript, companyFooter, companyHeader, companySigner, docCss, esc, hasCol, loadCompany, themed } from '../../lib/companyPrint'

type ClientRef = { code: string | null; name: string; phone: string | null; address: string | null; city: string | null; ifu: string | null } | null

const STYLE = `
  @page { size: A4; margin: 12mm }
  * { box-sizing: border-box }
  body { font-family: Inter, Arial, sans-serif; font-size: 11px; color: #111; margin: 0 }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #047857; padding-bottom: 8px }
  .co b { font-size: 16px; color: #064e3b } .co div { color: #444; line-height: 1.5 }
  .doc { text-align: right } .doc h1 { margin: 0; font-size: 20px; color: #047857 } .doc .n { font: 700 14px monospace }
  .boxes { display: flex; gap: 12px; margin: 12px 0 }
  .box { flex: 1; border: 1px solid #c3d3c9; border-radius: 4px }
  .box h3 { margin: 0; padding: 4px 8px; background: #eef5f0; color: #064e3b; font-size: 10px; text-transform: uppercase }
  .box .b { padding: 6px 8px; line-height: 1.6 }
  table { width: 100%; border-collapse: collapse }
  th { background: #3b4248; color: #fff; text-align: left; padding: 5px; font-size: 9.5px; text-transform: uppercase }
  td { padding: 5px; border-bottom: 1px solid #e5e7eb; vertical-align: top }
  .r { text-align: right; white-space: nowrap } .c { text-align: center } .m { font-family: monospace }
  .tot { margin-left: auto; width: 290px; margin-top: 10px }
  .tot div { display: flex; justify-content: space-between; padding: 3px 0 }
  .tot .big { border-top: 2px solid #047857; font-size: 14px; font-weight: 700; color: #047857; margin-top: 4px; padding-top: 6px }
  .notes { margin-top: 12px; padding: 8px; border: 1px dashed #c3d3c9; border-radius: 4px; white-space: pre-line }
  .sign { display: flex; justify-content: space-between; margin-top: 36px }
  .sign div { width: 45%; border-top: 1px solid #999; padding-top: 6px; text-align: center; color: #555 }
  .words { margin-top: 8px; font-style: italic; color: #333 }
`

// Montant en lettres (francs CFA)
function words(n: number): string {
  const u = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
  const t = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante']
  const below100 = (x: number): string => {
    if (x < 17) return u[x]
    if (x < 20) return 'dix-' + u[x - 10]
    if (x < 70) return t[Math.floor(x / 10)] + (x % 10 === 1 ? ' et un' : x % 10 ? '-' + u[x % 10] : '')
    if (x < 80) return 'soixante' + (x === 71 ? ' et onze' : '-' + below100(x - 60))
    return 'quatre-vingt' + (x === 80 ? 's' : '-' + below100(x - 80))
  }
  const below1000 = (x: number): string => {
    const h = Math.floor(x / 100)
    const r = x % 100
    const hs = h === 0 ? '' : h === 1 ? 'cent' : u[h] + ' cent' + (r === 0 ? 's' : '')
    return [hs, r ? below100(r) : ''].filter(Boolean).join(' ')
  }
  n = Math.round(n)
  if (n === 0) return 'zéro'
  const parts: string[] = []
  const mil = Math.floor(n / 1_000_000_000)
  const m = Math.floor((n % 1_000_000_000) / 1_000_000)
  const k = Math.floor((n % 1_000_000) / 1000)
  const r = n % 1000
  if (mil) parts.push(below1000(mil) + ' milliard' + (mil > 1 ? 's' : ''))
  if (m) parts.push(below1000(m) + ' million' + (m > 1 ? 's' : ''))
  if (k) parts.push(k === 1 ? 'mille' : below1000(k).replace(/s$/, '') + ' mille')
  if (r) parts.push(below1000(r))
  return parts.join(' ')
}

function header(c: CompanyInfo, title: string, number: string, date: string) {
  return companyHeader(c, title, number, 'Date : ' + dFr(date))
}

// Colonnes des lignes selon Paramètres › Société › « Colonnes affichées sur les documents »
type Col = { h: string; cls: string; cell: (l: DocLine) => string }
function lineCols(c: CompanyInfo, priced: boolean): Col[] {
  const cols: Col[] = []
  const ref = hasCol(c, 'reference')
  const desc = hasCol(c, 'description') || !ref
  if (ref) cols.push({ h: 'Référence', cls: '', cell: (l) => `<b>${esc(l.products?.code ?? '')}</b>` })
  if (desc) cols.push({ h: 'Désignation', cls: '', cell: (l) => esc(l.description) })
  if (hasCol(c, 'longueur')) {
    cols.push({ h: 'Nb tôles', cls: 'r', cell: (l) => String(l.sheets_count ?? '') })
    cols.push({ h: 'Long. m', cls: 'r', cell: (l) => (l.length_m != null ? qty(l.length_m, 3) : '') })
  }
  if (hasCol(c, 'epaisseur')) cols.push({ h: 'Ép. mm', cls: 'r', cell: (l) => (l.products?.thickness_mm != null ? qty(l.products.thickness_mm, 2) : '') })
  if (hasCol(c, 'quantity') || !priced) cols.push({ h: priced ? 'Qté' : 'Quantité', cls: 'r', cell: (l) => (priced ? qty(l.quantity, 3) : `<b>${qty(l.quantity, 3)}</b>`) })
  if (priced) {
    if (hasCol(c, 'unit_price')) cols.push({ h: 'P.U. HT', cls: 'r', cell: (l) => fcfa(l.unit_price) })
    if (hasCol(c, 'discount')) cols.push({ h: 'Rem.', cls: 'r', cell: (l) => (Number(l.discount_pct) ? qty(l.discount_pct) + ' %' : '') })
    if (hasCol(c, 'total_ht')) cols.push({ h: 'Total HT', cls: 'r', cell: (l) => fcfa(l.total_ht) })
    if (hasCol(c, 'tax')) cols.push({ h: 'TVA', cls: 'r', cell: (l) => qty(l.vat_rate, 0) + ' %' })
    if (hasCol(c, 'total_ttc')) cols.push({ h: 'Total TTC', cls: 'r', cell: (l) => `<b>${fcfa(Number(l.total_ht) + lineTva(l))}</b>` })
  }
  return cols
}
function linesTable(c: CompanyInfo, lines: DocLine[], priced: boolean, extra?: { h: string; cell: string }) {
  const cols = lineCols(c, priced)
  const head = `<th class="c">#</th>${cols.map((x) => `<th class="${x.cls}">${x.h}</th>`).join('')}${extra ? `<th class="c">${extra.h}</th>` : ''}`
  const body = lines.map((l, i) => `<tr><td class="c">${i + 1}</td>${cols.map((x) => `<td class="${x.cls}">${x.cell(l)}</td>`).join('')}${extra ? `<td class="c">${extra.cell}</td>` : ''}</tr>`).join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}
function clientBox(cl: ClientRef, extra = '') {
  return `<div class="box"><h3>Client</h3><div class="b"><b>${esc(cl?.name)}</b> ${cl?.code ? '(' + esc(cl.code) + ')' : ''}<br>
    ${[cl?.address, cl?.city].filter(Boolean).map(esc).join(', ')}<br>${cl?.phone ? 'Tél : ' + esc(cl.phone) : ''}${cl?.ifu ? ' · IFU : ' + esc(cl.ifu) : ''}${extra}</div></div>`
}
function open(title: string) {
  const w = window.open('', '_blank')
  if (!w) {
    alert("Autorisez les fenêtres pop-up pour imprimer.")
    return null
  }
  w.document.write(`<p style="font-family:sans-serif;padding:24px">Préparation : ${esc(title)}…</p>`)
  return w
}
function finish(w: Window, c: CompanyInfo, title: string, body: string, page = true) {
  w.document.open()
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${themed(STYLE, c)}${docCss(c, { page })}</style></head><body>${body}
  ${autoPrintScript(c)}</body></html>`)
  w.document.close()
}

// Devis, commande ou facture : lignes chiffrées + totaux
export async function printPriced(opts: {
  title: string
  number: string
  date: string
  client: ClientRef
  infos: [string, string | null | undefined][]
  lines: DocLine[]
  totals: { ht: number; tva: number; ttc: number; paid?: number }
  notes?: string | null
  signLeft?: string
  signRight?: string
}) {
  const w = open(opts.title)
  if (!w) return
  const c = await loadCompany()
  const info = opts.infos.filter(([, v]) => v).map(([k, v]) => `<div>${esc(k)} : <b>${esc(v)}</b></div>`).join('')
  const t = opts.totals
  const body = `${header(c, opts.title, opts.number, opts.date)}
  <div class="boxes">${clientBox(opts.client)}<div class="box"><h3>Informations</h3><div class="b">${info || '—'}</div></div></div>
  ${linesTable(c, opts.lines, true)}
  <div class="tot"><div><span>Total HT</span><b>${fcfa(t.ht)} F</b></div><div><span>Total TVA</span><b>${fcfa(t.tva)} F</b></div>
    <div class="big"><span>Total TTC</span><span>${fcfa(t.ttc)} FCFA</span></div>
    ${t.paid != null ? `<div><span>Déjà réglé</span><b>${fcfa(t.paid)} F</b></div><div><span>Reste à payer</span><b>${fcfa(t.ttc - t.paid)} F</b></div>` : ''}</div>
  <p class="words">Arrêté à la somme de : ${words(t.ttc)} francs CFA.</p>
  ${opts.notes ? `<div class="notes">${esc(opts.notes)}</div>` : ''}
  <div class="sign"><div>${esc(opts.signLeft ?? 'Le client')}</div><div>${opts.signRight ? esc(opts.signRight) : companySigner(c)}</div></div>
  ${companyFooter(c, { bank: true, terms: opts.title === 'FACTURE' || opts.title === 'DEVIS', penalties: opts.title === 'FACTURE' })}`
  finish(w, c, `${opts.title} ${opts.number}`, body)
}

// Bon de livraison : quantités seulement
export async function printDelivery(opts: { number: string; date: string; client: ClientRef; orderNumber?: string | null; address?: string | null; carrier?: string | null; vehicle?: string | null; lines: DocLine[]; notes?: string | null }) {
  const w = open('Bon de livraison')
  if (!w) return
  const c = await loadCompany()
  const body = `${header(c, 'BON DE LIVRAISON', opts.number, opts.date)}
  <div class="boxes">${clientBox(opts.client)}<div class="box"><h3>Livraison</h3><div class="b">
    ${opts.orderNumber ? 'Commande : <b>' + esc(opts.orderNumber) + '</b><br>' : ''}${opts.address ? 'Adresse : ' + esc(opts.address) + '<br>' : ''}
    ${opts.carrier ? 'Transporteur : ' + esc(opts.carrier) + '<br>' : ''}${opts.vehicle ? 'Véhicule : ' + esc(opts.vehicle) : ''}</div></div></div>
  ${linesTable(c, opts.lines, false, { h: 'Contrôle', cell: '' })}
  ${opts.notes ? `<div class="notes">${esc(opts.notes)}</div>` : ''}
  <div class="sign"><div>Reçu en bon état par le client<br><br>Nom, date et signature</div><div>${companySigner(c, 'Le magasinier')}</div></div>
  ${companyFooter(c)}`
  finish(w, c, `Bon de livraison ${opts.number}`, body)
}

// Reçu de caisse
export async function printReceipt(p: {
  number: string
  paid_at: string
  amount: number
  method: string
  account: string
  reference?: string | null
  client: { code: string | null; name: string; phone: string | null } | null
  document?: string | null
  rest?: number | null
  cashier?: string
}) {
  const w = open('Reçu de caisse')
  if (!w) return
  const c = await loadCompany()
  const body = `<div style="max-width:480px;margin:auto">${header(c, 'REÇU DE CAISSE', p.number, p.paid_at.slice(0, 10))}
  <div class="boxes"><div class="box"><h3>Reçu de</h3><div class="b"><b>${esc(p.client?.name)}</b> ${p.client?.code ? '(' + esc(p.client.code) + ')' : ''}<br>${p.client?.phone ? 'Tél : ' + esc(p.client.phone) : ''}</div></div></div>
  <table><tbody>
    <tr><td>Date et heure</td><td class="r">${dtFr(p.paid_at)}</td></tr>
    ${p.document ? `<tr><td>Pour</td><td class="r"><b>${esc(p.document)}</b></td></tr>` : ''}
    <tr><td>Mode de paiement</td><td class="r">${esc(p.method)}${p.reference ? ' · ' + esc(p.reference) : ''}</td></tr>
    <tr><td>Caisse / compte</td><td class="r">${esc(p.account)}</td></tr>
  </tbody></table>
  <div class="tot" style="width:100%"><div class="big"><span>Montant reçu</span><span>${fcfa(p.amount)} FCFA</span></div>
  ${p.rest != null ? `<div><span>Reste à payer</span><b>${fcfa(p.rest)} F</b></div>` : ''}</div>
  <p class="words">Soit : ${words(p.amount)} francs CFA.</p>
  <div class="sign"><div>Le client</div><div>Pour ${esc(c.name)}<br>Le caissier${p.cashier ? ' : ' + esc(p.cashier) : ''}</div></div>
  ${companyFooter(c)}</div>`
  finish(w, c, `Reçu ${p.number}`, body, false)
}
