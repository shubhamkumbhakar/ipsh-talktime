import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://gowlsoqlupqzqasxzued.supabase.co'
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_emmI4yVDcErqLSC2fx0tSA_k5rB8nj0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
