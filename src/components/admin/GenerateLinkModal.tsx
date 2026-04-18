import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  Copy, Link as LinkIcon, Check, TestTube, ShoppingCart, Briefcase,
  Unlock, Lock,
} from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type PlanMode = 'livre' | 'plano';

export function GenerateLinkModal({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [selectedOrigin, setSelectedOrigin] = useState('');
  const [selectedSalesperson, setSelectedSalesperson] = useState('');
  const [linkType, setLinkType] = useState<'teste' | 'venda'>('teste');
  const [trialDays, setTrialDays] = useState(14);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [planMode, setPlanMode] = useState<PlanMode>('livre');
  const [selectedPlanCode, setSelectedPlanCode] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  const [customPriceValue, setCustomPriceValue] = useState('');
  const [isPermanent, setIsPermanent] = useState(false);
  const [customPriceMonths, setCustomPriceMonths] = useState('3');

  const { data: origins = [] } = useQuery({
    queryKey: ['company-origins-link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_origins')
        .select('id, name, color, icon')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople')
        .select('id, name, referral_code')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['subscription-plans-link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('code, name, price, max_users, description')
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data || [];
    },
  });

  const selectedPlan = plans.find((p: any) => p.code === selectedPlanCode);

  const handleGenerateLink = () => {
    const baseUrl = window.location.origin;
    const params = new URLSearchParams();

    if (selectedOrigin) params.append('origem', selectedOrigin);
    if (selectedSalesperson) {
      const sp = salespeople.find((s: any) => s.id === selectedSalesperson);
      params.append('vendedor', sp?.referral_code || selectedSalesperson);
    }
    params.append('tipo', linkType);
    if (linkType === 'teste' && trialDays !== 14) params.append('dias', String(trialDays));

    if (planMode === 'plano' && selectedPlanCode) {
      params.append('plano', selectedPlanCode);
      params.append('ciclo', billingCycle);
      params.append('bloqueado', '1');
      if (useCustomPrice && customPriceValue) {
        params.append('preco', customPriceValue);
        if (!isPermanent && customPriceMonths) {
          params.append('meses_promo', customPriceMonths);
        }
      }
    }

    const link = params.toString() ? `${baseUrl}/cadastro?${params.toString()}` : `${baseUrl}/cadastro`;
    setGeneratedLink(link);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      toast({ title: 'Link copiado!' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao copiar' });
    }
  };

  const handleClose = () => {
    setSelectedOrigin('');
    setSelectedSalesperson('');
    setLinkType('teste');
    setTrialDays(14);
    setGeneratedLink('');
    setCopied(false);
    setPlanMode('livre');
    setSelectedPlanCode('');
    setBillingCycle('monthly');
    setUseCustomPrice(false);
    setCustomPriceValue('');
    setIsPermanent(false);
    setCustomPriceMonths('3');
    onOpenChange(false);
  };

  const Content = (
    <div className="space-y-4">
      <Tabs defaultValue="geral" className="w-full">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="geral" className="text-xs sm:text-sm">
            <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />Geral
          </TabsTrigger>
          <TabsTrigger value="comercial" className="text-xs sm:text-sm">
            <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />Comercial
          </TabsTrigger>
        </TabsList>

        {/* GERAL */}
        <TabsContent value="geral" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Tipo de Link</Label>
            <RadioGroup
              value={linkType}
              onValueChange={(v) => setLinkType(v as 'teste' | 'venda')}
              className="grid grid-cols-2 gap-2"
            >
              <div
                className={cn(
                  'flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors',
                  linkType === 'teste' ? 'border-primary bg-primary/5' : 'border-muted'
                )}
                onClick={() => setLinkType('teste')}
              >
                <RadioGroupItem value="teste" id="teste" />
                <Label htmlFor="teste" className="flex items-center gap-2 cursor-pointer">
                  <TestTube className="h-4 w-4" />Teste
                </Label>
              </div>
              <div
                className={cn(
                  'flex items-center space-x-2 border rounded-lg p-3 cursor-pointer transition-colors',
                  linkType === 'venda' ? 'border-primary bg-primary/5' : 'border-muted'
                )}
                onClick={() => setLinkType('venda')}
              >
                <RadioGroupItem value="venda" id="venda" />
                <Label htmlFor="venda" className="flex items-center gap-2 cursor-pointer">
                  <ShoppingCart className="h-4 w-4" />Venda
                </Label>
              </div>
            </RadioGroup>
            <p className="text-xs text-muted-foreground">
              {linkType === 'teste'
                ? 'O usuário terá um período de teste gratuito antes de pagar.'
                : 'O usuário pagará o plano imediatamente ao finalizar o cadastro.'}
            </p>
          </div>

          {linkType === 'teste' && (
            <div className="space-y-2">
              <Label>Dias de Teste</Label>
              <Select value={String(trialDays)} onValueChange={(v) => setTrialDays(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 dias</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="14">14 dias (padrão)</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Origem (opcional)</Label>
            <Select value={selectedOrigin} onValueChange={setSelectedOrigin}>
              <SelectTrigger><SelectValue placeholder="Selecione uma origem" /></SelectTrigger>
              <SelectContent>
                {origins.map((o: any) => (
                  <SelectItem key={o.id} value={o.name}>
                    <div className="flex items-center gap-2">
                      {o.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: o.color }} />}
                      {o.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Vendedor (opcional)</Label>
            <Select value={selectedSalesperson} onValueChange={setSelectedSalesperson}>
              <SelectTrigger><SelectValue placeholder="Selecione um vendedor" /></SelectTrigger>
              <SelectContent>
                {salespeople.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </TabsContent>

        {/* COMERCIAL */}
        <TabsContent value="comercial" className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Configuração do Plano</Label>
            <RadioGroup
              value={planMode}
              onValueChange={(v) => setPlanMode(v as PlanMode)}
              className="space-y-2"
            >
              <div
                className={cn(
                  'flex items-center space-x-3 border rounded-lg p-3 cursor-pointer transition-colors',
                  planMode === 'livre' ? 'border-primary bg-primary/5' : 'border-muted'
                )}
                onClick={() => setPlanMode('livre')}
              >
                <RadioGroupItem value="livre" id="livre" />
                <div className="flex items-center gap-2 flex-1">
                  <Unlock className="h-4 w-4" />
                  <div>
                    <Label htmlFor="livre" className="cursor-pointer font-medium">Livre</Label>
                    <p className="text-xs text-muted-foreground">O cliente escolhe o plano na tela de cadastro</p>
                  </div>
                </div>
                <Badge variant="secondary">Padrão</Badge>
              </div>

              <div
                className={cn(
                  'flex items-center space-x-3 border rounded-lg p-3 cursor-pointer transition-colors',
                  planMode === 'plano' ? 'border-primary bg-primary/5' : 'border-muted'
                )}
                onClick={() => setPlanMode('plano')}
              >
                <RadioGroupItem value="plano" id="plano" />
                <div className="flex items-center gap-2 flex-1">
                  <Lock className="h-4 w-4" />
                  <div>
                    <Label htmlFor="plano" className="cursor-pointer font-medium">Plano Específico</Label>
                    <p className="text-xs text-muted-foreground">Selecione um plano pré-definido (bloqueado para o cliente)</p>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </div>

          {planMode === 'plano' && (
            <div className="space-y-3 animate-in fade-in duration-200">
              <Label>Selecione o Plano</Label>
              <div className="grid gap-2">
                {plans.map((plan: any) => (
                  <Card
                    key={plan.code}
                    className={cn(
                      'cursor-pointer transition-all hover:shadow-md',
                      selectedPlanCode === plan.code && 'ring-2 ring-primary border-primary'
                    )}
                    onClick={() => setSelectedPlanCode(plan.code)}
                  >
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {selectedPlanCode === plan.code && (
                          <div className="bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="h-3 w-3" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{plan.name}</p>
                          <p className="text-xs text-muted-foreground">{plan.max_users} usuários</p>
                        </div>
                      </div>
                      <Badge variant="outline">R$ {Number(plan.price).toFixed(2)}/mês</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                <span className="text-sm">Ciclo de Cobrança</span>
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs', billingCycle === 'monthly' && 'font-medium')}>Mensal</span>
                  <Switch
                    checked={billingCycle === 'yearly'}
                    onCheckedChange={(c) => setBillingCycle(c ? 'yearly' : 'monthly')}
                  />
                  <span className={cn('text-xs', billingCycle === 'yearly' && 'font-medium')}>Anual</span>
                </div>
              </div>

              {/* Custom price */}
              <div className="space-y-3 p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Switch
                    id="use-custom-price-link"
                    checked={useCustomPrice}
                    onCheckedChange={setUseCustomPrice}
                  />
                  <Label htmlFor="use-custom-price-link" className="text-xs cursor-pointer">
                    Usar valor personalizado
                  </Label>
                </div>

                {useCustomPrice && (
                  <div className="space-y-3">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Ex: 150.00"
                      value={customPriceValue}
                      onChange={(e) => setCustomPriceValue(e.target.value)}
                      className="h-8 text-sm"
                    />
                    {selectedPlan && (
                      <p className="text-xs text-muted-foreground">
                        Valor original: R$ {Number(selectedPlan.price).toFixed(2)}/mês
                      </p>
                    )}

                    <div className="space-y-2 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="is-permanent-link"
                          checked={isPermanent}
                          onCheckedChange={setIsPermanent}
                        />
                        <Label htmlFor="is-permanent-link" className="text-xs cursor-pointer">
                          Permanentemente
                        </Label>
                      </div>

                      {!isPermanent && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Por quantos meses?</Label>
                          <Input
                            type="number"
                            min="1"
                            placeholder="3"
                            value={customPriceMonths}
                            onChange={(e) => setCustomPriceMonths(e.target.value)}
                            className="h-8 text-sm w-24"
                          />
                          {customPriceValue && selectedPlan && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              Os primeiros {customPriceMonths || 'X'} pagamentos serão de R$ {customPriceValue}, depois volta para R$ {Number(selectedPlan.price).toFixed(2)}/mês
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {selectedPlan && (
                <div className="p-3 bg-primary/10 rounded-lg">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Valor final mensal:</span>
                    <span className="text-lg font-bold">
                      R$ {(useCustomPrice && customPriceValue ? parseFloat(customPriceValue) : Number(selectedPlan.price)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {planMode === 'plano' && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Lock className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  <p className="font-medium">Plano bloqueado para o cliente</p>
                  <p className="mt-1">O cliente não poderá alterar o plano na tela de cadastro.</p>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="space-y-4 pt-4 border-t">
        <Button type="button" onClick={handleGenerateLink} className="w-full">
          <LinkIcon className="h-4 w-4 mr-2" />Gerar Link
        </Button>

        {generatedLink && (
          <div className="space-y-2 pt-2 border-t">
            <Label>Link Gerado</Label>
            <div className="flex gap-2">
              <Input value={generatedLink} readOnly className="text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Clique no botão para copiar o link</p>

            <div className="bg-muted/50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-medium">Resumo do Link:</p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>• Tipo: {linkType === 'teste' ? `Teste (${trialDays} dias)` : 'Venda direta'}</p>
                {selectedOrigin && <p>• Origem: {selectedOrigin}</p>}
                {selectedSalesperson && <p>• Vendedor: {salespeople.find((s: any) => s.id === selectedSalesperson)?.name}</p>}
                {planMode === 'plano' && selectedPlan && (
                  <>
                    <p>• Plano: {selectedPlan.name} ({billingCycle === 'yearly' ? 'Anual' : 'Mensal'})</p>
                    {useCustomPrice && customPriceValue && (
                      <p>
                        • Preço: R$ {customPriceValue}{' '}
                        {isPermanent ? '(permanente)' : `por ${customPriceMonths} meses, depois R$ ${Number(selectedPlan.price).toFixed(2)}`}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader>
            <DrawerTitle>Gerar Link de Cadastro</DrawerTitle>
            <DrawerDescription>Crie um link personalizado para divulgação ou afiliados</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 overflow-y-auto">{Content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerar Link de Cadastro</DialogTitle>
          <DialogDescription>Crie um link personalizado para divulgação ou afiliados</DialogDescription>
        </DialogHeader>
        {Content}
      </DialogContent>
    </Dialog>
  );
}
