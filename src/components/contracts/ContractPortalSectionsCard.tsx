import { KeyRound, Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';
import {
  CONTRACT_PORTAL_SECTION_KEYS,
  type ContractPortalSectionKey,
  type ContractPortalSections,
  type ContractPortalSectionState,
} from '@/lib/contractPortalSections';

interface ContractPortalSectionsCardProps {
  locale: LocaleCode;
  sections: ContractPortalSections;
  onChange: (key: ContractPortalSectionKey, state: ContractPortalSectionState) => void;
  /**
   * O cliente DONO do contrato tem senha configurada no Portal do Cliente?
   * Sem isso, "Com senha" fica DESABILITADO: a senha deste portal é a de lá, e
   * sem ela o tenant trancaria a seção sem ninguém conseguir abrir.
   */
  passwordConfigured: boolean;
  /** Enquanto carrega as configurações do cliente, não prometemos "Com senha". */
  passwordStatusLoading?: boolean;
  saving?: boolean;
  /** Caminho pra configurar a senha (cadastro do cliente). */
  onOpenCustomer?: () => void;
}

export function ContractPortalSectionsCard({
  locale,
  sections,
  onChange,
  passwordConfigured,
  passwordStatusLoading = false,
  saving = false,
  onOpenCustomer,
}: ContractPortalSectionsCardProps) {
  const t = MESSAGES[locale].app.pmoc.contractDetail.overview;

  const SECTION_LABEL: Record<ContractPortalSectionKey, string> = {
    visao_geral: t.portalSectionOverview,
    equipamentos: t.portalSectionEquipment,
    cronograma: t.portalSectionSchedule,
    ocorrencias: t.portalSectionOccurrences,
    documentos: t.portalSectionDocuments,
    historico: t.portalSectionHistory,
    historico_pmoc: t.portalSectionHistoryPmoc,
    cobrancas: t.portalSectionCharges,
  };

  // Pílula ATIVA = fill saturado + texto branco (régua de UI do CEO: nunca tint
  // claro com texto colorido). Mesmos tons do seletor do Portal do Cliente.
  const CHOICES: Array<{
    value: ContractPortalSectionState;
    label: string;
    activeClass: string;
  }> = [
    { value: 'hidden', label: t.portalSectionsStateHidden, activeClass: 'bg-muted-foreground text-white' },
    { value: 'free', label: t.portalSectionsStateFree, activeClass: 'bg-warning text-white' },
    { value: 'password', label: t.portalSectionsStatePassword, activeClass: 'bg-primary text-white' },
  ];

  const passwordDisabled = !passwordConfigured || passwordStatusLoading;

  return (
    <div className="min-w-0 space-y-3 rounded-xl bg-muted/35 p-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words">{t.portalSectionsTitle}</span>
          {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">
          {t.portalSectionsDesc}
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground break-words">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{t.portalSectionsPasswordHint}</span>
        </p>
      </div>

      {/* Guarda de UX: sem senha no cadastro do cliente, "Com senha" trancaria a
          seção sem ninguém conseguir abrir. Avisa e oferece o caminho. */}
      {!passwordConfigured && !passwordStatusLoading && (
        <div className="rounded-lg border border-dashed border-border bg-card p-3">
          <p className="text-xs leading-relaxed text-muted-foreground break-words">
            {t.portalSectionsNoPassword}
          </p>
          {onOpenCustomer && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full justify-center rounded-xl sm:w-auto"
              onClick={onOpenCustomer}
            >
              {t.portalSectionsNoPasswordCta}
            </Button>
          )}
        </div>
      )}

      {/* Tabela limpa: uma linha por seção, dividida por linha fina. */}
      <div className="divide-y divide-border rounded-lg border border-border bg-card px-3">
        {CONTRACT_PORTAL_SECTION_KEYS.map((key) => {
          const state = sections[key] ?? 'free';
          return (
            <div
              key={key}
              className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <p className="min-w-0 break-words text-sm">{SECTION_LABEL[key]}</p>
              <div
                role="group"
                aria-label={SECTION_LABEL[key]}
                className="grid w-full min-w-0 shrink-0 grid-cols-3 gap-1 rounded-lg border border-border bg-muted/30 p-1 sm:w-auto"
              >
                {CHOICES.map((choice) => {
                  const isActive = state === choice.value;
                  const disabled =
                    saving || (choice.value === 'password' && passwordDisabled && !isActive);
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      aria-pressed={isActive}
                      disabled={disabled}
                      title={
                        choice.value === 'password' && passwordDisabled
                          ? t.portalSectionsNoPassword
                          : undefined
                      }
                      onClick={() => onChange(key, choice.value)}
                      className={cn(
                        // 11px + padding menor no celular: em 390px o rótulo
                        // "Sem senha" truncava ("Sem sen...") dentro da pílula.
                        'min-w-0 truncate rounded-md px-1.5 py-1.5 text-[11px] font-semibold transition-colors sm:px-2 sm:text-xs',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                        isActive
                          ? choice.activeClass
                          : 'border border-border bg-card text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ContractPortalSectionsCard;
