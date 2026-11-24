export type CustomerBillingEmailEvent =
  | "charge_created"
  | "charge_due_reminder"
  | "charge_overdue"
  | "charge_paid"
  | "charge_refunded";

export type CustomerBillingEmailTemplate =
  "classic_light" | "brand_light" | "premium_dark" | "bento_gray";

export interface CustomerBillingEmailInput {
  eventType: CustomerBillingEmailEvent;
  templateStyle?: CustomerBillingEmailTemplate | string | null;
  companyName: string;
  companyHeaderName?: string | null;
  companyLogoUrl?: string | null;
  companyDocument?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyAddress?: string | null;
  companyAddressNumber?: string | null;
  companyNeighborhood?: string | null;
  companyComplement?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZipCode?: string | null;
  companyPrimaryColor?: string | null;
  whiteLabelEnabled?: boolean | null;
  customerName?: string | null;
  value: number;
  billingType?: string | null;
  description?: string | null;
  dueDate?: string | null;
  paymentDate?: string | null;
  checkoutUrl?: string | null;
  invoiceUrl?: string | null;
  boletoUrl?: string | null;
  pixCopyPaste?: string | null;
  contentOverrides?: unknown;
}

export type CustomerBillingEmailContentField =
  "subject" | "eyebrow" | "title" | "intro";

export type CustomerBillingEmailContentOverrides = Partial<
  Record<
    CustomerBillingEmailEvent,
    Partial<Record<CustomerBillingEmailContentField, string>>
  >
>;

const DOMINEX_LOGO_URL = "https://www.dominex.app/logo-horizontal-verde.png";
const DOMINEX_SITE_URL = "https://www.dominex.app";
const DEFAULT_ACCENT = "#18181b";
const CONTENT_FIELDS = ["subject", "eyebrow", "title", "intro"] as const;
const CONTENT_LIMITS: Record<CustomerBillingEmailContentField, number> = {
  subject: 150,
  eyebrow: 80,
  title: 120,
  intro: 400,
};

const COPY: Record<
  CustomerBillingEmailEvent,
  {
    subject: (company: string) => string;
    eyebrow: string;
    title: string;
    intro: (customer: string, company: string) => string;
    action: string;
    eventColor: string;
  }
> = {
  charge_created: {
    subject: (company) => `Nova cobrança de ${company}`,
    eyebrow: "NOVA COBRANÇA",
    title: "Sua cobrança foi gerada",
    intro: (customer, company) =>
      `Olá, ${customer}. A ${company} gerou uma nova cobrança para você.`,
    action: "Ver cobrança",
    eventColor: "#2563eb",
  },
  charge_due_reminder: {
    subject: (company) => `Lembrete de vencimento — ${company}`,
    eyebrow: "LEMBRETE DE VENCIMENTO",
    title: "Sua cobrança vence em breve",
    intro: (customer, company) =>
      `Olá, ${customer}. Este é um lembrete sobre uma cobrança da ${company}.`,
    action: "Ver cobrança",
    eventColor: "#d97706",
  },
  charge_overdue: {
    subject: (company) => `Cobrança vencida — ${company}`,
    eyebrow: "COBRANÇA VENCIDA",
    title: "Identificamos uma cobrança em atraso",
    intro: (customer, company) =>
      `Olá, ${customer}. A cobrança abaixo, emitida pela ${company}, está vencida.`,
    action: "Regularizar cobrança",
    eventColor: "#dc2626",
  },
  charge_paid: {
    subject: (company) => `Pagamento confirmado — ${company}`,
    eyebrow: "PAGAMENTO CONFIRMADO",
    title: "Recebemos seu pagamento",
    intro: (customer, company) =>
      `Olá, ${customer}. A ${company} confirmou o recebimento do seu pagamento.`,
    action: "Ver comprovante",
    eventColor: "#16a34a",
  },
  charge_refunded: {
    subject: (company) => `Atualização sobre sua cobrança — ${company}`,
    eyebrow: "ATUALIZAÇÃO DA COBRANÇA",
    title: "Houve uma atualização na sua cobrança",
    intro: (customer, company) =>
      `Olá, ${customer}. A ${company} registrou uma atualização de estorno ou contestação relacionada à cobrança abaixo.`,
    action: "Ver detalhes",
    eventColor: "#7c3aed",
  },
};

export function escapeCustomerEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function safeCustomerEmailUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const CUSTOMER_EMAIL_LINK_PATTERN =
  /\[([^\]\r\n]{1,80})\]\((https:\/\/[^\s<>"']{1,2048})\)/g;

export function renderCustomerEmailRichText(value: unknown): string {
  const source = String(value ?? "");
  let cursor = 0;
  let output = "";

  for (const match of source.matchAll(CUSTOMER_EMAIL_LINK_PATTERN)) {
    const index = match.index ?? 0;
    output += escapeCustomerEmailHtml(source.slice(cursor, index));
    const safeUrl = safeCustomerEmailUrl(match[2]);
    output += safeUrl
      ? `<a href="${escapeCustomerEmailHtml(
          safeUrl,
        )}" style="color:inherit;text-decoration:underline;font-weight:700;">${escapeCustomerEmailHtml(
          match[1],
        )}</a>`
      : escapeCustomerEmailHtml(match[0]);
    cursor = index + match[0].length;
  }

  return output + escapeCustomerEmailHtml(source.slice(cursor));
}

function customerEmailPlainText(value: string): string {
  return value.replace(
    CUSTOMER_EMAIL_LINK_PATTERN,
    (_match, label: string, url: string) => `${label}: ${url}`,
  );
}

export function normalizeCustomerEmailTemplate(
  value: unknown,
): CustomerBillingEmailTemplate {
  if (
    value === "brand_light" ||
    value === "premium_dark" ||
    value === "bento_gray"
  )
    return value;
  return "classic_light";
}

export function safeCustomerEmailColor(
  value: unknown,
  fallback = DEFAULT_ACCENT,
): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

function idealForeground(hex: string): "#ffffff" | "#111827" {
  const normalized = safeCustomerEmailColor(hex).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 160
    ? "#111827"
    : "#ffffff";
}

function compactText(value: unknown, fallback: string, max = 120): string {
  const normalized = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (normalized || fallback).slice(0, max);
}

export function sanitizeCustomerEmailSenderName(value: unknown): string {
  return compactText(value, "Dominex", 80).replace(/[<>]/g, "");
}

export function normalizeCustomerEmailContentOverrides(
  value: unknown,
): CustomerBillingEmailContentOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: CustomerBillingEmailContentOverrides = {};
  for (const eventType of Object.keys(COPY) as CustomerBillingEmailEvent[]) {
    const rawEvent = (value as Record<string, unknown>)[eventType];
    if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
      continue;
    }
    const eventContent: Partial<
      Record<CustomerBillingEmailContentField, string>
    > = {};
    for (const field of CONTENT_FIELDS) {
      const raw = (rawEvent as Record<string, unknown>)[field];
      if (typeof raw !== "string") continue;
      const normalized = compactText(raw, "", CONTENT_LIMITS[field]);
      if (normalized) eventContent[field] = normalized;
    }
    if (Object.keys(eventContent).length > 0) output[eventType] = eventContent;
  }
  return output;
}

function interpolateCustomerEmailContent(
  value: string,
  variables: Record<string, string>,
): string {
  return value.replace(
    /\{\{([a-z_]+)\}\}/gi,
    (match, name: string) => variables[name.toLowerCase()] ?? match,
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00-03:00`)
    : new Date(value);
  if (Number.isNaN(dateOnly.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(dateOnly);
}

function paymentMethodLabel(value?: string | null): string | null {
  if (value === "PIX") return "Pix";
  if (value === "BOLETO") return "Boleto bancário";
  if (value === "CREDIT_CARD") return "Cartão de crédito";
  if (value === "UNDEFINED") return "Pix, boleto ou cartão";
  return null;
}

function documentLabel(value?: string | null): string | null {
  const document = compactText(value, "", 30);
  if (!document) return null;
  const digits = document.replace(/\D/g, "");
  return `${digits.length <= 11 ? "CPF" : "CNPJ"}: ${document}`;
}

function companyDetailLines(input: CustomerBillingEmailInput): string[] {
  const addressParts = [
    input.companyAddress,
    input.companyAddressNumber,
    input.companyComplement,
    input.companyNeighborhood,
  ]
    .map((value) => compactText(value, "", 100))
    .filter(Boolean);
  const location = [
    compactText(input.companyCity, "", 80),
    compactText(input.companyState, "", 20),
  ]
    .filter(Boolean)
    .join(" / ");
  const zip = compactText(input.companyZipCode, "", 30);
  const address = [addressParts.join(", "), location, zip ? `CEP: ${zip}` : ""]
    .filter(Boolean)
    .join(" · ");
  const contact = [
    compactText(input.companyPhone, "", 40),
    compactText(input.companyEmail, "", 120),
  ]
    .filter(Boolean)
    .join(" · ");
  return [documentLabel(input.companyDocument), contact, address].filter(
    Boolean,
  ) as string[];
}

function companyHeader(
  input: CustomerBillingEmailInput,
  options: {
    background: string;
    text: string;
    subtle: string;
    padding: string;
    logoSurface?: string;
  },
): string {
  const company =
    input.companyHeaderName === undefined
      ? compactText(input.companyName, "Sua empresa", 80)
      : compactText(input.companyHeaderName, "", 80);
  const logo = safeCustomerEmailUrl(input.companyLogoUrl);
  const details = companyDetailLines(input);
  const detailHtml = details
    .map(
      (line) =>
        `<div style="margin-top:3px;color:${options.subtle};font-size:11px;line-height:16px;">${escapeCustomerEmailHtml(
          line,
        )}</div>`,
    )
    .join("");
  const logoImage = logo
    ? `<img src="${escapeCustomerEmailHtml(
        logo,
      )}" alt="${escapeCustomerEmailHtml(
        company,
      )}" style="display:block;width:auto;height:auto;max-width:122px;max-height:58px;">`
    : "";
  const logoHtml = logo
    ? `<td class="company-logo-cell" width="146" style="vertical-align:middle;padding-right:18px;">${
        options.logoSurface
          ? `<div class="company-logo-surface" style="display:inline-block;background:${options.logoSurface};border-radius:10px;padding:10px 12px;">${logoImage}</div>`
          : logoImage
      }</td>`
    : "";
  return `<tr><td style="background:${options.background};padding:${options.padding};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      ${logoHtml}
      <td class="company-details-cell" style="vertical-align:middle;">
        ${
          company
            ? `<div style="color:${options.text};font-size:19px;line-height:25px;font-weight:800;">${escapeCustomerEmailHtml(
                company,
              )}</div>`
            : ""
        }
        ${detailHtml}
      </td>
    </tr></table>
  </td></tr>`;
}

function detailRows(
  details: string[][],
  palette: { label: string; value: string; border: string },
): string {
  return details
    .map(
      ([label, value], index) => `
    <tr>
      <td style="padding:11px 0;${
        index ? `border-top:1px solid ${palette.border};` : ""
      }color:${palette.label};font-size:13px;vertical-align:top;">${escapeCustomerEmailHtml(
        label,
      )}</td>
      <td style="padding:11px 0 11px 20px;${
        index ? `border-top:1px solid ${palette.border};` : ""
      }color:${palette.value};font-size:14px;font-weight:700;text-align:right;vertical-align:top;">${escapeCustomerEmailHtml(
        value,
      )}</td>
    </tr>`,
    )
    .join("");
}

function dominexFooter(dark: boolean, neutral = false): string {
  const background = neutral ? "#111113" : dark ? "#0f172a" : "#18181b";
  const text = neutral ? "#a1a1aa" : dark ? "#94a3b8" : "#a1a1aa";
  const border = neutral ? "#3f3f46" : dark ? "#273244" : "#e4e4e7";
  return `<tr><td style="background:${background};border-top:1px solid ${border};padding:22px 32px 25px;text-align:center;">
    <a href="${DOMINEX_SITE_URL}" style="display:inline-block;text-decoration:none;">
      <img src="${DOMINEX_LOGO_URL}" alt="Dominex" style="display:block;height:23px;width:auto;max-width:124px;margin:0 auto 8px;">
      <span style="color:${text};font-size:11px;line-height:16px;">www.dominex.app</span>
    </a>
  </td></tr>`;
}

function paymentActions(
  primaryUrl: string | null,
  boletoUrl: string | null,
  palette: {
    primaryBackground: string;
    primaryForeground: string;
    secondaryBackground: string;
    secondaryBorder: string;
    secondaryForeground: string;
  },
): string {
  if (!primaryUrl && !boletoUrl) return "";

  const primary = primaryUrl
    ? `<td style="padding:0 10px 10px 0;"><a href="${escapeCustomerEmailHtml(
        primaryUrl,
      )}" style="display:inline-block;background:${palette.primaryBackground};color:${palette.primaryForeground};text-decoration:none;border-radius:11px;padding:16px 24px;font-size:15px;line-height:22px;font-weight:800;"><span class="payment-action-icon payment-action-icon-card" style="display:inline-block;width:15px;height:11px;border:2px solid ${palette.primaryForeground};border-radius:3px;vertical-align:-1px;margin-right:9px;"><span style="display:block;height:2px;background:${palette.primaryForeground};margin-top:3px;"></span></span>Pagar agora</a></td>`
    : "";
  const boleto = boletoUrl
    ? `<td style="padding:0 0 10px;"><a href="${escapeCustomerEmailHtml(
        boletoUrl,
      )}" style="display:inline-block;background:${palette.secondaryBackground};border:1px solid ${palette.secondaryBorder};color:${palette.secondaryForeground};text-decoration:none;border-radius:11px;padding:15px 23px;font-size:15px;line-height:22px;font-weight:800;"><span class="payment-action-icon payment-action-icon-document" style="display:inline-block;width:12px;height:15px;border:2px solid ${palette.secondaryForeground};border-radius:2px;vertical-align:-3px;margin-right:9px;"><span style="display:block;border-top:2px solid ${palette.secondaryForeground};margin:4px 2px 0;"></span><span style="display:block;border-top:2px solid ${palette.secondaryForeground};margin:3px 2px 0;"></span></span>Abrir boleto</a></td>`
    : "";

  return `<table role="presentation" cellspacing="0" cellpadding="0"><tr>${primary}${boleto}</tr></table>`;
}

export function getCustomerBillingEmailSubject(
  input: CustomerBillingEmailInput,
): string {
  const company = compactText(input.companyName, "sua empresa", 80);
  const customer = compactText(input.customerName, "cliente", 80);
  const amount = formatMoney(input.value);
  const dueDate = formatDate(input.dueDate) ?? "";
  const override = normalizeCustomerEmailContentOverrides(
    input.contentOverrides,
  )[input.eventType]?.subject;
  return interpolateCustomerEmailContent(
    override ?? COPY[input.eventType].subject(company),
    { cliente: customer, empresa: company, valor: amount, vencimento: dueDate },
  ).slice(0, 150);
}

export function renderCustomerBillingEmail(input: CustomerBillingEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const copy = COPY[input.eventType];
  const template = normalizeCustomerEmailTemplate(input.templateStyle);
  const whiteLabel = input.whiteLabelEnabled === true;
  const company = compactText(input.companyName, "sua empresa", 80);
  const customer = compactText(input.customerName, "cliente", 80);
  const description = compactText(
    input.description,
    "Cobrança de serviços",
    300,
  );
  const dueDate = formatDate(input.dueDate);
  const paymentDate = formatDate(input.paymentDate);
  const method = paymentMethodLabel(input.billingType);
  const canPay =
    input.eventType !== "charge_paid" && input.eventType !== "charge_refunded";
  const checkoutUrl = canPay ? safeCustomerEmailUrl(input.checkoutUrl) : null;
  const legacyInvoiceUrl = canPay
    ? safeCustomerEmailUrl(input.invoiceUrl)
    : null;
  const primaryPaymentUrl = checkoutUrl ?? legacyInvoiceUrl;
  const safeBoletoUrl = canPay ? safeCustomerEmailUrl(input.boletoUrl) : null;
  const secondaryBoletoUrl =
    safeBoletoUrl && safeBoletoUrl !== primaryPaymentUrl ? safeBoletoUrl : null;
  const pix =
    input.eventType !== "charge_paid" && input.eventType !== "charge_refunded"
      ? compactText(input.pixCopyPaste, "", 700)
      : "";
  const amount = formatMoney(input.value);
  const contentOverride = normalizeCustomerEmailContentOverrides(
    input.contentOverrides,
  )[input.eventType];
  const contentVariables = {
    cliente: customer,
    empresa: company,
    valor: amount,
    vencimento: dueDate ?? "",
  };
  const accent = whiteLabel
    ? safeCustomerEmailColor(input.companyPrimaryColor, copy.eventColor)
    : copy.eventColor;
  const accentForeground = idealForeground(accent);

  const details = [
    ["Valor", amount],
    dueDate ? ["Vencimento", dueDate] : null,
    paymentDate && input.eventType === "charge_paid"
      ? ["Pagamento", paymentDate]
      : null,
    method ? ["Forma de pagamento", method] : null,
    ["Descrição", description],
  ].filter(Boolean) as string[][];
  const textDetails = details
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
  const subject = getCustomerBillingEmailSubject(input);
  const eyebrow = interpolateCustomerEmailContent(
    contentOverride?.eyebrow ?? copy.eyebrow,
    contentVariables,
  );
  const titleText = interpolateCustomerEmailContent(
    contentOverride?.title ?? copy.title,
    contentVariables,
  );
  const intro = interpolateCustomerEmailContent(
    contentOverride?.intro ?? copy.intro(customer, company),
    contentVariables,
  );

  const sharedContent = (
    dark: boolean,
    detailBackground: string,
    detailBorder: string,
  ) => {
    const title = dark ? "#f8fafc" : "#18181b";
    const body = dark ? "#cbd5e1" : "#52525b";
    const label = dark ? "#94a3b8" : "#71717a";
    const value = dark ? "#f8fafc" : "#18181b";
    return `<tr><td style="padding:30px 32px 12px;">
        <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.2px;color:${accent};">${escapeCustomerEmailHtml(
          eyebrow,
        )}</div>
        <h1 style="margin:8px 0 12px;color:${title};font-size:28px;line-height:35px;letter-spacing:-0.6px;">${escapeCustomerEmailHtml(
          titleText,
        )}</h1>
        <p style="margin:0;color:${body};font-size:15px;line-height:24px;">${renderCustomerEmailRichText(
          intro,
        )}</p>
      </td></tr>
      <tr><td style="padding:16px 32px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${detailBackground};border:1px solid ${detailBorder};border-radius:12px;padding:4px 14px;">${detailRows(
          details,
          { label, value, border: detailBorder },
        )}</table>
      </td></tr>
      ${
        pix
          ? `<tr><td style="padding:0 32px 18px;"><div style="color:${title};font-size:12px;font-weight:700;margin-bottom:7px;">Pix copia e cola</div><div style="word-break:break-all;background:${detailBackground};border:1px solid ${detailBorder};border-radius:9px;padding:10px 12px;color:${body};font-size:12px;line-height:18px;"><div>${escapeCustomerEmailHtml(
              pix,
            )}</div>${
              primaryPaymentUrl
                ? `<div style="margin-top:10px;text-align:right;"><a href="${escapeCustomerEmailHtml(
                    primaryPaymentUrl,
                  )}" style="display:inline-block;background:${
                    dark ? "#273244" : "#f4f4f5"
                  };border:1px solid ${
                    dark ? "#475569" : "#d4d4d8"
                  };border-radius:8px;padding:8px 12px;color:${
                    dark ? "#f8fafc" : "#27272a"
                  };text-decoration:none;font-size:12px;line-height:18px;font-weight:800;">&#10697;&nbsp;&nbsp;Copiar código Pix</a></div>`
                : ""
            }</div></td></tr>`
          : ""
      }
      ${
        primaryPaymentUrl || secondaryBoletoUrl
          ? `<tr><td style="padding:2px 32px 22px;">${paymentActions(
              primaryPaymentUrl,
              secondaryBoletoUrl,
              {
                primaryBackground: accent,
                primaryForeground: accentForeground,
                secondaryBackground: dark ? "#1b2638" : "#eff6ff",
                secondaryBorder: dark ? "#64748b" : accent,
                secondaryForeground: dark ? "#e2e8f0" : accent,
              },
            )}</td></tr>`
          : ""
      }
      <tr><td style="padding:0 32px 24px;color:${label};font-size:12px;line-height:19px;">Em caso de dúvida, responda este e-mail para falar com ${escapeCustomerEmailHtml(
        company,
      )}.</td></tr>`;
  };

  const bentoContent = () => {
    const secondaryValue = method ?? "A combinar";
    const buttonBackground = accent;
    const buttonForeground = accentForeground;
    return `<tr><td style="height:5px;background:${accent};"></td></tr>
      <tr><td style="padding:30px 32px 14px;">
        <div style="font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.2px;color:${accent};">${escapeCustomerEmailHtml(
          eyebrow,
        )}</div>
        <h1 style="margin:8px 0 12px;color:#fafafa;font-size:28px;line-height:35px;letter-spacing:-0.6px;">${escapeCustomerEmailHtml(
          titleText,
        )}</h1>
        <p style="margin:0;color:#b4b4b8;font-size:15px;line-height:24px;">${renderCustomerEmailRichText(
          intro,
        )}</p>
      </td></tr>
      <tr><td style="padding:14px 32px 10px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#202022;border-radius:14px;overflow:hidden;table-layout:fixed;">
          <tr><td colspan="2" style="padding:18px 20px 16px;">
            <div style="color:#a1a1aa;font-size:11px;line-height:16px;font-weight:800;letter-spacing:1px;">VALOR</div>
            <div style="margin-top:6px;color:#fafafa;font-size:32px;line-height:39px;font-weight:800;letter-spacing:-0.8px;">${escapeCustomerEmailHtml(
              amount,
            )}</div>
          </td></tr>
          <tr><td colspan="2" style="height:1px;background:#343438;font-size:1px;line-height:1px;">&nbsp;</td></tr>
          <tr>
          <td width="50%" style="padding:15px 20px;vertical-align:top;">
            <div style="color:#a1a1aa;font-size:10px;line-height:15px;font-weight:800;letter-spacing:.8px;">VENCIMENTO</div>
            <div style="margin-top:5px;color:#fafafa;font-size:15px;line-height:21px;font-weight:800;">${escapeCustomerEmailHtml(
              dueDate ?? "Não informado",
            )}</div>
          </td>
          <td width="50%" style="border-left:1px solid #343438;padding:15px 20px;vertical-align:top;">
            <div style="color:#a1a1aa;font-size:10px;line-height:15px;font-weight:800;letter-spacing:.8px;">${
              input.eventType === "charge_paid" && paymentDate
                ? "PAGAMENTO"
                : "FORMA DE PAGAMENTO"
            }</div>
            <div style="margin-top:5px;color:#fafafa;font-size:15px;line-height:21px;font-weight:800;">${escapeCustomerEmailHtml(
              input.eventType === "charge_paid" && paymentDate
                ? paymentDate
                : secondaryValue,
            )}</div>
          </td></tr>
          <tr><td colspan="2" style="border-top:1px solid #343438;padding:15px 20px 17px;">
            <div style="color:#a1a1aa;font-size:10px;line-height:15px;font-weight:800;letter-spacing:.8px;">DESCRIÇÃO</div>
            <div style="margin-top:5px;color:#e4e4e7;font-size:14px;line-height:21px;font-weight:700;">${escapeCustomerEmailHtml(
              description,
            )}</div>
          </td></tr>
        </table>
      </td></tr>
      ${
        pix
          ? `<tr><td style="padding:8px 32px;"><div style="background:#202022;border-radius:12px;padding:14px 16px;"><div style="color:#a1a1aa;font-size:10px;line-height:15px;font-weight:800;letter-spacing:.8px;">PIX COPIA E COLA</div><div style="margin-top:6px;word-break:break-all;color:#d4d4d8;font-size:12px;line-height:18px;">${escapeCustomerEmailHtml(
              pix,
            )}</div>${
              primaryPaymentUrl
                ? `<div style="margin-top:10px;text-align:right;"><a href="${escapeCustomerEmailHtml(
                    primaryPaymentUrl,
                  )}" style="display:inline-block;background:#e4e4e7;border-radius:8px;padding:9px 13px;color:#18181b;text-decoration:none;font-size:12px;line-height:18px;font-weight:800;">&#10697;&nbsp;&nbsp;Copiar código Pix</a></div>`
                : ""
            }</div></td></tr>`
          : ""
      }
      ${
        primaryPaymentUrl || secondaryBoletoUrl
          ? `<tr><td style="padding:16px 32px 20px;">${paymentActions(
              primaryPaymentUrl,
              secondaryBoletoUrl,
              {
                primaryBackground: buttonBackground,
                primaryForeground: buttonForeground,
                secondaryBackground: "#2c2c30",
                secondaryBorder: "#52525b",
                secondaryForeground: "#e4e4e7",
              },
            )}</td></tr>`
          : ""
      }
      <tr><td style="padding:0 32px 24px;color:#a1a1aa;font-size:12px;line-height:19px;">Em caso de dúvida, responda este e-mail para falar com ${escapeCustomerEmailHtml(
        company,
      )}.</td></tr>`;
  };

  let outerBackground = "#f4f4f5";
  let cardBackground = "#ffffff";
  let header = "";
  let content = "";
  let dark = false;

  if (template === "bento_gray") {
    dark = true;
    outerBackground = "#0a0a0b";
    cardBackground = "#171719";
    header = companyHeader(input, {
      background: "#202022",
      text: "#fafafa",
      subtle: "#a1a1aa",
      padding: "22px 30px",
      logoSurface: "#f4f4f5",
    });
    content = bentoContent();
  } else if (template === "premium_dark") {
    dark = true;
    outerBackground = "#09090b";
    cardBackground = "#111827";
    header = companyHeader(input, {
      background: "linear-gradient(135deg,#09090b 0%,#27272a 100%)",
      text: "#ffffff",
      subtle: "#d4d4d8",
      padding: "25px 30px",
      logoSurface: "#f4f4f5",
    });
    content = sharedContent(true, "#151e2d", "#202b3a");
  } else if (template === "brand_light") {
    header = companyHeader(input, {
      background: accent,
      text: accentForeground,
      subtle: accentForeground,
      padding: "25px 30px",
    });
    content = sharedContent(false, "#fdfdfd", "#eeeeef");
  } else {
    header = companyHeader(input, {
      background: "#ffffff",
      text: "#18181b",
      subtle: "#71717a",
      padding: "26px 32px 22px",
    });
    content = `<tr><td style="height:5px;background:${accent};"></td></tr>${sharedContent(
      false,
      "#fdfdfd",
      "#eeeeef",
    )}`;
  }

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@media only screen and (max-width:480px){.company-logo-cell,.company-details-cell{display:block!important;width:auto!important}.company-logo-cell{padding:0 0 14px!important}}</style></head>
<body style="margin:0;background:${outerBackground};font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeCustomerEmailHtml(
    subject,
  )}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${outerBackground};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:${cardBackground};border-radius:18px;overflow:hidden;box-shadow:0 18px 45px rgba(0,0,0,.12);">
        ${header}${content}${
          whiteLabel ? "" : dominexFooter(dark, template === "bento_gray")
        }
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const brandText = whiteLabel
    ? ""
    : `\nEnviado com segurança pela Dominex — ${DOMINEX_SITE_URL}`;
  const companyLines = companyDetailLines(input);
  const text = `${company}${
    companyLines.length ? `\n${companyLines.join("\n")}` : ""
  }\n\n${titleText}\n\n${customerEmailPlainText(intro)}\n\n${textDetails}${
    pix ? `\n\nPix copia e cola:\n${pix}` : ""
  }${primaryPaymentUrl ? `\n\nPagar agora: ${primaryPaymentUrl}` : ""}${
    secondaryBoletoUrl ? `\nAbrir boleto: ${secondaryBoletoUrl}` : ""
  }\n\nEm caso de dúvida, responda este e-mail para falar com ${company}.${brandText}`;

  return { subject, html, text };
}
