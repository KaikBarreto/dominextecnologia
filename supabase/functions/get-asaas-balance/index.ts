// get-asaas-balance
// -----------------
// Retorna o saldo atual da conta Asaas (produção) para a tela de Conciliação
// bancária do painel master Auctus.
//
// Endpoint Asaas: GET /finance/balance → { balance: number }.
//
// Auth (regra-lei Dominex #6): SOMENTE super_admin. Valida Authorization + has_role
// server-side. Frontend só esconde o botão; a fronteira de segurança é aqui.
//
// Cliente Supabase: service_role (faz getUser do token + has_role). Não grava nada.
//
// Se ASAAS_API_KEY não estiver setada, o helper _shared/asaas-client.ts lança
// AsaasConfigError com mensagem cliente-facing em PT-BR (a integração fica inerte,
// nunca finge sucesso).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";

Deno.serve(async (req) => {
  const corsResp = handleCors(req);
  if (corsResp) return corsResp;
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ===== Auth: super_admin obrigatório =====
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Autenticação necessária." }, 401);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "Token inválido." }, 401);
    }
    const { data: isSuperAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isSuperAdmin) {
      return json({ error: "Acesso negado. Apenas o administrador master." }, 403);
    }

    // ===== Saldo Asaas =====
    // asaas.get lança AsaasConfigError (chave ausente) ou AsaasApiError (falha HTTP/negócio).
    const data = await asaas.get<{ balance?: number }>("/finance/balance");

    return json({ balance: Number(data?.balance ?? 0) }, 200);
  } catch (e) {
    if (e instanceof AsaasConfigError) {
      console.error("[get-asaas-balance] config:", e.message);
      return json({ error: e.message }, 503);
    }
    if (e instanceof AsaasApiError) {
      console.error("[get-asaas-balance] asaas:", e.message, e.asaasErrors);
      return json({ error: "Não foi possível consultar o saldo do Asaas no momento." }, 502);
    }
    console.error("[get-asaas-balance] erro inesperado:", (e as Error).message);
    return json({ error: "Erro ao buscar o saldo do Asaas." }, 500);
  }
});
