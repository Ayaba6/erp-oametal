import { ChangeEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { btnPrimary, btnSecondary, card } from '../../lib/ui'
import { Article, loadArticles } from './articleData'
import { CoilStatus, defaultWarehouseId, fmt, loadCoils, nextReference, statusInfo } from './bobineData'

// Colonnes reconnues dans le fichier (en-têtes de la liste des bobines OA)
type Field = 'reference' | 'lot' | 'code' | 'designation' | 'epaisseur' | 'largeur' | 'coil' | 'net' | 'brut' | 'metrage' | 'statut' | 'date' | 'prix'
const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

function fieldOf(header: unknown): Field | null {
  const h = norm(header)
  if (!h) return null
  if (h.includes('coil')) return 'coil'
  if (h.includes('bobine') && !h.includes('metrage')) return 'reference'
  if (h.includes('lot')) return 'lot'
  if (h.includes('codearticle') || h === 'code' || h === 'article') return 'code'
  if (h.includes('designation') || h.includes('libelle')) return 'designation'
  if (h.includes('epaisseur')) return 'epaisseur'
  if (h.includes('largeur')) return 'largeur'
  if (h.includes('brut')) return 'brut'
  if (h.includes('net')) return 'net'
  if (h.includes('metrage') || h.includes('longueur')) return 'metrage'
  if (h.includes('statut') || h.includes('etat')) return 'statut'
  if (h.includes('date') || h.includes('reception')) return 'date'
  if (h.includes('prix') || h.includes('cout')) return 'prix'
  return null
}

const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  const n = Number(String(v).replace(/[\s  ]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const txt = (v: unknown) => (v == null ? '' : String(v).trim())

function statusOf(v: unknown): CoilStatus {
  const s = norm(v)
  if (s.startsWith('fin') || s.includes('epuis') || s.includes('termine')) return 'epuisee'
  if (s.includes('bloq')) return 'bloquee'
  if (s.includes('prod')) return 'en_production'
  return 'disponible'
}

function dateOf(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = txt(v)
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (fr) return `${fr[3].length === 2 ? '20' + fr[3] : fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

type Line = {
  n: number
  reference: string
  lot_number: string | null
  product: Article | null
  codeLu: string
  supplier_coil_no: string | null
  thickness_mm: number | null
  width_mm: number | null
  net: number | null
  gross: number | null
  length_m: number | null
  cost: number | null
  status: CoilStatus
  received_at: string | null
  errors: string[]
}

const TEMPLATE_HEAD = ['N° bobine OA', 'N° de lot', 'Code article', 'Désignation', 'Épaisseur', 'Largeur', 'N° coil fournisseur', 'Poids net (kg)', 'Poids brut (kg)', 'Métrage bobine (m)', 'Statut']

export default function BobineImport() {
  const navigate = useNavigate()
  const [articles, setArticles] = useState<Article[]>([])
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [refs, setRefs] = useState<string[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    loadArticles().then((a) => setArticles(a.filter((x) => x.kind === 'bobine')))
    loadCoils().then((c) => {
      setExisting(new Set(c.map((x) => x.reference.toUpperCase())))
      setRefs(c.map((x) => x.reference))
    })
  }, [])

  function findArticle(code: string, designation: string): Article | null {
    const c = norm(code)
    const d = norm(designation)
    return (
      articles.find((a) => c && norm(a.code) === c) ??
      articles.find((a) => d && norm(a.name) === d) ??
      articles.find((a) => d && a.ral && d.includes(norm(a.ral)) && norm(a.color).length > 0 && d.includes(norm(a.color))) ??
      null
    )
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setDone(null)
    setLines([])
    setFileName(file.name)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true })

      // La ligne d'en-tête est la première qui contient au moins 3 colonnes reconnues
      const headerIdx = rows.findIndex((r) => r.map(fieldOf).filter(Boolean).length >= 3)
      if (headerIdx < 0) return setError("Impossible de trouver la ligne d'en-têtes (N° bobine OA, Code article, Poids net...).")
      const cols = new Map<Field, number>()
      rows[headerIdx].forEach((h, i) => {
        const f = fieldOf(h)
        if (f && !cols.has(f)) cols.set(f, i)
      })
      if (!cols.has('net')) return setError('La colonne « Poids net » est introuvable.')

      const get = (r: unknown[], f: Field) => (cols.has(f) ? r[cols.get(f)!] : '')
      const seen = new Set<string>()
      const pool = [...refs]
      const out: Line[] = []
      rows.slice(headerIdx + 1).forEach((r, i) => {
        const ref0 = txt(get(r, 'reference')).toUpperCase()
        const code = txt(get(r, 'code'))
        const net = toNum(get(r, 'net'))
        if (!ref0 && !code && net == null) return // ligne vide
        if (/total|recue|reçue/i.test(ref0) || (!ref0 && !code)) return // ligne de totaux
        const reference = ref0 || nextReference(pool)
        pool.push(reference)
        const designation = txt(get(r, 'designation'))
        const product = findArticle(code, designation)
        const errors: string[] = []
        if (!product) errors.push(`Article ${code || designation || '?'} inconnu`)
        if (!net || net <= 0) errors.push('Poids net manquant')
        if (existing.has(reference)) errors.push('Déjà enregistrée')
        if (seen.has(reference)) errors.push('En double dans le fichier')
        seen.add(reference)
        out.push({
          n: headerIdx + i + 2,
          reference,
          lot_number: txt(get(r, 'lot')) || null,
          product,
          codeLu: code,
          supplier_coil_no: txt(get(r, 'coil')) || null,
          thickness_mm: toNum(get(r, 'epaisseur')) ?? product?.thickness_mm ?? null,
          width_mm: toNum(get(r, 'largeur')) ?? product?.width_mm ?? null,
          net,
          gross: toNum(get(r, 'brut')),
          length_m: toNum(get(r, 'metrage')),
          cost: toNum(get(r, 'prix')) ?? product?.purchase_price ?? null,
          status: statusOf(get(r, 'statut')),
          received_at: dateOf(get(r, 'date')),
          errors,
        })
      })
      if (out.length === 0) setError('Aucune bobine trouvée dans le fichier.')
      setLines(out)
    } catch (err) {
      setError('Lecture du fichier impossible : ' + (err as Error).message)
    }
  }

  const ok = useMemo(() => lines.filter((l) => l.errors.length === 0), [lines])
  const sum = (k: 'net' | 'gross' | 'length_m') => ok.reduce((s, l) => s + (l[k] ?? 0), 0)

  async function onImport() {
    setBusy(true)
    setError(null)
    const wh = await defaultWarehouseId()
    if (!wh) {
      setBusy(false)
      return setError("Aucun dépôt actif n'est défini.")
    }
    const rows = ok.map((l) => ({
      reference: l.reference,
      lot_number: l.lot_number,
      product_id: l.product!.id,
      warehouse_id: wh,
      supplier_coil_no: l.supplier_coil_no,
      thickness_mm: l.thickness_mm,
      width_mm: l.width_mm,
      initial_weight_kg: l.net,
      remaining_weight_kg: l.status === 'epuisee' ? 0 : l.net,
      gross_weight_kg: l.gross,
      length_m: l.length_m,
      cost_per_kg: l.cost ?? 0,
      status: l.status,
      ...(l.received_at ? { received_at: l.received_at } : {}),
    }))
    let count = 0
    for (let i = 0; i < rows.length; i += 50) {
      const res = await supabase.from('coils').insert(rows.slice(i, i + 50))
      if (res.error) {
        setBusy(false)
        return setError(`Import interrompu après ${count} bobine(s) : ${res.error.message}`)
      }
      count += Math.min(50, rows.length - i)
    }
    setBusy(false)
    setDone(count)
  }

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_HEAD,
      ['BO-OA-0001', 'LOT-261013-0001', 'MPTBC0001', 'BOBINE PRELAQUEE VERTE RAL6005', 0.3, 1000, '1-1', 4000, 4020, 1700, 'En stock'],
    ])
    ws['!cols'] = TEMPLATE_HEAD.map((h) => ({ wch: Math.max(12, h.length + 2) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Bobines')
    XLSX.writeFile(wb, 'modele-bobines.xlsx')
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[16px] font-bold text-gray-900">Importer des bobines</h1>
        <p className="text-sm text-gray-500 mt-0.5">Fichier Excel (.xlsx, .xls) ou CSV, au format de la liste des bobines OA.</p>
      </div>

      <div className={`${card} p-5 space-y-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`${btnPrimary} cursor-pointer`}>
            Choisir le fichier
            <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
          </label>
          <button type="button" onClick={downloadTemplate} className={btnSecondary}>
            Télécharger le modèle
          </button>
          {fileName && <span className="text-sm text-gray-600">{fileName}</span>}
        </div>
        <p className="text-xs text-gray-500">
          Colonnes lues : N° bobine OA, N° de lot, Code article, Désignation, Épaisseur, Largeur, N° coil fournisseur, Poids net, Poids brut, Métrage, Statut.
          L'article est reconnu par son code (MPTBC0001…) ou sa désignation. Une bobine marquée « FIN » est enregistrée épuisée (restant 0). Les bobines déjà
          enregistrées sont ignorées.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}
      {done != null && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-[4px] px-4 py-2 flex items-center justify-between gap-3">
          <span>{done} bobine(s) importée(s). Le stock des articles a été mis à jour.</span>
          <button type="button" onClick={() => navigate('/stocks/bobines')} className={btnPrimary}>
            Voir la liste
          </button>
        </div>
      )}

      {lines.length > 0 && done == null && (
        <div className={`${card} overflow-hidden`}>
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              <b>{ok.length}</b> bobine(s) prête(s) · {fmt(sum('net'))} kg net · {fmt(sum('gross'))} kg brut · {fmt(sum('length_m'))} m
              {lines.length > ok.length && <span className="text-red-600"> · {lines.length - ok.length} ligne(s) ignorée(s)</span>}
            </p>
            <div className="flex gap-2">
              <Link to="/stocks/bobines" className={btnSecondary}>
                Annuler
              </Link>
              <button type="button" onClick={onImport} disabled={busy || ok.length === 0} className={btnPrimary}>
                {busy ? 'Import en cours...' : `Importer ${ok.length} bobine(s)`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-[12px]">
              <thead className="bg-[#eef5f0] sticky top-0">
                <tr className="text-left text-emerald-900">
                  {['Ligne', 'N° bobine', 'Lot', 'Article', 'Coil', 'Net (kg)', 'Brut (kg)', 'Métrage (m)', 'Statut', 'Contrôle'].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l) => (
                  <tr key={l.n} className={l.errors.length ? 'bg-red-50/60' : ''}>
                    <td className="px-2 py-1 text-gray-400">{l.n}</td>
                    <td className="px-2 py-1 font-mono">{l.reference}</td>
                    <td className="px-2 py-1 font-mono">{l.lot_number ?? '—'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{l.product ? `${l.product.code} — ${l.product.name}` : <span className="text-red-600">{l.codeLu || '?'}</span>}</td>
                    <td className="px-2 py-1">{l.supplier_coil_no ?? '—'}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(l.net)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(l.gross)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(l.length_m)}</td>
                    <td className="px-2 py-1">{statusInfo(l.status).label}</td>
                    <td className="px-2 py-1 whitespace-nowrap">
                      {l.errors.length ? <span className="text-red-600">{l.errors.join(' · ')}</span> : <span className="text-green-700">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
