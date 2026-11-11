// Edge Function Supabase : création et modification des comptes utilisateurs.
// La clé « service_role » reste côté serveur (fournie automatiquement par Supabase).
// Seul un utilisateur ayant la permission « users.manage » peut l'appeler.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

type Payload = {
  action: 'create' | 'update'
  id?: string
  full_name?: string
  email?: string
  phone?: string | null
  job_title?: string | null
  role?: string
  is_active?: boolean
  password?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'Méthode non autorisée' })

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  // 1. Vérifier que l'appelant a le droit de gérer les utilisateurs
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: allowed, error: permError } = await caller.rpc('has_permission', { p_code: 'users.manage' })
  if (permError || !allowed) return reply(403, { error: "Vous n'avez pas le droit de gérer les utilisateurs." })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  let p: Payload
  try {
    p = await req.json()
  } catch {
    return reply(400, { error: 'Requête invalide' })
  }

  if (p.password && p.password.length < 8) return reply(400, { error: 'Le mot de passe doit contenir au moins 8 caractères.' })
  const ban = p.is_active === false ? '876000h' : 'none' // compte inactif = connexion bloquée

  if (p.action === 'create') {
    if (!p.email || !p.password || !p.full_name || !p.role) return reply(400, { error: 'Champs obligatoires manquants.' })
    const { data, error } = await admin.auth.admin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: { full_name: p.full_name },
      ban_duration: ban,
    })
    if (error || !data.user) return reply(400, { error: traduire(error?.message) })
    const { error: e2 } = await admin
      .from('profiles')
      .upsert({
        id: data.user.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone ?? null,
        job_title: p.job_title ?? null,
        role: p.role,
        is_active: p.is_active ?? true,
      })
    if (e2) return reply(400, { error: e2.message })
    return reply(200, { id: data.user.id })
  }

  if (p.action === 'update') {
    if (!p.id) return reply(400, { error: 'Utilisateur manquant.' })
    const authChanges: Record<string, unknown> = { ban_duration: ban }
    if (p.email) authChanges.email = p.email
    if (p.password) authChanges.password = p.password
    if (p.full_name) authChanges.user_metadata = { full_name: p.full_name }
    const { error } = await admin.auth.admin.updateUserById(p.id, authChanges)
    if (error) return reply(400, { error: traduire(error.message) })
    const { error: e2 } = await admin
      .from('profiles')
      .update({
        full_name: p.full_name,
        email: p.email,
        phone: p.phone ?? null,
        job_title: p.job_title ?? null,
        role: p.role,
        is_active: p.is_active ?? true,
      })
      .eq('id', p.id)
    if (e2) return reply(400, { error: e2.message })
    return reply(200, { id: p.id })
  }

  return reply(400, { error: 'Action inconnue' })
})

function traduire(msg?: string): string {
  if (!msg) return 'Erreur inconnue'
  if (/already been registered|already exists/i.test(msg)) return 'Cette adresse e-mail est déjà utilisée.'
  if (/password/i.test(msg)) return 'Mot de passe refusé : ' + msg
  return msg
}
