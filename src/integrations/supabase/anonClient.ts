import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Cliente anônimo para links públicos (?modo=cliente).
// Não persiste sessão nem envia JWT do usuário logado, evitando que a RLS
// avalie como "authenticated" (com filtro de company_id) e bloqueie a leitura
// pública garantida pelas policies "TO anon".
export const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
