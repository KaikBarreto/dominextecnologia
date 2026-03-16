import { useMemo, useState } from 'react';
import { Copy, Plus, Trash2, Webhook } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCrmWebhooks } from '@/hooks/useCrmWebhooks';
import { useCustomerOrigins } from '@/hooks/useCustomerOrigins';
import { useToast } from '@/hooks/use-toast';

interface WebhookManagerDialogProps {
  children: React.ReactNode;
}

export function WebhookManagerDialog({ children }: WebhookManagerDialogProps) {
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
      toast({ title: 'URL copiada!' });
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar a URL' });
    }
  };

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Webhooks de Leads Externos" className="sm:max-w-[700px]">
        <div className="space-y-6">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium">Criar novo webhook</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Meta Ads - Campanha Março" />
              </div>
              <div className="space-y-1.5">
                <Label>Origem padrão</Label>
                <Select value={origin} onValueChange={setOrigin}>
                  <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem origem fixa</SelectItem>
                    {activeOrigins.map((item) => (<SelectItem key={item.id} value={item.name}>{item.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={handleCreate} disabled={!name.trim() || createWebhook.isPending} className="gap-2">
              <Plus className="h-4 w-4" />Criar webhook
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">Webhooks configurados</h3>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Carregando...</div>
            ) : webhooks.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum webhook cadastrado.</div>
            ) : (
              webhooks.map((hook) => {
                const endpoint = `${webhookBaseUrl}?token=${hook.token}`;
                return (
                  <div key={hook.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Webhook className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{hook.name}</span>
                        <Badge variant={hook.is_active ? 'default' : 'secondary'}>{hook.is_active ? 'Ativo' : 'Inativo'}</Badge>
                        {hook.origin && <Badge variant="outline">Origem: {hook.origin}</Badge>}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Ativo</Label>
                          <Switch checked={hook.is_active} onCheckedChange={(checked) => updateWebhook.mutate({ id: hook.id, is_active: checked })} />
                        </div>
                        <Button variant="destructive-ghost" size="icon" onClick={() => deleteWebhook.mutate(hook.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input value={endpoint} readOnly className="font-mono text-xs" />
                      <Button variant="outline" onClick={() => handleCopy(endpoint)}><Copy className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-3">
            <div>
              <h4 className="font-medium text-foreground mb-2">Como usar o webhook</h4>
              <p className="text-muted-foreground text-xs mb-3">Faça uma requisição <strong>POST</strong> para a URL do webhook com os dados do lead em JSON.</p>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground text-xs">Campos obrigatórios:</p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>• <code className="bg-muted px-1 rounded">name</code> - Nome completo do lead</li>
                <li>• <code className="bg-muted px-1 rounded">phone</code> - Telefone (apenas números)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-foreground text-xs">Campos opcionais:</p>
              <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                <li>• <code className="bg-muted px-1 rounded">email</code> - E-mail do lead</li>
                <li>• <code className="bg-muted px-1 rounded">source</code> - Origem do lead (ex: "Meta Ads")</li>
                <li>• <code className="bg-muted px-1 rounded">title</code> - Título personalizado</li>
                <li>• <code className="bg-muted px-1 rounded">notes</code> - Observações adicionais</li>
                <li>• <code className="bg-muted px-1 rounded">value</code> - Valor estimado (número)</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground text-xs mb-2">Exemplo prático:</p>
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
