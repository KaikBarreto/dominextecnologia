import {
  addCivilMonths,
  buildInstallmentPlan,
  parseCivilDate,
  sha256Hex,
  stableStringify,
  todayInTimeZone,
} from "./domain.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("plano preserva centavos e coloca resíduo na última parcela", () => {
  const plan = buildInstallmentPlan(100, 3, "2026-01-15");
  assert(plan.length === 3, "deveria criar três parcelas");
  assert(plan[0].value === 33.33, "primeira parcela incorreta");
  assert(plan[1].value === 33.33, "segunda parcela incorreta");
  assert(plan[2].value === 33.34, "resíduo deveria estar na última parcela");
  const cents = plan.reduce(
    (sum, item) => sum + Math.round(item.value * 100),
    0,
  );
  assert(cents === 10_000, "a soma em centavos precisa ser exata");
});

Deno.test("vencimentos mensais limitam o dia ao fim do mês", () => {
  assert(
    addCivilMonths("2026-01-31", 1) === "2026-02-28",
    "fevereiro comum incorreto",
  );
  assert(
    addCivilMonths("2028-01-31", 1) === "2028-02-29",
    "fevereiro bissexto incorreto",
  );
  assert(
    addCivilMonths("2026-01-31", 2) === "2026-03-31",
    "dia original deveria voltar",
  );
});

Deno.test("data civil inválida não é normalizada silenciosamente", () => {
  assert(
    parseCivilDate("2026-02-29") === null,
    "data inexistente deveria ser recusada",
  );
  assert(
    parseCivilDate("2028-02-29") !== null,
    "data bissexta válida deveria passar",
  );
});

Deno.test("hash canônico independe da ordem das chaves", async () => {
  const a = { customer_id: "x", nested: { b: 2, a: 1 } };
  const b = { nested: { a: 1, b: 2 }, customer_id: "x" };
  assert(
    stableStringify(a) === stableStringify(b),
    "serialização deveria ser estável",
  );
  assert(await sha256Hex(a) === await sha256Hex(b), "hash deveria ser estável");
});

Deno.test("hoje respeita o dia civil da empresa perto da meia-noite UTC", () => {
  const instant = new Date("2026-11-17T01:30:00.000Z");
  assert(
    todayInTimeZone("America/Sao_Paulo", instant) === "2026-11-16",
    "São Paulo ainda deveria estar no dia anterior",
  );
  assert(
    todayInTimeZone("UTC", instant) === "2026-11-17",
    "UTC já deveria estar no dia seguinte",
  );
  assert(
    todayInTimeZone("Fuso/Inválido", instant) === "2026-11-16",
    "fuso inválido deveria cair no padrão canônico",
  );
});
