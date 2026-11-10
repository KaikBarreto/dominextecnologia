import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_DOMAIN = "https://dominex.app";

export interface PmocCertificateValidationIdentity {
  certificateNumber: number;
  validationCode: string;
  validationToken: string;
  validationUrl: string;
  displayUrl: string;
}

export async function reservePmocCertificateValidation(
  db: SupabaseClient,
  input: {
    companyId: string;
    contentHash: string;
    sourceKind: "service_order" | "contract";
    sourceId: string;
  },
): Promise<PmocCertificateValidationIdentity> {
  const { data, error } = await db.rpc("reserve_pmoc_certificate_validation", {
    p_company_id: input.companyId,
    p_idempotency_key: input.contentHash,
    p_source_kind: input.sourceKind,
    p_source_id: input.sourceId,
  });
  if (error) throw new Error(`certificate_validation_reserve_failed:${error.code}`);
  const row = Array.isArray(data) ? data[0] : data;
  const certificateNumber = Number(row?.certificate_number);
  const validationToken = typeof row?.validation_token === "string" ? row.validation_token : "";
  const validationCode = typeof row?.validation_code === "string" ? row.validation_code : "";
  if (!Number.isSafeInteger(certificateNumber) || certificateNumber < 1
      || !/^[A-Za-z0-9_-]{16}$/.test(validationToken)
      || !/^PMOC-\d{6,}$/.test(validationCode)) {
    throw new Error("certificate_validation_reserve_invalid");
  }
  const validationUrl = `${APP_DOMAIN}/c/${validationToken}`;
  return {
    certificateNumber,
    validationCode,
    validationToken,
    validationUrl,
    displayUrl: validationUrl.replace(/^https:\/\//, ""),
  };
}

export async function finalizePmocCertificateValidation(
  db: SupabaseClient,
  input: {
    companyId: string;
    contentHash: string;
    sourceKind: "service_order" | "contract";
    documentId: string;
    issuerName: string;
    holderName: string;
    sourceLabel: string;
    issuedAt: string;
    validUntil: string | null;
  },
): Promise<void> {
  const { data, error } = await db.rpc("finalize_pmoc_certificate_validation", {
    p_company_id: input.companyId,
    p_idempotency_key: input.contentHash,
    p_source_kind: input.sourceKind,
    p_document_id: input.documentId,
    p_issuer_name: input.issuerName,
    p_holder_name: input.holderName,
    p_source_label: input.sourceLabel,
    p_issued_at: input.issuedAt,
    p_valid_until: input.validUntil,
  });
  if (error || data !== true) {
    throw new Error(`certificate_validation_finalize_failed:${error?.code ?? "not_updated"}`);
  }
}
