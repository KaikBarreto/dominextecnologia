// Camada standalone (não-React) do account switcher do Dominex.
// O hook `useSavedSessions` (em src/hooks/useSavedSessions.ts) consome essas
// funções. Esta camada existe pra que `AuthContext` possa chamar
// `addCurrentSessionToSavedStandalone()` no SIGNED_IN sem dependência
// circular hook↔hook.
//
// Adaptado 1:1 do EcoSistema (src/lib/savedSessions.ts) com ajustes pro
// schema do Dominex:
//   - profiles.user_id (não profiles.id) como FK pro auth user.
//   - profiles não tem coluna `email` — usa session.user.email.
//   - role do switcher vem de user_roles (Dominex usa AppRole específico,
//     não tem `company_admin` como string). Mapeamento:
//       super_admin → 'admin'         → badge ADMIN vermelho (Auctus staff)
//       admin       → 'company_admin' → badge MASTER verde com Crown
//       outros      → role original   → sem badge

import { supabase } from "@/integrations/supabase/client";
import {
  encryptJson,
  decryptJson,
  SAVED_SESSIONS_STORAGE_KEY,
} from "@/lib/sessionCrypto";

export type SavedSession = {
  user_id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  company_id: string | null;
  company_name: string | null;
  refresh_token: string;
  added_at: number;
  last_used_at: number;
};

export type SavedSessionsStore = {
  active_user_id: string | null;
  sessions: SavedSession[];
};

export const EMPTY_STORE: SavedSessionsStore = {
  active_user_id: null,
  sessions: [],
};
export const MAX_SESSIONS = 5;
export const AUTO_EXPIRE_DAYS = 60;

// Janela de cooldown pro fast-path do addCurrentSessionToSavedStandalone:
// se a entrada do user já foi atualizada há menos disso, só atualiza
// refresh_token+last_used_at sem refazer queries de profile/user_roles.
// Mata o ruído de chamadas /user causado por rotação de access_token
// (~1x/h) e re-emit de SIGNED_IN em tab focus (5 abas = 5 chamadas).
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;

const ADDING_ACCOUNT_FLAG = "__dominex_adding_account";

export async function loadStore(): Promise<SavedSessionsStore> {
  const raw = localStorage.getItem(SAVED_SESSIONS_STORAGE_KEY);
  if (!raw) return EMPTY_STORE;
  const store = await decryptJson<SavedSessionsStore>(raw);
  if (!store) return EMPTY_STORE;
  // Auto-expire
  const cutoff = Date.now() - AUTO_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
  const filtered = store.sessions.filter((s) => s.last_used_at >= cutoff);
  return { ...store, sessions: filtered };
}

export async function saveStore(store: SavedSessionsStore): Promise<void> {
  try {
    const encrypted = await encryptJson(store);
    localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, encrypted);
  } catch (e) {
    // Crypto falhou (browser muito antigo / contexto inseguro) — degrada
    // gracefully salvando plain. UX > consistência de crypto. Próximo load
    // tenta decrypt, falha, retorna EMPTY_STORE. Pior caso: user perde
    // sessões salvas mas não trava o app.
    console.warn("[savedSessions] crypto falhou, salvando plain como fallback:", e);
    try {
      localStorage.setItem(SAVED_SESSIONS_STORAGE_KEY, JSON.stringify(store));
    } catch {
      // Storage cheio ou private mode — desiste silenciosamente.
    }
  }
}

// Resolve o role efetivo da sessão a partir do array de user_roles. Mapeia
// o conceito Dominex pro vocabulário visual do switcher (que vem do
// EcoSistema). Hierarquia: super_admin > admin > resto.
function resolveEffectiveRole(roles: { role: string }[] | null): string {
  if (!roles || roles.length === 0) return "user";
  // Pega o "mais alto" da lista. super_admin é equipe Auctus → badge ADMIN.
  // admin é gestor da empresa cliente → badge MASTER.
  if (roles.some((r) => r.role === "super_admin")) return "admin";
  if (roles.some((r) => r.role === "admin")) return "company_admin";
  // Outros roles (gestor, tecnico, comercial, financeiro) — sem badge,
  // mas mantemos pra debug / futuras decisões.
  return roles[0].role;
}

// Adiciona/atualiza a sessão atual (a do supabase.auth.getSession() atual) no
// store criptografado. Chamado após SIGNED_IN bem-sucedido.
//
// `forceRefresh: true` pula o fast-path e sempre refaz queries de
// profile/user_roles. Usar quando precisa de dados atualizados após
// trocar de conta (ver useSavedSessions.switchToSession).
export async function addCurrentSessionToSavedStandalone(options?: {
  forceRefresh?: boolean;
}): Promise<void> {
  // session.user já vem com o User decodificado do JWT — sem round-trip
  // /user contra o servidor. Pra salvar dados locais no switcher, confiar
  // na sessão local já é suficiente.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;
  const user = session.user;

  const current = await loadStore();
  const existing = current.sessions.find((s) => s.user_id === user.id);

  // FAST PATH: entrada já existe pra esse user_id e foi atualizada há
  // menos de REFRESH_COOLDOWN_MS. Só atualiza refresh_token + last_used_at,
  // sem refazer queries em profiles/user_roles. Resolve o ruído de
  // /user e SELECTs em rotação de access_token (~1x/h) e re-emit de
  // SIGNED_IN em tab focus. Cache é por user_id → trocou de conta,
  // existing=undefined, cai no full path.
  if (
    existing &&
    !options?.forceRefresh &&
    Date.now() - existing.last_used_at < REFRESH_COOLDOWN_MS
  ) {
    const updated: SavedSession = {
      ...existing,
      refresh_token: session.refresh_token,
      last_used_at: Date.now(),
    };
    const next: SavedSessionsStore = {
      active_user_id: user.id,
      sessions: current.sessions.map((s) =>
        s.user_id === user.id ? updated : s
      ),
    };
    await saveStore(next);
    return;
  }

  // Pegar profile pra full_name, avatar, company. Schema Dominex: filtra
  // por `user_id` (não `id` como EcoSistema). E não tem coluna `email`
  // em profiles — usa session.user.email.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, company_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Roles do Dominex vivem em user_roles (M:N). Pode ter mais de um por
  // user_id. Pega o "mais alto" via resolveEffectiveRole.
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const effectiveRole = resolveEffectiveRole(roleData);

  // Company name — só busca se tem company_id. super_admin tipicamente
  // não tem company_id, então fica null mesmo.
  let companyName: string | null = null;
  const profileCompanyId = (profile?.company_id as string | null) ?? null;
  if (profileCompanyId) {
    const { data: companyData } = await supabase
      .from("companies")
      .select("name")
      .eq("id", profileCompanyId)
      .maybeSingle();
    companyName = (companyData?.name as string) ?? null;
  }

  const fullName =
    (profile?.full_name as string) ||
    (user.email || "").split("@")[0] ||
    "Conta";

  const sessionData: SavedSession = {
    user_id: user.id,
    email: user.email || "",
    full_name: fullName,
    avatar_url: (profile?.avatar_url as string) || null,
    role: effectiveRole,
    company_id: profileCompanyId,
    company_name: companyName,
    refresh_token: session.refresh_token,
    added_at: Date.now(),
    last_used_at: Date.now(),
  };

  const existingIdx = current.sessions.findIndex(
    (s) => s.user_id === user.id
  );
  let sessions: SavedSession[];
  if (existingIdx >= 0) {
    // Atualiza preservando added_at original
    sessions = [...current.sessions];
    sessions[existingIdx] = {
      ...sessionData,
      added_at: current.sessions[existingIdx].added_at,
    };
  } else {
    // Limita a MAX_SESSIONS — remove a mais antiga se atingiu
    if (current.sessions.length >= MAX_SESSIONS) {
      const oldest = [...current.sessions].sort(
        (a, b) => a.last_used_at - b.last_used_at
      )[0];
      sessions = current.sessions.filter((s) => s.user_id !== oldest.user_id);
    } else {
      sessions = [...current.sessions];
    }
    sessions.push(sessionData);
  }

  const next: SavedSessionsStore = {
    active_user_id: user.id,
    sessions,
  };
  await saveStore(next);
}

export function isAddingAccountStandalone(): boolean {
  return localStorage.getItem(ADDING_ACCOUNT_FLAG) === "1";
}

export function clearAddAccountFlagStandalone(): void {
  localStorage.removeItem(ADDING_ACCOUNT_FLAG);
}

export function setAddAccountFlagStandalone(): void {
  localStorage.setItem(ADDING_ACCOUNT_FLAG, "1");
}

export const ADDING_ACCOUNT_FLAG_KEY = ADDING_ACCOUNT_FLAG;
