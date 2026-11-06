import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { executarConsultaCobertura } from "./check-coverage.ts";

Deno.test("invalida cobertura antiga antes de consultar novo município", async () => {
  const eventos: string[] = [];
  let persistido = true;

  await assertRejects(
    () =>
      executarConsultaCobertura(
        async (valor) => {
          persistido = valor;
          eventos.push(`persistir:${valor}`);
        },
        async () => {
          eventos.push("consultar");
          throw new Error("rede indisponível");
        },
      ),
  );

  assertEquals(eventos, ["persistir:false", "consultar"]);
  assertEquals(persistido, false);
});

Deno.test("só persiste true depois de conclusão oficial positiva", async () => {
  const eventos: string[] = [];
  let persistido = true;

  const resultado = await executarConsultaCobertura(
    async (valor) => {
      persistido = valor;
      eventos.push(`persistir:${valor}`);
    },
    async () => {
      eventos.push("consultar");
      return { podeEmitir: true };
    },
  );

  assertEquals(resultado.podeEmitir, true);
  assertEquals(eventos, ["persistir:false", "consultar", "persistir:true"]);
  assertEquals(persistido, true);
});
