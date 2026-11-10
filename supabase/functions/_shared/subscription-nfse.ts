export interface SubscriptionNfseConfig {
  municipalServiceId?: string;
  municipalServiceCode?: string;
  municipalServiceName: string;
  taxes: {
    retainIss: boolean;
    iss: number;
    cofins: number;
    csll: number;
    inss: number;
    ir: number;
    pis: number;
  };
}

const TAX_KEYS = ["iss", "cofins", "csll", "inss", "ir", "pis"] as const;

export function parseSubscriptionNfseConfig(
  raw: string | undefined,
): SubscriptionNfseConfig {
  if (!raw?.trim()) {
    throw new Error("CONFIG_MISSING");
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("CONFIG_INVALID_JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CONFIG_INVALID");
  }

  const config = value as Record<string, unknown>;
  const municipalServiceId = typeof config.municipalServiceId === "string"
    ? config.municipalServiceId.trim()
    : "";
  const municipalServiceCode = typeof config.municipalServiceCode === "string"
    ? config.municipalServiceCode.trim()
    : "";
  const municipalServiceName = typeof config.municipalServiceName === "string"
    ? config.municipalServiceName.trim()
    : "";
  const taxes = config.taxes as Record<string, unknown> | undefined;

  if (
    (!municipalServiceId && !municipalServiceCode) || !municipalServiceName ||
    !taxes
  ) {
    throw new Error("CONFIG_FIELDS_MISSING");
  }
  if (typeof taxes.retainIss !== "boolean") {
    throw new Error("CONFIG_RETAIN_ISS_INVALID");
  }
  for (const key of TAX_KEYS) {
    if (
      typeof taxes[key] !== "number" || !Number.isFinite(taxes[key]) ||
      taxes[key] < 0
    ) {
      throw new Error(`CONFIG_TAX_INVALID:${key}`);
    }
  }

  return {
    ...(municipalServiceId ? { municipalServiceId } : { municipalServiceCode }),
    municipalServiceName,
    taxes: {
      retainIss: taxes.retainIss,
      iss: taxes.iss as number,
      cofins: taxes.cofins as number,
      csll: taxes.csll as number,
      inss: taxes.inss as number,
      ir: taxes.ir as number,
      pis: taxes.pis as number,
    },
  };
}

export function subscriptionNfseTypeLabel(type: unknown): string {
  switch (typeof type === "string" ? type.trim().toLowerCase() : "") {
    case "primeira_venda":
      return "Venda";
    case "upgrade":
      return "Ajuste proporcional de plano";
    default:
      return "Renovação";
  }
}

export function safeInvoiceErrorMessage(): string {
  return "Não foi possível emitir a nota fiscal. Confira os dados cadastrais da empresa e tente novamente ou fale com o suporte.";
}

export function invoiceStatusFromEvent(
  event: string,
  invoiceStatus: unknown,
): string {
  // O cancelamento negado mantém a nota válida. Não convertemos esse evento em
  // erro nem liberamos uma segunda emissão, mesmo se o snapshot repetir o nome
  // do evento no campo status.
  if (event === "INVOICE_CANCELLATION_DENIED") return "AUTHORIZED";
  if (typeof invoiceStatus === "string" && invoiceStatus.trim()) {
    return invoiceStatus.trim().toUpperCase();
  }
  return event.replace(/^INVOICE_/, "").trim().toUpperCase() || "PROCESSING";
}
