// create-asaas-customer
// ----------------------
// Find-or-create do customer Asaas (cus_*) para uma empresa (tenant).
// Grava companies.asaas_customer_id.
//
// Auth: chamada pelo checkout autenticado (o PRÓPRIO tenant paga sua assinatura
// quando o trial acaba) OU pelo painel master (verify_jwt = true). Server-side:
// usuário só age sobre a PRÓPRIA empresa, OU é super_admin (bypass de tenant).
// Frontend só esconde botão.
//
// Adaptado do EcoSistema (supabase/functions/create-asaas-customer/index.ts).
// Divergências de schema documentadas no briefing: Dominex usa `cnpj`, `email`
// e endereço FLAT na própria tabela companies (sem company_fiscal_config).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { asaas, buildQuery, AsaasConfigError, AsaasApiError } from "../_shared/asaas-client.ts";
import { assertValidDocument } from "../_shared/document-validation.ts";
import { authorizeAsaasCompany } from "../_shared/asaas-auth.ts";

class ValidationError extends Error {}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { company_id } = await req.json();
    if (!company_id) throw new ValidationError("company_id é obrigatório.");

    // --- Auth: própria empresa OU super_admin ---
    const auth = await authorizeAsaasCompany(
      supabase,
      req.headers.get("Authorization"),
      company_id,
    );
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.message }),
        { status: auth.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: company, error: compError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", company_id)
      .single();

    if (compError || !company) throw new ValidationError("Empresa não encontrada.");

    // Já vinculada → idempotente.
    if (company.asaas_customer_id) {
      return new Response(
        JSON.stringify({
          success: true,
          asaas_customer_id: company.asaas_customer_id,
          message: "Empresa já possui cliente Asaas vinculado.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cpfCnpj = (company.cnpj || "").replace(/\D/g, "");
    let asaasCustomerId: string | null = null;

    // 1. Busca por email
    if (company.email) {
      const d = await asaas.get(`/customers`, buildQuery({ email: company.email }));
      if (d?.data?.length > 0) asaasCustomerId = d.data[0].id;
    }

    // 2. Busca por nome
    if (!asaasCustomerId && company.name) {
      const d = await asaas.get(`/customers`, buildQuery({ name: company.name }));
      if (d?.data?.length > 0) asaasCustomerId = d.data[0].id;
    }

    // 3. Busca por CPF/CNPJ
    if (!asaasCustomerId && cpfCnpj.length >= 11) {
      const d = await asaas.get(`/customers`, buildQuery({ cpfCnpj }));
      if (d?.data?.length > 0) asaasCustomerId = d.data[0].id;
    }

    // 4. Cria se não encontrou
    if (!asaasCustomerId) {
      let cpfCnpjLimpo: string;
      try {
        cpfCnpjLimpo = assertValidDocument(company.cnpj, {
          required: true,
          field: "CPF/CNPJ",
        }) as string;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "CPF/CNPJ inválido";
        throw new ValidationError(`${msg} e cliente não encontrado na Asaas.`);
      }

      const payload: Record<string, unknown> = {
        name: company.name,
        email: company.email || undefined,
        cpfCnpj: cpfCnpjLimpo,
        notificationDisabled: true,
      };
      // Endereço FLAT no schema Dominex (não há company_fiscal_config).
      if (company.address) payload.address = company.address;
      if (company.address_number) payload.addressNumber = company.address_number;
      if (company.neighborhood) payload.province = company.neighborhood;
      const cep = (company.zip_code || "").replace(/\D/g, "");
      if (cep.length === 8) payload.postalCode = cep;

      const created = await asaas.post(`/customers`, payload);
      asaasCustomerId = created.id;
    }

    await supabase
      .from("companies")
      .update({ asaas_customer_id: asaasCustomerId })
      .eq("id", company_id);

    return new Response(
      JSON.stringify({ success: true, asaas_customer_id: asaasCustomerId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    console.error("create-asaas-customer error:", error);
    let status = 500;
    let message = "Erro ao vincular cliente de pagamento.";
    if (error instanceof AsaasConfigError) {
      status = 503;
      message = error.message;
    } else if (error instanceof ValidationError) {
      status = 400;
      message = error.message;
    } else if (error instanceof AsaasApiError) {
      status = 400;
      message = error.message;
    } else if (error instanceof Error) {
      message = error.message;
    }
    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
