import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guarda da regressão do 1.32.5.
 *
 * O formulário público de captação (PublicLeadCapture -> edge lead-capture-submit
 * -> RPC submit_lead_capture_form) grava em `customers` sem passar por nenhum
 * código TypeScript: quem monta o INSERT é a RPC, com a lista de colunas tirada
 * do catálogo do Postgres. Nenhum teste de componente cobre esse caminho, e
 * teste de edge function não roda nesta suíte.
 *
 * Em 15/10/2026 o 1.32.0 adicionou `whatsapp_notifications_enabled boolean NOT
 * NULL DEFAULT false` em `customers` e derrubou o formulário em todos os tenants,
 * sem ninguém tocar na RPC: o INSERT antigo não listava colunas, então expandia a
 * tabela inteira e gravava NULL explícito em toda coluna ausente, anulando o
 * DEFAULT. O 1.32.5 matou essa classe (insert dinâmico, só as colunas presentes).
 *
 * Sobrou UM jeito de quebrar o formulário de novo: adicionar a `customers` uma
 * coluna NOT NULL **sem** DEFAULT. A RPC só garante `name` (fallback) e
 * `company_id` (carimbado do formulário); qualquer outra coluna obrigatória faria
 * a submissão pública falhar. É exatamente isso que o teste abaixo trava.
 *
 * O sinal vem do `types.ts` gerado pelo Supabase, que é regenerado a cada mudança
 * de schema (regra-lei 5): no bloco `Insert`, coluna NOT NULL sem default aparece
 * obrigatória (`col: tipo`) e todo o resto aparece opcional (`col?: tipo`).
 */

const TYPES_PATH = `${process.cwd()}/src/integrations/supabase/types.ts`;
const MIGRATIONS_DIR = `${process.cwd()}/supabase/migrations`;

/** Colunas que a RPC submit_lead_capture_form sempre coloca no payload. */
const GARANTIDAS_PELA_RPC_PUBLICA = ["company_id", "name"];

function lerInsertDeCustomers(): string {
  const source = readFileSync(TYPES_PATH, "utf8");

  const inicioTabela = source.indexOf("\n      customers: {\n");
  expect(
    inicioTabela,
    "bloco `customers` não encontrado em types.ts (o gerador mudou de formato?)",
  ).toBeGreaterThan(-1);

  const inicioInsert = source.indexOf("\n        Insert: {\n", inicioTabela);
  expect(inicioInsert, "bloco `Insert` de customers não encontrado").toBeGreaterThan(-1);

  const fimInsert = source.indexOf("\n        }\n", inicioInsert);
  expect(fimInsert, "fim do bloco `Insert` de customers não encontrado").toBeGreaterThan(-1);

  return source.slice(inicioInsert, fimInsert);
}

describe("contrato de INSERT em customers (formulário público de captação)", () => {
  it("só exige as colunas que a RPC pública garante", () => {
    const bloco = lerInsertDeCustomers();

    const obrigatorias: string[] = [];
    for (const linha of bloco.split("\n")) {
      const campo = linha.match(/^\s{10}(\w+)(\?)?:/);
      if (campo && campo[2] === undefined) obrigatorias.push(campo[1]);
    }

    // Sanidade do parser: se isso zerar, o formato do types.ts mudou e o teste
    // viraria um falso verde silencioso.
    expect(obrigatorias.length, "parser não achou nenhuma coluna obrigatória").toBeGreaterThan(0);

    expect(
      obrigatorias.sort(),
      "coluna NOT NULL sem DEFAULT nova em `customers`: o formulário público de " +
        "captação vai falhar, porque a RPC submit_lead_capture_form não tem o que " +
        "gravar nela. Ou dê um DEFAULT à coluna, ou ensine a RPC a preenchê-la " +
        "(como já é feito com `name`).",
    ).toEqual([...GARANTIDAS_PELA_RPC_PUBLICA].sort());
  });

  it("nenhuma migration nova volta ao INSERT sem lista de colunas", () => {
    // `INSERT INTO <t> SELECT (jsonb_populate_record(NULL::<t>, payload)).*` grava
    // NULL explícito em toda coluna ausente e anula o DEFAULT. As duas migrations
    // abaixo são as versões históricas da RPC, já superadas pela 20261015233000 —
    // ficam no histórico e não podem ser reescritas.
    const HISTORICAS = new Set([
      "20260721120000_lead_capture_public_forms.sql",
      "20260916180000_lead_capture_form_photo_url.sql",
    ]);

    // `INSERT INTO <tabela>` seguido direto de `SELECT`, sem `(colunas)` no meio.
    // O insert dinâmico correto escreve `INSERT INTO public.customers (%s) SELECT`,
    // então não casa aqui.
    const SEM_LISTA_DE_COLUNAS = /INSERT\s+INTO\s+[\w."]+\s+SELECT\b/i;

    // Comentário `--` fora: migration que DOCUMENTA o padrão errado (como a
    // 20261015233000 faz, de propósito) não pode ser acusada de cometê-lo.
    const semComentarios = (sql: string) => sql.replace(/--[^\n]*/g, "");

    const reincidentes = readdirSync(MIGRATIONS_DIR)
      .filter((arquivo) => arquivo.endsWith(".sql") && !HISTORICAS.has(arquivo))
      .filter((arquivo) =>
        SEM_LISTA_DE_COLUNAS.test(
          semComentarios(readFileSync(`${MIGRATIONS_DIR}/${arquivo}`, "utf8")),
        ),
      );

    expect(
      reincidentes,
      "migration com `INSERT INTO <tabela> SELECT ...` sem lista de colunas: isso " +
        "expande TODAS as colunas da tabela e grava NULL explícito em cada uma que " +
        "faltar, anulando o DEFAULT. Liste as colunas explicitamente, como em " +
        "20261015233000_lead_capture_insert_dinamico_respeita_default.sql.",
    ).toEqual([]);
  });
});
