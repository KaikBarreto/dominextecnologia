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
    <div className="min-w-0 space-y-3">
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
          <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 break-words">{t.portalSectionsTitle}</span>
          {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground break-words">
            {t.portalSectionsDesc}
          </p>
        </div>
        {passwordConfigured && !passwordStatusLoading && (
          <p className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.portalSectionsPasswordHint}</span>
          </p>
        )}
      </div>

      {/* Guarda de UX: sem senha no cadastro do cliente, "Com senha" trancaria a
          seção sem ninguém conseguir abrir. Avisa e oferece o caminho. */}
      {!passwordConfigured && !passwordStatusLoading && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs leading-relaxed text-foreground/80 break-words">
            {t.portalSectionsNoPassword}
          </p>
          {onOpenCustomer && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full shrink-0 justify-center rounded-lg sm:w-auto"
              onClick={onOpenCustomer}
            >
              {t.portalSectionsNoPasswordCta}
            </Button>
          )}
        </div>
      )}

      {/* Grade compacta: duas colunas no desktop e uma no mobile.
          O rótulo fica SEMPRE acima do seletor. Breakpoint do Tailwind olha a
          largura da JANELA, não a do container: neste cartão a coluna central
          do contrato tem ~250px mesmo numa tela de 1440, então pôr rótulo e
          seletor lado a lado em xl espremia "Visão Geral" numa letra por linha
          e cortava a pílula "Com senha". */}
      <div className="grid overflow-hidden rounded-lg border border-border bg-border gap-px md:grid-cols-2">
        {CONTRACT_PORTAL_SECTION_KEYS.map((key) => {
          const state = sections[key] ?? 'free';
          return (
            <div
              key={key}
              className="flex min-w-0 flex-col gap-2 bg-card p-3"
            >
              <p className="min-w-0 break-words text-xs font-medium">{SECTION_LABEL[key]}</p>
              <div
                role="group"
                aria-label={SECTION_LABEL[key]}
                className="grid w-full min-w-0 grid-cols-3 gap-1 rounded-lg border border-border bg-muted/30 p-1"
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
                        // 10px + padding apertado: a coluna central do contrato
                        // dá ~69px por pílula, e "Sem senha" a 11px com px-1.5
                        // virava "Sem sen...". Aqui o rótulo inteiro cabe.
                        'min-w-0 truncate rounded-md px-1 py-1.5 text-[10px] font-semibold leading-tight transition-colors',
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
