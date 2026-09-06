#!/usr/bin/env node
/**
 * Diz o que o Guia Técnico da Dominex precisa de atualização depois de um
 * release.
 *
 * Por que existe: reler o guia inteiro a cada release pra ver "o que mudou" é
 * caro e ninguém faz. Aqui a conta é estática: olha os arquivos que o release
 * tocou, descobre a que ROTAS eles pertencem, e cruza com as rotas que cada
 * seção do guia documenta (T0..T17, docs/domiflix/trilha-de-tutoriais.md) e
 * com as rotas dos prints já declarados. Zero IA.
 *
 * Uso:
 *   node scripts/guia-impacto.mjs                 # compara com origin/main
 *   node scripts/guia-impacto.mjs v1.22.5..HEAD    # intervalo explícito
 *   node scripts/guia-impacto.mjs --json           # saída pra script
 *
 * Saída: seções do guia afetadas, prints que precisam ser refeitos, e os
 * comandos exatos pra atualizar só o que mudou.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve("docs/guia-tecnico");
const CHUNKS = path.join(ROOT, "Guia-Tecnico-chunks.jsonl");
const SPECS = path.join(ROOT, "prints");
const SECOES = path.join(ROOT, "secoes");

const args = process.argv.slice(2);
const comoJson = args.includes("--json");
const intervalo = args.find((a) => !a.startsWith("--")) || "origin/main...HEAD";

function git(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// 1. arquivos tocados no intervalo
// ---------------------------------------------------------------------------
const arquivos = git(`git diff --name-only ${intervalo}`)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (!arquivos.length) {
  console.log(`Nenhum arquivo mudou em ${intervalo}. Guia não precisa de nada.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 2. arquivo -> rotas do sistema
//    src/lib/i18n/appRouteSlugs.ts é a fonte: cada tela registra `base` (o
//    path template pt-br, canônico — ver comentário no topo daquele arquivo).
//    src/App.tsx cobre o resto (rotas públicas com token, redirects, admin).
// ---------------------------------------------------------------------------
const rotasConhecidas = new Set();
if (fs.existsSync("src/lib/i18n/appRouteSlugs.ts")) {
  const txt = fs.readFileSync("src/lib/i18n/appRouteSlugs.ts", "utf8");
  for (const m of txt.matchAll(/base:\s*'(\/[a-z0-9\-/:*]*)'/gi)) rotasConhecidas.add(m[1]);
}
if (fs.existsSync("src/App.tsx")) {
  const txt = fs.readFileSync("src/App.tsx", "utf8");
  for (const m of txt.matchAll(/path=["'](\/[a-z0-9\-/:*]*)["']/gi)) rotasConhecidas.add(m[1]);
}

// pistas: caminho/arquivo do repositório -> rota(s) pt-br que ele afeta.
// Cobre pages/, components/<domínio>/ e hooks/use<Domínio> — um release raro
// mexe só na page; a maioria mexe em componente ou hook do domínio.
const PISTAS = [
  // T0/T17 — dashboard e changelog
  [/pages\/Dashboard/i, ["/dashboard"]],
  [/pages\/Changelog/i, ["/changelog"]],
  [/components\/layout\/(SidebarMenuContent|AppLayout|TopNavbar|MobileBottomNav|MoreMenuDrawer)/i, ["/dashboard"]],

  // T1 — configurações e identidade da empresa
  [/pages\/Settings/i, ["/configuracoes"]],
  [/pages\/Profile/i, ["/perfil"]],
  [/hooks\/useCompanySettings|hooks\/useWhiteLabel/i, ["/configuracoes"]],
  [/components\/settings\//i, ["/configuracoes"]],

  // T2 — usuários, cargos e permissões (aba dentro de Configurações)
  [/pages\/Users(\.tsx)?$/i, ["/configuracoes"]],
  [/hooks\/usePermissions|hooks\/useUsers/i, ["/configuracoes"]],
  [/components\/users\//i, ["/configuracoes"]],

  // T3 — clientes e equipamentos
  [/pages\/Customers|pages\/CustomerDetail/i, ["/clientes"]],
  [/pages\/Equipment(Page|Detail)?/i, ["/equipamentos"]],
  [/hooks\/useCustomers|hooks\/useEquipment/i, ["/clientes", "/equipamentos"]],
  [/components\/customers\//i, ["/clientes"]],
  [/components\/equipment\//i, ["/equipamentos"]],
  [/pages\/CustomerPortal/i, ["/portal/"]],

  // T4 — serviços, tarefas e checklists
  [/pages\/Services(Page)?(\.tsx)?$/i, ["/servicos"]],
  [/pages\/ChecklistDetail/i, ["/servicos", "/checklists"]],
  [/hooks\/useServiceTypes|hooks\/useTaskTypes|hooks\/useFormTemplates/i, ["/servicos"]],
  [/components\/services\//i, ["/servicos"]],

  // T5 — ordens de serviço (gestor)
  [/pages\/ServiceOrders/i, ["/ordens-servico"]],
  [/hooks\/useServiceOrders|hooks\/useOsStatuses|hooks\/useOrderAssignees/i, ["/ordens-servico"]],
  [/components\/service-orders\//i, ["/ordens-servico"]],

  // T6 — agenda, equipes e mapa ao vivo
  [/pages\/Schedule/i, ["/agenda"]],
  [/components\/schedule\//i, ["/agenda"]],
  [/pages\/Teams/i, ["/funcionarios"]], // /equipes é rota morta — aba vive em Funcionários
  [/components\/teams\//i, ["/funcionarios"]],
  [/pages\/LiveMap|pages\/TechnicianTracking/i, ["/mapa-ao-vivo"]],
  [/components\/tracking\//i, ["/mapa-ao-vivo"]],
  [/hooks\/useTechnicianLocations/i, ["/mapa-ao-vivo"]],

  // T7 — o técnico em campo + Área do Técnico™
  [/pages\/TechnicianOS/i, ["/os-tecnico/"]],
  [/components\/technician\//i, ["/os-tecnico/", "/area-tecnico"]],
  [/pages\/TechnicianArea|config\/technicianArea/i, ["/area-tecnico"]],
  [/components\/SignaturePad|components\/pwa\//i, ["/os-tecnico/"]],

  // T8 — estoque, compras e inventário
  [/pages\/Inventory/i, ["/estoque"]],
  [/hooks\/useInventory/i, ["/estoque"]],
  [/components\/inventory\//i, ["/estoque"]],

  // T9 — orçamentos, precificação e proposta
  [/pages\/Quotes|pages\/ProposalPublic|pages\/QuotePublic/i, ["/orcamentos", "/proposta/", "/orcamento/"]],
  [/hooks\/useQuotes|hooks\/useServiceCosts|hooks\/useServiceCostResources|hooks\/useServiceMaterials|hooks\/useCostResources/i, ["/orcamentos"]],
  [/components\/quotes\//i, ["/orcamentos"]],

  // T10 — CRM
  [/pages\/CRM(\.tsx)?$/i, ["/crm"]],
  [/hooks\/useCrm|hooks\/useLeads|hooks\/usePipeline/i, ["/crm"]],
  [/components\/crm\//i, ["/crm"]],

  // T11 — contratos e PMOC
  [/pages\/Contracts|pages\/ContractDetail|pages\/ContractSettings|pages\/PMOC(\.tsx)?$/i, ["/contratos", "/configuracoes-contrato"]],
  [/hooks\/useContracts|hooks\/usePmoc|hooks\/useResponsibleTechnicians/i, ["/contratos"]],
  [/components\/contracts\/|components\/pmoc\//i, ["/contratos"]],
  [/pages\/PmocPublicPortal/i, ["/contrato/unidade/", "/pmoc/unidade/"]],

  // T12 — portal do cliente, NPS e reputação
  [/hooks\/useServiceRatings/i, ["/portal/", "/os-tecnico/"]],
  [/OSRatingSurvey/i, ["/portal/", "/os-tecnico/"]],

  // T13 — financeiro
  [/pages\/Finance(\.tsx)?$/i, ["/financeiro/relatorio", "/financeiro/movimentacoes", "/financeiro/contas"]],
  [/hooks\/useFinance|hooks\/useBankAccounts|hooks\/useCreditCards|hooks\/useTransactions/i, ["/financeiro/movimentacoes"]],
  [/components\/finance\//i, ["/financeiro/relatorio"]],

  // T14 — notas fiscais (NFS-e)
  [/pages\/NotasFiscais|pages\/FiscalSettings/i, ["/notas-fiscais"]],
  [/hooks\/useFiscalSettings|hooks\/useNfse/i, ["/notas-fiscais"]],
  [/components\/fiscal\//i, ["/notas-fiscais"]],
  [/supabase\/functions\/nfse/i, ["/notas-fiscais"]],

  // T15 — funcionários, ponto e folha
  [/pages\/Employees/i, ["/funcionarios"]],
  [/hooks\/useEmployees|hooks\/usePayroll|hooks\/useTimeClock/i, ["/funcionarios"]],
  [/components\/employees\//i, ["/funcionarios"]],
  [/pages\/PontoPublico/i, ["/ponto/"]],

  // T16 — assinatura, plano e módulos
  [/pages\/Billing|pages\/Checkout|pages\/PublicCheckout/i, ["/assinatura", "/checkout", "/pagar/"]],
  [/hooks\/useCompanyModules|hooks\/useSubscription/i, ["/assinatura"]],

  // Autenticação/layout (afeta qualquer tela, mas sinaliza como layout — ver tocouLayoutOuMenu)
  [/src\/contexts\/AuthContext/i, ["/dashboard"]],
];

function rotasDoArquivo(f) {
  const achadas = new Set();
  for (const [re, rotas] of PISTAS) if (re.test(f)) rotas.forEach((r) => achadas.add(r));
  return achadas;
}

const rotasTocadas = new Set();
const tocouLayoutOuMenu = arquivos.some((f) =>
  /src\/(components\/layout|lib\/i18n\/appRouteSlugs|App\.tsx|index\.css)/.test(f)
);
for (const f of arquivos) rotasDoArquivo(f).forEach((r) => rotasTocadas.add(r));

// ---------------------------------------------------------------------------
// 3. rota -> seção do guia (as seções declaram as rotas que documentam)
// ---------------------------------------------------------------------------
const rotasPorSecao = {};
if (fs.existsSync(CHUNKS)) {
  for (const linha of fs.readFileSync(CHUNKS, "utf8").split("\n")) {
    if (!linha.trim()) continue;
    const c = JSON.parse(linha);
    rotasPorSecao[c.secao] ??= new Set();
    (c.rotas || []).forEach((r) => rotasPorSecao[c.secao].add(r));
  }
} else {
  // sem chunks ainda: cai pro HTML das seções
  for (const f of fs.existsSync(SECOES) ? fs.readdirSync(SECOES) : []) {
    if (!f.endsWith(".html")) continue;
    const code = path.basename(f, ".html");
    const txt = fs.readFileSync(path.join(SECOES, f), "utf8");
    rotasPorSecao[code] = new Set([...txt.matchAll(/<code>(\/[a-z0-9\-/:]+)<\/code>/g)].map((m) => m[1]));
  }
}

const secoesAfetadas = new Set();
for (const [secao, rotas] of Object.entries(rotasPorSecao)) {
  for (const r of rotas) {
    for (const t of rotasTocadas) {
      if (r === t || r.startsWith(t) || t.startsWith(r)) secoesAfetadas.add(secao);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. prints a refazer: spec cuja `url` cai numa rota tocada
// ---------------------------------------------------------------------------
const printsRefazer = [];
const secoesComPrint = new Set();
if (fs.existsSync(SPECS)) {
  for (const f of fs.readdirSync(SPECS).filter((x) => x.endsWith(".json"))) {
    const spec = JSON.parse(fs.readFileSync(path.join(SPECS, f), "utf8"));
    const secao = spec.secao || path.basename(f, ".json");
    for (const p of spec.prints || []) {
      const url = p.url || "";
      const bate = [...rotasTocadas].some((t) => url === t || url.startsWith(t) || t.startsWith(url));
      if (bate || (tocouLayoutOuMenu && p.recorte !== "dialog")) {
        printsRefazer.push({ secao, id: p.id, url });
        secoesComPrint.add(secao);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. relatório
// ---------------------------------------------------------------------------
const ordenar = (a, b) => Number(a.slice(1)) - Number(b.slice(1));
const secoes = [...secoesAfetadas].sort(ordenar);
const secoesPrint = [...secoesComPrint].sort(ordenar);

if (comoJson) {
  console.log(JSON.stringify({ intervalo, arquivos: arquivos.length, rotas: [...rotasTocadas], secoes, prints: printsRefazer, tocouLayoutOuMenu }, null, 1));
  process.exit(0);
}

console.log(`Intervalo: ${intervalo}`);
console.log(`Arquivos alterados: ${arquivos.length}`);
console.log(`Rotas atingidas: ${[...rotasTocadas].sort().join(", ") || "nenhuma reconhecida"}`);
if (tocouLayoutOuMenu) console.log("⚠️  Mexeu em layout/menu/rotas: os prints de tela cheia envelheceram.");

if (!secoes.length && !printsRefazer.length) {
  console.log("\n✅ Nada do guia foi afetado por este release.");
  process.exit(0);
}

console.log(`\n📄 Seções do guia a revisar (${secoes.length}): ${secoes.join(", ")}`);
secoes.forEach((s) => console.log(`   docs/guia-tecnico/secoes/${s}.html`));

if (printsRefazer.length) {
  console.log(`\n📸 Prints a refazer (${printsRefazer.length}):`);
  for (const p of printsRefazer) console.log(`   ${p.secao.padEnd(4)} ${p.id.padEnd(34)} ${p.url}`);
}

console.log(`\n▶️  Para atualizar só o que mudou:`);
if (printsRefazer.length) {
  console.log(`   node scripts/capturar-prints-guia.mjs`);
  console.log(`   node scripts/capturar-modais.mjs ${secoesPrint.join(" ")}`);
}
console.log(`   python3 scripts/censurar-prints.py`);
console.log(`   python3 scripts/otimizar-prints.py`);
console.log(`\n(a captura precisa de /tmp/session.json válido — ver scripts/README.md)`);
