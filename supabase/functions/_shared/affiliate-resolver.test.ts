// Testes do resolvedor de affiliate_id (Programa de Afiliados).
//
// Roda com Deno, como os vizinhos `company-origin.test.ts`/`ponto-kiosk.test.ts`:
//   deno test supabase/functions/_shared/affiliate-resolver.test.ts
//
// O que estes testes travam: `?afiliado=` é parâmetro PÚBLICO (slug OU uuid) e
// decide se uma venda gera comissão pra um parceiro externo. Resolver errado
// (slug tratado como uuid, afiliado inativo aceito, curinga de ilike não
// escapado) é dinheiro saindo errado — por isso o resolvedor em si é coberto
// sem precisar de banco real (fake client determinístico).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ilikeLiteral,
  isUuidLike,
  resolveAffiliateId,
  resolveAffiliateOriginName,
  AFFILIATE_ORIGIN_FALLBACK_NAME,
} from "./affiliate-resolver.ts";

Deno.test("isUuidLike: casa uuid canônico (case-insensitive), rejeita slug", () => {
  assertEquals(isUuidLike("550e8400-e29b-41d4-a716-446655440000"), true);
  assertEquals(isUuidLike("550E8400-E29B-41D4-A716-446655440000"), true);
  assertEquals(isUuidLike("  550e8400-e29b-41d4-a716-446655440000  "), true);
  assertEquals(isUuidLike("paulo-silva"), false);
  assertEquals(isUuidLike(""), false);
  assertEquals(isUuidLike("550e8400-e29b-41d4-a716"), false); // truncado
});

Deno.test("ilikeLiteral: escapa curinga de ilike (% e _) sem alterar o resto", () => {
  assertEquals(ilikeLiteral("paulo-silva"), "paulo-silva");
  assertEquals(ilikeLiteral("100%-afiliado"), "100\\%-afiliado");
  assertEquals(ilikeLiteral("a_b"), "a\\_b");
  assertEquals(ilikeLiteral("  trim-me  "), "trim-me");
});

// Fake client determinístico: simula `affiliates` com 1 linha ativa e 1 inativa,
// uma por id e outra por slug — cobre os dois caminhos de resolveAffiliateId
// sem precisar de Supabase real.
type FakeAffiliateRow = { id: string; slug: string; is_active: boolean };

function makeFakeAffiliateClient(rows: FakeAffiliateRow[]) {
  return {
    from(table: string) {
      if (table !== "affiliates") throw new Error(`tabela inesperada: ${table}`);
      return {
        select(_columns: string) {
          return {
            eq(_column: string, value: string) {
              return {
                async maybeSingle() {
                  const row = rows.find((r) => r.id === value);
                  return { data: row ? { id: row.id, is_active: row.is_active } : null, error: null };
                },
              };
            },
            ilike(_column: string, pattern: string) {
              // Espelha ilike sem curinga real nestes testes: casamento exato
              // case-insensitive, já que ilikeLiteral() escapou % e _.
              const wanted = pattern.toLowerCase();
              return {
                async maybeSingle() {
                  const row = rows.find((r) => r.slug.toLowerCase() === wanted);
                  return { data: row ? { id: row.id, is_active: row.is_active } : null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

const ACTIVE_ID = "550e8400-e29b-41d4-a716-446655440000";
const INACTIVE_ID = "660e8400-e29b-41d4-a716-446655440001";
const FAKE_ROWS: FakeAffiliateRow[] = [
  { id: ACTIVE_ID, slug: "paulo-silva", is_active: true },
  { id: INACTIVE_ID, slug: "ex-parceiro", is_active: false },
];

Deno.test("resolveAffiliateId: uuid ativo resolve direto por id", async () => {
  const client = makeFakeAffiliateClient(FAKE_ROWS);
  assertEquals(await resolveAffiliateId(client, ACTIVE_ID, "[test]"), ACTIVE_ID);
});

Deno.test("resolveAffiliateId: slug ativo resolve por ilike (case-insensitive)", async () => {
  const client = makeFakeAffiliateClient(FAKE_ROWS);
  assertEquals(await resolveAffiliateId(client, "paulo-silva", "[test]"), ACTIVE_ID);
  assertEquals(await resolveAffiliateId(client, "PAULO-SILVA", "[test]"), ACTIVE_ID);
  assertEquals(await resolveAffiliateId(client, "  paulo-silva  ", "[test]"), ACTIVE_ID);
});

Deno.test("resolveAffiliateId: afiliado inativo NUNCA resolve, mesmo existindo", async () => {
  const client = makeFakeAffiliateClient(FAKE_ROWS);
  assertEquals(await resolveAffiliateId(client, INACTIVE_ID, "[test]"), null);
  assertEquals(await resolveAffiliateId(client, "ex-parceiro", "[test]"), null);
});

Deno.test("resolveAffiliateId: slug/uuid inexistente, vazio ou só espaço → null, nunca lança", async () => {
  const client = makeFakeAffiliateClient(FAKE_ROWS);
  assertEquals(await resolveAffiliateId(client, "nao-existe", "[test]"), null);
  assertEquals(await resolveAffiliateId(client, "", "[test]"), null);
  assertEquals(await resolveAffiliateId(client, "   ", "[test]"), null);
  assertEquals(await resolveAffiliateId(client, null, "[test]"), null);
  assertEquals(await resolveAffiliateId(client, undefined, "[test]"), null);
});

Deno.test("resolveAffiliateId: erro do client vira null, não exceção", async () => {
  const brokenClient = {
    from(_table: string) {
      return {
        select(_columns: string) {
          return {
            eq(_column: string, _value: string) {
              return { async maybeSingle() { return { data: null, error: { message: "boom" } }; } };
            },
            ilike(_column: string, _pattern: string) {
              return { async maybeSingle() { return { data: null, error: { message: "boom" } }; } };
            },
          };
        },
      };
    },
  };
  assertEquals(await resolveAffiliateId(brokenClient, ACTIVE_ID, "[test]"), null);
});

Deno.test("resolveAffiliateOriginName: resolve pelo utm_key quando a linha existe", async () => {
  const client = {
    from(table: string) {
      if (table !== "company_origins") throw new Error(`tabela inesperada: ${table}`);
      return {
        select(_columns: string) {
          return {
            eq(_column: string, value: string) {
              return {
                async maybeSingle() {
                  return value === "affiliate"
                    ? { data: { name: "Afiliado" }, error: null }
                    : { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  assertEquals(await resolveAffiliateOriginName(client, "[test]"), "Afiliado");
});

Deno.test("resolveAffiliateOriginName: catálogo sem a linha (ou erro) cai no fallback, nunca lança", async () => {
  const emptyClient = {
    from(_table: string) {
      return {
        select(_columns: string) {
          return { eq(_column: string, _value: string) { return { async maybeSingle() { return { data: null, error: null }; } }; } };
        },
      };
    },
  };
  assertEquals(await resolveAffiliateOriginName(emptyClient, "[test]"), AFFILIATE_ORIGIN_FALLBACK_NAME);

  const brokenClient = {
    from(_table: string) {
      return {
        select(_columns: string) {
          return { eq(_column: string, _value: string) { return { async maybeSingle() { return { data: null, error: { message: "boom" } }; } }; } };
        },
      };
    },
  };
  assertEquals(await resolveAffiliateOriginName(brokenClient, "[test]"), AFFILIATE_ORIGIN_FALLBACK_NAME);
});
