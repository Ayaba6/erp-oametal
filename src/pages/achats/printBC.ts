// Bon de commande imprimable (Imprimer → Enregistrer en PDF)
import { companyFooter, companyHeader, companySigner, esc, loadCompany, autoPrintScript, docCss, themed } from '../../lib/companyPrint'
import { INCOTERMS, PAYMENT_METHODS, PAYMENT_TERMS, PurchaseOrder, dateFr, labelOf, lineHt, lineTax, num } from './achatsData'

export async function printPurchaseOrder(po: PurchaseOrder, buyer: string) {
  // La fenêtre est ouverte tout de suite, sinon le navigateur la bloque
  const w = window.open('', '_blank')
  if (!w) return alert("Autorisez les fenêtres pop-up pour imprimer le bon de commande.")
  w.document.write('<p style="font-family:sans-serif;padding:24px">Préparation du bon de commande…</p>')

  const c = await loadCompany()
  const s = po.suppliers
  const cur = po.currency || 'XOF'

  let gross = 0
  let ht = 0
  let tax = 0
  const rows = po.purchase_order_lines
    .map((l, i) => {
      const g = Math.round(Number(l.quantity) * Number(l.unit_price))
      const h = lineHt(Number(l.quantity), Number(l.unit_price), Number(l.discount_percent))
      const t = lineTax(h, Number(l.tax_rate))
      gross += g
      ht += h
      tax += t
      return `<tr>
        <td class="c">${i + 1}</td>
        <td><b>${esc(l.products?.code)}</b><br>${esc(l.description || l.products?.name)}</td>
        <td class="r">${num(l.quantity, 2)} kg</td>
        <td class="r">${num(l.unit_price)}</td>
        <td class="r">${Number(l.discount_percent) ? num(l.discount_percent, 2) + ' %' : '—'}</td>
        <td class="r">${num(h)}</td>
        <td class="r">${num(l.tax_rate, 0)} %</td>
        <td class="r"><b>${num(h + t)}</b></td>
      </tr>`
    })
    .join('')

  const line = (label: string, value: unknown) => (value ? `<div><span>${label}</span> ${esc(value)}</div>` : '')

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Bon de commande ${esc(po.number)}</title>
<style>
  @page { size: A4; margin: 14mm }
  * { box-sizing: border-box }
  body { font-family: Inter, Arial, sans-serif; font-size: 11px; color: #111; margin: 0 }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #047857; padding-bottom: 10px }
  .co b { font-size: 16px; color: #064e3b } .co div { color: #444; line-height: 1.5 }
  .doc { text-align: right } .doc h1 { margin: 0; font-size: 20px; color: #047857; letter-spacing: .5px } .doc .n { font: 700 14px monospace }
  .boxes { display: flex; gap: 12px; margin: 14px 0 }
  .box { flex: 1; border: 1px solid #c3d3c9; border-radius: 4px }
  .box h3 { margin: 0; padding: 5px 8px; background: #eef5f0; color: #064e3b; font-size: 11px; text-transform: uppercase; letter-spacing: .4px }
  .box .b { padding: 8px; line-height: 1.6 } .box span { color: #666; display: inline-block; min-width: 120px }
  table { width: 100%; border-collapse: collapse; margin-top: 4px }
  th { background: #3b4248; color: #fff; text-align: left; padding: 6px; font-size: 10px; text-transform: uppercase }
  td { padding: 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top }
  .r { text-align: right; white-space: nowrap } .c { text-align: center }
  .tot { margin-left: auto; width: 300px; margin-top: 10px }
  .tot div { display: flex; justify-content: space-between; padding: 4px 0 }
  .tot .ttc { border-top: 2px solid #047857; font-size: 14px; font-weight: 700; color: #047857; margin-top: 4px; padding-top: 6px }
  .notes { margin-top: 14px; padding: 8px; border: 1px dashed #c3d3c9; border-radius: 4px; white-space: pre-line }
  .sign { display: flex; justify-content: space-between; margin-top: 40px }
  .sign div { width: 45%; border-top: 1px solid #999; padding-top: 6px; text-align: center; color: #555 }
  .foot { margin-top: 24px; text-align: center; color: #777; font-size: 10px }
${docCss(c)}
</style></head><body>
  ${companyHeader(c, 'BON DE COMMANDE', po.number, 'Date : ' + dateFr(po.issued_at))}
  <div class="boxes">
    <div class="box"><h3>Fournisseur</h3><div class="b">
      <b>${esc(s?.name)}</b> ${s?.code ? '(' + esc(s.code) + ')' : ''}<br>
      ${esc(s?.address)}${s?.city ? ' – ' + esc(s.city) : ''}${s?.country ? ' – ' + esc(s.country) : ''}<br>
      ${s?.phone ? 'Tél : ' + esc(s.phone) : ''}${s?.email ? ' · ' + esc(s.email) : ''}
      ${po.supplier_contact ? '<br>À l’attention de : ' + esc(po.supplier_contact) : ''}
    </div></div>
    <div class="box"><h3>Conditions</h3><div class="b">
      ${line('Livraison prévue :', po.expected_at ? dateFr(po.expected_at) : '')}
      ${line('Lieu de livraison :', po.delivery_location || po.delivery_address)}
      ${line('Incoterm :', labelOf(INCOTERMS, po.incoterm))}
      ${line('Conditions de paiement :', po.payment_terms ? labelOf(PAYMENT_TERMS, po.payment_terms) : '')}
      ${line('Mode de paiement :', labelOf(PAYMENT_METHODS, po.payment_method))}
      ${line('Devise :', cur)}
      ${line('Référence :', po.reference)}
      ${line('Acheteur :', buyer)}
    </div></div>
  </div>
  <table>
    <thead><tr><th class="c">#</th><th>Article</th><th class="r">Quantité</th><th class="r">P.U. HT</th><th class="r">Remise</th><th class="r">Total HT</th><th class="r">TVA</th><th class="r">Total TTC</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="tot">
    <div><span>Total HT brut</span><b>${num(gross)} ${cur}</b></div>
    ${gross > ht ? `<div><span>Remise</span><b>- ${num(gross - ht)} ${cur}</b></div>` : ''}
    <div><span>Base imposable</span><b>${num(ht)} ${cur}</b></div>
    <div><span>Total TVA</span><b>${num(tax)} ${cur}</b></div>
    <div class="ttc"><span>Total TTC</span><span>${num(ht + tax)} ${cur}</span></div>
  </div>
  ${po.notes || po.terms ? `<div class="notes">${esc([po.notes, po.terms].filter(Boolean).join('\n'))}</div>` : ''}
  <div class="sign"><div>Le fournisseur (bon pour accord)</div><div>${companySigner(c, buyer)}</div></div>
  ${po.footer_note ? `<div class="foot">${esc(po.footer_note)}</div>` : ''}
  ${companyFooter(c)}
  ${autoPrintScript(c)}
</body></html>`

  w.document.open()
  w.document.write(themed(html, c))
  w.document.close()
}
