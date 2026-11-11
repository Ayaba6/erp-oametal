import { supabase } from './supabase'

export type Profile = { id: string; full_name: string; role: string; role_name: string; is_super: boolean }
export type Company = { name: string; trade_name: string | null; currency: string; maintenance_mode?: boolean }

export type AppContext = {
  email: string
  profile: Profile | null
  company: Company | null
  permissions: Set<string>
  can: (code: string) => boolean
}

export async function loadContext(userId: string, email: string): Promise<AppContext> {
  const [p, c, perms] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, roles(name, is_super)').eq('id', userId).maybeSingle(),
    supabase.from('company').select('name, trade_name, currency, maintenance_mode').eq('id', 1).maybeSingle(),
    supabase.rpc('my_permissions'),
  ])
  const raw = p.data as { id: string; full_name: string; role: string; roles: { name: string; is_super: boolean } | null } | null
  const profile: Profile | null = raw
    ? { id: raw.id, full_name: raw.full_name, role: raw.role, role_name: raw.roles?.name ?? raw.role, is_super: raw.roles?.is_super ?? false }
    : null
  const permissions = new Set<string>(((perms.data as string[] | null) ?? []).map(String))
  return {
    email,
    profile,
    company: (c.data as Company | null) ?? null,
    permissions,
    can: (code: string) => profile?.is_super === true || permissions.has(code),
  }
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
