import type { NfseProviderCtx } from "./nfse-provider.ts";
import { corpoBase } from "./providers/sefin.ts";

const TIMEOUT_MS = 45_000;
const env = (name: string) => (Deno.env.get(name) ?? "").trim();
const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export class NfeMotorError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "erro_fiscal",
    public guidance: unknown = null,
  ) {
    super(message);
    this.name = "NfeMotorError";
  }
}

async function callMotor<T>(path: string, body: unknown): Promise<T> {
  const base = env("FISCAL_SERVICE_URL").replace(/\/+$/, "");
  const token = env("FISCAL_SERVICE_TOKEN");
  if (!base || !token)
    throw new NfeMotorError(
      "A emissão de NF-e ainda não está configurada. Fale com o suporte.",
      503,
      "servico_nao_configurado",
    );
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
    const timeout = (error as Error).name === "AbortError";
    throw new NfeMotorError(
      timeout
        ? "A SEFAZ pode ter recebido a NF-e. Vamos consultar a chave antes de qualquer nova tentativa."
        : "A emissão de NF-e está indisponível no momento.",
      503,
      timeout ? "resultado_incerto" : "servico_indisponivel",
    );
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return (await response.json()) as T;
  if (response.status === 401 || response.status === 403)
    throw new NfeMotorError(
      "A emissão de NF-e está indisponível no momento. Fale com o suporte.",
      503,
      "servico_indisponivel",
    );
  const payload = (await response.json().catch(() => ({}))) as {
    erro?: { codigo?: string; mensagem?: string; orientacao?: unknown };
    detail?: string | Array<{ msg?: string }>;
  };
  const detailMessage = typeof payload.detail === "string"
    ? clean(payload.detail)
    : Array.isArray(payload.detail)
    ? payload.detail.map((item) => clean(item?.msg)).filter(Boolean).slice(0, 3).join("; ")
    : "";
  throw new NfeMotorError(
    clean(payload.erro?.mensagem) ||
      detailMessage ||
      "Não foi possível concluir a operação com a NF-e.",
    response.status,
    clean(payload.erro?.codigo) || (detailMessage ? "dados_invalidos" : "erro_fiscal"),
    payload.erro?.orientacao,
  );
}

export interface NfeOperation {
  operationId: string;
  snapshotHash: string;
}
export interface NfePrepared {
  tenantId: string;
  operationId: string;
  snapshotHash: string;
  status: "preparada";
  chave: string;
  xmlAssinado: string;
  fingerprint: string;
}
export interface NfeOfficialResult {
  outcome?: string;
  recovered?: boolean;
  situacaoOficial?: string;
  resposta?: Record<string, unknown>;
  xmlProcessado?: string | null;
  danfeBase64?: string | null;
  danfceBase64?: string | null;
  prova?: {
    access_key?: string;
    cstat?: string;
    protocol?: string;
    authorized_at?: string;
  };
  orientacao?: unknown;
}
async function base(
  ctx: NfseProviderCtx,
  operation: NfeOperation,
  audit: string,
) {
  return {
    ...(await corpoBase(ctx, `${audit}:${operation.operationId}`, "edge:nfe")),
    tenantId: ctx.companyId,
    operationId: operation.operationId,
    snapshotHash: operation.snapshotHash,
  };
}

export async function prepareNfe(
  ctx: NfseProviderCtx,
  operation: NfeOperation & { document: Record<string, unknown> },
): Promise<NfePrepared> {
  return await callMotor("/v1/nfe/preparar", {
    ...(await base(ctx, operation, "preparar_nfe")),
    documento: operation.document,
  });
}
export async function authorizeNfe(
  ctx: NfseProviderCtx,
  operation: NfeOperation & {
    uf: string;
    key: string;
    batchId: string;
    signedXml: string;
  },
): Promise<NfeOfficialResult> {
  return await callMotor("/v1/nfe/autorizar", {
    ...(await base(ctx, operation, "autorizar_nfe")),
    uf: operation.uf,
    chave: operation.key,
    idLote: operation.batchId,
    xmlAssinado: operation.signedXml,
  });
}
export async function consultNfe(
  ctx: NfseProviderCtx,
  input: { uf: string; key: string; signedXml?: string | null },
): Promise<NfeOfficialResult> {
  return await callMotor("/v1/nfe/consultar", {
    ...(await corpoBase(
      ctx,
      `consultar_nfe:${input.key.slice(-8)}`,
      "edge:nfe",
    )),
    uf: input.uf,
    chave: input.key,
    xmlAssinado: input.signedXml ?? null,
  });
}

export async function prepareNfeCancellation(
  ctx: NfseProviderCtx,
  operation: NfeOperation & {
    uf: string;
    key: string;
    cnpj: string;
    protocol: string;
    reason: string;
    occurredAt: string;
  },
): Promise<{ xmlAssinado: string; fingerprint: string; identidade: string }> {
  return await callMotor("/v1/nfe/eventos/preparar", {
    ...(await base(ctx, operation, "preparar_cancelamento_nfe")),
    tipo: "cancellation",
    uf: operation.uf,
    chave: operation.key,
    cnpj: operation.cnpj,
    sequencia: 1,
    texto: operation.reason,
    ocorridoEm: operation.occurredAt,
    protocolo: operation.protocol,
  });
}

export async function transmitNfeCancellation(
  ctx: NfseProviderCtx,
  operation: NfeOperation & {
    uf: string;
    batchId: string;
    signedXml: string;
  },
): Promise<NfeOfficialResult> {
  return await callMotor("/v1/nfe/eventos/transmitir", {
    ...(await base(ctx, operation, "transmitir_cancelamento_nfe")),
    tipo: "cancellation",
    uf: operation.uf,
    idLote: operation.batchId,
    xmlAssinado: operation.signedXml,
  });
}
