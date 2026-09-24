// admin-infra-metrics
// -------------------
// Proxy autenticado entre o painel master Auctus (aba Infra de /admin/estatisticas)
// e a rota `GET /v1/infra/metricas` do motor fiscal (`dominex-fiscal`, na VPS).
//
// POR QUE ESTA FUNÇÃO EXISTE, e não um fetch direto do browser:
//   o motor fiscal autentica com `FISCAL_SERVICE_TOKEN`, um segredo de SERVIÇO.
//   Ele nunca pode ir pro browser — quem tem o token fala com o motor que
//   custodia certificado digital de cliente. O token fica só aqui, no ambiente
//   da edge function.
//
// GUARD — `super_admin` ESTRITO:
//   Authorization Bearer <jwt> → auth.getUser() → has_role(uid, 'super_admin').
//   ⚠️ NÃO usar `is_admin_user()`: essa função inclui VENDEDOR-ADMIN (qualquer
//   linha em admin_permissions). A decisão do CEO em 2026-09-24 é que infra e
//   estatística da base são só do master. Mesma régua da RPC
//   `get_admin_usage_statistics`.
//
// CONTRATO DE RESPOSTA (o que a tela consome):
//   401 { ok:false, erro:{ codigo:'nao_autenticado',  mensagem } }
//   403 { ok:false, erro:{ codigo:'nao_autorizado',   mensagem } }
//   200 { ok:true,  consultadoEm, fonte, metricas: <corpo cru do motor> }
//   200 { ok:false, erro:{ codigo, mensagem } }  ← falha DO MOTOR, não nossa
//   500 { ok:false, erro:{ codigo:'erro_interno',     mensagem } }
//
//   ⚠️ Falha do motor volta em HTTP 200 DE PROPÓSITO. `supabase-js` lança
//   FunctionsHttpError em qualquer não-2xx e esconde o corpo dentro de
//   `error.context`, então um 502 aqui vira "Edge Function returned a non-2xx
//   status code" na tela — mensagem inútil justamente na hora em que o operador
//   precisa saber O QUE quebrou. O veredito vai no corpo, igual ao que o próprio
//   `/v1/infra/metricas` e o `/readyz` já fazem. `ok:false` + `erro.codigo` é o
//   que a tela lê.
//
//   Códigos de `erro.codigo` em falha do motor:
//     nao_configurado          FISCAL_SERVICE_URL/TOKEN ausentes no ambiente
//     rota_indisponivel        404/405 — a rota ainda não foi publicada na VPS
//     nao_autorizado_no_motor  401/403 — token dessincronizado (rotação pela metade)
//     tempo_esgotado           o motor não respondeu no prazo
//     rede                     não deu pra alcançar a VPS
//     resposta_invalida        respondeu, mas não é o JSON esperado
//     erro_do_motor            qualquer outro status

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const TAG = "[admin-infra-metrics]";

/** O motor lê /proc e dois arquivos pequenos: é barato. Se passar disso, está travado. */
const TIMEOUT_MS = 15_000;

function json(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

/** Falha do motor: sempre 200, veredito no corpo (ver cabeçalho do arquivo). */
function falhaDoMotor(req: Request, codigo: string, mensagem: string): Response {
  return json(req, { ok: false, erro: { codigo, mensagem } }, 200);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ---- 1. Authorization Bearer obrigatório ------------------------------
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json(
        req,
        {
          ok: false,
          erro: { codigo: "nao_autenticado", mensagem: "Sessão expirada. Faça login novamente." },
        },
        401,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Client com o JWT do chamador só pra resolver QUEM é.
    const comJwt = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userErr } = await comJwt.auth.getUser();
    const userId = userData?.user?.id;
    if (userErr || !userId) {
      return json(
        req,
        {
          ok: false,
          erro: { codigo: "nao_autenticado", mensagem: "Sessão expirada. Faça login novamente." },
        },
        401,
      );
    }

    // ---- 2. super_admin ESTRITO (has_role, não is_admin_user) -------------
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isSuper, error: roleErr } = await admin.rpc("has_role", {
      _user_id: userId,
      _role: "super_admin",
    });
    if (roleErr) {
      console.error(`${TAG} has_role falhou`, { message: roleErr.message });
      return json(
        req,
        {
          ok: false,
          erro: { codigo: "erro_interno", mensagem: "Falha ao verificar suas permissões." },
        },
        500,
      );
    }
    if (isSuper !== true) {
      return json(
        req,
        {
          ok: false,
          erro: {
            codigo: "nao_autorizado",
            mensagem: "Somente o administrador master pode consultar a infraestrutura.",
          },
        },
        403,
      );
    }

    // ---- 3. Chamada ao motor fiscal --------------------------------------
    const base = (Deno.env.get("FISCAL_SERVICE_URL") ?? "").replace(/\/+$/, "");
    const token = Deno.env.get("FISCAL_SERVICE_TOKEN") ?? "";
    if (!base || !token) {
      console.error(`${TAG} sem FISCAL_SERVICE_URL/TOKEN`);
      return falhaDoMotor(
        req,
        "nao_configurado",
        "O motor fiscal ainda não está configurado neste ambiente (endereço ou token de serviço ausente).",
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let resposta: Response;
    try {
      resposta = await fetch(`${base}/v1/infra/metricas`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (err) {
      const abortou = (err as Error)?.name === "AbortError";
      console.error(`${TAG} rede`, { abortou, message: (err as Error)?.message });
      return abortou
        ? falhaDoMotor(
            req,
            "tempo_esgotado",
            "O motor fiscal não respondeu a tempo. Ele pode estar sobrecarregado ou reiniciando.",
          )
        : falhaDoMotor(
            req,
            "rede",
            "Não foi possível alcançar o motor fiscal. Verifique se o serviço está no ar.",
          );
    } finally {
      clearTimeout(timer);
    }

    if (resposta.status === 404 || resposta.status === 405) {
      return falhaDoMotor(
        req,
        "rota_indisponivel",
        "O motor fiscal ainda não publicou as métricas de infraestrutura. A rota será liberada no próximo deploy do serviço.",
      );
    }
    if (resposta.status === 401 || resposta.status === 403) {
      // Cenário real: token rotacionado na VPS e não republicado no Supabase.
      console.error(`${TAG} motor recusou o token`, { status: resposta.status });
      return falhaDoMotor(
        req,
        "nao_autorizado_no_motor",
        "O motor fiscal recusou o token de serviço. O segredo pode ter sido rotacionado sem republicar.",
      );
    }

    const bruto = await resposta.text();
    let corpo: unknown;
    try {
      corpo = JSON.parse(bruto);
    } catch {
      console.error(`${TAG} resposta não-JSON`, { status: resposta.status, tamanho: bruto.length });
      return falhaDoMotor(
        req,
        "resposta_invalida",
        "O motor fiscal respondeu em um formato inesperado.",
      );
    }

    if (!resposta.ok) {
      console.error(`${TAG} status inesperado`, { status: resposta.status });
      return falhaDoMotor(
        req,
        "erro_do_motor",
        `O motor fiscal respondeu com erro (${resposta.status}).`,
      );
    }
    if (typeof corpo !== "object" || corpo === null) {
      return falhaDoMotor(
        req,
        "resposta_invalida",
        "O motor fiscal respondeu em um formato inesperado.",
      );
    }

    // Repasse CRU do corpo do motor. Nada é reinterpretado aqui de propósito:
    // o veredito (`ok`/`status`/`avisos`) é dele, e duas leituras do mesmo
    // estado seria uma delas apodrecendo em silêncio.
    return json(
      req,
      {
        ok: true,
        consultadoEm: new Date().toISOString(),
        fonte: base,
        metricas: corpo,
      },
      200,
    );
  } catch (err) {
    console.error(`${TAG} erro inesperado`, { message: (err as Error)?.message });
    return json(
      req,
      {
        ok: false,
        erro: {
          codigo: "erro_interno",
          mensagem: "Falha inesperada ao consultar a infraestrutura.",
        },
      },
      500,
    );
  }
});
