/**
 * Helper compartilhado pelos scripts de captura do Guia Técnico: sabe onde
 * fica a sessão da conta demo, qual é a chave de localStorage do Supabase,
 * e sabe renovar o token quando a captura é longa.
 *
 * Por quê existe: o token da conta demo dura 3600s (1h). Uma captura com
 * dezenas de telas em vários contextos paralelos pode passar disso — sem
 * renovação, a sessão expira NO MEIO da captura e as telas depois disso
 * caem tudo pro /login (print errado, sem aviso).
 *
 * ── Por que o arquivo NÃO se chama /tmp/session.json ────────────────────
 * Achado em produção (Onda 3, 05/09/2026): o EcoSistema usa a MESMA convenção
 * (`/tmp/session.json`) no pipeline irmão do Guia Técnico dele. `/tmp` é
 * compartilhado pela MÁQUINA inteira, não por workspace/worktree — rodando
 * os dois pipelines em paralelo (comum no setup de múltiplos workspaces do
 * Conductor), o processo que escrever por último vence, e o outro pipeline
 * passa a autenticar como a conta ERRADA sem aviso nenhum. Foi exatamente
 * isso: `/tmp/session.json` virou a sessão de teste do EcoSistema
 * (teste@ecosistematecnologia.com.br) no meio da captura T8 da Dominex —
 * o app carregou em inglês, travado em "Calculando estoque...", com 401/403
 * em toda chamada (token de um projeto Supabase diferente). Por isso o
 * arquivo agora tem nome específico do projeto — nunca reusar `/tmp/session.json` cru de novo.
 */

import fs from "node:fs";

export const SESSION_FILE = "/tmp/dominex-guia-tecnico-session.json";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://byqldosixshhuiuarszp.supabase.co";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** Ref do projeto Supabase, extraído do host (ex.: "byqldosixshhuiuarszp"). */
function projectRef() {
  try {
    return new URL(SUPABASE_URL).hostname.split(".")[0];
  } catch {
    return "byqldosixshhuiuarszp";
  }
}

/** Chave de localStorage que o supabase-js usa pra guardar a sessão. */
export const AUTH_STORAGE_KEY = `sb-${projectRef()}-auth-token`;

/** Lê a sessão gravada em /tmp/session.json (gerada por gerar-sessao-guia.mjs). */
export function carregarSessao() {
  if (!fs.existsSync(SESSION_FILE)) {
    throw new Error(
      `Não achei ${SESSION_FILE}. Rode primeiro:\n` +
        `  DOMINEX_DEMO_EMAIL=... DOMINEX_DEMO_PASSWORD=... node scripts/gerar-sessao-guia.mjs`
    );
  }
  return JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
}

/**
 * Renova a sessão se estiver a menos de `margemSeg` segundos de expirar
 * (default 3min). Usa o `refresh_token` — não precisa da senha de novo.
 * Sobrescreve /tmp/session.json com a sessão nova (idempotente: rodar de
 * novo com sessão ainda fresca é no-op).
 */
export async function renovarSeNecessario(session, margemSeg = 180) {
  const agora = Math.floor(Date.now() / 1000);
  const expiraEm = session.expires_at ?? 0;
  if (agora < expiraEm - margemSeg) return session;

  if (!SUPABASE_ANON_KEY) {
    throw new Error(
      "VITE_SUPABASE_PUBLISHABLE_KEY ausente no ambiente — não dá pra renovar o token no meio da captura. " +
        "Exporte a variável (ela já existe no .env do repositório) ou gere uma sessão nova."
    );
  }

  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!resp.ok) {
    throw new Error(`Falha ao renovar a sessão da conta demo: HTTP ${resp.status} — ${await resp.text()}`);
  }
  const nova = await resp.json();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(nova, null, 1));
  console.log("🔄 sessão da conta demo renovada (token ia expirar no meio da captura)");
  return nova;
}

/**
 * Sobrescreve a sessão no localStorage de uma página já aberta na origem
 * certa (BASE). Precisa ser chamado DEPOIS de um `page.goto`, porque
 * localStorage é por origem — antes da primeira navegação não há onde
 * gravar. Use em conjunto com `renovarSeNecessario` entre capturas.
 */
export async function aplicarSessaoNaPagina(page, session) {
  await page
    .evaluate(
      ({ key, value }) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          /* página ainda não montou storage; próxima captura tenta de novo */
        }
      },
      { key: AUTH_STORAGE_KEY, value: JSON.stringify(session) }
    )
    .catch(() => {});
}

/** Monta o `storageState.origins[0].localStorage` usado ao criar o contexto. */
export function localStorageDeSessao(session, extras = {}) {
  return [
    { name: AUTH_STORAGE_KEY, value: JSON.stringify(session) },
    { name: "theme", value: "light" },
    ...Object.entries(extras).map(([name, value]) => ({ name, value: String(value) })),
  ];
}
