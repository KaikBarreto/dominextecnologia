import { useEffect, useMemo, useState } from "react";
import { BellRing, Loader2, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeBanner } from "@/components/ui/NoticeBanner";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  useCustomerBillingEmails,
  validateCustomerBillingEmailContentOverrides,
} from "@/hooks/useCustomerBillingEmails";
import type { CustomerBillingEmailTemplate } from "@/hooks/useCustomerBillingEmails";
import type { CustomerBillingEmailContentOverrides } from "@/hooks/useCustomerBillingEmails";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CustomerBillingEmailTemplateGallery } from "./CustomerBillingEmailTemplateGallery";
import { CustomerBillingEmailContentEditor } from "./CustomerBillingEmailContentEditor";

const EVENTS = [
  ["charge_created_enabled", "Cobrança gerada"],
  ["due_reminder_enabled", "Lembrete de vencimento"],
  ["charge_overdue_enabled", "Cobrança vencida"],
  ["charge_paid_enabled", "Pagamento confirmado"],
  ["charge_refunded_enabled", "Estorno ou chargeback"],
] as const;

type EventField = (typeof EVENTS)[number][0];

export function CustomerBillingEmailsCard() {
  const { toast } = useToast();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const canManage = isAdminOrGestor() || hasPermission("fn:manage_settings");
  const { settings, isLoading, isError, update } = useCustomerBillingEmails();
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<Record<EventField, boolean>>({
    charge_created_enabled: true,
    due_reminder_enabled: true,
    charge_overdue_enabled: true,
    charge_paid_enabled: true,
    charge_refunded_enabled: true,
  });
  const [reminderDays, setReminderDays] = useState("3");
  const [senderName, setSenderName] = useState("");
  const [replyToEmail, setReplyToEmail] = useState("");
  const [templateStyle, setTemplateStyle] =
    useState<CustomerBillingEmailTemplate>("classic_light");
  const [contentOverrides, setContentOverrides] =
    useState<CustomerBillingEmailContentOverrides>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setEvents({
      charge_created_enabled: settings.charge_created_enabled,
      due_reminder_enabled: settings.due_reminder_enabled,
      charge_overdue_enabled: settings.charge_overdue_enabled,
      charge_paid_enabled: settings.charge_paid_enabled,
      charge_refunded_enabled: settings.charge_refunded_enabled,
    });
    setReminderDays(settings.reminder_days_before.join(", "));
    setSenderName(settings.sender_name ?? "");
    setReplyToEmail(settings.reply_to_email ?? "");
    setTemplateStyle(settings.template_style);
    setContentOverrides(settings.content_overrides ?? {});
  }, [settings]);

  const usagePercent = useMemo(() => {
    if (!settings?.monthly_limit) return 0;
    return Math.min(
      100,
      Math.round((settings.monthly_used / settings.monthly_limit) * 100),
    );
  }, [settings]);

  const handleSave = async () => {
    const days = [
      ...new Set(
        reminderDays
          .split(",")
          .map((value) => Number.parseInt(value.trim(), 10))
          .filter(Number.isFinite),
      ),
    ].sort((a, b) => b - a);

    if (
      days.length < 1 ||
      days.length > 5 ||
      days.some((day) => day < 0 || day > 30)
    ) {
      setValidationError(
        "Informe de 1 a 5 dias entre 0 e 30, separados por vírgula.",
      );
      return;
    }
    if (senderName.trim().length > 80) {
      setValidationError(
        "O nome do remetente pode ter no máximo 80 caracteres.",
      );
      return;
    }
    if (
      replyToEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToEmail.trim())
    ) {
      setValidationError("Informe um e-mail de resposta válido.");
      return;
    }
    const contentError =
      validateCustomerBillingEmailContentOverrides(contentOverrides);
    if (contentError) {
      setValidationError(contentError);
      return;
    }

    setValidationError(null);
    try {
      await update.mutateAsync({
        enabled,
        ...events,
        reminder_days_before: days,
        sender_name: senderName,
        reply_to_email: replyToEmail,
        template_style: templateStyle,
        content_overrides: contentOverrides,
      });
      toast({ title: "Notificações por e-mail atualizadas." });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Não foi possível salvar as notificações por e-mail.",
        description:
          error instanceof Error
            ? error.message
            : "Tente novamente em instantes.",
      });
    }
  };

  if (isLoading) {
    return (
      <section className="flex min-h-28 items-center justify-center rounded-2xl bg-muted/30 p-5">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (isError || !settings) {
    return (
      <NoticeBanner
        variant="warning"
        title="Notificações por e-mail indisponíveis"
      >
        Não foi possível carregar esta configuração. Tente novamente em
        instantes.
      </NoticeBanner>
    );
  }

  return (
    <section className="space-y-5 rounded-2xl bg-muted/30 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl bg-primary p-2 text-primary-foreground">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold">
              Automação de cobranças por e-mail
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              A Dominex envia novas cobranças com seu nome e seu modelo visual.
              Os avisos nativos do Asaas ficam desativados nesses novos envios.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!canManage || update.isPending}
          aria-label="Ativar e-mails de cobrança pela Dominex"
          className="mt-1 shrink-0"
        />
      </div>

      {!canManage && (
        <NoticeBanner variant="info" title="Configuração somente para gestores">
          Seu perfil pode consultar esta configuração, mas não pode alterá-la.
        </NoticeBanner>
      )}

      {!enabled && canManage && (
        <NoticeBanner
          variant="info"
          title="Desativação sem cobrança retroativa"
        >
          A fila pendente será cancelada. Os avisos pagos do Asaas não serão
          reativados automaticamente.
        </NoticeBanner>
      )}

      {enabled && (
        <NoticeBanner variant="info" title="Quem recebe estes avisos">
          Clientes sem personalização recebem no e-mail principal. Para escolher
          contatos e eventos diferentes, ajuste os destinatários na ficha de cada
          cliente. Cobranças anteriores à ativação não são enviadas.
        </NoticeBanner>
      )}

      <div className="space-y-2 rounded-xl bg-background/70 p-3.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium">Franquia mensal</span>
          <span className="tabular-nums text-muted-foreground">
            {settings.monthly_used} de {settings.monthly_limit} enviados
          </span>
        </div>
        <Progress value={usagePercent} className="h-2" />
        {settings.monthly_limit === 0 && (
          <p className="text-xs text-destructive">
            Seu plano não possui franquia de e-mails disponível.
          </p>
        )}
      </div>

      <CustomerBillingEmailTemplateGallery
        value={templateStyle}
        onChange={setTemplateStyle}
        disabled={!canManage || !enabled || update.isPending}
      />

      <CustomerBillingEmailContentEditor
        value={contentOverrides}
        onChange={setContentOverrides}
        disabled={!canManage || !enabled || update.isPending}
      />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs font-semibold">Quando enviar</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {EVENTS.map(([field, label]) => (
            <label
              key={field}
              className="flex items-center justify-between gap-3 rounded-xl bg-background/60 px-3 py-2.5"
            >
              <span className="text-xs font-medium">{label}</span>
              <Switch
                checked={events[field]}
                onCheckedChange={(checked) =>
                  setEvents((current) => ({ ...current, [field]: checked }))
                }
                disabled={!canManage || !enabled || update.isPending}
                aria-label={label}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="customer-email-sender" className="text-xs">
            Nome do remetente
          </Label>
          <Input
            id="customer-email-sender"
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
            disabled={!canManage || !enabled || update.isPending}
            placeholder="Nome da sua empresa"
            maxLength={80}
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            O endereço de envio usa o domínio verificado da Dominex.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="customer-email-reply-to" className="text-xs">
            Responder para
          </Label>
          <Input
            id="customer-email-reply-to"
            type="email"
            value={replyToEmail}
            onChange={(event) => setReplyToEmail(event.target.value)}
            disabled={!canManage || !enabled || update.isPending}
            placeholder="financeiro@suaempresa.com.br"
            className="h-9 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="customer-email-reminder-days" className="text-xs">
          Lembretes antes do vencimento
        </Label>
        <Input
          id="customer-email-reminder-days"
          value={reminderDays}
          onChange={(event) =>
            setReminderDays(event.target.value.replace(/[^0-9, ]/g, ""))
          }
          disabled={
            !canManage ||
            !enabled ||
            !events.due_reminder_enabled ||
            update.isPending
          }
          placeholder="7, 3, 1"
          className="h-9 max-w-52 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">
          Separe por vírgula. Use 0 para enviar no dia do vencimento.
        </p>
      </div>

      {validationError && (
        <p className="text-xs text-destructive">{validationError}</p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          Envios com fila, retentativa e proteção contra duplicidade.
        </p>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={
            !canManage ||
            update.isPending ||
            (enabled && settings.monthly_limit === 0)
          }
          className="w-full sm:w-auto"
        >
          {update.isPending && (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          )}
          Salvar notificações
        </Button>
      </div>
    </section>
  );
}
