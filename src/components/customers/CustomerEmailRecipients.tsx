import { useEffect, useMemo, useState } from 'react';
import { BellOff, Check, Loader2, Mail, MailWarning, Save } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { CustomerContact } from '@/hooks/useCustomerContacts';
import {
  CUSTOMER_EMAIL_EVENTS,
  customerEmailRouteSelection,
  isCustomerEmailValid,
  type CustomerEmailEvent,
  type CustomerEmailRecipientKind,
  type CustomerEmailRoute,
  type CustomerEmailRecipientSelection,
  type SaveCustomerEmailRouteInput,
} from '@/hooks/useCustomerEmailRoutes';

const EVENT_LABELS: Record<CustomerEmailEvent, string> = {
  charge_created: 'Cobrança gerada',
  charge_due_reminder: 'Lembrete de vencimento',
  charge_overdue: 'Cobrança vencida',
  charge_paid: 'Pagamento confirmado',
  charge_refunded: 'Estorno ou chargeback',
};

interface RecipientCandidate {
  kind: CustomerEmailRecipientKind;
  contactId: string | null;
  name: string;
  email?: string | null;
  position?: string | null;
}

interface CustomerEmailRecipientsProps {
  customerId: string;
  primaryName: string;
  primaryEmail?: string | null;
  contacts: CustomerContact[];
  route?: CustomerEmailRoute;
  isLoading: boolean;
  isError: boolean;
  isSaving: boolean;
  channelEnabled: boolean;
  globallyEnabledEvents: CustomerEmailEvent[];
  canEdit: boolean;
  onRetry: () => void;
  onSave: (input: SaveCustomerEmailRouteInput) => Promise<unknown>;
}

function selectionKey(kind: CustomerEmailRecipientKind, contactId: string | null) {
  return `${kind}:${contactId ?? 'primary'}`;
}

function normalizeSelections(selections: CustomerEmailRecipientSelection[]) {
  return selections
    .map((recipient) => ({
      ...recipient,
      events: [...recipient.events].sort(),
    }))
    .sort((a, b) => selectionKey(a.kind, a.contactId).localeCompare(selectionKey(b.kind, b.contactId)));
}

export function CustomerEmailRecipients({
  customerId,
  primaryName,
  primaryEmail,
  contacts,
  route,
  isLoading,
  isError,
  isSaving,
  channelEnabled,
  globallyEnabledEvents,
  canEdit,
  onRetry,
  onSave,
}: CustomerEmailRecipientsProps) {
  const { toast } = useToast();
  const initial = useMemo(() => customerEmailRouteSelection(route), [route]);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [recipients, setRecipients] = useState<CustomerEmailRecipientSelection[]>(initial.recipients);

  useEffect(() => {
    setEnabled(initial.enabled);
    setRecipients(initial.recipients);
  }, [initial, customerId]);

  const candidates = useMemo<RecipientCandidate[]>(() => [
    {
      kind: 'customer_primary',
      contactId: null,
      name: primaryName,
      email: primaryEmail,
    },
    ...contacts.map((contact) => ({
      kind: 'customer_contact' as const,
      contactId: contact.id,
      name: contact.name,
      email: contact.email,
      position: contact.position,
    })),
  ], [contacts, primaryEmail, primaryName]);

  const candidateKeys = new Set(candidates.map((candidate) => selectionKey(candidate.kind, candidate.contactId)));
  const effectiveRecipients = recipients.filter((recipient) => {
    const candidate = candidates.find((item) => selectionKey(item.kind, item.contactId) === selectionKey(recipient.kind, recipient.contactId));
    return candidateKeys.has(selectionKey(recipient.kind, recipient.contactId))
      && isCustomerEmailValid(candidate?.email)
      && recipient.events.length > 0;
  });
  const invalid = enabled && effectiveRecipients.length === 0;
  const dirty = enabled !== initial.enabled
    || JSON.stringify(normalizeSelections(effectiveRecipients)) !== JSON.stringify(normalizeSelections(initial.recipients));

  const selectedRecipient = (candidate: RecipientCandidate) => recipients.find(
    (recipient) => selectionKey(recipient.kind, recipient.contactId) === selectionKey(candidate.kind, candidate.contactId),
  );

  const toggleRecipient = (candidate: RecipientCandidate, checked: boolean) => {
    const key = selectionKey(candidate.kind, candidate.contactId);
    setRecipients((current) => checked
      ? [
          ...current.filter((recipient) => selectionKey(recipient.kind, recipient.contactId) !== key),
          {
            kind: candidate.kind,
            contactId: candidate.contactId,
            events: [...globallyEnabledEvents],
          },
        ]
      : current.filter((recipient) => selectionKey(recipient.kind, recipient.contactId) !== key));
  };

  const toggleEvent = (candidate: RecipientCandidate, event: CustomerEmailEvent, checked: boolean) => {
    const key = selectionKey(candidate.kind, candidate.contactId);
    setRecipients((current) => current.map((recipient) => {
      if (selectionKey(recipient.kind, recipient.contactId) !== key) return recipient;
      return {
        ...recipient,
        events: checked
          ? Array.from(new Set([...recipient.events, event]))
          : recipient.events.filter((item) => item !== event),
      };
    }));
  };

  const save = async () => {
    if (invalid) return;
    try {
      await onSave({
        enabled,
        recipients: enabled ? effectiveRecipients : [],
      });
      toast({ title: 'Destinatários de e-mail atualizados.' });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar os destinatários de e-mail.',
      });
    }
  };

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/50" aria-label="Carregando destinatários de e-mail" />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <MailWarning className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>Não foi possível confirmar os destinatários de e-mail. Nenhuma configuração foi presumida por segurança.</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-muted/25 p-3 sm:p-4" data-testid="customer-email-recipients">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Mail className="h-4 w-4" /> Destinatários por e-mail
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Escolha quem recebe os avisos financeiros e personalize os eventos de cada e-mail.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!canEdit || isSaving}
          aria-label="Enviar avisos financeiros por e-mail para este cliente"
        />
      </div>

      {!channelEnabled && (
        <Alert>
          <BellOff className="h-4 w-4" />
          <AlertDescription>
            O canal de e-mail está desativado em Integrações. As escolhas podem ser preparadas, mas nenhum aviso será enviado.
          </AlertDescription>
        </Alert>
      )}

      {!initial.explicit && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Padrão atual: o e-mail principal recebe todos os eventos ativos na integração até esta área ser personalizada.
        </p>
      )}

      {enabled && (
        <div className="space-y-3">
          {candidates.map((candidate) => {
            const valid = isCustomerEmailValid(candidate.email);
            const selection = selectedRecipient(candidate);
            const selected = Boolean(selection) && valid;
            return (
              <section
                key={selectionKey(candidate.kind, candidate.contactId)}
                className={cn('rounded-xl bg-background/70 p-3', !valid && 'opacity-55')}
              >
                <label className="flex min-h-10 items-center gap-3 text-sm">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={(checked) => toggleRecipient(candidate, checked === true)}
                    disabled={!canEdit || isSaving || !valid}
                    aria-label={`E-mail: ${candidate.name}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium">
                      {candidate.kind === 'customer_primary' ? `E-mail principal · ${candidate.name}` : candidate.name}
                      {candidate.kind === 'customer_primary' && <Badge variant="outline" className="text-[10px]">Principal</Badge>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {valid ? [candidate.position, candidate.email].filter(Boolean).join(' · ') : 'Sem e-mail válido'}
                    </span>
                  </span>
                </label>

                {selected && (
                  <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">
                    {CUSTOMER_EMAIL_EVENTS.map((event) => {
                      const globallyEnabled = globallyEnabledEvents.includes(event);
                      const eventChecked = selection?.events.includes(event) ?? false;
                      return (
                        <label key={event} className={cn('flex items-center gap-2 text-xs', !globallyEnabled && 'opacity-50')}>
                          <Checkbox
                            checked={eventChecked && globallyEnabled}
                            onCheckedChange={(checked) => toggleEvent(candidate, event, checked === true)}
                            disabled={!canEdit || isSaving || !globallyEnabled}
                            aria-label={`${candidate.name}: ${EVENT_LABELS[event]}`}
                          />
                          <span>
                            {EVENT_LABELS[event]}
                            {!globallyEnabled && ' · desativado na integração'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {contacts.length === 0 && enabled && (
        <p className="px-1 text-xs text-muted-foreground">
          Cadastre contatos com e-mail para escolher outros destinatários.
        </p>
      )}

      {invalid && (
        <p className="flex items-center gap-2 text-xs font-medium text-destructive">
          <MailWarning className="h-4 w-4" /> Selecione ao menos um e-mail e um evento, ou desative os avisos deste cliente.
        </p>
      )}
      {!canEdit && (
        <p className="text-xs text-muted-foreground">
          Você pode consultar esta configuração, mas não possui permissão para alterá-la.
        </p>
      )}

      {canEdit && dirty && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isSaving || invalid}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar destinatários
          </Button>
        </div>
      )}

      {!dirty && initial.explicit && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Check className="h-3.5 w-3.5" /> Configuração personalizada salva.
        </p>
      )}
    </div>
  );
}
