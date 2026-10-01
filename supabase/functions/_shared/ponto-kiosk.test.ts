// Testes puros da máquina de estado do ponto (link pessoal e quiosque).
//
// Roda com Deno, como o vizinho `face-biometrics.test.ts`:
//   deno test --allow-net supabase/functions/_shared/ponto-kiosk.test.ts
//
// O que estes testes travam é a regressão que gerou o chamado da Imperium: a
// máquina de estado decidia pelo CONJUNTO dos tipos do dia, o que tornava
// impossível a SEGUNDA JORNADA e a JORNADA SEM INTERVALO. Aqui a decisão é
// sempre pelo ÚLTIMO evento da sequência ordenada.
//
// Espelho obrigatório de `public.allowed_punch_actions` (migration
// 20260930150000_ponto_multiplas_jornadas.sql). Mudou a tabela lá, muda aqui.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allowedActionsFrom,
  dayStatusFromLastType,
  deriveDayStatus,
  nextActionFrom,
} from "./ponto-kiosk.ts";

// ── allowedActionsFrom: os 5 estados da tabela ───────────────────────────────

Deno.test("dia sem nenhuma batida so permite entrada", () => {
  assertEquals(allowedActionsFrom([]), ["clock_in"]);
});

Deno.test("depois da entrada permite intervalo OU saida direta (jornada sem intervalo)", () => {
  assertEquals(allowedActionsFrom(["clock_in"]), ["break_start", "clock_out"]);
});

Deno.test("dentro do intervalo so permite voltar do intervalo", () => {
  assertEquals(allowedActionsFrom(["clock_in", "break_start"]), ["break_end"]);
});

Deno.test("depois de voltar do intervalo permite novo intervalo OU saida", () => {
  assertEquals(
    allowedActionsFrom(["clock_in", "break_start", "break_end"]),
    ["break_start", "clock_out"],
  );
});

Deno.test("depois da saida permite uma NOVA entrada (segunda jornada)", () => {
  assertEquals(
    allowedActionsFrom(["clock_in", "break_start", "break_end", "clock_out"]),
    ["clock_in"],
  );
});

// ── Cenário Imperium: duas jornadas completas seguidas no mesmo dia ──────────

Deno.test("duas jornadas completas seguidas: 08-12/13-17 e depois 23:00 sem intervalo", () => {
  // Jornada 1: 08:00 entrada, 12:00 intervalo, 13:00 volta, 17:00 saída.
  const jornada1 = ["clock_in", "break_start", "break_end", "clock_out"];
  assertEquals(allowedActionsFrom(jornada1), ["clock_in"]);

  // Jornada 2 (plantão da madrugada): entra às 23:00 e precisa poder SAIR sem
  // nenhum intervalo — é exatamente o que a regra por conjunto barrava.
  const jornada2Aberta = [...jornada1, "clock_in"];
  assertEquals(allowedActionsFrom(jornada2Aberta), ["break_start", "clock_out"]);

  // Saída de 01:10 do dia seguinte, herdada por este mesmo dia de ponto.
  const jornada2Fechada = [...jornada2Aberta, "clock_out"];
  assertEquals(allowedActionsFrom(jornada2Fechada), ["clock_in"]);
});

Deno.test("terceira jornada tambem e possivel (o teto e o MAX_PUNCHES da edge, nao a maquina)", () => {
  const duas = [
    "clock_in", "clock_out",
    "clock_in", "clock_out",
  ];
  assertEquals(allowedActionsFrom(duas), ["clock_in"]);
  assertEquals(allowedActionsFrom([...duas, "clock_in"]), ["break_start", "clock_out"]);
});

// ── Tipos desconhecidos ──────────────────────────────────────────────────────

Deno.test("tipo desconhecido no MEIO da sequencia nao vira o ultimo evento", () => {
  // Se o valor torto contasse como "último", o `default` liberaria `clock_in` e
  // a pessoa bateria entrada duas vezes com a jornada aberta.
  assertEquals(
    allowedActionsFrom(["clock_in", "lunch", "break_start", "???"]),
    ["break_end"],
  );
  assertEquals(
    allowedActionsFrom(["clock_in", "almoco"]),
    ["break_start", "clock_out"],
  );
});

Deno.test("sequencia SO com tipos desconhecidos equivale a dia vazio", () => {
  assertEquals(allowedActionsFrom(["nada", "coisa"]), ["clock_in"]);
});

// ── nextActionFrom: compatibilidade com bundle velho em cache de PWA ─────────

Deno.test("nextActionFrom e sempre o primeiro item de allowedActionsFrom", () => {
  const sequencias = [
    [],
    ["clock_in"],
    ["clock_in", "break_start"],
    ["clock_in", "break_start", "break_end"],
    ["clock_in", "break_start", "break_end", "clock_out"],
    ["clock_in", "clock_out", "clock_in"],
    ["clock_in", "xpto"],
  ];
  for (const seq of sequencias) {
    assertEquals(nextActionFrom(seq), allowedActionsFrom(seq)[0]);
  }
});

Deno.test("depois da saida o next_action volta a ser clock_in (bundle velho segue batendo)", () => {
  // Antes devolvia null e o bundle velho escondia o botão. Agora a tela antiga
  // continua funcionando: mostra "Registrar Entrada" da jornada nova.
  assertEquals(nextActionFrom(["clock_in", "clock_out"]), "clock_in");
});

Deno.test("sugerido preserva o fluxo com intervalo: depois da entrada sugere break_start", () => {
  assertEquals(nextActionFrom(["clock_in"]), "break_start");
  assertEquals(nextActionFrom(["clock_in", "break_start", "break_end"]), "break_start");
});

// ── deriveDayStatus (crachá do quiosque) ─────────────────────────────────────

Deno.test("status do cracha segue o ultimo evento, nao a existencia de clock_out", () => {
  assertEquals(deriveDayStatus([]), "not_started");
  assertEquals(deriveDayStatus(["clock_in"]), "working");
  assertEquals(deriveDayStatus(["clock_in", "break_start"]), "on_break");
  assertEquals(deriveDayStatus(["clock_in", "break_start", "break_end"]), "working");
  assertEquals(deriveDayStatus(["clock_in", "break_start", "break_end", "clock_out"]), "finished");
  // 2ª jornada aberta: o tablet precisa mostrar "Trabalhando", não "Concluída".
  assertEquals(
    deriveDayStatus(["clock_in", "clock_out", "clock_in"]),
    "working",
  );
});

Deno.test("status do cracha ignora tipo desconhecido", () => {
  assertEquals(deriveDayStatus(["clock_in", "zzz"]), "working");
  assertEquals(deriveDayStatus(["zzz"]), "not_started");
});

// ── dayStatusFromLastType (lista do quiosque, via kiosk_punch_states) ────────
//
// A lista do tablet parou de ler a sequência de `time_records` do dia e passa
// a receber do banco UM tipo por funcionário (`last_type`, NULL = sem batida).
// Estes testes travam a equivalência entre os dois caminhos.

Deno.test("dayStatusFromLastType cobre os 5 estados e o dia vazio", () => {
  assertEquals(dayStatusFromLastType(null), "not_started");
  assertEquals(dayStatusFromLastType(undefined), "not_started");
  assertEquals(dayStatusFromLastType(""), "not_started");
  assertEquals(dayStatusFromLastType("clock_in"), "working");
  assertEquals(dayStatusFromLastType("break_start"), "on_break");
  assertEquals(dayStatusFromLastType("break_end"), "working");
  assertEquals(dayStatusFromLastType("clock_out"), "finished");
  assertEquals(dayStatusFromLastType("zzz"), "not_started");
});

Deno.test("REGRESSAO do cracha: jornada fechada + nova entrada diz TRABALHANDO, nao concluida", () => {
  // O dia tem um clock_out, mas a última batida é um clock_in: é a 2ª jornada
  // aberta. O banco elege `last_type = 'clock_in'` com o MESMO desempate de
  // allowed_punch_actions, e o crachá tem que dizer "trabalhando".
  const sequencia = ["clock_in", "break_start", "break_end", "clock_out", "clock_in"];
  const lastType = sequencia[sequencia.length - 1];

  assertEquals(dayStatusFromLastType(lastType), "working");
  // E o caminho degradado (lista pelo dia do relógio, sem a RPC) concorda:
  assertEquals(deriveDayStatus(sequencia), "working");
  // A pessoa continua podendo bater intervalo ou saída desta 2ª jornada.
  assertEquals(allowedActionsFrom(sequencia), ["break_start", "clock_out"]);
});

Deno.test("dayStatusFromLastType == deriveDayStatus da sequencia inteira", () => {
  const sequencias: string[][] = [
    [],
    ["clock_in"],
    ["clock_in", "break_start"],
    ["clock_in", "break_start", "break_end"],
    ["clock_in", "break_start", "break_end", "clock_out"],
    ["clock_in", "clock_out", "clock_in"],
    ["clock_in", "clock_out", "clock_in", "break_start"],
    ["clock_in", "clock_out", "clock_in", "clock_out"],
  ];
  for (const seq of sequencias) {
    // `last_type` do banco = última batida VÁLIDA do dia de jornada.
    const lastType = seq.length > 0 ? seq[seq.length - 1] : null;
    assertEquals(
      dayStatusFromLastType(lastType),
      deriveDayStatus(seq),
      `divergiu em [${seq.join(",")}]`,
    );
  }
});
