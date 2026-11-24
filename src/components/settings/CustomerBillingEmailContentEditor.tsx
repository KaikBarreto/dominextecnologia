import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Link2, RotateCcw, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HorizontalTabBar } from "@/components/ui/HorizontalTabBar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  CustomerBillingEmailContentField,
  CustomerBillingEmailContentOverrides,
  CustomerBillingEmailEvent,
} from "@/hooks/useCustomerBillingEmails";

type Content = Record<CustomerBillingEmailContentField, string>;

const EVENTS: Array<{ id: CustomerBillingEmailEvent; label: string }> = [
  { id: "charge_created", label: "Cobrança gerada" },
  { id: "charge_due_reminder", label: "Lembrete" },
  { id: "charge_overdue", label: "Vencida" },
  { id: "charge_paid", label: "Pagamento confirmado" },
  { id: "charge_refunded", label: "Estorno" },
];

const CUSTOMER_BILLING_EMAIL_DEFAULT_CONTENT: Record<
  CustomerBillingEmailEvent,
  Content
> = {
  charge_created: {
    subject: "Nova cobrança de {{empresa}}",
    eyebrow: "NOVA COBRANÇA",
    title: "Sua cobrança foi gerada",
    intro: "Olá, {{cliente}}. A {{empresa}} gerou uma nova cobrança para você.",
  },
  charge_due_reminder: {
    subject: "Lembrete de vencimento — {{empresa}}",
    eyebrow: "LEMBRETE DE VENCIMENTO",
    title: "Sua cobrança vence em breve",
    intro:
      "Olá, {{cliente}}. Este é um lembrete sobre uma cobrança da {{empresa}}.",
  },
  charge_overdue: {
    subject: "Cobrança vencida — {{empresa}}",
    eyebrow: "COBRANÇA VENCIDA",
    title: "Identificamos uma cobrança em atraso",
    intro:
      "Olá, {{cliente}}. A cobrança abaixo, emitida pela {{empresa}}, está vencida.",
  },
  charge_paid: {
    subject: "Pagamento confirmado — {{empresa}}",
    eyebrow: "PAGAMENTO CONFIRMADO",
    title: "Recebemos seu pagamento",
    intro:
      "Olá, {{cliente}}. A {{empresa}} confirmou o recebimento do seu pagamento.",
  },
  charge_refunded: {
    subject: "Atualização sobre sua cobrança — {{empresa}}",
    eyebrow: "ATUALIZAÇÃO DA COBRANÇA",
    title: "Houve uma atualização na sua cobrança",
    intro:
      "Olá, {{cliente}}. A {{empresa}} registrou uma atualização de estorno ou contestação relacionada à cobrança abaixo.",
  },
};

const FIELDS: Array<{
  id: CustomerBillingEmailContentField;
  label: string;
  maxLength: number;
  multiline?: boolean;
}> = [
  { id: "subject", label: "Assunto", maxLength: 150 },
  { id: "eyebrow", label: "Chamada", maxLength: 80 },
  { id: "title", label: "Título", maxLength: 120 },
  { id: "intro", label: "Mensagem", maxLength: 400, multiline: true },
];

const VARIABLES = [
  ["{{cliente}}", "Cliente"],
  ["{{empresa}}", "Empresa"],
  ["{{valor}}", "Valor"],
  ["{{vencimento}}", "Vencimento"],
] as const;

const PREVIEW_VALUES: Record<string, string> = {
  cliente: "Maria Oliveira",
  empresa: "KGIE Climatização",
  valor: "R$ 1.234,50",
  vencimento: "30/11/2026",
};

function interpolatePreview(value: string) {
  return value.replace(
    /\{\{([a-z_]+)\}\}/gi,
    (match, name: string) => PREVIEW_VALUES[name.toLowerCase()] ?? match,
  );
}

function renderPreviewLinks(value: string): ReactNode[] {
  const pattern = /\[([^\]\r\n]{1,80})\]\((https:\/\/[^\s<>"']{1,2048})\)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    try {
      const url = new URL(match[2]);
      if (url.protocol !== "https:") throw new Error("invalid_protocol");
      nodes.push(
        <a
          key={`${index}-${url.toString()}`}
          href={url.toString()}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-foreground underline underline-offset-2"
        >
          {match[1]}
        </a>,
      );
    } catch {
      nodes.push(match[0]);
    }
    cursor = index + match[0].length;
  }

  nodes.push(value.slice(cursor));
  return nodes;
}

function eventContent(
  value: CustomerBillingEmailContentOverrides,
  event: CustomerBillingEmailEvent,
): Content {
  return { ...CUSTOMER_BILLING_EMAIL_DEFAULT_CONTENT[event], ...value[event] };
}

interface CustomerBillingEmailContentEditorProps {
  value: CustomerBillingEmailContentOverrides;
  onChange: (value: CustomerBillingEmailContentOverrides) => void;
  disabled?: boolean;
}

export function CustomerBillingEmailContentEditor({
  value,
  onChange,
  disabled = false,
}: CustomerBillingEmailContentEditorProps) {
  const [activeEvent, setActiveEvent] =
    useState<CustomerBillingEmailEvent>("charge_created");
  const [activeField, setActiveField] =
    useState<CustomerBillingEmailContentField>("intro");
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("https://");
  const [linkError, setLinkError] = useState<string | null>(null);
  const fieldRefs = useRef<
    Partial<
      Record<
        CustomerBillingEmailContentField,
        HTMLInputElement | HTMLTextAreaElement | null
      >
    >
  >({});
  const content = eventContent(value, activeEvent);
  const customized = Boolean(
    value[activeEvent] && Object.keys(value[activeEvent] ?? {}).length,
  );

  const preview = useMemo(
    () => ({
      subject: interpolatePreview(content.subject),
      eyebrow: interpolatePreview(content.eyebrow),
      title: interpolatePreview(content.title),
      intro: interpolatePreview(content.intro),
    }),
    [content],
  );

  const updateField = (
    field: CustomerBillingEmailContentField,
    next: string,
  ) => {
    const defaults = CUSTOMER_BILLING_EMAIL_DEFAULT_CONTENT[activeEvent];
    const nextEvent = { ...(value[activeEvent] ?? {}) };
    if (next === defaults[field]) delete nextEvent[field];
    else nextEvent[field] = next;

    const nextValue = { ...value };
    if (Object.keys(nextEvent).length) nextValue[activeEvent] = nextEvent;
    else delete nextValue[activeEvent];
    onChange(nextValue);
  };

  const insertAtField = (
    targetField: CustomerBillingEmailContentField,
    text: string,
  ) => {
    const field = fieldRefs.current[targetField];
    const current = content[targetField];
    const start = field?.selectionStart ?? current.length;
    const end = field?.selectionEnd ?? start;
    updateField(
      targetField,
      `${current.slice(0, start)}${text}${current.slice(end)}`,
    );
    window.setTimeout(() => {
      fieldRefs.current[targetField]?.focus();
      fieldRefs.current[targetField]?.setSelectionRange(
        start + text.length,
        start + text.length,
      );
    }, 0);
  };

  const insertVariable = (variable: string) =>
    insertAtField(activeField, variable);

  const prepareLink = () => {
    const field = fieldRefs.current.intro;
    const current = content.intro;
    const start = field?.selectionStart ?? current.length;
    const end = field?.selectionEnd ?? start;
    setActiveField("intro");
    setLinkLabel(current.slice(start, end) || "Saiba mais");
    setLinkUrl("https://");
    setLinkError(null);
  };

  const insertLink = () => {
    const label = linkLabel.trim().split("[").join("").split("]").join("");
    let normalizedUrl: string;
    try {
      const url = new URL(linkUrl.trim());
      if (url.protocol !== "https:") throw new Error("invalid_protocol");
      normalizedUrl = url.toString();
    } catch {
      setLinkError("Informe um endereço completo começando com https://.");
      return;
    }
    if (!label) {
      setLinkError("Informe o texto que será exibido no link.");
      return;
    }
    insertAtField("intro", `[${label}](${normalizedUrl})`);
    setLinkEditorOpen(false);
    setLinkError(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Type
              className="h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-xs font-semibold">Conteúdo dos e-mails</p>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            Personalize o texto de cada evento. Valores, botões e identidade
            visual continuam automáticos.
          </p>
        </div>
        {customized && (
          <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
            Personalizado
          </span>
        )}
      </div>

      <HorizontalTabBar
        wrapTabs={false}
        viewportClassName="flex border-b"
        viewportProps={{ role: "tablist", "aria-label": "Evento do e-mail" }}
      >
        {EVENTS.map((event) => (
          <button
            key={event.id}
            type="button"
            role="tab"
            aria-selected={activeEvent === event.id}
            onClick={() => setActiveEvent(event.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              activeEvent === event.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {event.label}
          </button>
        ))}
      </HorizontalTabBar>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
        <div className="space-y-3">
          {FIELDS.map((field) => {
            const commonProps = {
              id: `customer-email-content-${activeEvent}-${field.id}`,
              value: content[field.id],
              maxLength: field.maxLength,
              disabled,
              onFocus: () => setActiveField(field.id),
              onChange: (
                event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
              ) => updateField(field.id, event.target.value),
            };
            return (
              <div key={field.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor={commonProps.id} className="text-xs">
                    {field.label}
                  </Label>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {content[field.id].length}/{field.maxLength}
                  </span>
                </div>
                {field.multiline ? (
                  <Textarea
                    {...commonProps}
                    ref={(node) => {
                      fieldRefs.current[field.id] = node;
                    }}
                    rows={4}
                    className="min-h-24 resize-y text-sm"
                  />
                ) : (
                  <Input
                    {...commonProps}
                    ref={(node) => {
                      fieldRefs.current[field.id] = node;
                    }}
                    className="h-10 text-sm"
                  />
                )}
              </div>
            );
          })}

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium">
              Inserir variável no campo selecionado
            </p>
            <div className="flex flex-wrap gap-2">
              {VARIABLES.map(([variable, label]) => (
                <Button
                  key={variable}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  onClick={() => insertVariable(variable)}
                  className="h-8 px-2.5 text-[11px]"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <Popover open={linkEditorOpen} onOpenChange={setLinkEditorOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={prepareLink}
                className="h-8 px-2.5 text-[11px]"
              >
                <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Adicionar link à mensagem
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-3 p-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold">Adicionar link</p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  O link será inserido no campo Mensagem e aceitará somente
                  endereços seguros.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-email-link-label" className="text-xs">
                  Texto do link
                </Label>
                <Input
                  id="customer-email-link-label"
                  value={linkLabel}
                  onChange={(event) => setLinkLabel(event.target.value)}
                  maxLength={80}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customer-email-link-url" className="text-xs">
                  Endereço
                </Label>
                <Input
                  id="customer-email-link-url"
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://suaempresa.com.br"
                  maxLength={2048}
                  className="h-9 text-sm"
                />
              </div>
              {linkError && (
                <p className="text-[11px] text-destructive">{linkError}</p>
              )}
              <Button
                type="button"
                size="sm"
                onClick={insertLink}
                className="h-8 w-full text-xs"
              >
                Inserir link
              </Button>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || !customized}
            onClick={() => {
              const next = { ...value };
              delete next[activeEvent];
              onChange(next);
            }}
            className="h-8 px-2 text-xs"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Restaurar padrão deste evento
          </Button>
        </div>

        <aside
          className="rounded-xl bg-background/70 p-4"
          aria-label="Prévia do conteúdo"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Prévia
          </p>
          <p className="mt-2 break-words text-[11px] text-muted-foreground">
            Assunto: {preview.subject}
          </p>
          <div className="mt-4 border-l-4 border-primary pl-4">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
              {preview.eyebrow}
            </p>
            <p className="mt-1.5 text-lg font-extrabold leading-tight">
              {preview.title}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {renderPreviewLinks(preview.intro)}
            </p>
          </div>
          <div className="mt-4 rounded-lg bg-muted/55 px-3 py-2.5 text-[11px] text-muted-foreground">
            Valor, vencimento, Pix, boleto e link de pagamento entram
            automaticamente no envio.
          </div>
        </aside>
      </div>
    </div>
  );
}
