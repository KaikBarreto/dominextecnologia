// asaas-customer (shared)
// ------------------------
// Find-or-create do customer Asaas (cus_*) para uma empresa (tenant) e gravação de
// companies.asaas_customer_id. Lógica espelhada de create-asaas-customer/index.ts,
// extraída para reuso no provisionamento durante o CADASTRO (self-register,
// create-company) e no BACKFILL (backfill-asaas-customers).
//
// BEST-EFFORT por design: nunca lança para o chamador. Retorna um resultado
// estruturado para que o cadastro NÃO seja bloqueado caso a Asaas falhe (chave
// ausente, erro de API, sem CNPJ). O checkout e o backfill recuperam depois.
//
// Idempotente: se a empresa já tiver asaas_customer_id, retorna 'skipped'.

import { asaas, buildQuery, AsaasConfigError, AsaasApiError } from "./asaas-client.ts";
import { assertValidDocument } from "./document-validation.ts";

export interface ProvisionResult {
  /** 'created' = customer criado/vinculado agora; 'skipped' = já tinha; 'failed' = erro não-fatal. */
  outcome: "created" | "skipped" | "failed";
  asaas_customer_id: string | null;
  /** Mensagem de erro (apenas quando outcome = 'failed'), para log/relatório. */
  error?: string;
}

/** Empresa mínima necessária para provisionar o customer Asaas. */
export interface CompanyForAsaas {
  id: string;
  name?: string | null;
  email?: string | null;
  cnpj?: string | null;
  asaas_customer_id?: string | null;
  address?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  zip_code?: string | null;
}

/**
 * Find-or-create do customer Asaas para uma empresa e grava companies.asaas_customer_id.
 * NÃO lança: encapsula qualquer erro no resultado. Usa o cliente Supabase (service_role)
 * fornecido pelo chamador.
 */
export async function provisionAsaasCustomer(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  company: CompanyForAsaas,
): Promise<ProvisionResult> {
  try {
    // Idempotente: já vinculada.
    if (company.asaas_customer_id) {
      return { outcome: "skipped", asaas_customer_id: company.asaas_customer_id };
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

    // 4. Cria se não encontrou. Exige CNPJ válido (Asaas só cria customer com documento).
    if (!asaasCustomerId) {
      let cpfCnpjLimpo: string;
      try {
        cpfCnpjLimpo = assertValidDocument(company.cnpj, {
          required: true,
          field: "CPF/CNPJ",
        }) as string;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "CPF/CNPJ inválido";
        return { outcome: "failed", asaas_customer_id: null, error: `${msg} e cliente não encontrado na Asaas.` };
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

    const { error: updErr } = await supabase
      .from("companies")
      .update({ asaas_customer_id: asaasCustomerId })
      .eq("id", company.id);

    if (updErr) {
      return {
        outcome: "failed",
        asaas_customer_id: asaasCustomerId,
        error: `Customer Asaas ${asaasCustomerId} criado, mas falha ao gravar em companies: ${updErr.message}`,
      };
    }

    return { outcome: "created", asaas_customer_id: asaasCustomerId };
  } catch (e: unknown) {
    let msg = "Erro ao provisionar cliente Asaas.";
    if (e instanceof AsaasConfigError) msg = e.message;
    else if (e instanceof AsaasApiError) msg = e.message;
    else if (e instanceof Error) msg = e.message;
    return { outcome: "failed", asaas_customer_id: null, error: msg };
  }
}
