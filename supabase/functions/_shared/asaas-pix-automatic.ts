export const PIX_AUTOMATIC_LIVE_STATUSES = [
  "CREATING",
  "CREATE_UNKNOWN",
  "PENDING",
  "CREATED",
  "ACTIVE",
] as const;

export const PIX_AUTOMATIC_AUTHORIZATION_EVENTS = [
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CREATED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
  "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED",
] as const;

export const ASAAS_MASTER_REQUIRED_WEBHOOK_EVENTS = [
  "PAYMENT_CREATED",
  "PAYMENT_UPDATED",
  "PAYMENT_RECEIVED",
  "PAYMENT_CONFIRMED",
  "PAYMENT_OVERDUE",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  ...PIX_AUTOMATIC_AUTHORIZATION_EVENTS,
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_SCHEDULED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_REFUSED",
  "PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CANCELLED",
] as const;

export interface PixAutomaticAuthorizationResponse {
  id: string;
  status?: string;
  subscriptionId?: string;
  contractId?: string;
  endToEndIdentifier?: string;
  encodedImage?: string;
  payload?: string;
  immediateQrCode?: {
    expirationDate?: string;
    encodedImage?: string;
    payload?: string;
    conciliationIdentifier?: string;
  };
}

export interface PixAutomaticCorrelation {
  authorizationId: string;
  subscriptionId: string | null;
  contractId: string | null;
  conciliationIdentifier: string | null;
  endToEndIdentifier: string | null;
  qrCode: string | null;
  copyPaste: string | null;
  authorizationStatus: string;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function pixAutomaticCorrelation(
  authorization: PixAutomaticAuthorizationResponse,
): PixAutomaticCorrelation {
  const authorizationId = nonEmptyString(authorization?.id);
  if (!authorizationId) {
    throw new TypeError("Autorização Pix Automático sem id");
  }

  return {
    authorizationId,
    subscriptionId: nonEmptyString(authorization.subscriptionId),
    contractId: nonEmptyString(authorization.contractId),
    conciliationIdentifier: nonEmptyString(
      authorization.immediateQrCode?.conciliationIdentifier,
    ),
    endToEndIdentifier: nonEmptyString(authorization.endToEndIdentifier),
    qrCode: nonEmptyString(
      authorization.encodedImage ?? authorization.immediateQrCode?.encodedImage,
    ),
    copyPaste: nonEmptyString(
      authorization.payload ?? authorization.immediateQrCode?.payload,
    ),
    authorizationStatus: nonEmptyString(authorization.status)?.toUpperCase() ??
      "PENDING",
  };
}

export function isPaidAsaasPaymentStatus(status: unknown): boolean {
  const normalized = nonEmptyString(status)?.toUpperCase();
  return normalized === "RECEIVED" || normalized === "CONFIRMED";
}

export function pixAutomaticCheckoutStatus(status: unknown): string {
  const normalized = nonEmptyString(status)?.toUpperCase() ?? "PENDING";
  if (normalized === "ACTIVATED") return "ACTIVE";
  return normalized;
}

export function buildPixAutomaticAuthorizationPayload(input: {
  frequency: string;
  contractId: string;
  startDate: string;
  customerId: string;
  value: number;
  description: string;
  expirationSeconds?: number;
}) {
  return {
    frequency: input.frequency,
    contractId: input.contractId,
    startDate: input.startDate,
    customerId: input.customerId,
    value: input.value,
    description: input.description.substring(0, 35),
    paymentCreationMode: "SUBSCRIPTION",
    immediateQrCode: {
      expirationSeconds: input.expirationSeconds ?? 86400,
      originalValue: input.value,
    },
  } as const;
}

export function paymentPixCorrelationCandidates(
  payment: Record<string, unknown>,
): string[] {
  const transaction = payment.pixTransaction;
  const transactionObject = transaction && typeof transaction === "object"
    ? transaction as Record<string, unknown>
    : null;
  const values = [
    payment.pixQrCodeId,
    payment.conciliationIdentifier,
    payment.endToEndIdentifier,
    transactionObject?.pixQrCodeId,
    transactionObject?.conciliationIdentifier,
    transactionObject?.endToEndIdentifier,
  ];
  return [
    ...new Set(
      values.map(nonEmptyString).filter((value): value is string => !!value),
    ),
  ];
}
