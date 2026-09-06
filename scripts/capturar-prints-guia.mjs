#!/usr/bin/env node
/**
 * Captura os prints reais do sistema pro Guia Técnico da Dominex (PDF +
 * página pública + Central de Ajuda). Porte do pipeline do EcoSistema.
 *
 * Usa a conta DEMO (ver scripts/gerar-sessao-guia.mjs) e navega em PRODUÇÃO.
 * Roda N contextos de browser em paralelo — cada um pega uma fatia da lista
 * de telas.
 *
 * ── REGRA INVIOLÁVEL DA CAPTURA ──────────────────────────────────────────
 * A conta demo roda em PRODUÇÃO de verdade. Este script só ABRE tela e
 * modal — nunca persiste nada. NUNCA clicar em: Salvar, Criar, Finalizar,
 * Concluir, Confirmar, Excluir, Remover, Emitir, Cancelar nota, Pagar,
 * Receber, Baixar, Enviar, Compartilhar, Agendar, Atribuir, Iniciar OS,
 * Check-in, Assinar, Aprovar, Convidar. Na Dominex isso é ainda mais
 * sensível que em outros sistemas: existe OS, agendamento e NOTIFICAÇÃO
 * PUSH pro celular do técnico — um clique errado avisa uma pessoa de
 * verdade. Ao editar TARGETS, nunca declare uma URL que abra um wizard e
 * deixe ele "quase pronto" — o objetivo é só o print da tela em repouso.
 * ──────────────────────────────────────────────────────────────────────
 *
 * Uso:
 *   node scripts/capturar-prints-guia.mjs [--only=t5,t8] [--concurrency=5]
 *
 * Pré-requisito: /tmp/session.json (node scripts/gerar-sessao-guia.mjs).
 * Saída: docs/guia-tecnico/img/<id>.png
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { carregarSessao, renovarSeNecessario, aplicarSessaoNaPagina, localStorageDeSessao } from "./lib/sessao-guia.mjs";

// Por padrão captura a produção. GUIA_BASE=http://localhost:8081 aponta pro
// dev server, que é o único jeito de printar mudança de tela ainda não
// deployada. Produção real é www.dominex.app (o apex dominex.app é 301 pro
// www — ver public/_redirects).
const BASE = process.env.GUIA_BASE || "https://www.dominex.app";
const OUT = path.resolve("docs/guia-tecnico/img");

fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Telas a capturar. `clip: "main"` recorta só a área de conteúdo (sem
// sidebar). Cada `url` foi conferida contra `src/lib/i18n/appRouteSlugs.ts`
// (registro canônico das rotas pt-br) e/ou `src/App.tsx`. NÃO inclui:
//   - painel master /admin/* (é interno da Dominex, não do cliente)
//   - rotas mortas que só redirecionam (/equipes, /checklists, /pmoc,
//     /notas-fiscais/configuracoes, /responsaveis-tecnicos, /tutoriais) —
//     ver docs/domiflix/trilha-de-tutoriais.md → "O que ficou de fora"
//   - detalhe dinâmico (/clientes/:id, /contratos/:id, /os-tecnico/:id...) —
//     precisa de um id real da empresa demo; ver capturar-prints-extras.mjs
// IDs seguem o padrão `tX-slug`, X = seção da trilha (docs/domiflix/
// trilha-de-tutoriais.md, T0..T17), pra bater com guia-impacto.mjs.
// ---------------------------------------------------------------------------
const TARGETS = [
  // T0 — visão geral / boas-vindas
  { id: "t0-dashboard-completo", url: "/dashboard", clip: "page", full: true },
  { id: "t0-menu-lateral", url: "/dashboard", clip: "sidebar" },

  // T1 — conta e empresa
  { id: "t1-configuracoes", url: "/configuracoes", clip: "main", full: true },
  { id: "t1-perfil", url: "/perfil", clip: "main" },

  // T2 — usuários e permissões (aba dentro de Configurações, sem rota própria)
  { id: "t2-usuarios", url: "/configuracoes?tab=usuarios", clip: "main", full: true },

  // T3 — clientes e equipamentos
  { id: "t3-clientes", url: "/clientes", clip: "main" },
  { id: "t3-equipamentos", url: "/equipamentos", clip: "main" },

  // T4 — serviços, tarefas e checklists
  { id: "t4-servicos", url: "/servicos", clip: "main" },

  // T5 — ordens de serviço (visão do gestor)
  { id: "t5-ordens-servico", url: "/ordens-servico", clip: "main", full: true },

  // T6 — agenda, equipes e mapa ao vivo
  { id: "t6-agenda", url: "/agenda", clip: "main" },
  { id: "t6-mapa", url: "/mapa-ao-vivo", clip: "main" },

  // T7 — Área do Técnico™ (hub; a execução de OS em si depende de um id real
  // de OS da empresa demo — ver capturar-prints-extras.mjs)
  { id: "t7-area-tecnico", url: "/area-tecnico", clip: "main" },

  // T8 — estoque, compras e inventário
  { id: "t8-estoque", url: "/estoque", clip: "main", full: true },

  // T9 — orçamentos, precificação e proposta
  { id: "t9-orcamentos", url: "/orcamentos", clip: "main", full: true },

  // T10 — CRM: funil, leads e captação (módulo pago — pode não aparecer se
  // a empresa demo não tiver o módulo CRM contratado)
  { id: "t10-crm", url: "/crm", clip: "main", full: true },

  // T11 — contratos e PMOC (PMOC não tem menu próprio — é filtro dentro de
  // Contratos; "Responsáveis Técnicos" vive em Configurações de Contrato)
  { id: "t11-contratos", url: "/contratos", clip: "main", full: true },
  { id: "t11-configuracoes-contrato", url: "/configuracoes-contrato", clip: "main" },

  // T12 — Portal do Cliente, NPS e reputação: é rota PÚBLICA com token
  // (/portal/:token) — não dá pra listar aqui sem o token de um cliente
  // real da empresa demo. Ver capturar-prints-extras.mjs → PENDÊNCIA.

  // T13 — financeiro
  { id: "t13-financeiro-relatorio", url: "/financeiro/relatorio", clip: "main", full: true },
  { id: "t13-financeiro-movimentacoes", url: "/financeiro/movimentacoes", clip: "main", full: true },
  { id: "t13-financeiro-contas", url: "/financeiro/contas", clip: "main", full: true },

  // T14 — notas fiscais (NFS-e)
  { id: "t14-notas-fiscais", url: "/notas-fiscais", clip: "main", full: true },

  // T15 — funcionários, ponto e folha
  { id: "t15-funcionarios", url: "/funcionarios", clip: "main", full: true },

  // T16 — assinatura, plano e módulos
  { id: "t16-assinatura", url: "/assinatura", clip: "main", full: true },

  // T17 — dashboard (já coberto em T0), rotina e changelog
  { id: "t17-changelog", url: "/changelog", clip: "main" },
];

// CSS pra tirar o que polui o print (toasts, banners residuais)
const HIDE_CSS = `
  [data-sonner-toaster], [role="status"] { display: none !important; }
  * { animation: none !important; transition: none !important; }
`;

async function makeContext(browser, session) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: localStorageDeSessao(session) }],
    },
  });
  // Fecha de antemão qualquer modal de boas-vindas/preferências que apareça
  // sozinho pouco depois do load em contexto novo. Não sabemos hoje o nome
  // exato de um modal desses na Dominex (não achamos nenhum no código na
  // hora do porte) — mas se um aparecer no futuro, a defesa abaixo mais o
  // Escape em `limpar()` seguram o print sem precisar saber o nome dele.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("preferences-modal-dismissed", "true");
      localStorage.setItem("onboarding-preferences-seen", "true");
    } catch {}
  });
  return ctx;
}

// Fecha modal residual por Escape + esconde qualquer banner por texto.
async function limpar(page) {
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
}

async function capture(page, t) {
  const url = BASE + t.url;
  await page.setViewportSize({ width: 1440, height: t.full ? 2000 : 900 });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  // espera o app montar
  await page.waitForSelector("main, [role=main]", { timeout: 30000 }).catch(() => {});
  await limpar(page);
  // fecha modais/banners residuais que o load possa ter aberto sozinho
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 25000 }).catch(() => {});
  // espera sumir o esqueleto de carregamento (skeleton/shimmer)
  await page
    .waitForFunction(
      () => document.querySelectorAll(".animate-pulse, [data-skeleton], .skeleton").length === 0,
      null,
      { timeout: 25000 }
    )
    .catch(() => {});
  await page.waitForTimeout(2500);
  await limpar(page);

  const file = path.join(OUT, `${t.id}.png`);
  const opts = { path: file, animations: "disabled", scale: "css" };

  if (t.clip === "sidebar") {
    const el = page.locator("nav").first();
    await el.screenshot({ ...opts }).catch(async () => {
      await page.screenshot({ ...opts });
    });
  } else if (t.clip === "main") {
    const el = page.locator("main").first();
    if (await el.count()) {
      await el.screenshot({ ...opts }).catch(async () => {
        await page.screenshot({ ...opts, fullPage: !!t.full });
      });
    } else {
      await page.screenshot({ ...opts, fullPage: !!t.full });
    }
  } else {
    await page.screenshot({ ...opts, fullPage: !!t.full });
  }
  const size = fs.statSync(file).size;
  return size;
}

async function worker(browser, slice, results, sessaoInicial) {
  let sessao = sessaoInicial;
  const ctx = await makeContext(browser, sessao);
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  // Aquecimento: o PRIMEIRO print de todo contexto novo do Playwright falha
  // (JS ainda compilando, fontes carregando, possível modal de boas-vindas
  // engolindo o 1º clique). Descarta uma navegação antes de contar pra valer.
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await limpar(page);

  for (const t of slice) {
    try {
      // Captura longa (muitas telas, vários workers) pode passar de 1h — o
      // token da conta demo expira em 3600s. Renova sozinho antes de furar.
      sessao = await renovarSeNecessario(sessao);
      await aplicarSessaoNaPagina(page, sessao);
      const size = await capture(page, t);
      results.push({ id: t.id, ok: true, size });
      console.log(`✅ ${t.id} (${Math.round(size / 1024)}kb)`);
    } catch (e) {
      results.push({ id: t.id, ok: false, err: String(e).slice(0, 160) });
      console.log(`❌ ${t.id} — ${String(e).slice(0, 160)}`);
    }
  }
  await ctx.close();
}

(async () => {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const concArg = args.find((a) => a.startsWith("--concurrency="));
  const concurrency = concArg ? Number(concArg.split("=")[1]) : 5;

  let targets = TARGETS;
  if (onlyArg) {
    const keys = onlyArg.split("=")[1].split(",").map((s) => s.trim().toLowerCase());
    targets = TARGETS.filter((t) => keys.some((k) => t.id.startsWith(k + "-") || t.id === k));
  }

  const sessaoInicial = await renovarSeNecessario(carregarSessao());

  console.log(`Capturando ${targets.length} telas com ${concurrency} contextos paralelos...`);
  const browser = await chromium.launch({ headless: true });
  const slices = Array.from({ length: concurrency }, () => []);
  targets.forEach((t, i) => slices[i % concurrency].push(t));

  const results = [];
  await Promise.all(slices.filter((s) => s.length).map((s) => worker(browser, s, results, sessaoInicial)));
  await browser.close();

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n=== ${ok}/${results.length} capturados ===`);
  const fails = results.filter((r) => !r.ok);
  if (fails.length) {
    console.log("Falhas:");
    fails.forEach((f) => console.log(`  ${f.id}: ${f.err}`));
  }
  fs.writeFileSync(path.join(OUT, "_captura.json"), JSON.stringify(results, null, 1));
})();
