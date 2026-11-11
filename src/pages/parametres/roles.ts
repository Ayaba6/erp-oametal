import { supabase } from '../../lib/supabase'

export type Role = { code: string; name: string; group_name: string; sort_order: number; is_super: boolean }
export type Permission = { code: string; group_name: string; label: string; sort_order: number }

export async function loadRoles() {
  const [r, rp, p] = await Promise.all([
    supabase.from('roles').select('*').order('sort_order'),
    supabase.from('role_permissions').select('role_code'),
    supabase.from('profiles').select('role'),
  ])
  const roles = (r.data as Role[]) ?? []
  const permCount = new Map<string, number>()
  for (const x of (rp.data as { role_code: string }[]) ?? []) permCount.set(x.role_code, (permCount.get(x.role_code) ?? 0) + 1)
  const userCount = new Map<string, number>()
  for (const x of (p.data as { role: string }[]) ?? []) userCount.set(x.role, (userCount.get(x.role) ?? 0) + 1)
  return { roles, permCount, userCount }
}

export async function loadPermissions(): Promise<Permission[]> {
  const { data } = await supabase.from('permissions').select('*').order('sort_order')
  return (data as Permission[]) ?? []
}

// Regroupe les permissions par rubrique, dans l'ordre d'origine
export function groupPermissions(perms: Permission[]): [string, Permission[]][] {
  const map = new Map<string, Permission[]>()
  for (const p of perms) map.set(p.group_name, [...(map.get(p.group_name) ?? []), p])
  return [...map.entries()]
}

// Couleur du point et du libellé selon l'action (Créer, Supprimer, Modifier, Voir…)
export function actionTone(code: string): { dot: string; text: string } {
  const action = code.split('.').pop() ?? ''
  if (action === 'create') return { dot: 'bg-green-500', text: 'text-green-700' }
  if (action === 'delete') return { dot: 'bg-red-500', text: 'text-red-700' }
  if (action === 'edit' || action === 'update') return { dot: 'bg-blue-500', text: 'text-blue-700' }
  return { dot: 'bg-gray-400', text: 'text-gray-600' }
}
