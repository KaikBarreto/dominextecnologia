import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Cliente anônimo para links públicos (?modo=cliente).
// Não persiste sessão nem envia JWT do usuário logado, evitando que a RLS
// avalie como "authenticated" (com filtro de company_id) e bloqueie a leitura
// pública garantida pelas policies "TO anon".
//
// storageKey distinta do client autenticado: sem isso, os dois GoTrueClient
// disputam a mesma chave do localStorage e o mesmo lock do navigator.locks,
// gerando o warning "Multiple GoTrueClient instances detected" e — pior —
// travando o getSession() do AuthProvider em loading infinito.
export const supabaseAnon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'sb-anon-public',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
