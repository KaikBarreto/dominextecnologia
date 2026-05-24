import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, ShieldCheck, WifiOff } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useResetSystem, type ResetOptions } from '@/hooks/useResetSystem';

/**
 * Modal principal da feature "Zerar Sistema".
 *
 * Estrutura (de cima pra baixo):
 *  - Subtítulo com nome da empresa em destaque.
 *  - Master checkbox "Selecionar tudo".
 *  - 11 checkboxes (cada um com título + descrição curta).
 *  - Avisos vermelhos (irreversibilidade + lista do que é preservado).
 *  - Confirmação por digitação do nome da empresa.
 *  - Footer com Cancelar / Sim, Zerar Sistema.
 *
 * Regras de UI obrigatórias:
 *  - "Selecionar tudo" liga/desliga todos.
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

/** Ordem dos checkboxes na UI (não confundir com ordem de execução do pipeline). */
const CHECKBOXES: ReadonlyArray<CheckboxConfig> = [
  {
    key: 'delete_customers',
    title: 'Clientes',
    description: 'Remove todos os cadastros de clientes, contatos, portais e leads',
  },
  {
    key: 'delete_equipment',
    title: 'Equipamentos',
    description: 'Remove todos os equipamentos cadastrados nos clientes',
  },
  {
    key: 'delete_quotes',
    title: 'Orçamentos',
    description: 'Remove todos os orçamentos e propostas',
  },
  {
    key: 'delete_contracts',
    title: 'Contratos',
    description:
      'Remove todos os contratos, cronogramas PMOC e documentos PMOC personalizados',
  },
  {
    key: 'delete_service_orders',
    title: 'Ordens de Serviço',
    description:
      'Remove todas as OS, fotos, materiais consumidos, avaliações e formulários respondidos',
  },
  {
    key: 'delete_materials',
    title: 'Cadastro de Materiais',
    description: 'Remove todos os materiais cadastrados (e o estoque deles)',
  },
  {
    key: 'delete_stock',
    title: 'Estoque de Materiais',
    description: 'Zera o estoque (movimentações), mantém os materiais cadastrados',
  },
  {
    key: 'delete_financial_movements',
    title: 'Movimentações Financeiras',
    description:
      'Remove todas as transações de caixa, banco, cartão, receitas e despesas',
  },
  {
    key: 'delete_financial_categories',
    title: 'Categorias Financeiras',
    description: 'Remove as categorias financeiras personalizadas (as padrões são mantidas)',
  },
  {
    key: 'delete_employees',
    title: 'Funcionários e RH',
    description:
      'Remove todos os funcionários, vales, pagamentos, ponto eletrônico e equipes',
  },
  {
    key: 'delete_custom_configs',
    title: 'Configurações Personalizadas',
    description: 'Remove CRM stages personalizados, formulários de OS e recursos de custo',
  },
];

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
 * Mapa de PT-BR pra exibir nome legível do step no progresso.
 * Match com os labels dos checkboxes (sem reusar a key crua).
 */
const STEP_LABEL: Record<string, string> = {
  service_orders: 'Ordens de Serviço',
  contracts: 'Contratos',
  quotes: 'Orçamentos',
  equipment: 'Equipamentos',
  custom_configs: 'Configurações Personalizadas',
  financial_movements: 'Movimentações Financeiras',
  financial_categories: 'Categorias Financeiras',
  employees: 'Funcionários e RH',
  stock: 'Estoque de Materiais',
  materials: 'Cadastro de Materiais',
  customers: 'Clientes',
};

export function ResetSystemDialog({
  open,
  onOpenChange,
  companyName,
  companyId,
}: ResetSystemDialogProps) {
  const { toast } = useToast();
  const { reset, isLoading, currentStep, currentStepIndex, totalSteps } = useResetSystem();

  const [options, setOptions] = useState<ResetOptions>(EMPTY_OPTIONS);
  const [confirmName, setConfirmName] = useState('');
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  // Online/offline listener — feature destrutiva exige conexão (regra-lei #7).
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

  const allSelected = selectedCount === CHECKBOXES.length;

  const nameMatches = confirmName.trim() === companyName.trim() && companyName.trim().length > 0;

  const canConfirm = selectedCount > 0 && nameMatches && !isLoading && isOnline;

  // ===== Handlers de seleção =====

  const handleToggleAll = (checked: boolean) => {
    setOptions((prev) => {
      const next = { ...prev };
      for (const cfg of CHECKBOXES) {
        next[cfg.key] = checked;
      }
      return next;
    });
  };

  const handleToggle = (key: keyof ResetOptions, checked: boolean) => {
    setOptions((prev) => {
      const next = { ...prev, [key]: checked };

      // Regra: marcar Materiais auto-marca Estoque e bloqueia desmarcar Estoque
      // enquanto Materiais estiver marcado (não faz sentido apagar materiais
      // sem apagar suas movimentações).
      if (key === 'delete_materials' && checked) {
        next.delete_stock = true;
      }
      // Se desmarcar Materiais, Estoque permanece como o user deixou (default
      // já era true — não força reset).
      return next;
    });
  };

  // ===== Handler de confirmação =====

  const handleConfirm = async () => {
    if (!canConfirm) return;

    try {
      await reset(companyId, options);
      toast({
        title: 'Sistema zerado com sucesso',
        description: 'Os dados selecionados foram removidos. O log de auditoria foi gerado.',
      });
      onOpenChange(false);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const message = (err as { message?: string }).message ?? '';
      const step = (err as { step?: string }).step;

      const stepLabel = step ? STEP_LABEL[step] ?? step : null;
      const stepPrefix = stepLabel ? `Erro na etapa "${stepLabel}". ` : '';

      let toastMessage: string;
      if (code === '42501') {
        toastMessage =
          'Você não tem permissão pra zerar o sistema. Apenas o administrador da empresa pode fazer isso.';
      } else if (code === '57014') {
        toastMessage =
          'Uma etapa demorou demais. Tente novamente — o que já foi apagado continua apagado.';
      } else if (code === '23503') {
        toastMessage =
          'Não foi possível concluir a etapa por uma dependência inesperada. Avise o suporte com o nome da etapa.';
      } else if (code === '23505') {
        toastMessage =
          'Não foi possível recriar uma configuração padrão. Tente novamente em alguns segundos.';
      } else if (code === 'P0001' && message) {
        toastMessage = message;
      } else if (message) {
        toastMessage = message;
      } else {
        toastMessage = 'Não foi possível zerar o sistema. Tente novamente ou avise o suporte.';
      }

      toast({
        variant: 'destructive',
        title: 'Não foi possível zerar o sistema',
        description: `${stepPrefix}${toastMessage}`,
      });
    }
  };

  // Bloqueia close enquanto está rodando (não fecha por Esc, clique fora, X).
  const handleOpenChange = (nextOpen: boolean) => {
    if (isLoading && !nextOpen) return;
    onOpenChange(nextOpen);
  };

  // ===== Footer (muda durante execução) =====

  const currentStepLabel = currentStep ? STEP_LABEL[currentStep] ?? currentStep : '';
  const progressNumber = currentStepIndex >= 0 ? currentStepIndex + 1 : 1;

  const footer = isLoading ? (
    <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-warning" />
      <div className="text-sm text-foreground">
        <div className="font-medium">Apagando dados…</div>
        <div className="text-xs text-muted-foreground">
          Etapa <strong>{progressNumber}</strong> de <strong>{totalSteps}</strong>:{' '}
          {currentStepLabel || '…'}
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
        Cancelar
      </Button>
      <Button
        variant="destructive"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="w-full sm:w-auto"
      >
        <AlertTriangle className="mr-2 h-4 w-4" />
        Sim, Zerar Sistema
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Zerar Sistema — Ação Irreversível"
      footer={footer}
    >
      <div className="space-y-5">
        {/* Subtítulo */}
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <p className="text-sm text-foreground">
            Esta ação irá <strong className="text-destructive">DELETAR PERMANENTEMENTE</strong>{' '}
            todos os dados operacionais da empresa{' '}
            <strong className="text-foreground">{companyName || '—'}</strong>:
          </p>
        </div>

        {/* Master checkbox: Selecionar tudo */}
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
          <span className="text-sm font-medium text-foreground">Selecionar tudo</span>
          {selectedCount > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {selectedCount}/{CHECKBOXES.length} selecionados
            </span>
          )}
        </label>

        <Separator />

        {/* 11 checkboxes */}
        <div className="space-y-1">
          {CHECKBOXES.map((cfg) => {
            const isChecked = options[cfg.key];
            // Estoque é forçado quando Materiais marcado.
            const forcedByMaterials =
              cfg.key === 'delete_stock' && options.delete_materials;

            return (
              <label
                key={cfg.key}
                htmlFor={`reset-${cfg.key}`}
                className={`flex min-h-[44px] cursor-pointer items-start gap-3 rounded-md px-3 py-2 hover:bg-muted/40 transition-colors ${
                  isChecked ? 'bg-muted/20' : ''
                } ${forcedByMaterials ? 'opacity-90' : ''}`}
              >
                <Checkbox
                  id={`reset-${cfg.key}`}
                  checked={isChecked}
                  onCheckedChange={(c) => handleToggle(cfg.key, c === true)}
                  disabled={isLoading || forcedByMaterials}
                  className="mt-0.5"
                />
                <div className="flex-1 space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">{cfg.title}</div>
                  <div className="text-xs text-muted-foreground leading-snug">
                    {cfg.description}
                  </div>
                  {forcedByMaterials && (
                    <div className="text-[11px] text-muted-foreground italic">
                      Necessário porque o cadastro foi marcado.
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        <Separator />

        {/* Aviso vermelho — estado final */}
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            O sistema voltará ao estado inicial, como se a empresa tivesse acabado de ser criada.
          </p>
        </div>

        {/* O que é preservado */}
        <div className="rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Serão mantidos:</span>
          </div>
          <ul className="space-y-1 pl-6 text-xs text-muted-foreground list-disc">
            <li>Dados básicos da empresa</li>
            <li>Usuários cadastrados</li>
            <li>Histórico de pagamentos</li>
          </ul>
        </div>

        {/* Aviso final em vermelho/bold */}
        <div className="rounded-md border border-destructive bg-destructive/10 p-3">
          <p className="text-center text-sm font-bold text-destructive">
            Esta ação NÃO PODE ser desfeita!
          </p>
        </div>

        {/* Confirmação por nome */}
        <div className="space-y-2">
          <Label htmlFor="reset-confirm-name" className="text-xs font-semibold uppercase tracking-wide text-foreground">
            Para confirmar, digite o nome da empresa:
          </Label>
          <div className="rounded-md border bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium text-foreground select-none">
              {companyName || '—'}
            </span>
          </div>
          <Input
            id="reset-confirm-name"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder="Nome da empresa"
            disabled={isLoading}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {confirmName.length > 0 && !nameMatches && (
            <p className="text-xs text-destructive">
              O nome digitado não confere com o nome da empresa.
            </p>
          )}
        </div>

        {/* Aviso offline */}
        {!isOnline && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-xs text-foreground">
              Esta ação precisa de conexão com a internet. Você está offline.
            </p>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
