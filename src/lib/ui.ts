// Petits utilitaires d'affichage partagés (mêmes rendus que l'A3 ERP)

// "super_admin" -> "Super admin" (libellé court utilisé dans les badges et listes)
export function humanize(code: string): string {
  const s = code.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  directeur: 'bg-blue-100 text-blue-700',
  daf: 'bg-blue-100 text-blue-700',
  commercial: 'bg-green-100 text-green-700',
  responsable_commercial: 'bg-green-100 text-green-700',
  magasinier: 'bg-emerald-100 text-emerald-800',
  responsable_stock: 'bg-emerald-100 text-emerald-800',
  acheteur: 'bg-amber-100 text-amber-700',
  comptable: 'bg-indigo-100 text-indigo-700',
}
export const roleBadgeClass = (code: string) => ROLE_BADGE[code] ?? 'bg-gray-100 text-gray-700'

// "il y a 2 minutes", "il y a 1 mois"...
export function timeAgo(iso: string | null): string {
  if (!iso) return 'Jamais'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  const steps: [number, string, string][] = [
    [60, 'seconde', 'secondes'],
    [60, 'minute', 'minutes'],
    [24, 'heure', 'heures'],
    [30, 'jour', 'jours'],
    [12, 'mois', 'mois'],
    [Infinity, 'an', 'ans'],
  ]
  let v = s
  for (const [size, one, many] of steps) {
    if (v < size) {
      const n = Math.max(1, Math.floor(v))
      return `il y a ${n} ${n > 1 ? many : one}`
    }
    v /= size
  }
  return ''
}

export function dateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

// Classes communes des formulaires et boutons
export const input =
  'w-full border border-gray-300 rounded-[4px] px-3 py-2 text-sm focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 focus:outline-none'
export const label = 'block text-xs font-medium text-gray-700 mb-1'
export const btnPrimary =
  'inline-flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium px-3 py-1.5 rounded-[4px] transition-colors disabled:opacity-60'
export const btnSecondary =
  'inline-flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium px-3 py-1.5 rounded-[4px] transition-colors'
export const card = 'bg-white rounded-[4px] border border-gray-300'
export const th = 'px-3 py-1.5 text-left text-[11px] font-bold text-emerald-900 uppercase tracking-wide'
