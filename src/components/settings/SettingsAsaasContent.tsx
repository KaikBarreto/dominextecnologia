import { useState, useEffect } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import {
  Lock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Wallet,
  ShieldCheck,
  HelpCircle,
  ChevronDown,
} from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Subaba "Recebimentos (Asaas)" das Integrações. Espelha o padrão do WhatsApp:
//   • Gate de add-on via hasModule('cobrancas') → estado "não contratado".
//   • Estado DESATIVADO: campo pra colar a API key + botão Ativar (provision).
//   • Estado ATIVO/PENDENTE: status + taxas informativas + botão desativar.
//
// A chave viaja SÓ até a edge (guardada no Vault server-side); o front nunca a
// persiste. Erro do invoke: a mensagem PT-BR vem do hook (que lê error.context).
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsAsaasContent() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.integrations.asaas;
  const { toast } = useToast();

  const { hasModule, isLoading: modulesLoading } = useCompanyModules();
  const {
    status, isActive, isLoading,
    autoPostToFinance, setAutoPostToFinance,
    autoPostFees, setAutoPostFees,
    defaultFinePercent, defaultInterestPercent, setLateFees,
    provision, deactivate,
  } = useTenantPaymentAccount();

  const [apiKey, setApiKey] = useState('');
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);

  // Campos de multa/juros: string para permitir decimais ("2,5") sem forçar ponto.
  // Sincroniza com o valor do banco quando ele muda (ex: após salvar ou na carga inicial).
  const [fineInput, setFineInput] = useState(String(defaultFinePercent));
  const [interestInput, setInterestInput] = useState(String(defaultInterestPercent));

  useEffect(() => {
    setFineInput(String(defaultFinePercent));
    setInterestInput(String(defaultInterestPercent));
  }, [defaultFinePercent, defaultInterestPercent]);

  /** Normaliza entrada que aceita vírgula ou ponto como separador decimal. */
  function parsePercent(raw: string): number {
    return parseFloat(raw.replace(',', '.'));
  }

  const fineValue = parsePercent(fineInput);
  const interestValue = parsePercent(interestInput);
  const fineValid = !isNaN(fineValue) && fineValue >= 0 && fineValue <= 100;
  const interestValid = !isNaN(interestValue) && interestValue >= 0 && interestValue <= 10;
  const interestOverCap = !isNaN(interestValue) && interestValue > 10;

  const handleSaveLateFees = async () => {
    if (!fineValid || !interestValid) return;
    try {
      await setLateFees.mutateAsync({ finePercent: fineValue, interestPercent: interestValue });
      toast({ title: t.activeState.lateFeesToastOk });
    } catch {
      toast({ variant: 'destructive', title: t.activeState.lateFeesToastError });
    }
  };

  const handleActivate = async () => {
    const key = apiKey.trim();
    if (!key) return;
    try {
      await provision.mutateAsync({ apiKey: key });
      setApiKey('');
      toast({ title: t.toasts.activated });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t.card.title,
        description: err instanceof Error ? err.message : t.errors.activateGeneric,
      });
    }
  };

  const handleAutoPostChange = async (enabled: boolean) => {
    try {
      await setAutoPostToFinance.mutateAsync(enabled);
      toast({ title: enabled ? t.activeState.autoPostToastOn : t.activeState.autoPostToastOff });
    } catch {
      toast({ variant: 'destructive', title: t.activeState.autoPostToastError });
    }
  };

  const handleAutoFeeChange = async (enabled: boolean) => {
    try {
      await setAutoPostFees.mutateAsync(enabled);
      toast({ title: enabled ? t.activeState.autoFeeToastOn : t.activeState.autoFeeToastOff });
    } catch {
      toast({ variant: 'destructive', title: t.activeState.autoFeeError });
    }
  };

  const handleDeactivateConfirmed = async () => {
    try {
      await deactivate.mutateAsync();
      toast({ title: t.toasts.deactivated });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t.card.title,
        description: err instanceof Error ? err.message : t.errors.deactivateGeneric,
      });
    }
  };

  if (modulesLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">{t.loading}</span>
      </div>
    );
  }

  // Add-on não contratado: estado dedicado (o gate real é server-side na edge).
  if (!hasModule('cobrancas')) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={<Lock className="h-full w-full" />}
            title={t.notContracted.title}
            description={t.notContracted.description}
          />
        </CardContent>
      </Card>
    );
  }

  // Selo de status saturado (fundo na cor + texto branco) — régua de badges.
  const statusConfig = {
    active: { label: t.status.active, className: 'bg-emerald-600 text-white', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    pending: { label: t.status.pending, className: 'bg-amber-500 text-white', icon: <Loader2 className="h-3.5 w-3.5 animate-spin" /> },
    disabled: { label: t.status.disabled, className: 'bg-slate-500 text-white', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    rejected: { label: t.status.rejected, className: 'bg-red-600 text-white', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  } as const;

  const showActiveState = status === 'active' || status === 'pending';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">{t.card.title}</CardTitle>
                <CardDescription className="text-sm">{t.card.description}</CardDescription>
              </div>
            </div>
            {status && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0',
                  statusConfig[status].className,
                )}
              >
                {statusConfig[status].icon}
                {statusConfig[status].label}
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ── ESTADO DESATIVADO: colar a chave + ativar ─────────────────── */}
          {!showActiveState && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t.inactive.intro}</p>

              <div className="space-y-2">
                <Label htmlFor="asaas-api-key" className="text-sm font-medium">
                  {t.inactive.apiKeyLabel}
                </Label>
                <Input
                  id="asaas-api-key"
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={t.inactive.apiKeyPlaceholder}
                  disabled={provision.isPending}
                />
              </div>

              <Button
                onClick={handleActivate}
                disabled={provision.isPending || apiKey.trim().length === 0}
                className="w-full sm:w-auto"
              >
                {provision.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.inactive.activating}
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    {t.inactive.activate}
                  </>
                )}
              </Button>

              {/* Guia discreto: como obter a chave na Asaas */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{t.inactive.apiKeyGuide.trigger}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 rounded-md border border-border bg-muted/40 p-3 space-y-1.5 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">1.</span> {t.inactive.apiKeyGuide.step1}</p>
                  <p><span className="font-medium text-foreground">2.</span> {t.inactive.apiKeyGuide.step2}</p>
                  <p><span className="font-medium text-foreground">3.</span> {t.inactive.apiKeyGuide.step3}</p>
                  <p><span className="font-medium text-foreground">4.</span> {t.inactive.apiKeyGuide.step4}</p>
                  <p className="pt-1 border-t border-border/60 text-muted-foreground/80 italic">{t.inactive.apiKeyGuide.sandboxHint}</p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}

          {/* ── ESTADO ATIVO / PENDENTE ───────────────────────────────────── */}
          {showActiveState && (
            <div className="space-y-4">
              {isActive ? (
                <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {t.activeState.connected}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3">
                  <Loader2 className="h-4 w-4 text-amber-500 shrink-0 mt-0.5 animate-spin" />
                  <p className="text-sm text-muted-foreground">{t.activeState.pendingDesc}</p>
                </div>
              )}

              <Separator />

              {/* Taxas informativas (cobradas pela Asaas, repasse puro) */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t.activeState.feesTitle}</p>
                <div className="rounded-lg border divide-y text-sm">
                  <FeeRow label={t.activeState.feePix} value={t.activeState.feePixValue} />
                  <FeeRow label={t.activeState.feeBoleto} value={t.activeState.feeBoletoValue} />
                  <FeeRow label={t.activeState.feeCard} value={t.activeState.feeCardValue} />
                </div>
                <p className="text-xs text-muted-foreground">{t.activeState.feesNote}</p>
              </div>

              <Separator />

              {/* Toggle: lançar cobranças no Financeiro automaticamente */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{t.activeState.autoPostLabel}</p>
                  <p className="text-xs text-muted-foreground">{t.activeState.autoPostDesc}</p>
                </div>
                <Switch
                  checked={autoPostToFinance}
                  onCheckedChange={handleAutoPostChange}
                  disabled={setAutoPostToFinance.isPending}
                  aria-label={t.activeState.autoPostLabel}
                  className="shrink-0 mt-0.5"
                />
              </div>

              {/* Toggle: lançar taxa da Asaas como despesa */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5 flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{t.activeState.autoFeeLabel}</p>
                  <p className="text-xs text-muted-foreground">{t.activeState.autoFeeDesc}</p>
                </div>
                <Switch
                  checked={autoPostFees}
                  onCheckedChange={handleAutoFeeChange}
                  disabled={setAutoPostFees.isPending}
                  aria-label={t.activeState.autoFeeLabel}
                  className="shrink-0 mt-0.5"
                />
              </div>

              <Separator />

              {/* Seção: Multa e juros por atraso */}
              <div className="space-y-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">{t.activeState.lateFeesTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.activeState.lateFeesDesc}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {/* Multa % */}
                  <div className="space-y-1.5">
                    <Label htmlFor="asaas-fine" className="text-xs font-medium">
                      {t.activeState.fineLabel}
                    </Label>
                    <div className="relative">
                      <input
                        id="asaas-fine"
                        type="text"
                        inputMode="decimal"
                        value={fineInput}
                        onChange={(e) => setFineInput(e.target.value)}
                        disabled={setLateFees.isPending}
                        className={cn(
                          'flex h-9 w-full rounded-md border bg-transparent px-3 pr-8 py-1 text-sm shadow-sm transition-colors',
                          'placeholder:text-muted-foreground',
                          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                          !fineValid && fineInput !== '' ? 'border-destructive' : 'border-input',
                        )}
                        placeholder="2"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                  {/* Juros % */}
                  <div className="space-y-1.5">
                    <Label htmlFor="asaas-interest" className="text-xs font-medium">
                      {t.activeState.interestLabel}
                    </Label>
                    <div className="relative">
                      <input
                        id="asaas-interest"
                        type="text"
                        inputMode="decimal"
                        value={interestInput}
                        onChange={(e) => setInterestInput(e.target.value)}
                        disabled={setLateFees.isPending}
                        className={cn(
                          'flex h-9 w-full rounded-md border bg-transparent px-3 pr-8 py-1 text-sm shadow-sm transition-colors',
                          'placeholder:text-muted-foreground',
                          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                          'disabled:cursor-not-allowed disabled:opacity-50',
                          interestOverCap || (!interestValid && interestInput !== '') ? 'border-destructive' : 'border-input',
                        )}
                        placeholder="1"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
                {interestOverCap && (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {t.activeState.interestCapWarning}
                  </p>
                )}
                <Button
                  size="sm"
                  onClick={handleSaveLateFees}
                  disabled={setLateFees.isPending || !fineValid || !interestValid}
                  className="w-full sm:w-auto"
                >
                  {setLateFees.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      {t.activeState.lateFeesSaving}
                    </>
                  ) : (
                    t.activeState.lateFeesSave
                  )}
                </Button>
              </div>

              <Separator />

              <Button
                variant="destructive"
                onClick={() => setDeactivateDialogOpen(true)}
                disabled={deactivate.isPending}
                className="w-full sm:w-auto"
              >
                {deactivate.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.activeState.deactivating}
                  </>
                ) : (
                  t.activeState.deactivate
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {/* ── Confirmação de desativação ────────────────────────────────────── */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deactivateConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.deactivateConfirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deactivateConfirm.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateConfirmed}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.deactivateConfirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
