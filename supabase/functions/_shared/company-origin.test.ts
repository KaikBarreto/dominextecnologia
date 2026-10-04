// Testes puros da canonização de origem de captação.
//
// Roda com Deno, como os vizinhos `ponto-kiosk.test.ts` e `face-biometrics.test.ts`:
//   deno test supabase/functions/_shared/company-origin.test.ts
//
// O que estes testes travam: o `?origem=` da URL é parâmetro PÚBLICO e links de
// campanha antigos já publicados mandam valores que não existem no catálogo. Foi
// assim que entraram empresas com "Site", que não é origem nenhuma e suja todo
// relatório de atribuição do painel master.
//
// CATALOG abaixo é o espelho das 12 linhas de `public.company_origins` (conferido
// em produção em 04/10/2026). Mudou a tabela lá, muda aqui.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchCanonicalOrigin, UNKNOWN_ORIGIN_NAME } from "./company-origin.ts";

const CATALOG = [
  "BNI",
  "ChatGPT/IAs",
  "Facebook/Instagram",
  "Feira/Evento",
  "Indicação",
  "Outros",
  "Parceiro",
  "Prospecção Ativa",
  "Site/Google",
  "Tráfego Pago",
  "WhatsApp",
  "YouTube",
];

Deno.test("grafia torta casa e sai com o nome do banco", () => {
  assertEquals(matchCanonicalOrigin("  whatsapp ", CATALOG), "WhatsApp");
  assertEquals(matchCanonicalOrigin("WHATSAPP", CATALOG), "WhatsApp");
  assertEquals(matchCanonicalOrigin("indicação", CATALOG), "Indicação");
  assertEquals(matchCanonicalOrigin("tráfego pago", CATALOG), "Tráfego Pago");
});

Deno.test("origens que só existem em link de vendedor continuam passando", () => {
  // Estas três NÃO vêm na RPC do cadastro público (show_in_signup=false), então
  // só a edge consegue validá-las. Derrubar aqui quebra a atribuição comercial.
  assertEquals(matchCanonicalOrigin("BNI", CATALOG), "BNI");
  assertEquals(matchCanonicalOrigin("bni", CATALOG), "BNI");
  assertEquals(matchCanonicalOrigin("Parceiro", CATALOG), "Parceiro");
  assertEquals(matchCanonicalOrigin("prospecção ativa", CATALOG), "Prospecção Ativa");
});

Deno.test("texto fora do catálogo vira Outros, nunca o texto cru", () => {
  assertEquals(matchCanonicalOrigin("Site", CATALOG), UNKNOWN_ORIGIN_NAME);
  assertEquals(matchCanonicalOrigin("xpto123", CATALOG), UNKNOWN_ORIGIN_NAME);
  assertEquals(matchCanonicalOrigin("Cadastro Direto", CATALOG), UNKNOWN_ORIGIN_NAME);
  assertEquals(matchCanonicalOrigin("<script>alert(1)</script>", CATALOG), UNKNOWN_ORIGIN_NAME);
});

Deno.test("ausência de origem é null, diferente de origem desconhecida", () => {
  assertEquals(matchCanonicalOrigin("", CATALOG), null);
  assertEquals(matchCanonicalOrigin("   ", CATALOG), null);
  assertEquals(matchCanonicalOrigin(null, CATALOG), null);
  assertEquals(matchCanonicalOrigin(undefined, CATALOG), null);
});

Deno.test("catálogo vazio não transforma lixo em origem válida", () => {
  assertEquals(matchCanonicalOrigin("WhatsApp", []), UNKNOWN_ORIGIN_NAME);
  assertEquals(matchCanonicalOrigin("", []), null);
});
