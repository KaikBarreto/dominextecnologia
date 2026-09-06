#!/usr/bin/env node
/**
 * Gera a sessão da conta DEMO da Dominex (arquivo definido em SESSION_FILE, ver scripts/lib/sessao-guia.mjs), pra ser usada
 * pelos scripts de captura do Guia Técnico (capturar-prints-guia.mjs,
 * capturar-prints-extras.mjs, capturar-modais.mjs).
 *
 * A conta demo roda EM PRODUÇÃO. Ela existe só pra gerar print do sistema —
 * não é cliente real. Ver scripts/README.md → "Regra de ouro da captura".
 *
 * A senha NUNCA fica hardcoded aqui. Vem de variável de ambiente:
 *   DOMINEX_DEMO_EMAIL      (default: demo@dominex.app)
 *   DOMINEX_DEMO_PASSWORD   (obrigatória, sem default)
 *
 * As credenciais do PROJETO (não da conta) já existem no .env do repositório:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 *
 * Uso:
 *   set -a; source .env; set +a
 *   DOMINEX_DEMO_PASSWORD='...' node scripts/gerar-sessao-guia.mjs
 *
 * Saída: SESSION_FILE (scripts/lib/sessao-guia.mjs) — a resposta crua de
 * POST /auth/v1/token?grant_type=password (access_token, refresh_token,
 * expires_at, user...). É o MESMO formato que o supabase-js grava em
 * localStorage, então os scripts de captura usam esse arquivo direto,
 * sem transformação.
 */

import fs from "node:fs";
import { SESSION_FILE } from "./lib/sessao-guia.mjs";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.DOMINEX_DEMO_EMAIL || "demo@dominex.app";
const PASSWORD = process.env.DOMINEX_DEMO_PASSWORD;

function falhar(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) {
  falhar(
    "VITE_SUPABASE_URL ausente no ambiente. Rode antes:\n" +
      "  set -a; source .env; set +a"
  );
}
if (!SUPABASE_ANON_KEY) {
  falhar(
    "VITE_SUPABASE_PUBLISHABLE_KEY ausente no ambiente. Rode antes:\n" +
      "  set -a; source .env; set +a"
  );
}
if (!PASSWORD) {
  falhar(
    "DOMINEX_DEMO_PASSWORD não foi definida. A senha da conta demo NÃO pode " +
      "ficar hardcoded em script versionado — exporte a variável antes de rodar:\n" +
      "  DOMINEX_DEMO_PASSWORD='...' node scripts/gerar-sessao-guia.mjs"
  );
}

(async () => {
  console.log(`Autenticando ${EMAIL} em ${SUPABASE_URL}...`);
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!resp.ok) {
    const corpo = await resp.text();
    falhar(`Login falhou: HTTP ${resp.status} — ${corpo.slice(0, 300)}`);
  }

  const sessao = await resp.json();
  if (!sessao.access_token || !sessao.user?.id) {
    falhar(`Resposta de login sem access_token/user — algo mudou na API. Corpo: ${JSON.stringify(sessao).slice(0, 300)}`);
  }

  fs.writeFileSync(SESSION_FILE, JSON.stringify(sessao, null, 1));
  const minutos = Math.round((sessao.expires_in ?? 3600) / 60);
  console.log(`✅ Sessão salva em ${SESSION_FILE} (user_id=${sessao.user.id}, expira em ~${minutos}min)`);
  console.log("   Captura longa renova sozinha no meio (ver scripts/lib/sessao-guia.mjs).");
})();
