// =============================================================================
// nfse-auto-runner — drena a fila da NFS-e AUTOMÁTICA e emite, sem humano.
// =============================================================================
// Roda por pg_cron + pg_net, com `Authorization: Bearer <CRON_SECRET>` (Vault).
// Regra de autorização completa:
//   docs/planos/2026-10-16-nfse-automatica-regra-de-autorizacao.md
//
// ⚠️ NÃO ACEITA JWT DE USUÁRIO, e isso não é descuido de plumbing.
// Esta função drena a fila de TODAS as empresas e emite DOCUMENTO FISCAL em
// nome de cada CNPJ. Aceitar sessão de usuário aqui daria a qualquer tenant o
// poder de disparar emissão no CNPJ dos outros e de queimar a cota fiscal
// alheia. Quem emite com humano na ponta é `nfse-emit`, que exige JWT + módulo
// 'nfe' + can_manage_system e prova a posse pelo profile. Mesmo desenho do par
// `dfe-manifestar` / `dfe-manifestar-worker`.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ O QUE ESTA FUNÇÃO NÃO FAZ (cada "não" é uma trava, não uma omissão)       │
// │                                                                           │
// │ • NÃO lê o corpo da requisição. Nenhum `req.json()`, nenhum `req.text()`. │
// │   Não existe `company_id`, `job_id`, `contract_id` nem `limite` vindo de  │
// │   fora: lote e orçamento de tempo são CONSTANTES deste arquivo. É isso    │
// │   que mantém o raio de explosão de um CRON_SECRET vazado em "a fila que   │
// │   nós mesmos construímos sai mais cedo hoje" em vez de "emita nota        │
// │   arbitrária em nome de qualquer tenant".                                 │
// │ • NÃO lê `nfse_auto_jobs` com `supabase.from(...)`. O único consumo é a   │
// │   RPC `nfse_auto_claim`, que re-deriva a posse (job ↔ parcela ↔ contrato  │
// │   ↔ cliente) numa statement SQL e mata job incoerente sem entregar.       │
// │ • NÃO monta `NfseProviderCtx` nem lê `company_fiscal_settings`. O par     │
// │   (companyId, certificado) tem UMA origem, dentro do núcleo de emissão.   │
// │   Passar `fiscal` por fora é o caminho de assinar a nota da empresa A com │
// │   o certificado da empresa B.                                             │
// │ • NÃO reimplementa carência de assinatura, regra de módulo nem contagem   │
// │   de cota em TypeScript. Chama as funções do banco. Duas verdades sobre   │
// │   entitlement é como o incidente ENGETEC nasceu.                          │
// │ • NÃO escreve em `contracts`. Perder módulo ou ficar inadimplente PAUSA a │
// │   emissão (job vivo, com motivo), nunca DESLIGA a configuração do cliente.│
// │ • NÃO apaga job e NÃO monta DPS. Segunda montagem de DPS = segunda        │
// │   verdade sobre o que vai na nota.                                        │
// └───────────────────────────────────────────────────────────────────────────┘
//
// ORDEM DOS GATES, por job, antes de QUALQUER byte para o provedor:
//   1. coerência de tenant .... dentro de `nfse_auto_claim` (job nem chega aqui)
//   2. automação/contrato ..... retorno do claim        → cancelada (decisão)
//   3. parcela ainda válida ... leitura escopada        → cancelada ou falhou
//   4. parcela já tem nota .... leitura escopada        → emitida ou cancelada
//   5. competência encerrada .. mês calendário          → aguardando_decisao  (R7.5)
//   6. entitlement ............ tenant_subscription_allows_access → bloqueada_assinatura
//   7. módulo ................. company_has_module(.., 'nfe')     → bloqueada_modulo
//   8. cota do mês ............ nfse_can_emit                     → bloqueada_cota
//   9. dados fiscais .......... dentro do núcleo (422)            → falhou, definitivo
//  10. emitir ................. emitirNfseAutorizada
//
// POR QUE CONTRATO/PARCELA/COMPETÊNCIA VÊM ANTES DE ASSINATURA/MÓDULO/COTA
// (ordem definida pelo Tech Lead): os três primeiros são desfechos TERMINAIS e
// verdadeiros independentemente da assinatura. O caso real é o cliente que
// regulariza a assinatura em novembro com uma nota de outubro parada: se a
// competência fosse avaliada depois do gate de assinatura, ele passaria o mês
// lendo "bloqueada por assinatura" e só descobriria o problema de verdade
// depois de pagar. A decisão é humana de qualquer jeito, então a informação
// útil aparece primeiro. Não há exposição nova nessa ordem: o claim já JOINou
// parcela, contrato e cliente daquele tenant antes de qualquer gate.
//
// TRÊS FAMÍLIAS DE DESFECHO, TRÊS FUNÇÕES DIFERENTES, de propósito:
//   • `adiar`            porta fechada que VOLTA amanhã (bloqueada_*)
//   • `aguardarDecisao`  parou de vez, só volta por clique humano (R7.5)
//   • `encerrar`         encerrado por DECISÃO, sem erro nenhum (cancelada)
//   • `falhar`           erro de verdade (dado quebrado, provedor, rede)
// Misturar os quatro em `falhar` é o que faz a tela de pendências pintar erro
// onde não houve erro, e tela que mostra problema inexistente é tela que o
// gestor aprende a ignorar.
//
// POR QUE 2 VEM ANTES DE 3, e separado: `company_has_module` NÃO olha
// `subscription_status`. Ela libera por add-on em `company_modules` ou por
// `included_modules` do plano — então empresa DESATIVADA com o add-on 'nfe'
// passa pelo gate de módulo. A regra-lei vale inteira aqui:
// `subscription_status = 'inactive'` bloqueia na hora, sem carência, mesmo com
// `subscription_expires_at` nulo — e `tenant_subscription_allows_access` é a
// fonte canônica que já implementa isso (trial até o vencimento, `active` com 1
// dia de carência, `pending_payment` só com bypass, desconhecido falha fechado).
//
// POR QUE 4 VEM DEPOIS DE 2 E 3: `nfse_can_emit` só sabe de tier e contagem.
// Empresa desativada com cota sobrando passaria, e o cliente leria "limite de
// notas atingido" quando o problema é a assinatura. Mensagem errada manda o
// cliente para o lugar errado.
//
// PORTA FECHADA NÃO É TENTATIVA FALHA: gates 2/3/4 chamam `nfse_auto_adiar`,
// que não toca `attempts` e deixa o job VIVO para o dia seguinte. O faturamento
// do cliente não pode evaporar porque a assinatura Dominex, o módulo ou a cota
// travou — e o inverso também é lei: enquanto a porta está fechada, NADA é
// emitido.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { timingSafeEqual } from "../_shared/timing-safe.ts";
import { emitirNfseAutorizada } from "../_shared/nfse-handlers/emit.ts";
import type { EmitBody } from "../_shared/nfse-handlers/emit.ts";

const TAG = "[nfse-auto-runner]";

/**
 * Lote por rodada. CONSTANTE de propósito (nunca vem da requisição).
 * Emissão é chamada SÍNCRONA ao governo: 6 jobs cabem com folga no orçamento
 * abaixo, e o cron de 10 em 10 minutos dá ~36 notas/hora. Subir isto é decisão
 * de capacidade, não de quem chama a URL.
 */
const MAX_JOBS = 6;

/** Orçamento de parede. Sobrou fila? Volta na próxima rodada, nada se perde. */
const ORCAMENTO_MS = 100_000;

/**
 * Job em 'processando' há mais que isto é ÓRFÃO (processo morreu) e volta pra
 * fila dentro do próprio claim. Sem isso, um crash trancaria a parcela pra
 * sempre e o cliente ficaria sem nota, em silêncio.
 */
const ORFAO_MINUTOS = 10;

/** Status de nota VIVA: a parcela que tem uma destas não leva outra nota. */
const STATUS_NOTA_VIVA = ["pending", "processando", "autorizada", "cancelada"];

/** Linha devolvida por `nfse_auto_claim` (nomes do RETURNS TABLE da RPC). */
interface JobClaimado {
  job_id: string;
  job_company_id: string;
  job_contract_id: string;
  job_transaction_id: string;
  job_competencia: string;
  job_trigger_reason: string;
  job_scheduled_for: string;
  job_attempts: number;
  parcela_amount: number | string | null;
  parcela_due_date: string | null;
  parcela_transaction_date: string | null;
  parcela_is_paid: boolean | null;
  parcela_amount_received: number | string | null;
  parcela_description: string | null;
  contrato_nome: string | null;
  contrato_status: string | null;
  contrato_auto_enabled: boolean | null;
  contrato_auto_trigger: string | null;
  contrato_descricao_nota: string | null;
  contrato_service_type_id: string | null;
  fiscal_servico_nome: string | null;
  fiscal_codigo_servico: string | null;
  fiscal_codigo_trib_mun: string | null;
  fiscal_codigo_nbs: string | null;
  fiscal_item_lc116: string | null;
  fiscal_iss_aliquota: number | string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  cliente_razao_social: string | null;
  cliente_documento: string | null;
  cliente_email: string | null;
  cliente_telefone: string | null;
  cliente_logradouro: string | null;
  cliente_numero: string | null;
  cliente_complemento: string | null;
  cliente_bairro: string | null;
  cliente_cidade: string | null;
  cliente_uf: string | null;
  cliente_cep: string | null;
  cliente_ibge: string | null;
  cliente_inscricao_mun: string | null;
}

/** Identificador curto pra log. NUNCA logar id inteiro de tenant. */
function curto(id: string): string {
  return `${String(id ?? "").slice(0, 8)}...`;
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Competência (1º dia do mês) em "MM/AAAA", pra discriminação em PT-BR. */
function competenciaLegivel(competencia: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(competencia ?? ""));
  return m ? `${m[2]}/${m[1]}` : String(competencia ?? "");
}

/** Fuso em que o mês do cliente vira. O banco roda em UTC. */
const FUSO_BRASIL = "America/Sao_Paulo";

/**
 * Mês calendário corrente NO FUSO DO BRASIL, como "AAAA-MM".
 *
 * `en-CA` é o único locale que o Intl formata exatamente como ISO. Sem o fuso,
 * entre 21:00 e a meia-noite de Brasília o UTC já virou — e no dia 30/31 isso
 * viraria o MÊS, fazendo a competência do mês corrente parecer encerrada.
 */
function mesCorrenteBrasil(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASIL,
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

/**
 * `true` quando a competência do job é de um mês calendário ANTERIOR ao
 * corrente (R7.5).
 *
 * MÊS CALENDÁRIO, NUNCA "30 DIAS": a comparação é de `"AAAA-MM"` com
 * `"AAAA-MM"`, em texto. Para esse formato, ordem lexicográfica É ordem
 * cronológica de mês, então isso é exatamente o `date_trunc('month')` do banco,
 * sem nenhuma aritmética de data no meio. De propósito não existe `setMonth`
 * aqui: o nativo não faz clamp de fim de mês (31 de março menos um mês dá 3 de
 * março) e já foi cicatriz neste projeto.
 *
 * Competência ilegível devolve `false` (segue o fluxo normal, onde o núcleo
 * valida). Parar um job por não saber ler a data seria parar todos.
 */
function competenciaFechada(competencia: string): boolean {
  const m = /^(\d{4})-(\d{2})/.exec(String(competencia ?? ""));
  if (!m) return false;
  return `${m[1]}-${m[2]}` < mesCorrenteBrasil();
}

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };

  // ---------------------------------------------------------------------------
  // GATE 0 — segredo do cron. PRIMEIRA coisa depois do CORS, e ANTES de
  // qualquer `createClient`: 401 não pode custar uma conexão de service_role.
  //
  // FAIL-CLOSED: CRON_SECRET ausente/vazio no env ⇒ 401 para todo mundo,
  // inclusive o cron. Comparação timing-safe. O segredo nunca vai pra log,
  // resposta ou evento.
  //
  // Aceita o segredo em `x-cron-secret` OU `Authorization: Bearer <segredo>` —
  // os dois formatos que os crons deste projeto já usam.
  // ---------------------------------------------------------------------------
  const cronSecret = (Deno.env.get("CRON_SECRET") ?? "").trim();
  const headerSecret = (req.headers.get("x-cron-secret") ?? "").trim();
  const authHeader = (req.headers.get("Authorization") ?? "").trim();
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const autorizado = !!cronSecret &&
    ((!!headerSecret && timingSafeEqual(headerSecret, cronSecret)) ||
      (!!bearer && timingSafeEqual(bearer, cronSecret)));
  if (!autorizado) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const comeco = Date.now();

  try {
    // -------------------------------------------------------------------------
    // ÚNICO consumo da fila. A RPC solta órfãos, mata job incoerente SEM
    // entregar, reivindica com FOR UPDATE SKIP LOCKED (duas instâncias do cron
    // nunca pegam o mesmo job) e devolve cada job já JOINado com parcela,
    // contrato, cliente e a herança fiscal resolvida.
    // -------------------------------------------------------------------------
    const { data, error } = await supabase.rpc("nfse_auto_claim", {
      p_limite: MAX_JOBS,
      p_orfao_minutos: ORFAO_MINUTOS,
    });
    if (error) throw error;

    const jobs = (data ?? []) as JobClaimado[];

    let emitidas = 0;
    let jaEmitidas = 0;
    let bloqueadas = 0;
    let falhas = 0;
    let adiadas = 0;
    let encerradas = 0;
    let aguardando = 0;
    let sumiram = 0;

    // Cache POR company_id, dentro do lote. A chave do Map é o company_id —
    // nunca um índice, nunca "a última empresa vista" (molde do
    // dfe-manifestar-worker). Entitlement e módulo não mudam no meio de uma
    // rodada de 100s; COTA MUDA (cada nota consome), então ela NÃO é cacheada.
    const entitlement = new Map<string, boolean>();
    const modulo = new Map<string, boolean>();

    for (const job of jobs) {
      if (Date.now() - comeco >= ORCAMENTO_MS) {
        // Sobrou fila: os jobs não processados continuam 'processando' e voltam
        // sozinhos pela liberação de órfão. Nenhuma nota se perde, nenhuma
        // tentativa é contada (quem conta tentativa é registrar_tentativa).
        break;
      }

      // ⚠️ UMA ÚNICA variável de tenant por iteração, vinda do retorno do
      // claim. Não existe outra fonte de company_id neste arquivo.
      const companyId = job.job_company_id;
      const log = { job: curto(job.job_id), company_id: curto(companyId) };

      // ---- VALIDAÇÃO 1: a automação ainda está ligada? --------------------
      // Humano desligou = DECISÃO, não erro. O runner nunca escreve em
      // `contracts`; ele só respeita o que está lá.
      if (job.contrato_auto_enabled !== true) {
        await encerrar(
          supabase,
          job,
          "A emissão automática foi desligada neste contrato. Nenhuma nota foi emitida para esta parcela.",
        );
        encerradas += 1;
        continue;
      }

      // Contrato pausado/encerrado: barra SÓ os modos que empurram faturamento
      // pra FRENTE (dia_fixo e vencimento), espelhando o cron de
      // enfileiramento. O modo 'pagamento' passa de propósito: o pagamento é
      // fato consumado sobre serviço já prestado, e dinheiro que entrou de uma
      // parcela de contrato encerrado no mês passado ainda precisa de nota.
      // É a MESMA assimetria deliberada do trigger
      // trg_nfse_auto_enqueue_on_payment (migration 20261016140000 §7).
      if (
        job.job_trigger_reason !== "pagamento" &&
        String(job.contrato_status ?? "") !== "active"
      ) {
        await encerrar(
          supabase,
          job,
          "O contrato não está mais ativo. A emissão automática desta parcela foi encerrada; se a nota ainda é devida, emita manualmente.",
        );
        encerradas += 1;
        continue;
      }

      // ---- VALIDAÇÃO 2: a parcela ainda é emitível? -----------------------
      // O claim prova a POSSE (quatro company_id batendo) mas não devolve
      // `cancelled_at`, e a parcela pode ter sido cancelada DEPOIS do
      // enfileiramento (a janela de recuperação do produtor é de 35 dias).
      // Leitura escopada por id + company_id do próprio job.
      const { data: parcela, error: errParcela } = await supabase
        .from("financial_transactions")
        .select("id, cancelled_at, is_paid, amount, amount_received")
        .eq("id", job.job_transaction_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (errParcela) {
        console.error(`${TAG} parcela`, { ...log, message: errParcela.message });
        await falhar(
          supabase,
          job,
          "Não foi possível conferir a parcela agora. A nota será tentada novamente.",
          false,
        );
        adiadas += 1;
        continue;
      }
      if (!parcela) {
        // Não deveria acontecer (o claim faz INNER JOIN e a FK é CASCADE).
        // Anomalia de verdade, então FALHA, não encerramento por decisão.
        await falhar(
          supabase,
          job,
          "A parcela desta nota não foi encontrada. A emissão automática foi interrompida.",
          true,
        );
        falhas += 1;
        continue;
      }
      if (parcela.cancelled_at) {
        await encerrar(
          supabase,
          job,
          "A parcela foi cancelada. Nenhuma nota foi emitida para ela.",
        );
        encerradas += 1;
        continue;
      }

      const valorParcela = num(parcela.amount);
      if (!(valorParcela > 0)) {
        // Erro de DADO (o cadastro precisa de conserto), não decisão.
        await falhar(
          supabase,
          job,
          "A parcela está sem valor. Corrija o valor da parcela para emitir a nota.",
          true,
        );
        falhas += 1;
        continue;
      }

      // Modo 'pagamento' exige quitação TOTAL. Nota em cima de meio pagamento é
      // erro fiscal, não detalhe de tela. O trigger já garante isso no
      // enfileiramento; aqui é a releitura no momento de emitir (o pagamento
      // pode ter sido estornado no meio).
      if (job.job_trigger_reason === "pagamento") {
        const recebido = num(parcela.amount_received);
        if (parcela.is_paid !== true || (recebido > 0 && recebido < valorParcela)) {
          await encerrar(
            supabase,
            job,
            "A parcela não está mais quitada integralmente. A nota não foi emitida; registre o pagamento total e peça a nota de novo.",
          );
          encerradas += 1;
          continue;
        }
      }

      // ---- Chave de idempotência DERIVADA DA PARCELA ----------------------
      // NUNCA a determinística do caminho manual
      // (empresa + tomador + valor + competência): dois contratos de manutenção
      // iguais, mesmo cliente, mesmo valor e mesma competência (caso comum em
      // PMOC) colidiriam, a segunda parcela receberia 200 "já emitida"
      // apontando para a nota da PRIMEIRA, o job fecharia como SUCESSO e o
      // cliente ficaria sem uma nota, sem ninguém ser avisado. Falha que se
      // disfarça de sucesso é a pior classe de falha nesta feature.
      const idempotencyKey = `nfse_auto_${companyId}_${job.job_transaction_id}`;

      // ---- VALIDAÇÃO 3: esta parcela já tem nota viva? --------------------
      // Cobre o caso do humano que emitiu manualmente depois do job entrar na
      // fila, e também a retomada de um job que emitiu e morreu antes de
      // concluir. A consulta por `financial_transaction_id` é confiável
      // ENQUANTO a parcela existe (o ON DELETE SET NULL só apaga o vínculo
      // quando a parcela é apagada, e aí o job cai por CASCADE).
      const { data: notasVivas, error: errNotas } = await supabase
        .from("nfse_emissions")
        .select("id, status, idempotency_key, nfse_auto_job_id")
        .eq("company_id", companyId)
        .eq("financial_transaction_id", job.job_transaction_id)
        .in("status", STATUS_NOTA_VIVA)
        .limit(5);

      if (errNotas) {
        console.error(`${TAG} notas`, { ...log, message: errNotas.message });
        await falhar(
          supabase,
          job,
          "Não foi possível conferir se a parcela já tem nota. A emissão será tentada novamente.",
          false,
        );
        adiadas += 1;
        continue;
      }

      const nossa = (notasVivas ?? []).find((n) =>
        n.idempotency_key === idempotencyKey || n.nfse_auto_job_id === job.job_id
      );
      if (nossa) {
        // Nota NOSSA já existe: rodada anterior emitiu e morreu antes de
        // concluir o job. Fechar o job é o certo; emitir de novo é que seria
        // duplicidade. Tem que vir ANTES do gate de competência: nota que já
        // saiu não é decisão pendente de ninguém.
        await concluir(supabase, job, String(nossa.id));
        jaEmitidas += 1;
        continue;
      }
      if ((notasVivas ?? []).length > 0) {
        await encerrar(
          supabase,
          job,
          "Esta parcela já tem nota fiscal emitida manualmente. A emissão automática foi dispensada para não gerar nota em duplicidade.",
        );
        encerradas += 1;
        continue;
      }

      // ---- R7.5: a competência já encerrou? -------------------------------
      // POSIÇÃO DEFINIDA PELO TECH LEAD, e eu concordo: depois das validações
      // de contrato e parcela, e ANTES de assinatura/módulo/cota.
      //
      // O caso real é o cliente que regulariza a assinatura em novembro com uma
      // nota de outubro parada na fila. Se a competência fosse checada depois
      // do gate de assinatura, ele passaria o mês inteiro lendo "bloqueada por
      // assinatura" e só descobriria o problema de verdade ao regularizar. A
      // decisão é humana de qualquer jeito, então a informação útil tem que
      // aparecer primeiro.
      //
      // Vem DEPOIS das validações de contrato/parcela porque aquelas são
      // terminais e mais baratas: não faz sentido pedir decisão humana sobre
      // uma nota de contrato desligado, parcela cancelada ou que já tem nota.
      //
      // `nfse_auto_aguardar_decisao` zera `proxima_tentativa_em` (NULL) e NÃO
      // toca `attempts`: o job sai do fluxo automático de vez e só volta pelo
      // clique humano ("emitir mesmo assim", via `nfse_auto_enfileirar`). Se
      // herdasse o "tenta amanhã" do `adiar`, o runner reavaliaria a mesma
      // competência fechada toda madrugada, pra sempre.
      if (competenciaFechada(job.job_competencia)) {
        await aguardarDecisao(
          supabase,
          job,
          `A competência desta nota (${
            competenciaLegivel(job.job_competencia)
          }) já encerrou. Emitir agora mexe em um mês cujo imposto já foi apurado, por isso a emissão automática parou aqui e espera a sua decisão: confira com quem cuida da sua contabilidade e use "emitir mesmo assim" se a nota ainda é devida.`,
        );
        aguardando += 1;
        continue;
      }

      // ---- GATE 2: entitlement da assinatura ------------------------------
      if (!entitlement.has(companyId)) {
        const { data: ok, error: errEnt } = await supabase.rpc(
          "tenant_subscription_allows_access",
          { _company_id: companyId },
        );
        if (errEnt) {
          console.error(`${TAG} entitlement`, { ...log, message: errEnt.message });
          // Falha ao CONSULTAR o gate não é porta fechada nem erro de dado:
          // é indisponibilidade nossa. Adia como transitório e tenta de novo.
          await falhar(
            supabase,
            job,
            "Não foi possível verificar a assinatura agora. A nota será tentada novamente.",
            false,
          );
          adiadas += 1;
          continue;
        }
        entitlement.set(companyId, ok === true);
      }
      if (entitlement.get(companyId) !== true) {
        await adiar(
          supabase,
          job,
          "bloqueada_assinatura",
          "A assinatura da empresa está sem acesso liberado. Regularize a assinatura para a emissão automática voltar a funcionar. A nota desta parcela continua guardada.",
        );
        bloqueadas += 1;
        continue;
      }

      // ---- GATE 3: módulo Notas Fiscais -----------------------------------
      if (!modulo.has(companyId)) {
        const { data: ok, error: errMod } = await supabase.rpc("company_has_module", {
          p_company_id: companyId,
          p_module_code: "nfe",
        });
        if (errMod) {
          console.error(`${TAG} modulo`, { ...log, message: errMod.message });
          await falhar(
            supabase,
            job,
            "Não foi possível verificar o módulo de Notas Fiscais agora. A nota será tentada novamente.",
            false,
          );
          adiadas += 1;
          continue;
        }
        modulo.set(companyId, ok === true);
      }
      if (modulo.get(companyId) !== true) {
        await adiar(
          supabase,
          job,
          "bloqueada_modulo",
          "O módulo Notas Fiscais não está ativo no plano atual. Ative o módulo para retomar a emissão automática. A nota desta parcela continua guardada.",
        );
        bloqueadas += 1;
        continue;
      }

      // ---- GATE 4: cota do mês --------------------------------------------
      // NUNCA cacheada entre jobs: cada nota emitida consome cota, e cachear
      // faria o 11º job do lote passar por um "pode" medido antes do 10º.
      {
        const { data: quota, error: errQuota } = await supabase.rpc("nfse_can_emit", {
          p_company_id: companyId,
        });
        if (errQuota) {
          console.error(`${TAG} cota`, { ...log, message: errQuota.message });
          await falhar(
            supabase,
            job,
            "Não foi possível verificar o limite de notas deste mês. A nota será tentada novamente.",
            false,
          );
          adiadas += 1;
          continue;
        }
        const q = (quota ?? null) as { allowed?: boolean; limit?: number } | null;
        if (q && q.allowed === false) {
          await adiar(
            supabase,
            job,
            "bloqueada_cota",
            `Limite de ${q.limit ?? "notas"} notas fiscais deste mês atingido no nível atual. A nota desta parcela continua guardada e sai quando a cota renovar ou o nível subir.`,
          );
          bloqueadas += 1;
          continue;
        }
      }

      // ---- Corpo da emissão -----------------------------------------------
      // Tomador SEMPRE por `customerId` (cliente cadastrado, lido pelo núcleo
      // com `.eq("company_id", companyId)`): emissão automática nunca inventa
      // tomador avulso. Códigos fiscais vêm da HERANÇA JÁ RESOLVIDA pelo claim
      // (override do contrato vence o tipo de serviço) — o runner não decide
      // tributação. Campo nulo é OMITIDO, pro núcleo cair no default da
      // empresa, igual ao caminho manual.
      if (!job.cliente_id) {
        await falhar(
          supabase,
          job,
          "O contrato está sem cliente vinculado. Vincule o cliente para emitir a nota.",
          true,
        );
        falhas += 1;
        continue;
      }

      const discriminacao = (job.contrato_descricao_nota ?? "").trim() ||
        `${(job.fiscal_servico_nome ?? "").trim() || "Prestação de serviços"} - competência ${
          competenciaLegivel(job.job_competencia)
        }`;

      const servico: NonNullable<EmitBody["servico"]> = { descricao: discriminacao };
      if (job.fiscal_codigo_servico) servico.codigoServico = job.fiscal_codigo_servico;
      if (job.fiscal_codigo_nbs) servico.codigoNbs = job.fiscal_codigo_nbs;
      if (job.fiscal_codigo_trib_mun) {
        servico.codigoTributacaoMunicipal = job.fiscal_codigo_trib_mun;
      }

      const valores: NonNullable<EmitBody["valores"]> = { valorServico: valorParcela };
      if (job.fiscal_iss_aliquota != null && job.fiscal_iss_aliquota !== "") {
        valores.aliquotaIss = num(job.fiscal_iss_aliquota);
      }

      // ---- `attempts` é incrementado AQUI, imediatamente antes de a emissão
      // começar. Reivindicar job não é tentar emitir (quem conta reivindicação
      // é `claim_count`), e porta fechada não é tentativa — por isso todo job
      // `bloqueada_*` chega no dia seguinte com `attempts` intacto.
      // O TETO de tentativas mora dentro de `nfse_auto_falhar`, não aqui.
      {
        const { data: tentativa, error: errTentativa } = await supabase.rpc(
          "nfse_auto_registrar_tentativa",
          { p_job_id: job.job_id },
        );
        if (errTentativa) {
          // Não conseguimos registrar a tentativa ⇒ NÃO emitimos. Emitir sem
          // contador é como se cria retentativa infinita em cima do governo.
          console.error(`${TAG} registrar_tentativa`, { ...log, message: errTentativa.message });
          await falhar(
            supabase,
            job,
            "Não foi possível registrar a tentativa de emissão. A nota será tentada novamente.",
            false,
          );
          adiadas += 1;
          continue;
        }
        if (tentativa == null) {
          // Contrato da RPC: `null` = o job não existe mais. Só acontece por
          // CASCADE — a parcela foi apagada entre o claim e aqui. Não há o que
          // faturar, e não há linha pra registrar nada: só sai do caminho.
          console.error(`${TAG} job sumiu antes de emitir`, log);
          sumiram += 1;
          continue;
        }
      }

      // ---- GATE 7 + 8: o NÚCLEO valida dados fiscais e emite --------------
      // Mesmo montador de DPS do caminho manual. `autorUserId: null` porque
      // ninguém apertou botão nenhum (a autoria da AUTORIZAÇÃO está em
      // contracts.nfse_auto_enabled_by/at, alcançável por nfseAutoJobId).
      let resposta: Response;
      try {
        resposta = await emitirNfseAutorizada({
          supabase,
          companyId,
          autorUserId: null,
          origem: "automatica",
          nfseAutoJobId: job.job_id,
          financialTransactionId: job.job_transaction_id,
          contextoAuditoria: `emitir_nfse_auto:${job.job_id}`,
          body: {
            customerId: job.cliente_id,
            idempotencyKey,
            // Competência = mês da parcela, já no 1º dia do mês (o CHECK da
            // fila garante). Explícita de propósito: o fallback "hoje no fuso
            // da empresa" é do caminho manual e daria a competência errada numa
            // nota que sai dias depois do vencimento.
            dataCompetencia: job.job_competencia,
            servico,
            valores,
          },
        });
      } catch (err) {
        // Exceção que escapou do núcleo: tratamos como transitório porque não
        // sabemos se a nota chegou ao governo. O núcleo já registrou a
        // tentativa em nfse_emissions/nfse_events quando era o caso.
        console.error(`${TAG} nucleo lançou`, {
          ...log,
          message: (err as Error)?.message ?? String(err),
        });
        await falhar(
          supabase,
          job,
          "Falha inesperada ao emitir a nota. A emissão será tentada novamente.",
          false,
        );
        adiadas += 1;
        continue;
      }

      const corpo = await resposta.json().catch(() => null) as {
        emission?: { id?: string };
        already_emitted?: boolean;
        error?: string;
        message?: string;
      } | null;
      const emissionId = corpo?.emission?.id ? String(corpo.emission.id) : "";
      const mensagem = (corpo?.message ?? "").trim();

      // 202 = enviada/autorizada. 200 + already_emitted = a MESMA nota desta
      // parcela já existia (a chave derivada da parcela garante que "já
      // emitida" aqui é sempre a nota DESTA parcela, nunca a de um contrato
      // gêmeo).
      if (
        (resposta.status === 202 || (resposta.status === 200 && corpo?.already_emitted === true)) &&
        emissionId
      ) {
        await concluir(supabase, job, emissionId);
        if (resposta.status === 202) emitidas += 1;
        else jaEmitidas += 1;
        continue;
      }

      // 402 = cota estourou entre o gate 4 e a emissão (corrida real num lote
      // da mesma empresa). Porta fechada, job vivo.
      if (resposta.status === 402 || corpo?.error === "nfse_quota_exceeded") {
        await adiar(
          supabase,
          job,
          "bloqueada_cota",
          mensagem ||
            "Limite de notas fiscais deste mês atingido. A nota desta parcela continua guardada.",
        );
        bloqueadas += 1;
        continue;
      }

      // 400/403/404/422 = erro de DADO ou de configuração: retentar não
      // conserta cadastro. Falha DEFINITIVA, com o motivo em PT-BR na tela de
      // pendências (a mensagem do núcleo já é a mesma que o usuário veria).
      if ([400, 403, 404, 422].includes(resposta.status)) {
        console.error(`${TAG} erro de dado`, {
          ...log,
          http: resposta.status,
          codigo: corpo?.error ?? "",
        });
        await falhar(
          supabase,
          job,
          mensagem || "Não foi possível emitir a nota com os dados atuais. Revise o cadastro.",
          true,
        );
        falhas += 1;
        continue;
      }

      // Tudo o mais (500/502/503, provedor fora, resposta sem corpo) é
      // transitório: volta pra fila. O teto de 3 tentativas está na RPC.
      console.error(`${TAG} transitorio`, {
        ...log,
        http: resposta.status,
        codigo: corpo?.error ?? "",
      });
      await falhar(
        supabase,
        job,
        mensagem || "A emissão não pôde ser concluída agora. Será tentada novamente.",
        false,
      );
      adiadas += 1;
    }

    return new Response(
      JSON.stringify({
        message: "NFS-e automatic queue drained",
        jobs_claimed: jobs.length,
        emitted: emitidas,
        already_emitted: jaEmitidas,
        blocked: bloqueadas,
        failed: falhas,
        closed: encerradas,
        awaiting_decision: aguardando,
        vanished: sumiram,
        retrying: adiadas,
        elapsed_ms: Date.now() - comeco,
      }),
      { headers },
    );
  } catch (err) {
    console.error(`${TAG} erro`, { message: (err as Error)?.message ?? String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers },
    );
  }
});

// -----------------------------------------------------------------------------
// Desfechos — SEMPRE por RPC. O runner não dá UPDATE em `nfse_auto_jobs`.
// -----------------------------------------------------------------------------

/** Nota autorizada/registrada: fecha o job apontando pra emissão. */
async function concluir(
  supabase: SupabaseClient,
  job: JobClaimado,
  emissionId: string,
): Promise<void> {
  const { error } = await supabase.rpc("nfse_auto_concluir", {
    p_job_id: job.job_id,
    p_nfse_emission_id: emissionId,
  });
  if (error) {
    // A nota existe; só a baixa do job falhou. O job fica 'processando' e a
    // liberação de órfão o devolve pra fila, onde o gate 6b reconhece a nota
    // como NOSSA pela chave derivada da parcela e conclui. Zero duplicidade.
    console.error(`${TAG} concluir`, { job: curto(job.job_id), message: error.message });
  }
}

/**
 * Falha do job. `definitivo = true` = erro de dado/decisão humana (retentar não
 * conserta cadastro). `definitivo = false` = transitório; o TETO de tentativas
 * mora dentro da RPC, nunca aqui.
 */
async function falhar(
  supabase: SupabaseClient,
  job: JobClaimado,
  mensagem: string,
  definitivo: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("nfse_auto_falhar", {
    p_job_id: job.job_id,
    // PT-BR leigo e curto: este texto vai DIRETO pra tela de pendências.
    // Nunca carrega segredo, token nem payload cru do provedor.
    p_mensagem: mensagem.slice(0, 500),
    p_definitivo: definitivo,
  });
  if (error) {
    console.error(`${TAG} falhar`, { job: curto(job.job_id), message: error.message });
  }
}

/**
 * DESFECHO POR DECISÃO, não por falha (`cancelada`): automação desligada no
 * contrato, contrato encerrado, parcela cancelada, parcela deixou de estar
 * quitada, parcela já tem nota manual.
 *
 * Em todos esses o sistema FUNCIONOU: conferiu, concluiu que não há nota a
 * emitir e parou. Antes estes cinco saíam por `nfse_auto_falhar(true)` e
 * apareciam como erro na tela de "Emissões automáticas" — tela que pinta
 * problema onde não houve problema é tela que o gestor aprende a ignorar, e aí
 * o erro de verdade passa batido.
 *
 * Terminal: 'cancelada' não está entre os status reivindicáveis do claim. A RPC
 * não grava `proxima_tentativa_em` nem toca `attempts`, e RECUSA job que já tem
 * nota (encerrar não desfaz documento fiscal). Reverter, enquanto não houver
 * nota, é o clique humano em `nfse_auto_enfileirar`.
 */
async function encerrar(
  supabase: SupabaseClient,
  job: JobClaimado,
  mensagem: string,
): Promise<void> {
  const { error } = await supabase.rpc("nfse_auto_encerrar", {
    p_job_id: job.job_id,
    p_status: "cancelada",
    p_mensagem: mensagem.slice(0, 500),
  });
  if (error) {
    console.error(`${TAG} encerrar`, { job: curto(job.job_id), message: error.message });
  }
}

/**
 * R7.5 — COMPETÊNCIA ENCERRADA: o job para de vez e espera decisão humana.
 *
 * A RPC grava `proxima_tentativa_em = NULL` ("não há próxima tentativa") e não
 * toca `attempts`. É isso que a separa de `adiar`: os `bloqueada_*` voltam
 * sozinhos amanhã, este NUNCA volta sozinho. Se herdasse o "tenta amanhã", o
 * runner reavaliaria a mesma competência fechada toda madrugada e acabaria
 * emitindo a nota de período já apurado no primeiro dia em que um gate
 * oscilasse.
 *
 * Duas travas independentes garantem que o claim não devolva mais este job: o
 * status 'aguardando_decisao' não está na lista de reivindicáveis, e
 * `NULL <= now()` é NULL, nunca true.
 */
async function aguardarDecisao(
  supabase: SupabaseClient,
  job: JobClaimado,
  mensagem: string,
): Promise<void> {
  const { error } = await supabase.rpc("nfse_auto_aguardar_decisao", {
    p_job_id: job.job_id,
    // Vai DIRETO pra tela de pendências que o Financeiro está montando:
    // PT-BR leigo, sem jargão e sem erro técnico.
    p_mensagem: mensagem.slice(0, 500),
  });
  if (error) {
    console.error(`${TAG} aguardar_decisao`, {
      job: curto(job.job_id),
      message: error.message,
    });
  }
}

/**
 * PORTA FECHADA: job fica VIVO, com status próprio e motivo em português, e é
 * reavaliado no dia seguinte. NÃO toca `attempts` — porta fechada não é
 * tentativa falha, e o teto de tentativas não se aplica a ela.
 */
async function adiar(
  supabase: SupabaseClient,
  job: JobClaimado,
  status: "bloqueada_assinatura" | "bloqueada_modulo" | "bloqueada_cota",
  mensagem: string,
): Promise<void> {
  const { error } = await supabase.rpc("nfse_auto_adiar", {
    p_job_id: job.job_id,
    p_status: status,
    p_mensagem: mensagem.slice(0, 500),
  });
  if (error) {
    console.error(`${TAG} adiar`, { job: curto(job.job_id), status, message: error.message });
  }
}
