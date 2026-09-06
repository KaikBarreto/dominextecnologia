#!/usr/bin/env node
/**
 * Segunda passada de prints do Guia Técnico: telas que só aparecem depois de
 * uma interação (abrir modal) ou que ficam em rota PÚBLICA com token.
 *
 * ── REGRA INVIOLÁVEL DA CAPTURA ──────────────────────────────────────────
 * A conta demo roda em PRODUÇÃO de verdade. Este script só ABRE tela e
 * modal — nunca persiste nada. NUNCA clicar em: Salvar, Criar, Finalizar,
 * Concluir, Confirmar, Excluir, Remover, Emitir, Cancelar nota, Pagar,
 * Receber, Baixar, Enviar, Compartilhar, Agendar, Atribuir, Iniciar OS,
 * Check-in, Assinar, Aprovar, Convidar. Existe OS, agendamento e
 * NOTIFICAÇÃO PUSH pro celular do técnico na Dominex — um clique errado
 * avisa uma pessoa de verdade.
 * ──────────────────────────────────────────────────────────────────────
 *
 * Uso:  node scripts/capturar-prints-extras.mjs
 * Pré-requisito: /tmp/session.json (node scripts/gerar-sessao-guia.mjs).
 * Saída: docs/guia-tecnico/img/<id>.png
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { carregarSessao, renovarSeNecessario, localStorageDeSessao } from "./lib/sessao-guia.mjs";

const BASE = process.env.GUIA_BASE || "https://www.dominex.app";
const OUT = path.resolve("docs/guia-tecnico/img");
fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// PENDÊNCIA — tokens/ids reais da empresa DEMO.
//
// Diferente do EcoSistema (que já tinha token de portal/fornecedor/quiosque
// de teste conhecidos), a conta demo@dominex.app é nova e ninguém abriu
// ainda o portal de um cliente demo, gerou uma OS pública ou um orçamento
// público nela. Os campos abaixo ficam **vazios de propósito** — preencha
// com um id/token real da empresa demo antes de rodar (abra o sistema
// logado, copie o link público de cada tela e extraia só o token/id da URL).
// NÃO usar token de empresa/cliente real fora da conta demo.
//
// Onde cada um aparece na URL:
//   Portal do Cliente        /portal/:token           (Clientes → detalhe → Portal)
//   OS compartilhada         /os-tecnico/:id           (Ordens de Serviço → abrir OS → Compartilhar)
//   Ponto do funcionário     /ponto/:slug              (Funcionários → funcionário → gerar link de ponto)
//   Orçamento público        /orcamento/:token         (Orçamentos → abrir → Copiar link)
//   Proposta pública         /proposta/:token          (Orçamentos → Configurar Proposta → link)
//   Contrato/PMOC da unidade /contrato/unidade/:token  (Contratos → detalhe → Portal do Contrato)
// ---------------------------------------------------------------------------
const PORTAL_CLIENTE_TOKEN = process.env.GUIA_TOKEN_PORTAL_CLIENTE || "";
const OS_PUBLICA_ID = process.env.GUIA_ID_OS_PUBLICA || "";
const PONTO_SLUG = process.env.GUIA_SLUG_PONTO || "";
const ORCAMENTO_PUBLICO_TOKEN = process.env.GUIA_TOKEN_ORCAMENTO || "";
const CONTRATO_UNIDADE_TOKEN = process.env.GUIA_TOKEN_CONTRATO_UNIDADE || "";

const HIDE_CSS = `
  [data-sonner-toaster] { display: none !important; }
  * { animation: none !important; transition: none !important; }
`;

// telas públicas (sem sessão) — só entram na lista se o token/id foi
// preenchido via env (ver PENDÊNCIA acima). Sem token, o script pula e avisa.
const PUBLICAS = [
  PORTAL_CLIENTE_TOKEN && { id: "t12-portal-cliente", url: `/portal/${PORTAL_CLIENTE_TOKEN}`, full: true },
  OS_PUBLICA_ID && { id: "t7-os-compartilhada", url: `/os-tecnico/${OS_PUBLICA_ID}`, full: true },
  PONTO_SLUG && { id: "t15-ponto-publico", url: `/ponto/${PONTO_SLUG}`, full: false },
  ORCAMENTO_PUBLICO_TOKEN && { id: "t9-orcamento-publico", url: `/orcamento/${ORCAMENTO_PUBLICO_TOKEN}`, full: true },
  CONTRATO_UNIDADE_TOKEN && { id: "t11-portal-unidade", url: `/contrato/unidade/${CONTRATO_UNIDADE_TOKEN}`, full: true },
].filter(Boolean);

// telas que exigem sessão + interação (clique único, sem persistir nada)
const LOGADAS = [
  {
    id: "t2-novo-usuario",
    url: "/configuracoes?tab=usuarios",
    acao: async (page) => {
      const b = page.getByRole("button", { name: /Criar Usuário/i }).first();
      await b.click({ timeout: 15000 });
      await page.waitForTimeout(2500);
    },
  },
  // Checkout de assinatura da Dominex (protegido — precisa estar logado).
  // Fica só na tela, sem escolher forma de pagamento nem confirmar nada.
  { id: "t16-checkout", url: "/checkout", full: true },
];

// `limpar()` só esconde CSS (toast/animação) — NUNCA aperta Escape aqui.
// Escape fecha o diálogo que uma `acao` acabou de abrir de propósito (bug real
// encontrado na 1ª captura completa: `t2-novo-usuario` saiu sem o modal porque
// o Escape genérico rodava DEPOIS do clique). O Escape de "fecha modal
// residual de boas-vindas" só roda ANTES de qualquer `acao`, em
// `fecharModalResidual()`.
async function limpar(page) {
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
}

async function fecharModalResidual(page) {
  await page.keyboard.press("Escape").catch(() => {});
}

async function tirar(page, alvo) {
  await page.setViewportSize({ width: 1440, height: alvo.full ? 1900 : 900 });
  await page.goto(BASE + alvo.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await limpar(page);
  await fecharModalResidual(page);
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(2500);
  if (alvo.acao) await alvo.acao(page);
  await limpar(page);
  const file = path.join(OUT, `${alvo.id}.png`);
  await page.screenshot({ path: file, animations: "disabled", scale: "css", fullPage: !!alvo.full });
  return fs.statSync(file).size;
}

(async () => {
  if (!PUBLICAS.length) {
    console.log(
      "⚠️  Nenhum token/id público preenchido (GUIA_TOKEN_PORTAL_CLIENTE, GUIA_ID_OS_PUBLICA, " +
        "GUIA_SLUG_PONTO, GUIA_TOKEN_ORCAMENTO, GUIA_TOKEN_CONTRATO_UNIDADE) — pulando as telas " +
        "públicas com token. Ver comentário PENDÊNCIA no topo deste arquivo."
    );
  }

  const sessao = await renovarSeNecessario(carregarSessao());
  const browser = await chromium.launch({ headless: true });

  const comSessao = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: localStorageDeSessao(sessao) }],
    },
  });
  const anonimo = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });

  const resultados = [];
  for (const [ctx, lista] of [
    [anonimo, PUBLICAS],
    [comSessao, LOGADAS],
  ]) {
    if (!lista.length) continue;
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    // Aquecimento — mesmo motivo do capturar-prints-guia.mjs: 1º print de
    // contexto novo falha calado sem essa navegação de descarte.
    await page.goto(BASE + (ctx === anonimo ? "/login" : "/dashboard"), { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await limpar(page);
    await fecharModalResidual(page);
    for (const alvo of lista) {
      try {
        const kb = Math.round((await tirar(page, alvo)) / 1024);
        resultados.push({ id: alvo.id, ok: true });
        console.log(`✅ ${alvo.id} (${kb}kb)`);
      } catch (e) {
        resultados.push({ id: alvo.id, ok: false, err: String(e).slice(0, 140) });
        console.log(`❌ ${alvo.id} — ${String(e).slice(0, 140)}`);
      }
    }
    await page.close();
  }

  await browser.close();
  console.log(`\n=== ${resultados.filter((r) => r.ok).length}/${resultados.length} ===`);
})();
