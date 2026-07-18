import { useMemo, useState } from 'react';
import { Copy, Plus, Trash2, Webhook } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCrmWebhooks } from '@/hooks/useCrmWebhooks';
import { useCustomerOrigins } from '@/hooks/useCustomerOrigins';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface WebhookManagerDialogProps {
  children: React.ReactNode;
}

export function WebhookManagerDialog({ children }: WebhookManagerDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState('none');

  const { toast } = useToast();
  const { webhooks, isLoading, createWebhook, updateWebhook, deleteWebhook } = useCrmWebhooks();
  const { activeOrigins } = useCustomerOrigins();

  const webhookBaseUrl = useMemo(() => {
    return `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/crm-lead-webhook`;
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    await createWebhook.mutateAsync({ name: name.trim(), origin: origin === 'none' ? null : origin });
    setName('');
    setOrigin('none');
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t.webhooks.copySuccess });
    } catch {
      toast({ variant: 'destructive', title: t.webhooks.copyError });
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={t.webhooks.title}
        className="sm:max-w-[700px]"
      >
        <div className="space-y-6">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium">{t.webhooks.createTitle}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t.webhooks.nameLabel}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.webhooks.namePlaceholder}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t.webhooks.originLabel}</Label>
                <Select value={origin} onValueChange={setOrigin}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.webhooks.originLabel} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t.webhooks.originNone}</SelectItem>
                    {activeOrigins.map((item) => (
                      <SelectItem key={item.id} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || createWebhook.isPending}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              {t.webhooks.createButton}
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">{t.webhooks.listTitle}</h3>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">{t.webhooks.loading}</div>
            ) : webhooks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                {t.webhooks.emptyWebhooks}
              </div>
            ) : (
              webhooks.map((hook) => {
                const endpoint = `${webhookBaseUrl}?token=${hook.token}`;
                return (
                  <div key={hook.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{hook.name}</span>
                        <Badge variant={hook.is_active ? 'default' : 'secondary'}>
                          {hook.is_active ? t.webhooks.badgeActive : t.webhooks.badgeInactive}
                        </Badge>
                        {hook.origin && (
                          <Badge variant="outline">
                            {t.webhooks.badgeOriginPrefix} {hook.origin}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">{t.webhooks.activeLabel}</Label>
                          <Switch
                            checked={hook.is_active}
                            onCheckedChange={(checked) =>
                              updateWebhook.mutate({ id: hook.id, is_active: checked })
                            }
                          />
                        </div>
                        <Button
                          variant="destructive-ghost"
                          size="icon"
                          onClick={() => deleteWebhook.mutate(hook.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input value={endpoint} readOnly className="font-mono text-xs" />
                      <Button variant="outline" onClick={() => handleCopy(endpoint)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-3">
            <div>
              <h4 className="font-medium text-foreground mb-2">{t.webhooks.docsTitle}</h4>
              <p className="text-muted-foreground text-xs mb-3">
                {t.webhooks.docsDesc.split('POST').map((part, i) =>
                  i === 0 ? (
                    <span key={i}>
                      {part}
                      <strong>POST</strong>
                    </span>
                  ) : (
                    <span key={i}>{part}</span>
                  ),
                )}
              </p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground text-xs">{t.webhooks.docsRequired}</p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>
                  • <code className="bg-muted px-1 rounded">name</code> - Nome completo do lead
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">phone</code> - Telefone (apenas
                  números)
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground text-xs">{t.webhooks.docsOptional}</p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>
                  • <code className="bg-muted px-1 rounded">email</code> - E-mail do lead
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">source</code> - Origem do lead (ex:
                  "Meta Ads")
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">title</code> - Título personalizado
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">notes</code> - Observações adicionais
                </li>
                <li>
                  • <code className="bg-muted px-1 rounded">value</code> - Valor estimado (número)
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground text-xs mb-2">
                {t.webhooks.docsPracticalExample}
              </p>
              <pre className="overflow-x-auto text-xs bg-background border rounded p-2">
                {`{
  "name": "João Silva",
  "phone": "11999999999",
  "email": "joao@email.com"
}`}
              </pre>
            </div>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
