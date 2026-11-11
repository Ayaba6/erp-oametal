// Fiche de contrôle de réception (simple) : une ligne par bobine,
// une case Conforme et une case Refusée à cocher sur le terrain.
import { companyHeader, esc, loadCompany, autoPrintScript, docCss, themed } from '../../lib/companyPrint'
import { PurchaseOrder, Reception, dateFr, num } from './achatsData'

export type CoilRow = {
  po_line_id: string
  coil_reference: string
  lot_number: string
  supplier_coil_no: string
  quantity: string
}

const n = (s: string) => {
  const v = Number(String(s).replace(/\s/g, '').replace(',', '.'))
  return s.trim() === '' || !Number.isFinite(v) ? null : v
}

export async function printReception(rec: Reception, po: PurchaseOrder | null, coils: CoilRow[], creator: string) {
  const w = window.open('', '_blank')
  if (!w) return alert('Autorisez les fenêtres pop-up pour imprimer la fiche de contrôle.')
  w.document.write('<p style="font-family:sans-serif;padding:24px">Préparation de la fiche de contrôle…</p>')

  const company = await loadCompany()
  const lines = po?.purchase_order_lines ?? []
  const article = (id: string) => lines.find((l) => l.id === id)

  // Bobines classées par article
  const sorted = [...coils].sort((a, b) => lines.findIndex((l) => l.id === a.po_line_id) - lines.findIndex((l) => l.id === b.po_line_id))
  const rows = sorted
    .map((c, i) => {
      const pl = article(c.po_line_id)
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="m"><b>${esc(c.coil_reference)}</b></td>
        <td>${esc(pl?.description || pl?.products?.name)}</td>
        <td>${esc(c.supplier_coil_no)}</td>
        <td class="r">${n(c.quantity) != null ? num(n(c.quantity)) : ''}</td>
        <td class="w"></td>
        <td class="c"><span class="cb"></span></td>
        <td class="c"><span class="cb"></span></td>
        <td></td>
      </tr>`
    })
    .join('')
  const total = coils.reduce((t, c) => t + (n(c.quantity) ?? 0), 0)

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche de contrôle ${esc(rec.number)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm }
  * { box-sizing: border-box }
  body { font-family: Inter, Arial, sans-serif; font-size: 11px; color: #111; margin: 0 }
  .top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #047857; padding-bottom: 6px }
  .top b { color: #064e3b } .top h1 { margin: 2px 0 0; font-size: 16px; color: #047857 } .top .r { text-align: right }
  .info { margin: 10px 0; line-height: 1.7 } .info span { color: #666 }
  table { width: 100%; border-collapse: collapse }
  th { background: #eef5f0; color: #064e3b; padding: 6px 4px; font-size: 10px; text-transform: uppercase; text-align: left; border: 1px solid #c3d3c9 }
  td { border: 1px solid #c3d3c9; padding: 6px 4px; height: 28px }
  .r { text-align: right; white-space: nowrap } .c { text-align: center } .m { font-family: monospace; white-space: nowrap }
  td.w { min-width: 80px }
  .cb { display: inline-block; width: 16px; height: 16px; border: 1.5px solid #333; border-radius: 2px }
  tfoot td { font-weight: 700; background: #f7faf8 }
  .sign { margin-top: 24px; display: flex; gap: 40px }
  .sign div { flex: 1; border-top: 1px solid #999; padding-top: 6px; color: #444 }
${docCss(company, { page: false })}
</style></head><body>
  ${companyHeader(company, 'Fiche de contrôle — réception de bobines', rec.number, undefined, { small: true })}
  <div class="info">
    <span>Fournisseur :</span> <b>${esc(rec.suppliers?.name)}</b> &nbsp;·&nbsp;
    <span>Commande :</span> <b>${esc(po?.number ?? '—')}</b> &nbsp;·&nbsp;
    <span>Arrivée :</span> <b>${dateFr(rec.received_at)}</b> &nbsp;·&nbsp;
    <span>Bobines attendues :</span> <b>${coils.length}</b> (${num(total)} kg)
  </div>
  <table>
    <thead><tr>
      <th class="c" style="width:28px">#</th><th>N° bobine</th><th>Article</th><th>Coil fourn.</th>
      <th class="r">Poids étiquette (kg)</th><th class="r">Poids constaté (kg)</th>
      <th class="c" style="width:70px">Conforme</th><th class="c" style="width:70px">Refusée</th><th>Observation</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="c">Aucune bobine.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td class="r">${num(total)}</td><td></td><td colspan="3"></td></tr></tfoot>
  </table>
  <div class="sign">
    <div>Vérifié par : ${esc(creator)}</div>
    <div>Date :</div>
    <div>Signature :</div>
  </div>
  ${autoPrintScript(company)}
</body></html>`

  w.document.open()
  w.document.write(themed(html, company))
  w.document.close()
}
