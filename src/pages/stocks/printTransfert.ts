// Bon de transfert imprimable (A4 paysage) : liste des bobines + signatures
import { companyHeader, esc, loadCompany, autoPrintScript, docCss, themed } from '../../lib/companyPrint'
import { Transfer, kg, lineKg } from './transfertData'

export async function printTransfer(t: Transfer, names: Record<string, string>) {
  const w = window.open('', '_blank')
  if (!w) return alert('Autorisez les fenêtres pop-up pour imprimer le bon de transfert.')
  w.document.write('<p style="font-family:sans-serif;padding:24px">Préparation du bon de transfert…</p>')
  const company = await loadCompany()
  const total = t.stock_transfer_lines.reduce((s, l) => s + lineKg(l), 0)
  const rows = t.stock_transfer_lines
    .map(
      (l, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td class="m"><b>${esc(l.coils?.reference)}</b></td>
      <td>${esc(l.products?.code)} — ${esc(l.products?.name)}</td>
      <td class="m">${esc(l.coils?.lot_number)}</td>
      <td class="r">${kg(lineKg(l))}</td>
      <td class="c"><span class="cb"></span></td>
      <td></td>
    </tr>`,
    )
    .join('')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Demande de transfert ${esc(t.number)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm }
  * { box-sizing: border-box }
  body { font-family: Inter, Arial, sans-serif; font-size: 11px; color: #111; margin: 0 }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #047857; padding-bottom: 6px }
  .top b { color: #064e3b } .top h1 { margin: 2px 0 0; font-size: 16px; color: #047857 }
  .info { margin: 10px 0; line-height: 1.7 } .info span { color: #666 }
  table { width: 100%; border-collapse: collapse }
  th { background: #eef5f0; color: #064e3b; padding: 6px 4px; font-size: 10px; text-transform: uppercase; text-align: left; border: 1px solid #c3d3c9 }
  td { border: 1px solid #c3d3c9; padding: 6px 4px; height: 26px }
  .r { text-align: right; white-space: nowrap } .c { text-align: center } .m { font-family: monospace; white-space: nowrap }
  .cb { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #333; border-radius: 2px }
  tfoot td { font-weight: 700; background: #f7faf8 }
  .sign { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px }
  .sign div { border: 1px solid #c3d3c9; border-radius: 4px; padding: 8px; min-height: 80px; color: #333 }
  .sign h3 { margin: 0 0 6px; font-size: 11px; color: #064e3b; text-transform: uppercase }
${docCss(company, { page: false })}
</style></head><body>
  ${companyHeader(company, `Demande de transfert — ${t.source?.code ?? ''} → ${t.dest?.code ?? ''}`, t.number, undefined, { small: true })}
  <div class="info">
    <span>De :</span> <b>${esc(t.source?.code)} — ${esc(t.source?.name)}</b> &nbsp;→&nbsp; <span>Vers :</span> <b>${esc(t.dest?.code)} — ${esc(t.dest?.name)}</b> &nbsp;·&nbsp;
    <span>Date :</span> <b>${new Date(t.transfer_date + 'T00:00:00').toLocaleDateString('fr-FR')}</b> &nbsp;·&nbsp; <span>Motif :</span> <b>${esc(t.reason)}</b>
    ${t.reference ? ` &nbsp;·&nbsp; <span>Réf. :</span> <b>${esc(t.reference)}</b>` : ''}
  </div>
  <table>
    <thead><tr><th class="c" style="width:28px">#</th><th>N° bobine</th><th>Article</th><th>N° lot</th><th class="r">Poids (kg)</th><th class="c" style="width:80px">Livrée</th><th>Observation</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="4">Total : ${t.stock_transfer_lines.length} bobine(s)</td><td class="r">${kg(total)}</td><td colspan="2"></td></tr></tfoot>
  </table>
  <div class="sign">
    <div><h3>Demandé par (magasinier)</h3>Nom : ${esc(t.created_by ? names[t.created_by] ?? '' : '')}<br><br>Date :<br><br>Signature :</div>
    <div><h3>Validé par (direction)</h3>Nom : ${esc(t.decided_by && t.status === 'validee' ? names[t.decided_by] ?? '' : '')}<br><br>Date :<br><br>Signature :</div>
  </div>
  ${autoPrintScript(company)}
</body></html>`
  w.document.open()
  w.document.write(themed(html, company))
  w.document.close()
}
