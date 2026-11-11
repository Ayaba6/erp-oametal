import { supabase } from '../../lib/supabase'

export type Kind = 'bobine' | 'tole' | 'faitiere'
export type Finish = 'aluzinc' | 'galva' | 'prelaquee'

export type Article = {
  id: string
  code: string
  name: string
  kind: Kind
  finish: Finish | null
  color: string | null
  ral: string | null
  thickness_mm: number | null
  width_mm: number | null
  waves: number | null
  kg_per_meter: number | null
  coil_product_id: string | null
  purchase_price: number
  sale_price: number
  min_sale_price: number | null
  stock_min: number
  is_active: boolean
  notes: string | null
}

export const KINDS: { value: Kind; label: string; unit: string; unitLabel: string; category: string; badge: string }[] = [
  { value: 'bobine', label: 'Bobine', unit: 'KG', unitLabel: 'kg', category: 'MPTBC', badge: 'bg-amber-100 text-amber-800' },
  { value: 'tole', label: 'Tôle ondulée', unit: 'MTL', unitLabel: 'm', category: 'PFTBC', badge: 'bg-blue-100 text-blue-700' },
  { value: 'faitiere', label: 'Faîtière', unit: 'PCE', unitLabel: 'pièce', category: 'PFFAI', badge: 'bg-violet-100 text-violet-700' },
]
export const kindInfo = (k: Kind) => KINDS.find((x) => x.value === k)!

export const FINISHES: { value: Finish; label: string; code: string }[] = [
  { value: 'aluzinc', label: 'Aluzinc', code: 'AZ' },
  { value: 'galva', label: 'Galva', code: 'GA' },
  { value: 'prelaquee', label: 'Prélaquée', code: 'PL' },
]
export const finishLabel = (f: Finish | null) => FINISHES.find((x) => x.value === f)?.label ?? '—'

export const COLORS = ['Bleue', 'Orange', 'Rouge bordeaux', 'Verte', 'Grise', 'Blanche', 'Noire']

const COLOR_CODES: Record<string, string> = { bleue: 'BL', orange: 'OR', 'rouge bordeaux': 'RB', verte: 'VE', grise: 'GR', blanche: 'BC', noire: 'NO' }
function colorCode(c: string) {
  return COLOR_CODES[c.trim().toLowerCase()] ?? c.trim().slice(0, 2).toUpperCase()
}

// Code proposé automatiquement : BOB-AZ-030, TOL-PL-BL-035, FAI-GA-040
export function suggestCode(a: Pick<Article, 'kind' | 'finish' | 'color' | 'thickness_mm'>): string {
  const prefix = { bobine: 'BOB', tole: 'TOL', faitiere: 'FAI' }[a.kind]
  const parts = [prefix]
  const f = FINISHES.find((x) => x.value === a.finish)
  if (f) parts.push(f.code)
  if (a.finish === 'prelaquee' && a.color) parts.push(colorCode(a.color))
  if (a.thickness_mm) parts.push(String(Math.round(a.thickness_mm * 100)).padStart(3, '0'))
  return parts.join('-')
}

// Désignation proposée : « Tôle ondulée prélaquée bleue 35/100 4 ondes »
export function suggestName(a: Pick<Article, 'kind' | 'finish' | 'color' | 'ral' | 'thickness_mm' | 'waves'>): string {
  const finish =
    a.finish === 'prelaquee'
      ? `prélaquée${a.color ? ' ' + a.color.toLowerCase() : ''}${a.ral ? ' RAL' + a.ral : ''}`
      : a.finish ?? ''
  const th = a.thickness_mm ?? 0
  if (a.kind === 'bobine') return `Bobine ${finish} ${th.toFixed(2).replace('.', ',')} mm`.replace(/\s+/g, ' ').trim()
  const thick = th ? `${Math.round(th * 100)}/100` : ''
  if (a.kind === 'faitiere') return `Faîtière ${finish} ${thick}`.replace(/\s+/g, ' ').trim()
  return `Tôle ondulée ${finish} ${thick}${a.waves ? ` ${a.waves} ondes` : ''}`.replace(/\s+/g, ' ').trim()
}

export async function loadArticles(): Promise<Article[]> {
  const { data } = await supabase
    .from('products')
    .select('id, code, name, kind, finish, color, ral, thickness_mm, width_mm, waves, kg_per_meter, coil_product_id, purchase_price, sale_price, min_sale_price, stock_min, is_active, notes')
    .not('kind', 'is', null)
    .order('kind')
    .order('code')
  return (data as Article[]) ?? []
}

export async function loadStock(): Promise<Map<string, number>> {
  const { data } = await supabase.from('stock_levels').select('product_id, quantity')
  const map = new Map<string, number>()
  for (const r of (data as { product_id: string; quantity: number }[]) ?? []) map.set(r.product_id, (map.get(r.product_id) ?? 0) + Number(r.quantity))
  return map
}

export const num = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n).replace(/[  ]/g, ' ')
