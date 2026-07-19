import { useEffect, useMemo, useState } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { AlertTriangle, ChevronDown, Loader2, ShieldCheck, WifiOff } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useResetSystem, type ResetOptions } from '@/hooks/useResetSystem';
import { cn } from '@/lib/utils';

/**
 * Modal principal da feature "Zerar Sistema".
 *
 * Estrutura (de cima pra baixo):
 *  - Subtítulo com nome da empresa em destaque.
 *  - Master checkbox "Marcar tudo".
 *  - 4 grupos expansíveis (Collapsible) com "Selecionar tudo do grupo" por grupo.
 *  - Avisos vermelhos (irreversibilidade + lista do que é preservado).
 *  - Confirmação por digitação do nome da empresa.
 *  - Footer com Cancelar / Sim, Zerar Sistema.
 *
 * Regras de UI:
 *  - "Marcar tudo" liga/desliga todos os 11 itens.
 *  - Cada grupo tem seu próprio "Selecionar tudo do grupo".
 *  - Marcar Materiais auto-marca Estoque e bloqueia desmarcar Estoque.
 *  - Botão final disabled se: 0 selecionados / nome não bate / loading / offline.
 *  - Durante execução: bloqueia close, mostra progress "etapa X de N".
 *
 * Plano: docs/planos/2026-05-23-zerar-sistema.md §3 / §6.2 / §7
 * Permission spec: docs/planos/2026-05-23-zerar-sistema-permissions.md §5
 */

export interface ResetSystemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyName: string;
  companyId: string;
}

interface CheckboxConfig {
  key: keyof ResetOptions;
  title: string;
  description: string;
}

interface GroupConfig {
  id: string;
  label: string;
  items: ReadonlyArray<CheckboxConfig>;
}

/** Grupos de exibição — chaves reais de ResetOptions, agrupadas por domínio. */
const GROUPS: ReadonlyArray<GroupConfig> = [
  {
    id: 'operacional',
    label: 'Operacional',
    items: [
      {
        key: 'delete_service_orders',
        title: 'Ordens de Serviço',
        description:
          'Remove todas as OS, fotos, materiais consumidos, avaliações e formulários respondidos',
      },
      {
        key: 'delete_equipment',
        title: 'Equipamentos',
        description: 'Remove todos os equipamentos cadastrados nos clientes',
      },
      {
        key: 'delete_contracts',
        title: 'Contratos e PMOC',
        description:
          'Remove todos os contratos, cronogramas PMOC e documentos PMOC personalizados',
      },
      {
        key: 'delete_custom_configs',
        title: 'Configurações personalizadas',
        description:
          'Remove CRM stages personalizados, formulários de OS e recursos de custo',
      },
    ],
  },
  {
    id: 'comercial',
    label: 'Comercial (CRM)',
    items: [
      {
        key: 'delete_quotes',
        title: 'Orçamentos e Propostas',
        description: 'Remove todos os orçamentos e propostas',
      },
      {
        key: 'delete_customers',
        title: 'Clientes e Leads',
        description: 'Remove todos os cadastros de clientes, contatos, portais e leads',
      },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      {
        key: 'delete_financial_movements',
        title: 'Movimentações',
        description:
          'Remove todas as transações de caixa, banco, cartão, receitas e despesas',
      },
      {
        key: 'delete_financial_categories',
        title: 'Categorias financeiras',
        description:
          'Remove as categorias financeiras personalizadas (as padroes sao mantidas)',
      },
    ],
  },
  {
    id: 'rh-inventario',
    label: 'RH e Inventário',
    items: [
      {
        key: 'delete_employees',
        title: 'Funcionários e equipe',
        description:
          'Remove todos os funcionários, vales, pagamentos, ponto eletronico e equipes',
      },
      {
        key: 'delete_materials',
        title: 'Materiais',
        description: 'Remove todos os materiais cadastrados (e o estoque deles)',
      },
      {
        key: 'delete_stock',
        title: 'Estoque',
        description: 'Zera o estoque (movimentacoes), mantem os materiais cadastrados',
      },
    ],
  },
];

/** Todos os checkboxes em ordem plana, pra calcular "selecionar tudo". */
const ALL_CHECKBOXES: ReadonlyArray<CheckboxConfig> = GROUPS.flatMap((g) => g.items);

const EMPTY_OPTIONS: ResetOptions = {
  delete_customers: false,
  delete_equipment: false,
  delete_quotes: false,
  delete_contracts: false,
  delete_service_orders: false,
  delete_materials: false,
  delete_stock: false,
  delete_financial_movements: false,
  delete_financial_categories: false,
  delete_employees: false,
  delete_custom_configs: false,
};

/**
 * Mapa PT-BR pra exibir nome legivel do step no progresso.
 * Match com os labels dos checkboxes (sem reusar a key crua).
 */
const STEP_LABEL: Record<string, string> = {
  service_orders: 'Ordens de Servico',
  contracts: 'Contratos',
  quotes: 'Orcamentos',
  equipment: 'Equipamentos',
  custom_configs: 'Configuracoes Personalizadas',
  financial_movements: 'Movimentacoes Financeiras',
  financial_categories: 'Categorias Financeiras',
  employees: 'Funcionarios e RH',
  stock: 'Estoque de Materiais',
  materials: 'Cadastro de Materiais',
  customers: 'Clientes',
};

// ===== Sub-componente de grupo =====

interface ResetGroupProps {
  group: GroupConfig;
  options: ResetOptions;
  isLoading: boolean;
  onToggle: (key: keyof ResetOptions, checked: boolean) => void;
  tGroup?: { label?: string; [key: string]: { title?: string; description?: string } | string | undefined };
  forcedByMaterialsLabel?: string;
}

function ResetGroup({ group, options, isLoading, onToggle, tGroup, forcedByMaterialsLabel }: ResetGroupProps) {
  const [open, setOpen] = useState(true);

  const groupKeys = group.items.map((i) => i.key);
  const selectedInGroup = groupKeys.filter((k) => options[k]).length;
  const allInGroup = selectedInGroup === groupKeys.length;
  const someInGroup = selectedInGroup > 0 && !allInGroup;

  const handleToggleGroup = (checked: boolean) => {
    for (const item of group.items) {
      // Regra: marcar Materiais auto-marca Estoque — delegar pro handler pai.
      onToggle(item.key, checked);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Header do grupo */}
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full min-h-[44px] items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Checkbox de grupo — clique no checkbox nao expande/recolhe */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (!isLoading) handleToggleGroup(!allInGroup);
            }}
            className="flex-shrink-0"
          >
            <Checkbox
              checked={allInGroup ? true : someInGroup ? 'indeterminate' : false}
              onCheckedChange={(c) => handleToggleGroup(c === true)}
              disabled={isLoading}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Selecionar tudo em ${tGroup?.label ?? group.label}`}
            />
          </div>

          <span className="flex-1 text-sm font-semibold text-foreground">{tGroup?.label ?? group.label}</span>

          {selectedInGroup > 0 && (
            <span className="text-xs text-muted-foreground mr-1">
              {selectedInGroup}/{groupKeys.length}
            </span>
          )}

          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>

      {/* Itens do grupo */}
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 pl-2">
          {group.items.map((cfg) => {
            const isChecked = options[cfg.key];
            const forcedByMaterials =
              cfg.key === 'delete_stock' && options.delete_materials;

            return (
              <label
                key={cfg.key}
                htmlFor={`reset-${cfg.key}`}
                className={cn(
                  'flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/40 transition-colors',
                  isChecked && 'bg-muted/20',
                  forcedByMaterials && 'opacity-90',
                )}
              >
                <Checkbox
                  id={`reset-${cfg.key}`}
                  checked={isChecked}
                  onCheckedChange={(c) => onToggle(cfg.key, c === true)}
                  disabled={isLoading || forcedByMaterials}
                  className="mt-0.5 shrink-0"
                />
                <div className="flex-1 space-y-0.5">
                  <div className="text-sm font-medium text-foreground">
                    {(tGroup?.[cfg.key] as { title?: string } | undefined)?.title ?? cfg.title}
                  </div>
                  <div className="text-xs text-muted-foreground leading-snug">
                    {(tGroup?.[cfg.key] as { description?: string } | undefined)?.description ?? cfg.description}
                  </div>
                  {forcedByMaterials && (
                    <div className="text-[11px] text-muted-foreground italic">
                      {forcedByMaterialsLabel ?? cfg.description}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ===== Componente principal =====

export function ResetSystemDialog({
  open,
  onOpenChange,
  companyName,
  companyId,
}: ResetSystemDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.resetSystem;
  const { toast } = useToast();
  const { reset, isLoading, currentStep, currentStepIndex, totalSteps } = useResetSystem();

  const [options, setOptions] = useState<ResetOptions>(EMPTY_OPTIONS);
  const [confirmName, setConfirmName] = useState('');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Online/offline listener — feature destrutiva exige conexao (regra-lei #7).
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Reset do form quando o modal fecha.
  useEffect(() => {
    if (!open) {
      setOptions(EMPTY_OPTIONS);
      setConfirmName('');
    }
  }, [open]);

  const selectedCount = useMemo(
    () => Object.values(options).filter(Boolean).length,
    [options],
  );

  const allSelected = selectedCount === ALL_CHECKBOXES.length;

  const nameMatches =
    confirmName.trim() === companyName.trim() && companyName.trim().length > 0;

  const canConfirm = selectedCount > 0 && nameMatches && !isLoading && isOnline;

  // ===== Handlers de selecao =====

  const handleToggleAll = (checked: boolean) => {
    setOptions((prev) => {
      const next = { ...prev };
      for (const cfg of ALL_CHECKBOXES) {
        next[cfg.key] = checked;
      }
      return next;
    });
  };

  const handleToggle = (key: keyof ResetOptions, checked: boolean) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: checked };

      // Regra: marcar Materiais auto-marca Estoque e bloqueia desmarcar Estoque
      // enquanto Materiais estiver marcado (nao faz sentido apagar materiais
      // sem apagar suas movimentacoes).
      if (key === 'delete_materials' && checked) {
        next.delete_stock = true;
      }
      // Se desmarcar Materiais, Estoque permanece como o user deixou.
      return next;
    });
  };

  // ===== Handler de confirmacao =====

  const handleConfirm = async () => {
    if (!canConfirm) return;

    try {
      await reset(companyId, options);
      toast({
        title: t.successTitle,
        description: t.successDesc,
      });
      onOpenChange(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = (err as { message?: string }).message ?? '';
      const step = (err as { step?: string }).step;

      const stepLabelRaw = step ? (t.stepLabels as Record<string, string>)[step] ?? step : null;
      const stepPrefix = stepLabelRaw ? t.errorStepPrefix.replace('{step}', stepLabelRaw) + ' ' : '';

      let toastMessage: string;
      if (code === '42501') {
        toastMessage = t.errorPermission;
      } else if (code === '57014') {
        toastMessage = t.errorTimeout;
      } else if (code === '23503') {
        toastMessage = t.errorDependency;
      } else if (code === '23505') {
        toastMessage = t.errorDuplicate;
      } else if (code === 'P0001' && message) {
        toastMessage = message;
      } else if (message) {
        toastMessage = message;
      } else {
        toastMessage = t.errorGeneric;
      }

      toast({
        variant: 'destructive',
        title: t.errorTitle,
        description: `${stepPrefix}${toastMessage}`,
      });
    }
  };

  // Bloqueia close enquanto esta rodando (nao fecha por Esc, clique fora, X).
  const handleOpenChange = (nextOpen: boolean) => {
    if (isLoading && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  // ===== Footer (muda durante execucao) =====

  const currentStepLabel = currentStep ? (t.stepLabels as Record<string, string>)[currentStep] ?? currentStep : '';
  const progressNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : 1;

  const footer = isLoading ? (
    <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-warning" />
      <div className="text-sm text-foreground">
        <div className="font-medium">{t.progressTitle}</div>
        <div className="text-xs text-muted-foreground">
          {t.progressStep.replace('{current}', String(progressNumber)).replace('{total}', String(totalSteps))}{' '}
          {currentStepLabel || '...'}
        </div>
      </div>
    </div>
  ) : (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button
        variant="outline"
        onClick={() => onOpenChange(false)}
        className="w-full sm:w-auto"
      >
        {t.cancel}
      </Button>
      <Button
        variant="destructive"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="w-full sm:w-auto"
      >
        <AlertTriangle className="mr-2 h-4 w-4" />
        {t.confirmButton}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t.modalTitle}
      footer={footer}
    >
      <div className="space-y-4">
        {/* Aviso de acao irreversivel */}
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm text-foreground">
            {t.irreversibleWarning}{' '}
            <strong className="text-destructive">{t.deletePermanently}</strong>{' '}
            {t.warningCompany}{' '}
            <strong className="text-foreground">{companyName || '...'}</strong>. {t.chooseWhat}
          </p>
        </div>

        {/* Marcar tudo global */}
        <label
          className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 hover:bg-muted/50 transition-colors"
          htmlFor="reset-select-all"
        >
          <Checkbox
            id="reset-select-all"
            checked={allSelected}
            onCheckedChange={(c) => handleToggleAll(c === true)}
            disabled={isLoading}
          />
          <span className="text-sm font-semibold text-foreground">{t.selectAll}</span>
          {selectedCount > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {t.selectedCount.replace('{count}', String(selectedCount)).replace('{total}', String(ALL_CHECKBOXES.length))}
            </span>
          )}
        </label>

        {/* 4 grupos expansiveis */}
        <div className="space-y-2">
          {GROUPS.map((group) => {
            const groupKey = group.id === 'rh-inventario' ? 'rh_inventario' : group.id;
            const tGroup = (t.groups as Record<string, { label?: string; [k: string]: { title?: string; description?: string } | string | undefined }>)[groupKey];
            return (
              <ResetGroup
                key={group.id}
                group={group}
                options={options}
                isLoading={isLoading}
                onToggle={handleToggle}
                tGroup={tGroup}
                forcedByMaterialsLabel={t.forcedByMaterials}
              />
            );
          })}
        </div>

        <Separator />

        {/* O que e preservado */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{t.preserved.title}</span>
          </div>
          <ul className="space-y-1 pl-6 text-xs text-muted-foreground list-disc">
            <li>{t.preserved.companyData}</li>
            <li>{t.preserved.users}</li>
            <li>{t.preserved.paymentHistory}</li>
          </ul>
        </div>

        {/* Aviso final em vermelho */}
        <div className="rounded-md border border-destructive bg-destructive/10 p-3">
          <p className="text-center text-sm font-bold text-destructive">
            {t.finalWarning}
          </p>
        </div>

        {/* Confirmacao por nome */}
        <div className="space-y-2">
          <Label
            htmlFor="reset-confirm-name"
            className="text-xs font-semibold uppercase tracking-wide text-foreground"
          >
            {t.confirmLabel}
          </Label>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium text-foreground select-none">
              {companyName || '...'}
            </span>
          </div>
          <Input
            id="reset-confirm-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={t.confirmPlaceholder}
            disabled={isLoading}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {confirmName.length > 0 && !nameMatches && (
            <p className="text-xs text-destructive">
              {t.nameMismatch}
            </p>
          )}
        </div>

        {/* Aviso offline */}
        {!isOnline && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-foreground">
              {t.offline}
            </p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
