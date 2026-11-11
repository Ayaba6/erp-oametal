// Fiche fin de bobine — même présentation que la fiche papier OAMI « FICHE FIN DE BOBINE — OPÉRATEUR ».
// Remplie avec la saisie de l'ERP, ou vierge (pour les opérateurs) si aucune fiche n'est fournie.
import { esc, loadCompany } from '../../lib/companyPrint'
import { SHEET_CSS } from '../production/printOF'
import { CoilEndReport, DEFECTS, FdbCoil, dFr, nf } from './finBobineData'

export async function printCoilEnd(r: CoilEndReport | null, coil: FdbCoil | null) {
  const w = window.open('', '_blank')
  if (!w) return alert('Autorisez les fenêtres pop-up pour imprimer la fiche fin de bobine.')
  w.document.write('<p style="font-family:sans-serif;padding:24px">Préparation de la fiche fin de bobine…</p>')
  const c = await loadCompany()
  const brand = esc(c.sigle || c.trade_name || c.name)
  const lines = r?.coil_end_report_lines ?? []
  const ROWS = 15
  const rows = Array.from({ length: ROWS }, (_, i) => {
    const l = lines[i]
    return `<tr><td class="c v">${l ? dFr(l.used_on) : ''}</td><td class="c v">${esc(l?.shift ?? '')}</td><td class="c v">${esc(l?.sheet_no ?? '')}</td>
      <td class="r v">${l ? nf(l.ml_produced) : ''}</td><td class="r v">${l && Number(l.scrap_kg) ? nf(l.scrap_kg) : ''}</td>
      <td class="v">${esc(l?.operator ?? '')}</td><td>${esc(l?.notes ?? '')}</td></tr>`
  }).join('')
  const totMl = lines.reduce((s, l) => s + Number(l.ml_produced), 0)
  const totScrap = lines.reduce((s, l) => s + Number(l.scrap_kg), 0)
  const box = (on: boolean | undefined) => `<span class="cb${on === true ? ' x' : ''}"></span> Oui <span class="cb${on === false && r ? ' x' : ''}"></span> Non`
  const k = coil ?? r?.coils ?? null
  const thick = r?.thickness_mm ?? k?.thickness_mm ?? k?.products?.thickness_mm
  const color = r?.color ?? k?.color ?? k?.products?.color

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche fin de bobine ${esc(r?.number ?? k?.reference ?? '')}</title><style>${SHEET_CSS}
  .defect td { height: 19px } .fin td.l { width: 22% }</style></head><body>
  <button class="print" onclick="window.print()">Imprimer</button>
  <div class="title">${brand} — FICHE FIN DE BOBINE — OPÉRATEUR${r?.number ? ` <span style="font-weight:400;font-size:11px">(${esc(r.number)})</span>` : ''}</div>
  <div class="sec">Bobine</div>
  <table>
    <tr><td class="l">N° bobine</td><td class="v">${esc(k?.reference ?? '')}${k?.lot_number ? ` <span style="font-size:10px;color:#555">${esc(k.lot_number)}</span>` : ''}</td><td class="l">Fournisseur</td><td class="v">${esc(r?.supplier_name ?? k?.suppliers?.name ?? '')}</td><td class="l">Couleur</td><td class="v">${esc(color ?? '')}</td></tr>
    <tr><td class="l">Épaisseur (mm)</td><td class="v">${thick ? nf(thick, 2) : ''}</td><td class="l">Largeur (mm)</td><td class="v">${r?.width_mm ?? k?.width_mm ? nf(r?.width_mm ?? k?.width_mm, 0) : ''}</td><td class="l">Poids étiquette (kg)</td><td class="v">${r?.label_weight_kg ?? k?.initial_weight_kg ? nf(r?.label_weight_kg ?? k?.initial_weight_kg, 0) + ' kg' : ''}</td></tr>
    <tr><td class="l">Machine</td><td class="v">${esc(r?.machine ?? '')}</td><td class="l">Date début</td><td class="v">${dFr(r?.started_on)}</td><td class="l">Date fin</td><td class="v">${r ? dFr(r.ended_on) : ''}</td></tr>
  </table>
  <div class="sec">Historique d'utilisation (une ligne par poste)</div>
  <table>
    <thead><tr><th style="width:9%">Date</th><th style="width:8%">Poste</th><th style="width:10%">N° fiche</th><th style="width:9%">ml produits</th><th style="width:8%">Chutes (kg)</th><th style="width:20%">Opérateur</th><th>Observations</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3" class="c" style="font-weight:700;background:#ececec">TOTAL</td><td class="sh r v">${lines.length ? nf(totMl) : ''}</td><td class="sh r v">${totScrap ? nf(totScrap) : ''}</td><td colspan="2"></td></tr></tfoot>
  </table>
  <div class="two" style="margin-top:6px;grid-template-columns:1fr 1fr">
    <div>
      <div class="sec" style="margin-top:0">Contrôle visuel de la bobine</div>
      <table class="defect">${DEFECTS.map(([key, label]) => `<tr><td>${label}${key === 'defect_other' && r?.defect_other_text ? ' : <b>' + esc(r.defect_other_text) + '</b>' : ''}</td><td class="c" style="width:38%">${box(r ? Boolean(r[key]) : undefined)}</td></tr>`).join('')}</table>
    </div>
    <div>
      <div class="sec" style="margin-top:0">Fin de bobine</div>
      <table class="fin">
        <tr><td class="l">Reste / queue de bobine (kg)</td><td class="v">${r ? nf(r.remaining_kg) : ''}</td></tr>
        <tr><td class="l">Épaisseur mesurée (mm)</td><td class="v">${r?.measured_thickness_mm ? nf(r.measured_thickness_mm, 2) : ''}</td></tr>
        <tr><td class="l">Total ml produits</td><td class="v">${r ? nf(r.total_ml || totMl) + ' ml' : ''}</td></tr>
        <tr><td class="l">Total chutes (kg)</td><td class="v">${r ? nf(r.total_scrap_kg) : ''}</td></tr>
        <tr><td class="l">Bobine à signaler ?</td><td>${box(r ? r.to_report : undefined)}</td></tr>
      </table>
    </div>
  </div>
  <div class="sec">Observations</div>
  <div class="box" style="min-height:34px">${esc(r?.notes ?? '')}${r?.decision_note ? `<br><i>Direction : ${esc(r.decision_note)}</i>` : ''}</div>
  <table class="sign" style="margin-top:6px"><tr><th>Opérateur — Nom et signature</th><th>Chef d'équipe — Nom et signature</th></tr>
  <tr><td>${esc(r?.operator_names ?? '')}</td><td>${esc(r?.team_leader ?? '')}</td></tr></table>
  ${c.auto_pdf_print ? '<script>window.onload = () => setTimeout(() => window.print(), 300)</script>' : ''}
</body></html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
}
