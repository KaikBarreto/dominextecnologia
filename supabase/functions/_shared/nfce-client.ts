// Adaptador server-side do modelo 65 no motor fiscal compartilhado.
//
// Esta fronteira nunca é importada pelo browser. A edge resolve company_id pelo
// JWT/RLS, lê o certificado cifrado e envia somente o snapshot fiscal congelado.
// operationId + snapshotHash precisam sobreviver a retry e timeout.

import type { NfseProviderCtx } from "./nfse-provider.ts";
import { corpoBase } from "./providers/sefin.ts";

const TAG = "[nfce:motor]";
const TIMEOUT_MS = 45_000;

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export class NfceMotorError extends Error {
  status: number;
  code: string;
  guidance: unknown;

  constructor(message: string, options: { status?: number; code?: string; guidance?: unknown } = {}) {
    super(message);
    this.name = "NfceMotorError";
    this.status = options.status ?? 502;
    this.code = options.code ?? "erro_fiscal";
    this.guidance = options.guidance ?? null;
  }
}

interface MotorErrorPayload {
  erro?: { codigo?: string; mensagem?: string; orientacao?: unknown };
}

async function callMotor<T>(path: string, body: unknown): Promise<T> {
  const base = env("FISCAL_SERVICE_URL").replace(/\/+$/, "");
  const token = env("FISCAL_SERVICE_TOKEN");
  if (!base || !token) {
    console.error(`${TAG} serviço não configurado`);
    throw new NfceMotorError(
      "A emissão de NFC-e ainda não está configurada. Fale com o suporte.",
      { status: 503, code: "servico_nao_configurado" },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    const timeout = (error as Error)?.name === "AbortError";
    console.error(`${TAG} falha de rede`, { path, timeout });
    throw new NfceMotorError(
      timeout
        ? "A SEFAZ pode ter recebido a NFC-e, mas a confirmação não voltou. Vamos consultar antes de tentar novamente."
        : "A emissão de NFC-e está indisponível no momento. Tente novamente em alguns minutos.",
      { status: 503, code: timeout ? "resultado_incerto" : "servico_indisponivel" },
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) return await response.json() as T;
  if (response.status === 401 || response.status === 403) {
    console.error(`${TAG} credencial do serviço recusada`, { path, status: response.status });
    throw new NfceMotorError(
      "A emissão de NFC-e está indisponível no momento. Fale com o suporte.",
      { status: 503, code: "servico_indisponivel" },
    );
  }
  const payload = await response.json().catch(() => ({})) as MotorErrorPayload;
  throw new NfceMotorError(
    clean(payload.erro?.mensagem) || "Não foi possível concluir a operação com a NFC-e.",
    {
      status: response.status,
      code: clean(payload.erro?.codigo) || "erro_fiscal",
      guidance: payload.erro?.orientacao ?? null,
    },
  );
}

export interface NfceOperation {
  operationId: string;
  snapshotHash: string;
}

export interface NfcePrepared {
  tenantId: string;
  operationId: string;
  snapshotHash: string;
  status: "preparada";
  chave: string;
  xmlAssinado: string;
  fingerprint: string;
}

export interface NfceOfficialResult {
  outcome?: "authorized" | "cancelled" | "denied" | "rejected" | "uncertain" | "retry" | "accepted";
  recovered?: boolean;
  situacaoOficial?: "autorizada" | "cancelada" | "denegada" | "nao_localizada" | "aguardando_confirmacao";
  resposta?: Record<string, unknown>;
  xmlProcessado?: string | null;
  danfceBase64?: string | null;
  prova?: { access_key?: string; cstat?: string; protocol?: string; authorized_at?: string };
  orientacao?: unknown;
}

async function base(ctx: NfseProviderCtx, operation: NfceOperation, audit: string) {
  return {
    ...await corpoBase(ctx, `${audit}:${operation.operationId}`, "edge:nfce"),
    tenantId: ctx.companyId,
    operationId: operation.operationId,
    snapshotHash: operation.snapshotHash,
  };
}

export async function prepareNfce(
  ctx: NfseProviderCtx,
  operation: NfceOperation & {
    document: Record<string, unknown>;
    qrBaseUrl: string;
    accessUrl: string;
  },
): Promise<NfcePrepared> {
  return await callMotor("/v1/nfce/preparar", {
    ...await base(ctx, operation, "preparar_nfce"),
    documento: operation.document,
    qrBaseUrl: operation.qrBaseUrl,
    accessUrl: operation.accessUrl,
  });
}

export async function authorizeNfce(
  ctx: NfseProviderCtx,
  operation: NfceOperation & { uf: string; key: string; batchId: string; signedXml: string },
): Promise<NfceOfficialResult> {
  return await callMotor("/v1/nfce/autorizar", {
    ...await base(ctx, operation, "autorizar_nfce"),
    uf: operation.uf,
    chave: operation.key,
    idLote: operation.batchId,
    xmlAssinado: operation.signedXml,
  });
}

export async function consultNfce(
  ctx: NfseProviderCtx,
  input: { uf: string; key: string; signedXml?: string | null },
): Promise<NfceOfficialResult> {
  return await callMotor("/v1/nfce/consultar", {
    ...await corpoBase(ctx, `consultar_nfce:${input.key.slice(-8)}`, "edge:nfce"),
    uf: input.uf,
    chave: input.key,
    xmlAssinado: input.signedXml ?? null,
  });
}

export async function prepareNfceCancellation(
  ctx: NfseProviderCtx,
  operation: NfceOperation & {
    uf: string;
    key: string;
    cnpj: string;
    protocol: string;
    reason: string;
    occurredAt: string;
  },
): Promise<{ xmlAssinado: string; fingerprint: string; identidade: string }> {
  return await callMotor("/v1/nfce/cancelamento/preparar", {
    ...await base(ctx, operation, "preparar_cancelamento_nfce"),
    uf: operation.uf,
    chave: operation.key,
    cnpj: operation.cnpj,
    protocolo: operation.protocol,
    justificativa: operation.reason,
    ocorridoEm: operation.occurredAt,
  });
}

export async function transmitNfceCancellation(
  ctx: NfseProviderCtx,
  operation: NfceOperation & { uf: string; batchId: string; signedXml: string },
): Promise<NfceOfficialResult> {
  return await callMotor("/v1/nfce/cancelamento/transmitir", {
    ...await base(ctx, operation, "transmitir_cancelamento_nfce"),
    uf: operation.uf,
    idLote: operation.batchId,
    xmlAssinado: operation.signedXml,
  });
}
