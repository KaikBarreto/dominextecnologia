import { useEffect, useMemo, useState } from 'react';
import { Banknote, BellOff, Check, Loader2, MessageCircleWarning, Save, Wrench } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { cn } from '@/lib/utils';
import {
  customerWhatsappRouteSelection,
  isWhatsappPhoneOptedOut,
  isWhatsappRecipientPhoneValid,
  type CustomerWhatsappRoute,
  type CustomerWhatsappRouteCategory,
  type SaveCustomerWhatsappRouteInput,
} from '@/hooks/useCustomerWhatsappRoutes';
import type { CustomerContact } from '@/hooks/useCustomerContacts';

interface CustomerWhatsappRecipientsProps {
  customerId: string;
  primaryName: string;
  primaryPhone?: string | null;
  contacts: CustomerContact[];
  routes: CustomerWhatsappRoute[];
  isLoading: boolean;
  isError: boolean;
  isSaving: boolean;
  customerAutomationEnabled: boolean;
  optedOutPhones: string[];
  canEditOperational: boolean;
  canViewFinancial: boolean;
  canEditFinancial: boolean;
  onRetry: () => void;
  onSave: (input: SaveCustomerWhatsappRouteInput) => Promise<unknown>;
}
const COPY = {
  'pt-br': {
    title: 'Destinatários automáticos',
    description: 'Escolha livremente quem recebe cada tipo de mensagem. O cargo do contato é apenas informativo.',
    disabledMaster: 'As mensagens automáticas estão desativadas no cadastro deste cliente. As escolhas podem ser preparadas, mas nenhum aviso será enviado até a ativação.',
    legacy: 'Padrão atual: o contato principal recebe enquanto esta categoria não for personalizada.',
    explicit: 'Configuração personalizada',
    default: 'Padrão',
    enabled: 'Enviar mensagens',
    primary: 'Contato principal',
    noPhone: 'Sem telefone válido',
    optedOut: 'Este número pediu para não receber mensagens',
    noContacts: 'Cadastre contatos com telefone para escolher outros destinatários.',
    selectOne: 'Selecione ao menos um destinatário ou desative esta categoria.',
    save: 'Salvar destinatários',
    saved: 'Destinatários atualizados',
    saveError: 'Não foi possível salvar os destinatários.',
    readOnly: 'Você pode consultar esta configuração, mas não possui permissão para alterá-la.',
    loadError: 'Não foi possível confirmar os destinatários. Nenhuma configuração foi presumida por segurança.',
    retry: 'Tentar novamente',
    categories: {
      service_order: ['Ordens de serviço', 'Visitas, técnico a caminho, início e conclusão da OS'],
      billing: ['Financeiro', 'Cobranças, vencimentos e links de pagamento'],
    },
  },
  en: {
    title: 'Automatic recipients', description: 'Choose who receives each message type. Contact roles are informational only.',
    disabledMaster: 'Automatic messages are disabled for this customer. You may prepare the choices, but no notice will be sent until activation.',
    legacy: 'Current default: the primary contact receives messages until this category is customized.', explicit: 'Custom setup', default: 'Default', enabled: 'Send messages',
    primary: 'Primary contact', noPhone: 'No valid phone', optedOut: 'This number opted out of messages', noContacts: 'Add contacts with a phone number to choose other recipients.',
    selectOne: 'Select at least one recipient or disable this category.', save: 'Save recipients', saved: 'Recipients updated', saveError: 'Could not save recipients.',
    readOnly: 'You can view this setup, but you do not have permission to change it.',
    loadError: 'Recipients could not be confirmed. No setup was assumed for safety.', retry: 'Try again',
    categories: { service_order: ['Work orders', 'Visits, technician on the way, start and completion'], billing: ['Financial', 'Charges, due dates and payment links'] },
  },
  es: {
    title: 'Destinatarios automáticos', description: 'Elige quién recibe cada tipo de mensaje. El cargo es solo informativo.',
    disabledMaster: 'Los mensajes automáticos están desactivados para este cliente. Puedes preparar la selección, pero no se enviará ningún aviso hasta activarlos.',
    legacy: 'Configuración actual: el contacto principal recibe mientras esta categoría no se personalice.', explicit: 'Configuración personalizada', default: 'Predeterminado', enabled: 'Enviar mensajes',
    primary: 'Contacto principal', noPhone: 'Sin teléfono válido', optedOut: 'Este número pidió no recibir mensajes', noContacts: 'Agrega contactos con teléfono para elegir otros destinatarios.',
    selectOne: 'Selecciona al menos un destinatario o desactiva esta categoría.', save: 'Guardar destinatarios', saved: 'Destinatarios actualizados', saveError: 'No se pudieron guardar los destinatarios.',
    readOnly: 'Puedes consultar esta configuración, pero no tienes permiso para cambiarla.',
    loadError: 'No se pudieron confirmar los destinatarios. No se asumió ninguna configuración por seguridad.', retry: 'Intentar nuevamente',
    categories: { service_order: ['Órdenes de servicio', 'Visitas, técnico en camino, inicio y finalización'], billing: ['Financiero', 'Cobros, vencimientos y enlaces de pago'] },
  },
  fr: {
    title: 'Destinataires automatiques', description: 'Choisissez qui reçoit chaque type de message. Le poste du contact est uniquement informatif.',
    disabledMaster: 'Les messages automatiques sont désactivés pour ce client. Les choix peuvent être préparés, mais aucun avis ne sera envoyé avant activation.',
    legacy: 'Réglage actuel : le contact principal reçoit les messages tant que cette catégorie n’est pas personnalisée.', explicit: 'Configuration personnalisée', default: 'Par défaut', enabled: 'Envoyer les messages',
    primary: 'Contact principal', noPhone: 'Aucun téléphone valide', optedOut: 'Ce numéro a demandé à ne plus recevoir de messages', noContacts: 'Ajoutez des contacts avec un téléphone pour choisir d’autres destinataires.',
    selectOne: 'Sélectionnez au moins un destinataire ou désactivez cette catégorie.', save: 'Enregistrer les destinataires', saved: 'Destinataires mis à jour', saveError: 'Impossible d’enregistrer les destinataires.',
    readOnly: 'Vous pouvez consulter cette configuration, mais vous n’avez pas l’autorisation de la modifier.',
    loadError: 'Impossible de confirmer les destinataires. Aucun réglage n’a été supposé par sécurité.', retry: 'Réessayer',
    categories: { service_order: ['Ordres de service', 'Visites, technicien en route, début et fin'], billing: ['Financier', 'Factures, échéances et liens de paiement'] },
  },
} as const;

interface CategoryEditorProps {
  category: CustomerWhatsappRouteCategory;
  route?: CustomerWhatsappRoute;
  primaryName: string;
  primaryPhone?: string | null;
  contacts: CustomerContact[];
  optedOutPhones: string[];
  canEdit: boolean;
  isSaving: boolean;
  onSave: CustomerWhatsappRecipientsProps['onSave'];
}

function CategoryEditor({ category, route, primaryName, primaryPhone, contacts, optedOutPhones, canEdit, isSaving, onSave }: CategoryEditorProps) {
  const { locale, countryCode } = useAppLocaleContext();
  const copy = COPY[locale];
  const { toast } = useToast();
  const initial = useMemo(() => customerWhatsappRouteSelection(route), [route]);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [includePrimary, setIncludePrimary] = useState(initial.includePrimary);
  const [contactIds, setContactIds] = useState<string[]>(initial.contactIds);

  useEffect(() => {
    setEnabled(initial.enabled);
    setIncludePrimary(initial.includePrimary);
    setContactIds(initial.contactIds);
  }, [initial]);

  const primaryOptedOut = isWhatsappPhoneOptedOut(primaryPhone, optedOutPhones, countryCode);
  const primaryValid = isWhatsappRecipientPhoneValid(primaryPhone, countryCode) && !primaryOptedOut;
  const eligibleContactIds = contacts
    .filter((contact) => isWhatsappRecipientPhoneValid(contact.phone, countryCode)
      && !isWhatsappPhoneOptedOut(contact.phone, optedOutPhones, countryCode))
    .map((contact) => contact.id);
  const effectiveIncludePrimary = includePrimary && primaryValid;
  const effectiveContactIds = contactIds.filter((id) => eligibleContactIds.includes(id));
  const selectedCount = (effectiveIncludePrimary ? 1 : 0) + effectiveContactIds.length;
  const invalid = enabled && selectedCount === 0;
  const dirty = enabled !== initial.enabled
    || effectiveIncludePrimary !== initial.includePrimary
    || [...effectiveContactIds].sort().join(',') !== [...initial.contactIds].sort().join(',');
  const Icon = category === 'service_order' ? Wrench : Banknote;
  const [title, description] = copy.categories[category];

  const toggleContact = (contactId: string, checked: boolean) => {
    setContactIds((current) => checked
      ? Array.from(new Set([...current, contactId]))
      : current.filter((id) => id !== contactId));
  };

  const save = async () => {
    if (invalid) return;
    try {
      await onSave({
        category,
        enabled,
        includePrimary: enabled && effectiveIncludePrimary,
        contactIds: enabled ? effectiveContactIds : [],
      });
      toast({ title: copy.saved });
    } catch {
      toast({
        variant: 'destructive',
        title: copy.saveError,
      });
    }
  };

  return (
    <section className="rounded-xl border bg-background p-3 sm:p-4" data-testid={`whatsapp-route-${category}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{title}</p>
              <Badge variant={initial.explicit ? 'default' : 'outline'} className="text-[10px]">
                {initial.explicit ? copy.explicit : copy.default}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={setEnabled}
          disabled={!canEdit || isSaving}
          aria-label={`${copy.enabled}: ${title}`}
        />
      </div>

      {!initial.explicit && (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{copy.legacy}</p>
      )}

      {enabled && (
        <div className="mt-3 space-y-2">
          <label className={cn(
            'flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm',
            !primaryValid && 'opacity-55',
          )}>
            <Checkbox
              checked={effectiveIncludePrimary}
              onCheckedChange={(checked) => setIncludePrimary(checked === true)}
              disabled={!canEdit || isSaving || !primaryValid}
              aria-label={`${copy.primary}: ${primaryName}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{copy.primary} · {primaryName}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {primaryOptedOut ? copy.optedOut : primaryPhone || copy.noPhone}
              </span>
            </span>
          </label>

          {contacts.map((contact) => {
            const phoneValid = isWhatsappRecipientPhoneValid(contact.phone, countryCode);
            const optedOut = isWhatsappPhoneOptedOut(contact.phone, optedOutPhones, countryCode);
            const selectable = phoneValid && !optedOut;
            return (
            <label key={contact.id} className={cn('flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm', !selectable && 'opacity-55')}>
              <Checkbox
                checked={effectiveContactIds.includes(contact.id)}
                onCheckedChange={(checked) => toggleContact(contact.id, checked === true)}
                disabled={!canEdit || isSaving || !selectable}
                aria-label={`${title}: ${contact.name}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{contact.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {optedOut ? copy.optedOut : [contact.position, contact.phone || copy.noPhone].filter(Boolean).join(' · ')}
                </span>
              </span>
            </label>
          );})}

          {contacts.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">{copy.noContacts}</p>
          )}
        </div>
      )}

      {invalid && (
        <p className="mt-3 flex items-center gap-2 text-xs font-medium text-destructive">
          <MessageCircleWarning className="h-4 w-4" /> {copy.selectOne}
        </p>
      )}
      {!canEdit && <p className="mt-3 text-xs text-muted-foreground">{copy.readOnly}</p>}

      {canEdit && dirty && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={save} disabled={isSaving || invalid}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {copy.save}
          </Button>
        </div>
      )}
    </section>
  );
}

export function CustomerWhatsappRecipients({
  customerId,
  primaryName,
  primaryPhone,
  contacts,
  routes,
  isLoading,
  isError,
  isSaving,
  customerAutomationEnabled,
  optedOutPhones,
  canEditOperational,
  canViewFinancial,
  canEditFinancial,
  onRetry,
  onSave,
}: CustomerWhatsappRecipientsProps) {
  const { locale } = useAppLocaleContext();
  const copy = COPY[locale];

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl bg-muted/50" aria-label="Carregando destinatários" />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <MessageCircleWarning className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{copy.loadError}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>{copy.retry}</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3 rounded-xl bg-muted/25 p-3 sm:p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Check className="h-4 w-4" /> {copy.title}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{copy.description}</p>
      </div>

      {!customerAutomationEnabled && (
        <Alert>
          <BellOff className="h-4 w-4" />
          <AlertDescription>{copy.disabledMaster}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        <CategoryEditor
          key={`${customerId}:service_order`}
          category="service_order"
          route={routes.find((route) => route.category === 'service_order')}
          primaryName={primaryName}
          primaryPhone={primaryPhone}
          contacts={contacts}
          optedOutPhones={optedOutPhones}
          canEdit={canEditOperational}
          isSaving={isSaving}
          onSave={onSave}
        />
        {canViewFinancial && (
          <CategoryEditor
            key={`${customerId}:billing`}
            category="billing"
            route={routes.find((route) => route.category === 'billing')}
            primaryName={primaryName}
            primaryPhone={primaryPhone}
            contacts={contacts}
            optedOutPhones={optedOutPhones}
            canEdit={canEditFinancial}
            isSaving={isSaving}
            onSave={onSave}
          />
        )}
      </div>
    </div>
  );
}
