// admin-token-login
// -----------------
// "Token de Acesso" do painel master Auctus. Token GLOBAL rotativo (HMAC,
// troca a cada 30 min) que permite o super_admin logar como QUALQUER usuário
// usando email + token no lugar da senha — SEM derrubar as sessões ativas do
// usuário (a sessão é criada server-side via magic link + verify OTP, não via
// signInWithPassword).
//
// action 'generate': super_admin pede o token atual (Authorization Bearer +
//   has_role 'super_admin'). Frontend só esconde o botão; a segurança é aqui.
// action 'login':    valida email + token (época atual OU anterior, janela de
//   60 min), cria sessão server-side e devolve access/refresh token. Sem
//   Authorization (é o próprio fluxo de /auth do usuário-alvo). Rate-limit por
//   IP (10 / 15 min) persistido em master_login_audit. Auditoria de todo acesso
//   em master_login_audit.
//
// Adaptado do EcoSistema (supabase/functions/admin-token-login/index.ts).
// Divergências de schema Dominex aplicadas:
//  - admin NÃO é role='admin'; é has_role(uid, 'super_admin') via RPC.
//  - profiles.user_id = auth uid (profiles.id é o id próprio da linha). O
//    userId retornado e o user_id da auditoria são profiles.user_id.
//  - CORS via helper compartilhado ../_shared/cors.ts.
//
// PRESERVAR a lógica de auth EXATAMENTE: HMAC, janela 60min, magic link +
// verify OTP server-side, rate-limit por tabela. Só nomes foram adaptados.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const EPOCH_DURATION_MS = 30 * 60 * 1000; // token roda a cada 30 min
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function getCurrentEpoch(): number {
  return Math.floor(Date.now() / EPOCH_DURATION_MS);
}

async function generateGlobalToken(epoch30min: number, secret: string): Promise<string> {
  const payload = `global-admin-token:${epoch30min}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.substring(0, 8).toUpperCase();
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const masterPassword = Deno.env.get("MASTER_PASSWORD");
    if (!masterPassword) {
      // Erro genérico: nunca expor detalhe de configuração do servidor.
      return json({ error: "Configuração do servidor incompleta" }, 500);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabasePublishableKey =
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const body = await req.json();
    const { action, email, token, deviceInfo } = body ?? {};

    // -----------------------------------------------------------------
    // action: generate — super_admin pede o token global atual
    // -----------------------------------------------------------------
    if (action === "generate") {
      const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (!authToken) {
        return json({ error: "Token de autenticação necessário" }, 401);
      }

      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(authToken);
      if (!user) {
        return json({ error: "Token inválido" }, 401);
      }

      // Checagem server-side de super_admin via RPC has_role (Dominex).
      const { data: isSuper } = await supabaseAdmin.rpc("has_role", {
        _user_id: user.id,
        _role: "super_admin",
      });
      if (!isSuper) {
        return json({ error: "Acesso não autorizado" }, 403);
      }

      const generatedToken = await generateGlobalToken(getCurrentEpoch(), masterPassword);
      const expiresIn = Math.floor((EPOCH_DURATION_MS - (Date.now() % EPOCH_DURATION_MS)) / 1000);

      return json({ token: generatedToken, expiresIn, epoch: getCurrentEpoch() }, 200);
    }

    // -----------------------------------------------------------------
    // action: login — valida email + token e cria sessão server-side
    // -----------------------------------------------------------------
    if (action === "login") {
      if (!email || !token) {
        return json({ error: "Email e token são obrigatórios" }, 400);
      }

      // Rate-limit por IP (10 / 15 min), persistido em master_login_audit.
      const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count } = await supabaseAdmin
        .from("master_login_audit")
        .select("id", { count: "exact", head: true })
        .eq("device_info", `rate_limit:${ip}`)
        .gte("created_at", windowStart);
      if ((count ?? 0) >= RATE_LIMIT_MAX) {
        return json({ error: "Muitas tentativas. Tente mais tarde." }, 429);
      }
      // Registra esta tentativa (marcador de rate-limit; user_id null).
      await supabaseAdmin
        .from("master_login_audit")
        .insert({ device_info: `rate_limit:${ip}`, ip_address: ip });

      // Validação do token: época atual OU anterior (janela de 60 min).
      const cur = await generateGlobalToken(getCurrentEpoch(), masterPassword);
      const prev = await generateGlobalToken(getCurrentEpoch() - 1, masterPassword);
      if (!token || (token.toUpperCase() !== cur && token.toUpperCase() !== prev)) {
        return json({ error: "Token inválido ou expirado" }, 401);
      }

      // Acha o usuário-alvo por email (case-insensitive). profiles.user_id é
      // o auth uid; profiles.id é o id próprio da linha.
      const { data: profileData } = await supabaseAdmin
        .from("profiles")
        .select("id, user_id, email, company_id")
        .ilike("email", email)
        .maybeSingle();
      if (!profileData) {
        return json({ error: "Usuário não encontrado" }, 404);
      }

      // Gera magic link server-side e verifica o OTP server-side. NÃO usamos
      // signInWithPassword nem signInWithOtp — assim a sessão admin-como-usuário
      // é criada sem tocar nas sessões reais do usuário.
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: profileData.email,
      });
      if (linkError || !linkData) {
        return json({ error: "Erro ao gerar sessão" }, 500);
      }

      const url = new URL(linkData.properties.action_link);
      const tokenHash = url.searchParams.get("token_hash") || linkData.properties.hashed_token;
      if (!tokenHash) {
        return json({ error: "Erro ao gerar token" }, 500);
      }

      const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabasePublishableKey,
        },
        body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
      });
      const sessionData = await verifyResponse.json();
      if (!verifyResponse.ok || !sessionData?.access_token) {
        console.error("Error verifying OTP server-side:", sessionData);
        return json({ error: "Erro ao criar sessão" }, 500);
      }

      // Auditoria do acesso (user_id = auth uid = profiles.user_id).
      await supabaseAdmin.from("master_login_audit").insert({
        user_id: profileData.user_id,
        user_email: profileData.email,
        device_info: deviceInfo || "Token de Acesso (admin)",
        ip_address: ip,
      });

      return json(
        {
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
          userId: profileData.user_id,
          isAdminTokenLogin: true,
        },
        200,
      );
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    console.error("Error in admin-token-login");
    return json({ error: "Erro interno do servidor" }, 500);
  }
});
