#!/usr/bin/env node
/**
 * Captura prints de MODAIS e SITUAÇÕES específicas do sistema (não só telas).
 *
 * Cada seção do guia declara o que quer printar num JSON próprio:
 *   docs/guia-tecnico/prints/<Tx>.json
 *
 * Formato:
 * {
 *   "secao": "T5",
 *   "prints": [
 *     {
 *       "id": "t5-nova-os-etapa2",
 *       "url": "/ordens-servico",
 *       "legenda": "Etapa 2 do wizard de nova OS: equipamentos e checklists.",
 *       "viewport": { "largura": 1440, "altura": 1000 },
 *       "passos": [
 *         { "esperar": 2000 },
 *         { "clicar": "Nova OS" },
 *         { "esperarTexto": "Cliente" }
 *       ],
 *       "recorte": "dialog"
 *     }
 *   ]
 * }
 *
 * Passos disponíveis (um por objeto):
 *   { "ir": "/agenda" }                       navega pra outra rota
 *   { "clicar": "Nova OS" }                   clica por texto acessível (botão/link/aba)
 *   { "clicarSeletor": "button.foo" }         clica por seletor CSS
 *   { "preencher": "#campo", "valor": "10" }  preenche input por seletor CSS
 *   { "campo": "Nome do cliente", "valor": "Lat" }  preenche por placeholder ou rótulo
 *   { "digitar": "Latinha" }                  digita no elemento focado
 *   { "tecla": "Enter" }                      aperta uma tecla
 *   { "esperar": 1500 }                       espera N milissegundos
 *   { "esperarTexto": "Cliente cadastrado" }  espera o texto aparecer
 *   { "rolarAte": ".secao" }                  rola até o seletor
 *   { "opcional": true, ... }                 se o passo falhar, segue em frente
 *
 * Recortes: "dialog" (modal aberto), "main", "pagina", ou { "seletor": "css" }
 *
 * ── REGRA INVIOLÁVEL DA CAPTURA ──────────────────────────────────────────
 * A conta demo roda em PRODUÇÃO de verdade. Ao escrever spec novo: abrir o
 * modal, printar, e pronto. NUNCA clicar em Salvar, Criar, Finalizar,
 * Concluir, Confirmar, Excluir, Remover, Emitir, Cancelar nota, Pagar,
 * Receber, Baixar, Enviar, Compartilhar, Agendar, Atribuir, Iniciar OS,
 * Check-in, Assinar, Aprovar, Convidar. Existe OS, agendamento e
 * NOTIFICAÇÃO PUSH pro celular do técnico na Dominex — um clique errado
 * avisa uma pessoa de verdade. Não mexer em Configurações fora do necessário
 * pra abrir o modal declarado.
 * ──────────────────────────────────────────────────────────────────────
 *
 * Uso:
 *   node scripts/capturar-modais.mjs                # tudo
 *   node scripts/capturar-modais.mjs T5 T8           # só essas seções
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { carregarSessao, renovarSeNecessario, aplicarSessaoNaPagina, localStorageDeSessao } from "./lib/sessao-guia.mjs";

// Por padrão captura a produção. GUIA_BASE=http://localhost:8081 aponta pro
// dev server, que é o único jeito de printar mudança de tela ainda não
// deployada.
const BASE = process.env.GUIA_BASE || "https://www.dominex.app";
const OUT = path.resolve("docs/guia-tecnico/img");
const SPECS = path.resolve("docs/guia-tecnico/prints");

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SPECS, { recursive: true });

const HIDE_CSS = `
  [data-sonner-toaster] { display: none !important; }
  * { animation: none !important; transition: none !important; caret-color: transparent !important; }
`;

// `limpar()` só esconde CSS (toast/animação) — NUNCA aperta Escape aqui.
// Escape fecha o diálogo que os `passos` acabaram de abrir de propósito (bug
// real encontrado na 1ª captura completa do irmão `capturar-prints-extras.mjs`:
// o Escape genérico rodava DEPOIS da ação e fechava o modal antes do print).
// O Escape de "fecha modal residual de boas-vindas" só roda ANTES dos
// `passos`, em `fecharModalResidual()`.
async function limpar(page) {
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
}

async function fecharModalResidual(page) {
  await page.keyboard.press("Escape").catch(() => {});
}

async function executarPasso(page, passo) {
  const t = passo.tempo ?? 12000;
  if (passo.ir !== undefined) {
    await page.goto(BASE + passo.ir, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
  } else if (passo.clicar !== undefined) {
    const re = new RegExp(passo.clicar, "i");
    const candidatos = [
      page.getByRole("button", { name: re }),
      page.getByRole("link", { name: re }),
      page.getByRole("tab", { name: re }),
      page.getByRole("menuitem", { name: re }),
      page.locator(`[aria-label*="${passo.clicar}" i]`),
      page.locator(`[title*="${passo.clicar}" i]`),
      page.getByText(re),
    ];
    let clicou = false;
    let ultimo = null;
    for (const c of candidatos) {
      const n = await c.count().catch(() => 0);
      for (let i = 0; i < n && !clicou; i++) {
        const alvo = c.nth(i);
        if (!(await alvo.isVisible().catch(() => false))) continue;
        try {
          await alvo.click({ timeout: 4000 });
          clicou = true;
        } catch (e) {
          ultimo = e;
          // alguns botões ficam cobertos por overlay ou com pointer-events; força
          try {
            await alvo.click({ timeout: 2500, force: true });
            clicou = true;
          } catch (e2) {
            ultimo = e2;
          }
        }
      }
      if (clicou) break;
    }
    if (!clicou) throw new Error(`não achei nada clicável com "${passo.clicar}"` + (ultimo ? ` (${String(ultimo).split("\n")[0]})` : ""));
    await page.waitForTimeout(900);
  } else if (passo.clicarSeletor !== undefined) {
    const alvo = page.locator(passo.clicarSeletor).first();
    try {
      await alvo.click({ timeout: passo.forcar ? 4000 : t, force: !!passo.forcar });
    } catch (e) {
      await alvo.click({ timeout: 4000, force: true });
    }
    await page.waitForTimeout(900);
  } else if (passo.campo !== undefined) {
    // preenche por placeholder ou por rótulo, que é como o app nomeia os campos
    const re = new RegExp(passo.campo, "i");
    const cand = [page.getByPlaceholder(re), page.getByLabel(re), page.getByRole("textbox", { name: re })];
    let feito = false;
    for (const c of cand) {
      if (await c.count().catch(() => 0)) {
        await c.first().fill(String(passo.valor ?? ""), { timeout: 8000 });
        feito = true;
        break;
      }
    }
    if (!feito) throw new Error(`não achei o campo "${passo.campo}"`);
    await page.waitForTimeout(800);
  } else if (passo.preencher !== undefined) {
    await page.locator(passo.preencher).first().fill(String(passo.valor ?? ""), { timeout: t });
    await page.waitForTimeout(500);
  } else if (passo.digitar !== undefined) {
    await page.keyboard.type(String(passo.digitar), { delay: 45 });
    await page.waitForTimeout(700);
  } else if (passo.tecla !== undefined) {
    await page.keyboard.press(passo.tecla);
    await page.waitForTimeout(700);
  } else if (passo.esperar !== undefined) {
    await page.waitForTimeout(passo.esperar);
  } else if (passo.esperarTexto !== undefined) {
    await page.getByText(new RegExp(passo.esperarTexto, "i")).first().waitFor({ timeout: t });
  } else if (passo.rolarAte !== undefined) {
    await page.locator(passo.rolarAte).first().scrollIntoViewIfNeeded({ timeout: t });
    await page.waitForTimeout(600);
  } else {
    throw new Error("passo desconhecido: " + JSON.stringify(passo));
  }
}

async function capturar(page, p) {
  const largura = p.viewport?.largura ?? 1440;
  const altura = p.viewport?.altura ?? (p.full ? 1900 : 900);
  await page.setViewportSize({ width: largura, height: altura });

  await page.goto(BASE + p.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("main, [role=main], body", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await limpar(page);
  await fecharModalResidual(page);
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, { timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(1200);

  for (const passo of p.passos || []) {
    try {
      await executarPasso(page, passo);
    } catch (e) {
      if (passo.opcional) continue;
      throw new Error(`passo ${JSON.stringify(passo)} → ${String(e).split("\n")[0]}`);
    }
  }

  // Só CSS aqui (ver comentário em `limpar()`) — NÃO chamar fecharModalResidual,
  // senão o Escape fecha o diálogo que os `passos` acabaram de abrir.
  await limpar(page);
  await page.waitForTimeout(600);

  const arquivo = path.join(OUT, `${p.id}.png`);
  const opts = { path: arquivo, animations: "disabled", scale: "css" };

  const recorte = p.recorte || "pagina";
  if (recorte === "dialog") {
    const d = page.locator('[role="dialog"], [role="alertdialog"]').last();
    await d.waitFor({ timeout: 8000 });
    await d.screenshot(opts);
  } else if (typeof recorte === "object" && recorte.seletor) {
    await page.locator(recorte.seletor).first().screenshot(opts);
  } else if (recorte === "main") {
    const m = page.locator("main").first();
    if (await m.count()) await m.screenshot(opts);
    else await page.screenshot({ ...opts, fullPage: !!p.full });
  } else {
    await page.screenshot({ ...opts, fullPage: !!p.full });
  }
  return fs.statSync(arquivo).size;
}

async function main() {
  const filtro = process.argv.slice(2).map((s) => s.toUpperCase());
  const arquivos = fs.existsSync(SPECS)
    ? fs
        .readdirSync(SPECS)
        .filter((f) => f.endsWith(".json"))
        .filter((f) => !filtro.length || filtro.includes(path.basename(f, ".json").toUpperCase()))
    : [];

  if (!arquivos.length) {
    console.log("Nenhum spec em docs/guia-tecnico/prints/. Nada a fazer.");
    return;
  }

  const alvos = [];
  for (const f of arquivos) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPECS, f), "utf8"));
    for (const p of spec.prints || []) alvos.push({ ...p, secao: spec.secao || path.basename(f, ".json") });
  }

  console.log(`${alvos.length} prints declarados em ${arquivos.length} seções.`);

  let sessao = await renovarSeNecessario(carregarSessao());
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: {
      cookies: [],
      origins: [{ origin: BASE, localStorage: localStorageDeSessao(sessao) }],
    },
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  // Aquecimento — mesmo motivo dos outros dois scripts: o 1º print de
  // contexto novo do Playwright falha calado.
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await limpar(page);
  await fecharModalResidual(page);

  const falhas = [];
  for (const p of alvos) {
    try {
      // specs de modal tendem a rodar sequencial e demorado (passo a passo
      // com esperas); renova a sessão se estiver perto de expirar.
      sessao = await renovarSeNecessario(sessao);
      await aplicarSessaoNaPagina(page, sessao);
      const kb = Math.round((await capturar(page, p)) / 1024);
      console.log(`✅ ${p.secao} ${p.id} (${kb}kb)`);
    } catch (e) {
      falhas.push({ id: p.id, secao: p.secao, err: String(e).split("\n")[0].slice(0, 200) });
      console.log(`❌ ${p.secao} ${p.id} — ${String(e).split("\n")[0].slice(0, 200)}`);
    }
  }

  await browser.close();
  console.log(`\n=== ${alvos.length - falhas.length}/${alvos.length} capturados ===`);
  if (falhas.length) {
    console.log("Falhas:");
    falhas.forEach((f) => console.log(`  ${f.secao} ${f.id}: ${f.err}`));
    process.exitCode = 1;
  }
}

main();
