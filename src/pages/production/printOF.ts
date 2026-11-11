// Fiche opérateur — même présentation que la fiche papier OAMI « FICHE OPÉRATEUR — TÔLE BAC ».
// Pré-remplie avec l'OF (n° OF, client, nb feuilles, longueur, ml) ; le reste se complète à la main.
import { esc, loadCompany } from '../../lib/companyPrint'
import { ProductionOrder } from './prodData'

const n = (v: number | null | undefined, d = 2) => (v == null ? '' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(Number(v)).replace(/ | /g, ' '))

// Styles communs aux fiches atelier (fiche opérateur, fiche fin de bobine)
export const SHEET_CSS = `
  @page { size: A4 landscape; margin: 8mm }
  * { box-sizing: border-box }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #111; margin: 0 }
  .title { background: #3b4248; color: #fff; text-align: center; font-weight: 700; font-size: 14px; padding: 6px; letter-spacing: .3px }
  .sec { background: #d9d9d9; font-weight: 700; padding: 3px 6px; border: 1px solid #555; border-bottom: 0; margin-top: 6px; text-transform: uppercase; font-size: 10px }
  table { width: 100%; border-collapse: collapse }
  td, th { border: 1px solid #555; padding: 3px 5px; height: 20px; vertical-align: middle }
  th { background: #3b4248; color: #fff; font-size: 9.5px; font-weight: 700 }
  td.l { background: #ececec; font-weight: 700; width: 11%; white-space: nowrap }
  td.v { font-family: 'Courier New', monospace; font-size: 12px; font-weight: 700; color: #1f3a8a }
  td.sh { background: #ececec }
  .r { text-align: right } .c { text-align: center }
  .cb { display: inline-block; width: 10px; height: 10px; border: 1px solid #333; margin: 0 2px -1px 6px }
  .cb.x::after { content: '✕'; display: block; font-size: 9px; line-height: 9px; text-align: center }
  .sign td { height: 46px; vertical-align: top; font-weight: 700; text-align: center; background: #fff }
  .sign th { background: #ececec; color: #111 }
  .two { display: grid; grid-template-columns: 1fr 1.25fr; gap: 8px }
  .box { border: 1px solid #555; min-height: 80px; padding: 4px; color: #333 }
  .print { position: fixed; top: 8px; right: 8px; padding: 8px 14px; background: #047857; color: #fff; border: 0; border-radius: 4px; font-weight: 700; cursor: pointer }
  @media print { .print { display: none } }
`

export async function printOperatorSheet(of: ProductionOrder | null, _coils: string[] = [], opts: { blank?: boolean } = {}) {
  const w = window.open('', '_blank')
  if (!w) return alert('Autorisez les fenêtres pop-up pour imprimer la fiche opérateur.')
  w.document.write('<p style="font-family:sans-serif;padding:24px">Préparation de la fiche opérateur…</p>')
  const c = await loadCompany()
  const brand = esc(c.sigle || c.trade_name || c.name)
  const lines = of && !opts.blank ? of.production_order_lines : []
  const first = lines[0]?.products
  const ROWS = 19
  const body = Array.from({ length: ROWS }, (_, i) => {
    const l = lines[i]
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="c v">${l ? esc(of!.number.replace(/^OF-\d{4}-0*/, '')) : ''}</td>
      <td class="v">${l ? esc(of!.clients?.name ?? 'STOCK') : ''}</td>
      <td class="c v">${l?.sheets_count ?? ''}</td>
      <td class="c v">${l ? n(l.length_m, 2) : ''}</td>
      <td></td>
      <td class="sh r v">${l ? n(l.quantity, 2) : ''}</td>
      <td>${l && l.description ? `<span style="color:#666">${esc(l.products?.code ?? '')}</span>` : ''}</td>
    </tr>`
  }).join('')
  const total = lines.reduce((s, l) => s + Number(l.quantity), 0)
  const today = new Date().toLocaleDateString('fr-FR')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche opérateur ${esc(of?.number ?? '')}</title><style>${SHEET_CSS}</style></head><body>
  <button class="print" onclick="window.print()">Imprimer</button>
  <div class="title">${brand} — FICHE OPÉRATEUR — TÔLE BAC</div>
  <div class="sec">Identification &amp; bobine</div>
  <table>
    <tr><td class="l">Date</td><td class="v">${of && !opts.blank ? today : ''}</td><td class="l">Poste</td><td class="v"></td><td class="l">Opérateur</td><td class="v"></td></tr>
    <tr><td class="l">Machine</td><td class="v">${esc(of?.production_lines?.code ?? '')}</td><td class="l">N° fiche</td><td class="v">${esc(of && !opts.blank ? of.number : '')}</td><td class="l">Heure début → fin</td><td class="v"></td></tr>
    <tr><td class="l">N° bobine</td><td class="v"></td><td class="l">Couleur</td><td class="v">${esc(first?.color ?? '')}</td><td class="l">Épaisseur (mm)</td><td class="v">${first?.thickness_mm ? n(first.thickness_mm, 2) : ''}</td></tr>
    <tr><td class="l">Largeur (mm)</td><td class="v"></td><td class="l">Poids début (kg)</td><td class="v"></td><td class="l">Poids reste fin (kg)</td><td class="v"></td></tr>
    <tr><td class="l">Chutes / rebuts (kg)</td><td class="v"></td><td class="l">Bobine terminée ?</td><td><span class="cb"></span> Oui <span class="cb"></span> Non</td><td class="l">Chef d'équipe</td><td class="v">${esc(of?.operator_name ?? '')}</td></tr>
  </table>
  <div class="sec">Production</div>
  <table>
    <thead><tr><th style="width:3%">N°</th><th style="width:7%">N° OF</th><th style="width:22%">Client</th><th style="width:8%">Nb feuilles</th><th style="width:9%">Longueur (m)</th><th style="width:10%">Déclassées</th><th style="width:9%">ml total</th><th>Observations</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="6" class="c" style="font-weight:700;background:#ececec">TOTAL</td><td class="sh r v">${total ? n(total, 2) : ''}</td><td></td></tr></tfoot>
  </table>
  <div class="two" style="margin-top:6px">
    <div>
      <div class="sec" style="margin-top:0">Arrêts machine</div>
      <table><thead><tr><th>Début</th><th>Fin</th><th>Durée (min)</th><th style="width:50%">Cause / commentaire</th></tr></thead>
      <tbody>${'<tr><td></td><td></td><td class="sh"></td><td></td></tr>'.repeat(4)}</tbody></table>
    </div>
    <div>
      <div class="sec" style="margin-top:0">Observations / incidents</div>
      <div class="box">${esc(of?.notes ?? '')}</div>
    </div>
  </div>
  <table class="sign" style="margin-top:6px"><tr><th>Opérateur — Nom et signature</th><th>Chef d'équipe — Nom et signature</th></tr>
  <tr><td></td><td>${esc(of?.operator_name ?? '')}</td></tr></table>
  ${c.auto_pdf_print ? '<script>window.onload = () => setTimeout(() => window.print(), 300)</script>' : ''}
</body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
}
