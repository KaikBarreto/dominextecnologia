// ─────────────────────────────────────────────────────────────────────────────
// DISC — relatorio do perfil comportamental (reusavel).
//
// Usado TANTO na tela publica anonima QUANTO no painel do RH (app logado). Por
// isso NAO depende de nenhum provider exclusivo do app: o locale entra por prop
// (fallback ao contexto, que devolve pt-br defensivo fora do provider).
//
// Entrada flexivel: passe `scores` + `profileCode` (ja calculados no banco/RPC),
// OU so `answers` (calcula na hora com scoreAndClassify). Se ambos vierem, os
// explicitos vencem, mas a posicao da roda (blendAngle/intensity) sempre deriva
// dos scores via classify() pra ficar coerente.
//
// TEMA:
//   - Cabecalho, blocos de insight e disclaimer: adaptaveis (text-foreground /
//     text-muted-foreground). Funcionam em claro E em escuro.
//   - Cards de grafico (ChartCard): mantidos com fundo branco hardcoded — sao
//     visuais-documento com eixos/grades que precisam de fundo claro.
//   - Na tela publica (PublicPortalShell) o tema claro e forcado no <html> via
//     useForceLightTheme, entao text-foreground resolve correto em claro.
// ─────────────────────────────────────────────────────────────────────────────

import {
  AlertTriangle,
  Briefcase,
  HelpCircle,
  Info,
  MessageCircle,
  Shield,
  Sparkles,
  Sprout,
  Users,
  XCircle,
} from 'lucide-react';
import type { DiscFactor } from '@/lib/disc/questions';
import {
  classify,
  computeScores,
  type DiscClassification,
  type DiscScores,
} from '@/lib/disc/scoring';
import { FACTOR_COLOR, resolveProfile } from '@/lib/disc/profiles';
import type { LocaleCode } from '@/lib/i18n/locales';
import { DiscEmotionalRadar } from './DiscEmotionalRadar';
import { DiscLineChart } from './DiscLineChart';
import { DiscRadar } from './DiscRadar';
import { interpolate, useDiscMessages } from './useDiscMessages';

export interface DiscReportProps {
  /** Escores 0-100 por fator. Se ausente, e calculado a partir de `answers`. */
  scores?: DiscScores;
  /** Codigo do perfil (ex.: 'DC'). Se ausente, deriva de classify(scores). */
  profileCode?: string;
  /** Respostas cruas { itemId: 1..5 } — usadas se `scores` nao vier. */
  answers?: Record<string, number>;
  /** Idioma; se ausente, cai no contexto (pt-br fora do provider). */
  locale?: LocaleCode;
  /** So os graficos + cabecalho, sem blocos de insight (uso compacto no RH). */
  variant?: 'full' | 'compact';
  /**
   * Oculta o <header> interno (selo + heading "Perfil DC · ...").
   * Use quando o contexto externo ja exibe o selo ao lado do nome do funcionario
   * (ex.: EmployeeProfileDetail, EmployeeProfile) para evitar duplicidade visual.
   * Nao passe (ou passe false) em contextos publicos ou modais sem cabecalho proprio.
   */
  hideHeader?: boolean;
  className?: string;
}

/** Chaves das secoes de insight, na ordem de exibicao do relatorio. */
type ListSectionKey = 'qualidades' | 'pontosDeAtencao' | 'comoLiderar' | 'oQueEvitar' | 'ondeBrilha';
type TextSectionKey = 'comunicacaoIdeal' | 'sobEstresse';

/**
 * Tom visual de cada bloco.
 * - `iconBg`: fundo saturado do icone (permanece).
 * - `accentText`: cor de acento do titulo e bullets — escolhida pra funcionar
 *   tanto no tema claro quanto no escuro (500/600 com bom contraste nos dois).
 * Nao ha mais `bg` nem `border` de card — removidos pelo CEO.
 */
const SECTION_STYLE: Record<
  ListSectionKey | TextSectionKey,
  { icon: typeof Sparkles; accentText: string; iconBg: string }
> = {
  qualidades: {
    icon: Sparkles,
    accentText: 'text-emerald-600',
    iconBg: 'bg-emerald-500',
  },
  pontosDeAtencao: {
    icon: AlertTriangle,
    accentText: 'text-amber-600',
    iconBg: 'bg-amber-500',
  },
  comoLiderar: {
    icon: Users,
    accentText: 'text-sky-600',
    iconBg: 'bg-sky-500',
  },
  oQueEvitar: {
    icon: XCircle,
    accentText: 'text-muted-foreground',
    iconBg: 'bg-slate-500',
  },
  ondeBrilha: {
    icon: Sprout,
    accentText: 'text-emerald-600',
    iconBg: 'bg-emerald-500',
  },
  comunicacaoIdeal: {
    icon: MessageCircle,
    accentText: 'text-indigo-600',
    iconBg: 'bg-indigo-500',
  },
  sobEstresse: {
    icon: Shield,
    accentText: 'text-rose-600',
    iconBg: 'bg-rose-500',
  },
};

const TEXT_SECTIONS: TextSectionKey[] = ['comunicacaoIdeal', 'sobEstresse'];

/** Bloco de motivadores de carreira por fator. Adaptavel ao tema (sem cor hardcoded). */
function CareerBlock({
  label,
  factorName,
  factorColor,
  motivators,
  reflectionLabel,
}: {
  label: string;
  factorName: string;
  factorColor: string;
  motivators: { headline: string; points: { title: string; body: string }[]; questions: string[] };
  reflectionLabel: string;
}) {
  return (
    <div className="space-y-3 p-1">
      {/* Rotulo do fator (primario / apoio) + nome do fator por extenso */}
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">{label}:</span>
        <span className="text-sm font-bold" style={{ color: factorColor }}>
          {factorName}
        </span>
      </div>

      {/* Headline do motivador */}
      <p className="text-sm font-semibold leading-snug text-foreground">{motivators.headline}</p>

      {/* Points (titulo + corpo) */}
      <div className="space-y-2.5 pl-1">
        {motivators.points.map((pt, i) => (
          <div key={i}>
            <div
              className="text-xs font-bold mb-0.5"
              style={{ color: factorColor }}
            >
              {pt.title}
            </div>
            <p className="text-sm leading-relaxed text-foreground">{pt.body}</p>
          </div>
        ))}
      </div>

      {/* Perguntas de reflexao */}
      {motivators.questions.length > 0 && (
        <div className="pt-1">
          <div className="mb-1.5 flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {reflectionLabel}
            </span>
          </div>
          <ul className="space-y-1.5 pl-1">
            {motivators.questions.map((q, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Bloco de insight em lista (com marcadores). Sem fundo de card. */
function ListBlock({
  sectionKey,
  title,
  items,
}: {
  sectionKey: ListSectionKey;
  title: string;
  items: readonly string[];
}) {
  const style = SECTION_STYLE[sectionKey];
  const Icon = style.icon;
  return (
    <div className="p-1">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}>
          <Icon className="h-4 w-4 text-white" strokeWidth={2.5} />
        </span>
        <h5 className={`text-sm font-bold ${style.accentText}`}>{title}</h5>
      </div>
      <ul className="space-y-2 pl-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed text-foreground">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.iconBg}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bloco de insight de texto corrido. Sem fundo de card. */
function TextBlock({
  sectionKey,
  title,
  text,
}: {
  sectionKey: TextSectionKey;
  title: string;
  text: string;
}) {
  const style = SECTION_STYLE[sectionKey];
  const Icon = style.icon;
  return (
    <div className="p-1">
      <div className="mb-2 flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}>
          <Icon className="h-4 w-4 text-white" strokeWidth={2.5} />
        </span>
        <h5 className={`text-sm font-bold ${style.accentText}`}>{title}</h5>
      </div>
      <p className="pl-1 text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

export function DiscReport({
  scores: scoresProp,
  profileCode: profileCodeProp,
  answers,
  locale,
  variant = 'full',
  hideHeader = false,
  className,
}: DiscReportProps) {
  const { t } = useDiscMessages(locale);

  // Fonte dos escores: prop explicita ou calculo a partir das respostas.
  const scores: DiscScores = scoresProp ?? computeScores(answers ?? {});
  // Classificacao (roda) sempre derivada dos escores pra ser coerente.
  const classification: DiscClassification = classify(scores);
  const profileCode = profileCodeProp ?? classification.profileCode;

  const meta = resolveProfile(profileCode);
  const primary = meta.primary as DiscFactor;
  const primaryColor = FACTOR_COLOR[primary];

  // Title usa as LETRAS CRUAS do profileCode (não o resolveProfile que canonicaliza/faz fallback).
  // Assim "CI" → "Conforme-Influente", "SD" → "Estável-Dominante", puro "C" → "Conforme".
  const _p = profileCode[0] as DiscFactor;
  const _s = profileCode[1] as DiscFactor | undefined;
  const personPair = t.factors[_p]
    ? _s && t.factors[_s]
      ? `${t.factors[_p].person}-${t.factors[_s].person}`
      : t.factors[_p].person
    : meta.code;

  // Insights do perfil, resolvidos por code (cai no puro se o combinado nao existe).
  const profileText = t.profiles[meta.code as keyof typeof t.profiles];

  const profileHeading = interpolate(t.sections.profileHeading, { code: profileCode });

  // Biografia narrativa do perfil — string com paragrafos separados por \n\n.
  // Defensivo: alguns perfis podem nao ter biografia; nesse caso a secao nao renderiza.
  const bioParagraphs = ((profileText as { biografia?: string }).biografia ?? '')
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    /*
     * max-w-3xl em mobile/tablet (como antes).
     * lg:max-w-5xl no desktop para o bento 2-colunas ter espaco suficiente.
     */
    <div className={`mx-auto w-full max-w-3xl lg:max-w-5xl ${className ?? ''}`}>
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        {/* Cabecalho — centralizado, largura total em todos os breakpoints.
            Omitido quando hideHeader=true (contexto ja exibe o selo no cabecalho externo). */}
        {!hideHeader && (
          <header className="text-center">
            <span
              title={personPair}
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold text-white shadow-sm"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="text-xs font-black tracking-wide">{profileCode}</span>
              <span>{profileText.nome}</span>
            </span>
            <h2 className="mt-3 text-xl font-bold text-foreground">
              {profileHeading}
              <span className="text-muted-foreground"> · </span>
              {profileText.nome}
            </h2>
          </header>
        )}

        {/* ── Biografia narrativa "Sobre o seu perfil" — em destaque, largura de
            leitura confortavel. Tela-documento clara, entao text-foreground
            resolve correto. So renderiza se o perfil tiver biografia. ── */}
        {bioParagraphs.length > 0 && (
          <section className="w-full">
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: primaryColor }}
              >
                <Sparkles className="h-4 w-4 text-white" strokeWidth={2.5} />
              </span>
              <h5 className="text-sm font-bold text-foreground">{t.ui.aboutProfileTitle}</h5>
            </div>
            <div className="space-y-3">
              {bioParagraphs.map((para, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground">
                  {para}
                </p>
              ))}
            </div>
          </section>
        )}

        {/*
         * ORDEM (desktop e mobile identica, so muda o arranjo em colunas):
         *   1. Grafico DISC
         *   2. Qualidades + Pontos de atencao
         *   3. Competencias (radar, largura total)
         *   4. Perfil emocional (radar, largura total)
         *   5. Perfil em profundidade (5 blocos de insight)
         *   6. Motivadores de carreira
         *
         * BENTO DESKTOP (lg+): passos 1-2 dividem uma linha de 2 colunas
         *   [Grafico DISC | Qualidades + Pontos]. Radares full-width. Insights
         *   em grid de 2 colunas.
         * Mobile/tablet (< lg): tudo empilha em 1 coluna, na mesma ordem acima.
         */}

        {/* ── Linha 1 do bento: Grafico DISC | Qualidades + Pontos ── */}
        {/*
         * Mobile: Grafico DISC aparece aqui, sozinho em largura total; o bloco
         *   Qualidades + Pontos vem logo abaixo (lg:hidden), antes dos radares.
         * Desktop: grid 2 colunas — DISC a esquerda, Qualidades + Pontos a direita.
         */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          {/* Grafico DISC */}
          <div>
            <h4 className="mb-3 text-center text-sm font-semibold text-muted-foreground">
              {t.charts.barTitle}
            </h4>
            <DiscLineChart scores={scores} locale={locale} className="mx-auto" />
          </div>

          {/* Qualidades + Pontos de atencao — visivel SOMENTE no desktop (lg+) */}
          {variant === 'full' && (
            <div className="hidden lg:flex lg:flex-col lg:gap-4">
              <ListBlock
                sectionKey="qualidades"
                title={t.sections.qualidades}
                items={profileText.qualidades}
              />
              <ListBlock
                sectionKey="pontosDeAtencao"
                title={t.sections.pontosDeAtencao}
                items={profileText.pontosDeAtencao}
              />
            </div>
          )}
        </div>

        {/* Qualidades + Pontos de atencao — visivel SOMENTE no mobile (< lg).
            Fica AQUI (logo apos o grafico DISC) para manter a ordem-alvo no
            mobile: DISC -> Qualidades+Pontos -> radares. No desktop estes dois
            blocos aparecem ao lado do grafico DISC (bento acima). */}
        {variant === 'full' && (
          <div className="lg:hidden space-y-4">
            <ListBlock
              sectionKey="qualidades"
              title={t.sections.qualidades}
              items={profileText.qualidades}
            />
            <ListBlock
              sectionKey="pontosDeAtencao"
              title={t.sections.pontosDeAtencao}
              items={profileText.pontosDeAtencao}
            />
          </div>
        )}

        {/* ── Dois radares lado a lado no desktop, empilhados no mobile ──
         *
         * ATENCAO recharts: ResponsiveContainer mede ERRADO dentro de CSS grid
         * (renderiza minusculo). NAO usar CSS grid aqui. Usamos FLEXBOX:
         *   - Mobile (< lg): flex-col => empilhados, cada coluna w-full.
         *   - Desktop (lg+): flex-row => lado a lado; cada coluna lg:flex-1
         *     lg:min-w-0, o que garante largura real ~metade para o recharts
         *     medir corretamente e renderizar grande.
         * O leve full-bleed (-mx-2 sm:mx-0) dentro de cada radar evita cortar
         * os rotulos externos no mobile.
         */}
        <div className="flex flex-col lg:flex-row lg:items-stretch lg:gap-6">
          {/* Coluna 1: Competencias comportamentais */}
          <div className="w-full min-w-0 lg:flex-1 lg:flex lg:flex-col">
            {/* Header — altura reservada igual ao da coluna 2 */}
            <div className="shrink-0">
              <h4 className="text-center text-lg font-bold text-foreground">
                {t.charts.radarTitle}
              </h4>
              {/* Subtitulo com min-h reservado (lg) para casar com o do emocional */}
              <div className="lg:min-h-[2.75rem]">
                <p className="mx-auto mt-1 mb-2 max-w-xl text-center text-sm leading-snug text-muted-foreground">
                  {t.dossier.competenciesLead}
                </p>
              </div>
            </div>
            <div className="w-full min-w-0 -mx-2 sm:mx-0">
              <DiscRadar scores={scores} primary={primary} locale={locale} />
            </div>
          </div>

          {/* Coluna 2: Perfil emocional */}
          <div className="w-full min-w-0 lg:flex-1 lg:flex lg:flex-col">
            {/* Header — altura reservada igual ao da coluna 1 */}
            <div className="shrink-0">
              <h4 className="text-center text-lg font-bold text-foreground">
                {t.dossier.emotionalTitle}
              </h4>
              {/* Subtitulo com min-h reservado (lg) para casar com o de competencias */}
              <div className="lg:min-h-[2.75rem]">
                <p className="mx-auto mt-1 mb-2 max-w-xl text-center text-sm leading-snug text-muted-foreground">
                  {t.dossier.emotionalLead}
                </p>
              </div>
            </div>
            <div className="w-full min-w-0 -mx-2 sm:mx-0">
              <DiscEmotionalRadar scores={scores} primary={primary} locale={locale} />
            </div>
          </div>
        </div>

        {/* Blocos de insight ("Perfil em profundidade") — so no variant full,
            adaptaveis ao tema, sem fundo. Qualidades+Pontos ja apareceram acima
            (ao lado do DISC no desktop, logo apos o DISC no mobile). */}
        {variant === 'full' && (
          <>
            {/*
             * Demais insights ("Perfil em profundidade"): 1 coluna no mobile,
             * 2 colunas no desktop. Ordem fixa (definida pelo Tech Lead):
             * ondeBrilha, comoLiderar, oQueEvitar, comunicacaoIdeal, sobEstresse
             * (5 blocos => 2+2+1 no grid de 2 colunas).
             */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
              {(['ondeBrilha', 'comoLiderar', 'oQueEvitar'] as ListSectionKey[]).map((key) => (
                <ListBlock
                  key={key}
                  sectionKey={key}
                  title={t.sections[key]}
                  items={profileText[key]}
                />
              ))}
              {TEXT_SECTIONS.map((key) => (
                <TextBlock
                  key={key}
                  sectionKey={key}
                  title={t.sections[key]}
                  text={profileText[key]}
                />
              ))}
            </div>
          </>
        )}

        {/* ── Motivadores de carreira (so no variant full) ── */}
        {variant === 'full' && (() => {
          // Fator primario e secundario pelas LETRAS CRUAS do profileCode.
          const careerPrimary = (profileCode[0] as DiscFactor) ?? classify(scores).primary;
          const careerSecondaryRaw = profileCode[1] as DiscFactor | undefined;
          const careerSecondary: DiscFactor | undefined =
            careerSecondaryRaw && careerSecondaryRaw !== careerPrimary
              ? careerSecondaryRaw
              : undefined;

          const motivators = t.careerMotivators;
          const primaryMotivators = motivators[careerPrimary];
          const secondaryMotivators = careerSecondary ? motivators[careerSecondary] : undefined;

          if (!primaryMotivators) return null;

          return (
            <section className="space-y-5 border-t border-border pt-6">
              {/* Titulo de SECAO do perfil (nao um topico colorido como os demais) */}
              <div>
                <div className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5 shrink-0 text-foreground" strokeWidth={2.5} />
                  <h3 className="text-lg font-bold text-foreground">{t.dossier.careerTitle}</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground leading-snug">{t.dossier.careerLead}</p>
              </div>

              {/* Grade de 1 ou 2 colunas dependendo de haver secundario */}
              <div className={`grid grid-cols-1 gap-4 ${careerSecondary ? 'lg:grid-cols-2' : ''}`}>
                {/* Bloco do fator primario */}
                <CareerBlock
                  label={t.dossier.careerPrimaryLabel}
                  factorName={t.factors[careerPrimary].name}
                  factorColor={FACTOR_COLOR[careerPrimary]}
                  motivators={primaryMotivators}
                  reflectionLabel={t.dossier.reflectionLabel}
                />

                {/* Bloco do fator secundario (so se houver) */}
                {careerSecondary && secondaryMotivators && (
                  <CareerBlock
                    label={t.dossier.careerSecondaryLabel}
                    factorName={t.factors[careerSecondary].name}
                    factorColor={FACTOR_COLOR[careerSecondary]}
                    motivators={secondaryMotivators}
                    reflectionLabel={t.dossier.reflectionLabel}
                  />
                )}
              </div>
            </section>
          );
        })()}

        {/* Disclaimer — adaptavel ao tema */}
        <footer className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{t.disclaimer}</p>
        </footer>
      </div>
    </div>
  );
}
