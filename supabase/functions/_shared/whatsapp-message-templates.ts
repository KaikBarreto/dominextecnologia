// Motor ÚNICO dos textos dos avisos de WhatsApp.
//
// Este arquivo é a fonte da verdade de três coisas:
//   1. o catálogo de variáveis (`{{os.numero}}`, `{{cliente.nome}}` …);
//   2. os modelos prontos (objetiva, cordial, detalhada) de cada aviso;
//   3. a função que troca as variáveis pelos valores reais.
//
// Ele é importado pelo enviador (`whatsapp-send-worker`) E pela tela de
// configuração (via `src/lib/whatsappMessageTemplates.ts`). Antes existiam duas
// cópias dos textos, uma em cada ponta, e a prévia divergia do que era enviado.
// Não recrie texto de aviso fora daqui.
//
// Módulo puro: sem import, sem Deno, sem DOM. Precisa rodar nos dois ambientes.

export type WhatsappMessageDomain = "os" | "billing" | "birthday";

export type WhatsappOsTemplateEvent =
  | "criada"
  | "scheduled_reminder"
  | "a_caminho"
  | "em_andamento"
  | "concluida";

export type WhatsappBillingTemplateEvent =
  | "created"
  | "before_due"
  | "due_today"
  | "after_due";

export type WhatsappBirthdayTemplateEvent = "greeting";

export type WhatsappPresetStyle = "objective" | "cordial" | "detailed";

export type WhatsappTemplateChoice = "automatic" | WhatsappPresetStyle | "custom";

/** Limite do texto personalizado. Aviso longo vira propaganda e gera denúncia. */
export const WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH = 1000;

export type WhatsappTemplateVariableScope = "common" | WhatsappMessageDomain;

export interface WhatsappTemplateVariableMeta {
  /** Chave gravada no texto: `{{os.numero}}`. Estável, nunca traduzir. */
  key: string;
  scope: WhatsappTemplateVariableScope;
  /** Rótulo PT-BR. A tela pode traduzir pela `key`. */
  label: string;
  /** Texto usado quando o dado não existe naquela OS ou cobrança. */
  fallback: string;
  /**
   * Quando o dado não existe e não há `fallback`, a LINHA inteira sai da
   * mensagem. É o que impede "Pagar agora:" sem link no fim.
   */
  dropLineWhenEmpty: boolean;
  /**
   * `text` é dado digitado por alguém (nome, serviço): perde `* _ ~` e quebra de
   * linha para não bagunçar a formatação. `raw` é gerado pelo sistema (link,
   * valor, data) e passa intacto, porque um link pode conter `_` ou `~`.
   */
  kind: "text" | "raw";
  /** Valor ilustrativo da prévia. */
  example: string;
  /**
   * Dado da própria empresa: é o mesmo em toda mensagem e só muda quando o
   * cadastro da empresa muda. A tela mostra o valor real ao lado do nome.
   */
  fixed?: boolean;
}

export const WHATSAPP_TEMPLATE_VARIABLES: readonly WhatsappTemplateVariableMeta[] = [
  {
    key: "destinatario.nome",
    scope: "common",
    label: "Nome de quem recebe",
    fallback: "cliente",
    dropLineWhenEmpty: false,
    kind: "text",
    example: "Mariana",
  },
  {
    key: "cliente.nome",
    scope: "common",
    label: "Nome do cliente",
    fallback: "cliente",
    dropLineWhenEmpty: false,
    kind: "text",
    example: "Mariana",
  },
  {
    key: "empresa.nome",
    scope: "common",
    label: "Nome da sua empresa",
    fallback: "Sua empresa",
    dropLineWhenEmpty: false,
    kind: "text",
    example: "Clima Forte Serviços",
    fixed: true,
  },
  {
    key: "empresa.cnpj",
    scope: "common",
    label: "CNPJ da sua empresa",
    fallback: "",
    dropLineWhenEmpty: true,
    kind: "text",
    example: "12.345.678/0001-90",
    fixed: true,
  },
  {
    key: "empresa.telefone",
    scope: "common",
    label: "Telefone da sua empresa",
    fallback: "",
    dropLineWhenEmpty: true,
    kind: "text",
    example: "(62) 3333-4444",
    fixed: true,
  },
  {
    // Só tem valor quando o aviso vai para um CONTATO do cliente (ex.: o
    // síndico recebendo o aviso do condomínio). Para o próprio cliente fica
    // vazio e a linha some.
    key: "aviso.cliente",
    scope: "common",
    label: "Cliente do aviso (quando vai para um contato)",
    fallback: "",
    dropLineWhenEmpty: true,
    kind: "text",
    example: "",
  },
  {
    key: "os.numero",
    scope: "os",
    label: "Número da OS",
    fallback: "",
    dropLineWhenEmpty: false,
    kind: "raw",
    example: "#1048",
  },
  {
    key: "os.agendamento",
    scope: "os",
    label: "Data e horário da visita",
    fallback: "data a definir",
    dropLineWhenEmpty: false,
    kind: "raw",
    example: "28/10/2026, às 09:00",
  },
  {
    key: "os.data",
    scope: "os",
    label: "Data da visita",
    fallback: "data a definir",
    dropLineWhenEmpty: false,
    kind: "raw",
    example: "28/10/2026",
  },
  {
    key: "os.horario",
    scope: "os",
    label: "Horário da visita",
    fallback: "horário não informado",
    dropLineWhenEmpty: false,
    kind: "raw",
    example: "09:00",
  },
  {
    key: "os.servico",
    scope: "os",
    label: "Tipo de serviço",
    fallback: "seu atendimento",
    dropLineWhenEmpty: false,
    kind: "text",
    example: "Manutenção preventiva",
  },
  {
    key: "os.tecnico",
    scope: "os",
    label: "Nome do técnico",
    fallback: "nosso técnico",
    dropLineWhenEmpty: false,
    kind: "text",
    example: "Carlos",
  },
  {
    key: "os.equipamentos",
    scope: "os",
    label: "Equipamentos da OS",
    fallback: "seu equipamento",
    dropLineWhenEmpty: false,
    kind: "text",
    example: "Split 12.000 BTUs da sala",
  },
  {
    key: "os.link",
    scope: "os",
    label: "Link de acompanhamento da OS",
    fallback: "",
    dropLineWhenEmpty: true,
    kind: "raw",
    example: "https://www.dominex.app/os/1048",
  },
  {
    key: "cobranca.valor",
    scope: "billing",
    label: "Valor da cobrança",
    fallback: "",
    dropLineWhenEmpty: true,
    kind: "raw",
    example: "R$ 480,00",
  },
  {
    key: "cobranca.vencimento",
    scope: "billing",
    label: "Data de vencimento",
    fallback: "não informado",
    dropLineWhenEmpty: false,
    kind: "raw",
    example: "18/10/2026",
  },
  {
    key: "cobranca.link",
    scope: "billing",
    label: "Link de pagamento",
    fallback: "",
    dropLineWhenEmpty: true,
    kind: "raw",
    example: "https://www.dominex.app/pagar/8F2K9Q",
  },
  {
    key: "cobranca.dias_antes",
    scope: "billing",
    label: "Dias antes do vencimento (do lembrete)",
    fallback: "",
    dropLineWhenEmpty: false,
    kind: "raw",
    example: "3",
  },
  {
    key: "cobranca.dias_depois",
    scope: "billing",
    label: "Dias após o vencimento (do lembrete)",
    fallback: "",
    dropLineWhenEmpty: false,
    kind: "raw",
    example: "2",
  },
];

const VARIABLES_BY_KEY: Record<string, WhatsappTemplateVariableMeta> = Object.fromEntries(
  WHATSAPP_TEMPLATE_VARIABLES.map((meta) => [meta.key, meta]),
);

/** `{{ os.numero }}` com ou sem espaços. A chave é sempre `grupo.nome` minúsculo. */
const TOKEN_PATTERN = /\{\{\s*([a-z]+\.[a-z_]+)\s*\}\}/g;

export type WhatsappTemplateValues = Record<string, string | number | null | undefined>;

export function getWhatsappTemplateVariable(key: string): WhatsappTemplateVariableMeta | null {
  return VARIABLES_BY_KEY[key] ?? null;
}

/** Variáveis que podem ser usadas num aviso daquele domínio. */
export function whatsappVariablesForDomain(
  domain: WhatsappMessageDomain,
): WhatsappTemplateVariableMeta[] {
  return WHATSAPP_TEMPLATE_VARIABLES.filter(
    (meta) => meta.scope === "common" || meta.scope === domain,
  );
}

/** Chaves de variável presentes no texto, na ordem e sem repetição. */
export function listWhatsappTemplateTokens(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/**
 * Variáveis do texto que não valem para aquele domínio (ex.: `{{cobranca.valor}}`
 * num aviso de OS) ou que não existem. A tela usa para avisar antes de salvar;
 * no envio elas simplesmente saem vazias.
 */
export function findInvalidWhatsappTemplateTokens(
  template: string,
  domain: WhatsappMessageDomain,
): string[] {
  const allowed = new Set(whatsappVariablesForDomain(domain).map((meta) => meta.key));
  return listWhatsappTemplateTokens(template).filter((key) => !allowed.has(key));
}

/** Dado digitado por alguém não pode carregar formatação nem quebra de linha. */
export function sanitizeWhatsappTextValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[\r\n*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Mantém só texto visível e quebra de linha (sem regex de controle, que o lint barra). */
function stripControlChars(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 10 || (code > 31 && code !== 127)) out += char;
  }
  return out;
}

/**
 * Texto personalizado vindo do JSONB: normaliza quebras de linha, remove
 * caracteres de controle e corta no limite. Devolve `null` quando não sobra
 * texto, para o chamador cair no modelo pronto em vez de enviar mensagem vazia.
 */
export function normalizeWhatsappCustomTemplate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = stripControlChars(value.replace(/\r\n?/g, "\n"))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, WHATSAPP_CUSTOM_TEMPLATE_MAX_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

const GREETING = "Olá, {{destinatario.nome}}!";
const OS_CONTACT_NOTICE = "Aviso referente a *{{aviso.cliente}}*.";

const OS_PRESET_ACTIONS: Record<WhatsappOsTemplateEvent, Record<WhatsappPresetStyle, string>> = {
  criada: {
    objective:
      "A *{{empresa.nome}}* abriu a OS {{os.numero}} para o seu atendimento, com previsão para {{os.agendamento}}. A data e o horário podem mudar conforme a agenda do técnico.",
    cordial:
      "A *{{empresa.nome}}* já está cuidando do seu caso e agendou o seu serviço para {{os.agendamento}}. Essa data e horário podem ser alterados por imprevistos na agenda do técnico.\n\nSe precisar alterar, é só nos chamar por aqui.",
    detailed:
      "A *{{empresa.nome}}* registrou a OS {{os.numero}} para o serviço de {{os.servico}}, com previsão para {{os.agendamento}}. Essa data e horário podem ser alterados por imprevistos na agenda do técnico.\n\nSe precisar alterar, é só nos chamar por aqui.",
  },
  scheduled_reminder: {
    objective:
      "Lembrete: sua visita da OS {{os.numero}} está agendada para {{os.data}}, às {{os.horario}}.",
    cordial:
      "Passando para lembrar que sua visita da OS {{os.numero}} está agendada para {{os.data}}, às {{os.horario}}.",
    detailed:
      "Sua visita para {{os.servico}}, referente à OS {{os.numero}}, está agendada para {{os.data}}, às {{os.horario}}.",
  },
  a_caminho: {
    objective: "O técnico {{os.tecnico}} está a caminho para atender a OS {{os.numero}}.",
    cordial:
      "Boas notícias: o técnico {{os.tecnico}} já está a caminho para atender você na OS {{os.numero}}.",
    detailed:
      "O técnico {{os.tecnico}} iniciou o deslocamento para o serviço de {{os.servico}}, referente à OS {{os.numero}}.",
  },
  em_andamento: {
    objective: "O atendimento da OS {{os.numero}} foi iniciado.",
    cordial:
      "Seu atendimento começou. O técnico {{os.tecnico}} já está realizando o serviço da OS {{os.numero}}.",
    detailed:
      "O técnico {{os.tecnico}} iniciou o serviço de {{os.servico}}, referente à OS {{os.numero}}.",
  },
  concluida: {
    objective: "A OS {{os.numero}} foi concluída.",
    cordial:
      "Seu atendimento foi concluído com sucesso. Agradecemos pela confiança na nossa equipe!",
    detailed:
      "O serviço de {{os.servico}}, referente à OS {{os.numero}}, foi concluído pelo técnico {{os.tecnico}}.",
  },
};

const BILLING_PRESET_OPENINGS: Record<
  WhatsappBillingTemplateEvent,
  Record<WhatsappPresetStyle, string>
> = {
  created: {
    objective: "Você recebeu uma nova cobrança da *{{empresa.nome}}*.",
    cordial: "Passando para avisar que você recebeu uma nova cobrança da *{{empresa.nome}}*.",
    detailed: "Uma nova cobrança da *{{empresa.nome}}* foi gerada para você.",
  },
  before_due: {
    objective: "Uma cobrança da *{{empresa.nome}}* vence em {{cobranca.dias_antes}} dias.",
    cordial: "A *{{empresa.nome}}* lembra que sua cobrança vence em {{cobranca.dias_antes}} dias.",
    detailed:
      "Você possui uma cobrança da *{{empresa.nome}}* com vencimento em {{cobranca.dias_antes}} dias.",
  },
  due_today: {
    objective: "Uma cobrança da *{{empresa.nome}}* vence hoje.",
    cordial: "A *{{empresa.nome}}* lembra que sua cobrança vence hoje.",
    detailed: "Você possui uma cobrança da *{{empresa.nome}}* com vencimento hoje.",
  },
  after_due: {
    objective: "Uma cobrança da *{{empresa.nome}}* venceu há {{cobranca.dias_depois}} dias.",
    cordial: "A *{{empresa.nome}}* lembra que sua cobrança venceu há {{cobranca.dias_depois}} dias.",
    detailed:
      "Você possui uma cobrança da *{{empresa.nome}}* vencida há {{cobranca.dias_depois}} dias.",
  },
};

const BIRTHDAY_PRESET_MESSAGES: Record<WhatsappPresetStyle, string> = {
  objective: "A *{{empresa.nome}}* deseja a você um feliz aniversário!",
  cordial:
    "Hoje é um dia especial! A equipe da *{{empresa.nome}}* deseja a você um feliz aniversário, com muita saúde e realizações.",
  detailed:
    "Neste dia especial, toda a equipe da *{{empresa.nome}}* deseja a você um feliz aniversário, com saúde, felicidade e muitas conquistas. Obrigado por fazer parte da nossa história!",
};

export interface WhatsappPresetOptions {
  /** Avisos de OS: inclui a linha "Acompanhe a OS". */
  includeOsLink?: boolean;
  /** Cobranças: inclui a linha "Valor". */
  includeAmount?: boolean;
  /** Cobranças: inclui a linha "Pagar agora". */
  includePaymentLink?: boolean;
}

export function isWhatsappPresetStyle(value: unknown): value is WhatsappPresetStyle {
  return value === "objective" || value === "cordial" || value === "detailed";
}

/**
 * Modelo pronto de um aviso, já com as variáveis. É o mesmo texto que a tela
 * carrega no editor quando o cliente decide personalizar.
 */
export function buildWhatsappPresetTemplate(
  domain: WhatsappMessageDomain,
  event: string,
  style: WhatsappPresetStyle,
  options: WhatsappPresetOptions = {},
): string | null {
  if (domain === "os") {
    const action = OS_PRESET_ACTIONS[event as WhatsappOsTemplateEvent]?.[style];
    if (!action) return null;
    const blocks = [GREETING, OS_CONTACT_NOTICE, action];
    if (options.includeOsLink !== false) blocks.push("*Acompanhe a OS:* {{os.link}}");
    return blocks.join("\n\n");
  }

  if (domain === "birthday") {
    if (event !== "greeting") return null;
    return [GREETING, BIRTHDAY_PRESET_MESSAGES[style]].join("\n\n");
  }

  const opening = BILLING_PRESET_OPENINGS[event as WhatsappBillingTemplateEvent]?.[style];
  if (!opening) return null;
  const details = [
    "*Cliente:* {{aviso.cliente}}",
    options.includeAmount !== false ? "*Valor:* {{cobranca.valor}}" : null,
    "*Vencimento:* {{cobranca.vencimento}}",
    options.includePaymentLink !== false ? "*Pagar agora:* {{cobranca.link}}" : null,
  ].filter((line): line is string => line !== null);
  return [
    GREETING,
    opening,
    details.join("\n"),
    "Se você já realizou o pagamento, desconsidere esta mensagem.",
    "Em caso de dúvida, fale com a nossa equipe por aqui.",
  ].join("\n\n");
}

export interface ResolveWhatsappTemplateInput {
  domain: WhatsappMessageDomain;
  event: string;
  choice: unknown;
  customText?: unknown;
  options?: WhatsappPresetOptions;
  /**
   * Estilo usado quando a escolha é "automático". O enviador sorteia entre os
   * três para as mensagens não saírem idênticas; a prévia fixa em `cordial`.
   */
  automaticStyle?: WhatsappPresetStyle;
}

/**
 * Decide qual texto vale: o personalizado, se existir e for válido, ou o modelo
 * pronto. Texto personalizado vazio ou corrompido nunca derruba o aviso, cai no
 * modelo cordial.
 */
export function resolveWhatsappTemplate(input: ResolveWhatsappTemplateInput): string | null {
  if (input.choice === "custom") {
    const custom = normalizeWhatsappCustomTemplate(input.customText);
    if (custom) return custom;
  }
  const style: WhatsappPresetStyle = isWhatsappPresetStyle(input.choice)
    ? input.choice
    : input.choice === "automatic" || input.choice === undefined
      ? input.automaticStyle ?? "cordial"
      : "cordial";
  return buildWhatsappPresetTemplate(input.domain, input.event, style, input.options);
}

function resolveTokenValue(key: string, values: WhatsappTemplateValues): {
  text: string;
  dropLine: boolean;
} {
  const meta = VARIABLES_BY_KEY[key];
  if (!meta) return { text: "", dropLine: false };
  const raw = values[key];
  const value = meta.kind === "text"
    ? sanitizeWhatsappTextValue(raw)
    : raw === null || raw === undefined
      ? ""
      : String(raw).trim();
  if (value) return { text: value, dropLine: false };
  if (meta.fallback) return { text: meta.fallback, dropLine: false };
  return { text: "", dropLine: meta.dropLineWhenEmpty };
}

/**
 * Troca as variáveis pelos valores e devolve a mensagem final.
 *
 * - Variável sem valor usa o texto reserva do catálogo.
 * - Variável sem valor e sem reserva (links, valor) remove a linha inteira.
 * - Se o aviso vai para um contato e o texto não cita `{{aviso.cliente}}`, a
 *   identificação do cliente entra sozinha depois do primeiro parágrafo: quem
 *   recebe em nome de terceiros precisa saber de quem é o aviso.
 */
export function renderWhatsappTemplate(template: string, values: WhatsappTemplateValues): string {
  const normalized = template.replace(/\r\n?/g, "\n");
  const contactCustomer = sanitizeWhatsappTextValue(values["aviso.cliente"]);
  const mentionsContact = listWhatsappTemplateTokens(normalized).includes("aviso.cliente");

  const lines: string[] = [];
  for (const line of normalized.split("\n")) {
    let dropLine = false;
    let hadToken = false;
    const rendered = line.replace(TOKEN_PATTERN, (_match, key: string) => {
      hadToken = true;
      const resolved = resolveTokenValue(key, values);
      if (resolved.dropLine) dropLine = true;
      return resolved.text;
    });
    if (dropLine) continue;
    lines.push(hadToken ? rendered.replace(/ {2,}/g, " ").trimEnd() : rendered.trimEnd());
  }

  let message = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  if (contactCustomer && !mentionsContact) {
    const notice = `Aviso referente a *${contactCustomer}*.`;
    const firstBreak = message.indexOf("\n\n");
    message = firstBreak === -1
      ? `${notice}\n\n${message}`
      : `${message.slice(0, firstBreak)}\n\n${notice}${message.slice(firstBreak)}`;
  }

  return message;
}

/**
 * Tira do texto as linhas que só existem para identificar o cliente quando o
 * aviso vai para um contato (`{{aviso.cliente}}`). A tela usa isso para mostrar
 * o modelo pronto no editor sem uma linha que quase nunca aparece; no envio
 * real a identificação continua entrando sozinha (ver `renderWhatsappTemplate`).
 */
export function stripWhatsappContactNoticeLines(template: string): string {
  return template
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !listWhatsappTemplateTokens(line).includes("aviso.cliente"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Valores ilustrativos da prévia, tirados do próprio catálogo. */
export function whatsappTemplateExampleValues(): Record<string, string> {
  return Object.fromEntries(WHATSAPP_TEMPLATE_VARIABLES.map((meta) => [meta.key, meta.example]));
}

/**
 * Lista curta e legível dos equipamentos da OS: "A", "A e B", "A, B e C" ou
 * "A, B, C e mais 2". Mensagem de WhatsApp não comporta inventário.
 */
export function formatWhatsappEquipmentNames(names: string[]): string {
  const unique = Array.from(new Set(names.map((name) => sanitizeWhatsappTextValue(name)).filter(Boolean)));
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  if (unique.length <= 3) return `${unique.slice(0, -1).join(", ")} e ${unique[unique.length - 1]}`;
  return `${unique.slice(0, 3).join(", ")} e mais ${unique.length - 3}`;
}

/** `12345678000190` vira `12.345.678/0001-90`; qualquer outro formato passa como veio. */
export function formatWhatsappCompanyDocument(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return raw;
}

export interface WhatsappCompanyIdentityInput {
  /** `companies.name`: o nome que já assinava as cobranças. */
  name?: string | null;
  /** `companies.cnpj` e `companies.phone`. */
  cnpj?: string | null;
  phone?: string | null;
  /** `company_settings.document` e `.phone`: o que o cliente edita em Configurações, Empresa. */
  settingsDocument?: string | null;
  settingsPhone?: string | null;
}

/**
 * Valores das variáveis da própria empresa. Regra ÚNICA para o enviador e para
 * a tela: documento e telefone editados em Configurações vencem o cadastro
 * original; o nome continua vindo do cadastro, como sempre foi nas cobranças.
 */
export function resolveWhatsappCompanyValues(
  input: WhatsappCompanyIdentityInput,
): Record<"empresa.nome" | "empresa.cnpj" | "empresa.telefone", string> {
  const pick = (...values: Array<string | null | undefined>) =>
    values.map((value) => (value ?? "").trim()).find((value) => value.length > 0) ?? "";
  return {
    "empresa.nome": pick(input.name),
    "empresa.cnpj": formatWhatsappCompanyDocument(pick(input.settingsDocument, input.cnpj)),
    "empresa.telefone": pick(input.settingsPhone, input.phone),
  };
}
