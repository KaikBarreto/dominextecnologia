import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Copy, Check, Link as LinkIcon, Settings2, CreditCard, RefreshCw } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  origins: any[] | undefined;
  salespeople: any[] | undefined;
}

const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  essencial: { monthly: 200, annual: 160 },
  avancado: { monthly: 350, annual: 280 },
  master: { monthly: 650, annual: 520 },
};

export default function GenerateLinkModal({ open, onOpenChange, origins, salespeople }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('geral');
  const [copied, setCopied] = useState(false);

  // Geral
  const [tipo, setTipo] = useState<'teste' | 'venda'>('teste');
  const [trialDays, setTrialDays] = useState('14');
  const [origem, setOrigem] = useState('Site/Google');
  const [vendedorId, setVendedorId] = useState<string>('__none__');

  // Comercial
  const [modo, setModo] = useState<'livre' | 'plano' | 'personalizado'>('livre');
  const [plano, setPlano] = useState<string>('avancado');
  const [ciclo, setCiclo] = useState<'monthly' | 'annual'>('monthly');
  const [precoCustom, setPrecoCustom] = useState('');
  const [mesesPromo, setMesesPromo] = useState('');
  const [permanente, setPermanente] = useState(false);

  const vendedor = useMemo(
    () => salespeople?.find(s => s.id === vendedorId) || null,
    [salespeople, vendedorId]
  );

  // Vendedores sem referral_code precisam ser corrigidos
  const regenerateReferralMutation = useMutation({
    mutationFn: async (id: string) => {
      // Forçar regeneração: setar para null faz o trigger BEFORE INSERT/UPDATE rodar — mas trigger só roda em INSERT por design. Geramos manualmente.
      const slug = (vendedor?.name || 'vend').split(' ')[0].toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const code = `${slug}${Math.random().toString(36).slice(2, 6)}`;
      const { error } = await supabase.from('salespeople').update({ referral_code: code }).eq('id', id);
      if (error) throw error;
      return code;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['salespeople'] });
      toast({ title: 'Código de afiliado gerado!' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: e?.message || 'Erro ao gerar código' }),
  });

  const generatedUrl = useMemo(() => {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://dominex.app';
    const params = new URLSearchParams();
    params.set('origem', origem);
    if (vendedor?.referral_code) params.set('vendedor', vendedor.referral_code);
    params.set('tipo', tipo);
    if (tipo === 'teste' && trialDays) params.set('trial', trialDays);

    if (modo === 'plano' || modo === 'personalizado') {
      params.set('plano', plano);
      params.set('ciclo', ciclo);
      params.set('bloqueado', '1');
    }
    if (modo === 'personalizado' && precoCustom) {
      params.set('preco', precoCustom.replace(',', '.'));
      if (permanente) {
        params.set('permanente', '1');
      } else if (mesesPromo) {
        params.set('meses_promo', mesesPromo);
      }
    }
    return `${base}/cadastro?${params.toString()}`;
  }, [origem, vendedor, tipo, trialDays, modo, plano, ciclo, precoCustom, mesesPromo, permanente]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      toast({ title: 'Link copiado!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao copiar' });
    }
  };

  const previewPrice = useMemo(() => {
    if (modo === 'personalizado' && precoCustom) return Number(precoCustom.replace(',', '.'));
    if (modo === 'plano' && plano && PLAN_PRICES[plano]) return PLAN_PRICES[plano][ciclo];
    return null;
  }, [modo, precoCustom, plano, ciclo]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" /> Gerar Link de Afiliado
          </DialogTitle>
          <DialogDescription>
            Crie um link rastreável de origem, vendedor e plano. O cadastro através deste link já
            virá com vendedor vinculado e (opcionalmente) plano travado.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="geral" className="gap-2"><Settings2 className="h-4 w-4" /> Geral</TabsTrigger>
            <TabsTrigger value="comercial" className="gap-2"><CreditCard className="h-4 w-4" /> Comercial</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pb-4 space-y-4">
            <TabsContent value="geral" className="m-0 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Link</Label>
                  <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="teste">Teste Grátis</SelectItem>
                      <SelectItem value="venda">Venda Direta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {tipo === 'teste' && (
                  <div>
                    <Label>Dias de Trial</Label>
                    <Input type="number" min="1" max="60" value={trialDays} onChange={e => setTrialDays(e.target.value)} />
                  </div>
                )}
              </div>

              <div>
                <Label>Origem</Label>
                <Select value={origem} onValueChange={setOrigem}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(origins || []).map((o: any) => (
                      <SelectItem key={o.id} value={o.name}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Vendedor</Label>
                <Select value={vendedorId} onValueChange={setVendedorId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Sem vendedor —</SelectItem>
                    {(salespeople || []).filter(s => s.is_active).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.referral_code ? ` (${s.referral_code})` : ' (sem código)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vendedor && !vendedor.referral_code && (
                  <Button
                    type="button" variant="outline" size="sm" className="mt-2 gap-2"
                    onClick={() => regenerateReferralMutation.mutate(vendedor.id)}
                    disabled={regenerateReferralMutation.isPending}
                  >
                    <RefreshCw className={regenerateReferralMutation.isPending ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
                    Gerar código de afiliado
                  </Button>
                )}
              </div>
            </TabsContent>

            <TabsContent value="comercial" className="m-0 space-y-4">
              <div>
                <Label>Modo de Plano</Label>
                <Select value={modo} onValueChange={(v: any) => setModo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="livre">Livre — usuário escolhe</SelectItem>
                    <SelectItem value="plano">Plano travado</SelectItem>
                    <SelectItem value="personalizado">Plano + preço personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(modo === 'plano' || modo === 'personalizado') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Plano</Label>
                    <Select value={plano} onValueChange={setPlano}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="essencial">Essencial</SelectItem>
                        <SelectItem value="avancado">Avançado</SelectItem>
                        <SelectItem value="master">Master</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Ciclo</Label>
                    <Select value={ciclo} onValueChange={(v: any) => setCiclo(v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Mensal</SelectItem>
                        <SelectItem value="annual">Anual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {modo === 'personalizado' && (
                <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Preço Custom (R$)</Label>
                      <Input type="number" step="0.01" min="0" value={precoCustom} onChange={e => setPrecoCustom(e.target.value)} placeholder="Ex: 99.90" />
                    </div>
                    <div>
                      <Label className="text-xs">Meses Promocionais</Label>
                      <Input type="number" min="0" value={mesesPromo} onChange={e => setMesesPromo(e.target.value)} placeholder="Ex: 3" disabled={permanente} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={permanente} onCheckedChange={setPermanente} />
                    <Label className="text-sm font-normal">Preço permanente</Label>
                  </div>
                </div>
              )}

              {previewPrice != null && (
                <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-sm">
                  <span className="text-muted-foreground">Valor que será exibido:</span>{' '}
                  <strong className="text-primary">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(previewPrice)}
                  </strong>
                  <span className="text-muted-foreground">{ciclo === 'annual' ? '/ano' : '/mês'}</span>
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        {/* URL gerada */}
        <div className="border-t pt-3 space-y-2 shrink-0">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Link Gerado</Label>
          <div className="flex gap-2">
            <Input value={generatedUrl} readOnly className="font-mono text-xs bg-muted" />
            <Button type="button" onClick={handleCopy} className="gap-2 shrink-0">
              {copied ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar</>}
            </Button>
          </div>
          {!vendedor && tipo === 'venda' && (
            <p className="text-xs text-amber-600">⚠️ Vendas sem vendedor não geram comissão automática.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
