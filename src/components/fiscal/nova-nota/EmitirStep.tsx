import { ShieldAlert, AlertTriangle, Building2, User, MapPin, FileText, DollarSign } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatDate } from '@/lib/format';
import type { NfseCustomer, NfseServicoState, NfseValoresState, NfseFisqalTaxResult } from './types';

interface EmitirStepProps {
  loading: boolean;
  prestador: {
    razaoSocial?: string | null;
    cnpj?: string | null;
    inscricaoMunicipal?: string | null;
    cidade?: string | null;
    uf?: string | null;
  };
  tomador: NfseCustomer | null;
  intermediario: NfseCustomer | null;
  dataCompetencia: string;
  servico: NfseServicoState;
  valores: NfseValoresState;
  taxes: NfseFisqalTaxResult;
  /** Bloqueios de habilitação (certificado Fisqal). Vazio = ok. */
  habilitacaoErrors?: string[];
  /** Avisos não-bloqueantes (ex: sem inscrição municipal). */
  habilitacaoWarnings?: string[];
}

export function EmitirStep({
  loading,
  prestador,
  tomador,
  intermediario,
  dataCompetencia,
  servico,
  valores,
  taxes,
  habilitacaoErrors = [],
  habilitacaoWarnings = [],
}: EmitirStepProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const s = MESSAGES[locale].app.nfse.stepper;

  const tomadorNome =
    tomador?.company_name || tomador?.nome_fantasia || tomador?.name || '—';
  const intermediarioNome = intermediario
    ? intermediario.company_name || intermediario.nome_fantasia || intermediario.name
    : null;

  const dataFormatada = dataCompetencia
    ? formatDate(dataCompetencia, locale as any, timezone)
    : '—';

  // tpRetIssqn '1' = NÃO retido (ISS devido pelo prestador); '2'/'3' = retido.
  const issRetidoLabel =
    valores.tpRetIssqn === '1' ? s.emitir.issDue : s.emitir.issRetido;

  return (
    <div className="space-y-4">
      {/* Bloqueios de habilitação */}
      {habilitacaoErrors.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
          <div className="space-y-0.5">
            <p className="font-semibold text-red-700 dark:text-red-400">
              {s.emitir.habilitacaoBlockedTitle}
            </p>
            {habilitacaoErrors.map((msg, i) => (
              <p key={i} className="text-red-700/90 dark:text-red-400/90">
                {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Avisos não-bloqueantes */}
      {habilitacaoWarnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-0.5">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              {s.emitir.habilitacaoWarningTitle}
            </p>
            {habilitacaoWarnings.map((msg, i) => (
              <p key={i} className="text-amber-700/90 dark:text-amber-400/90">
                {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Resumo tipo DANFS-e */}
      <div className="rounded-xl border border-border overflow-hidden">
        {/* Cabeçalho */}
        <div className="bg-primary px-5 py-3 text-white">
          <p className="text-xs font-bold uppercase tracking-widest opacity-80">
            {s.emitir.previewTitle}
          </p>
          <p className="text-xs opacity-70 mt-0.5">{s.emitir.previewSubtitle}</p>
        </div>

        <div className="divide-y divide-border/60">
          {/* Prestador */}
          <Section icon={Building2} title={s.emitir.sections.prestador}>
            <SummaryLine label={s.emitir.fields.razaoSocial} value={prestador.razaoSocial} />
            <SummaryLine label={s.emitir.fields.cnpj} value={prestador.cnpj} />
            {prestador.inscricaoMunicipal && (
              <SummaryLine label={s.emitir.fields.inscricaoMunicipal} value={prestador.inscricaoMunicipal} />
            )}
            <SummaryLine
              label={s.emitir.fields.municipio}
              value={[prestador.cidade, prestador.uf].filter(Boolean).join(' - ') || null}
            />
          </Section>

          {/* Tomador */}
          <Section icon={User} title={s.emitir.sections.tomador}>
            {tomador ? (
              <>
                <SummaryLine label={s.emitir.fields.tomadorNome} value={tomadorNome} />
                <SummaryLine label={s.emitir.fields.tomadorDoc} value={tomador.document} />
                <SummaryLine
                  label={s.emitir.fields.tomadorCidade}
                  value={[tomador.city, tomador.state].filter(Boolean).join(' - ') || null}
                />
              </>
            ) : (
              <p className="text-sm text-destructive">{s.emitir.tomadorEmpty}</p>
            )}
            {intermediarioNome && (
              <SummaryLine label={s.emitir.fields.intermediario} value={intermediarioNome} />
            )}
          </Section>

          {/* Serviço */}
          <Section icon={MapPin} title={s.emitir.sections.servico}>
            <SummaryLine label={s.emitir.fields.dataCompetencia} value={dataFormatada} />
            <SummaryLine label={s.emitir.fields.municipioIncidencia} value={servico.municipioIncidenciaNome || servico.municipioIncidenciaIbge || null} />
            {servico.codigoServico && (
              <SummaryLine label={s.emitir.fields.codigoServico} value={servico.codigoServico} />
            )}
            {servico.codigoNbs && (
              <SummaryLine label={s.emitir.fields.codigoNbs} value={servico.codigoNbs} />
            )}
            <SummaryLine label={s.emitir.fields.discriminacao} value={servico.discriminacao || null} multiline />
          </Section>

          {/* Valores */}
          <Section icon={DollarSign} title={s.emitir.sections.valores}>
            <SummaryLine
              label={s.emitir.fields.valorServico}
              value={formatMoney(valores.valorServico, currency, locale as any)}
            />
            <SummaryLine
              label={s.emitir.fields.aliquotaIss}
              value={`${valores.aliquotaIssqn || 0}%`}
            />
            <SummaryLine
              label={s.emitir.fields.issValor}
              value={`${formatMoney(taxes.issValor, currency, locale as any)} (${issRetidoLabel})`}
            />
            {taxes.totalRetencoesFederais > 0 && (
              <SummaryLine
                label={s.emitir.fields.retencoesFederais}
                value={formatMoney(taxes.totalRetencoesFederais, currency, locale as any)}
              />
            )}
            <div className="flex items-center justify-between py-2 mt-1 border-t border-border/60">
              <span className="font-bold text-foreground">{s.emitir.fields.valorLiquido}</span>
              <span className="font-bold text-primary tabular-nums text-base">
                {formatMoney(taxes.valorLiquido, currency, locale as any)}
              </span>
            </div>
          </Section>
        </div>
      </div>

      {loading && (
        <p className="text-center text-sm text-muted-foreground animate-pulse">
          {s.emitir.loadingMessage}
        </p>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{title}</p>
      </div>
      {children}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div className={`flex gap-2 text-sm ${multiline ? 'flex-col' : 'items-start justify-between'}`}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`font-medium text-foreground ${multiline ? '' : 'text-right'}`}>
        {value}
      </span>
    </div>
  );
}

export default EmitirStep;
