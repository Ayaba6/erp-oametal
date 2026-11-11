import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  console.warn('Supabase : VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant (voir .env.example)')
}

export const supabase = createClient(url ?? '', anonKey ?? '')
