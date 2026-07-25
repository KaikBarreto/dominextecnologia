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

  // Insights do perfil, resolvidos por code (cai no puro se o combinado nao existe).
  const profileText = t.profiles[meta.code as keyof typeof t.profiles];

  const profileHeading = interpolate(t.sections.profileHeading, { code: profileCode });

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

        {/*
         * BENTO DESKTOP (lg+):
         *   Linha 1: [Grafico DISC | Qualidades + Pontos de atencao empilhados]
         *   Linha 2: Competencias Radar — LARGURA TOTAL (full-width)
         *   Linha 3+: demais insights em 2 colunas
         *
         * Mobile/tablet (< lg): pilha vertical, inalterado.
         */}

        {/* ── Linha 1 do bento: Grafico DISC | 2 primeiros insights ── */}
        {/*
         * Mobile: Grafico DISC aparece aqui, sozinho em largura total.
         * Desktop: grid 2 colunas — DISC a esquerda, 2 primeiros insights a direita.
         * Os 2 primeiros insights ficam OCULTOS aqui no mobile (aparecem na secao
         * de insights abaixo junto com os demais, para manter a ordem correta).
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

        {/* ── Linha 2 do bento: Competencias Radar — FLEX 2-col no desktop ── */}
        {/*
         * Desktop (lg+): flex row — titulo grande (260px fixo, shrink-0) a
         *   esquerda + radar (flex-1 min-w-0) a direita. O flex-1 min-w-0
         *   garante que o ResponsiveContainer do recharts mede a largura correta
         *   (~700px na coluna direita), diferente do grid que causava radar minusculo.
         *   NAO usar CSS grid aqui — a medicao do recharts fica errada.
         *
         * Mobile (< lg): empilhado — titulo pequeno centralizado em cima (lg:hidden),
         *   radar embaixo em largura total com leve full-bleed (-mx-2).
         *   O titulo grande do desktop fica hidden no mobile (hidden lg:block).
         */}
        {/*
         * Radar em LARGURA TOTAL (o recharts ResponsiveContainer so mede certo
         * com largura definida — em coluna flex/grid ele renderiza minusculo).
         * Titulo grande alinhado a esquerda em cima (2 linhas no desktop),
         * radar grande embaixo em largura total. Mobile: titulo menor centralizado.
         */}
        <div>
          <h4 className="mb-2 text-center text-lg font-bold text-foreground">
            {t.charts.radarTitle}
          </h4>
          {/* Radar em largura total (grande, sem cortar rotulos). */}
          <div className="w-full min-w-0 -mx-2 sm:mx-0">
            <DiscRadar scores={scores} primary={primary} locale={locale} />
          </div>
        </div>

        {/* Blocos de insight (so no variant full) — adaptaveis ao tema, sem fundo */}
        {variant === 'full' && (
          <>
            {/*
             * Mobile (< lg): todos os 7 blocos em 1 coluna, incluindo qualidades
             * e pontosDeAtencao (que estao ocultos no bento acima).
             * Desktop (lg+): apenas os 5 ultimos blocos em 2 colunas (qualidades
             * e pontosDeAtencao ja aparecem ao lado do grafico DISC acima).
             */}

            {/* Qualidades + Pontos de atencao — visivel SOMENTE no mobile (< lg) */}
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

            {/*
             * Demais insights: 1 coluna no mobile, 2 colunas no desktop.
             * No desktop: comoLiderar, oQueEvitar, ondeBrilha, comunicacaoIdeal,
             * sobEstresse (5 blocos => 2+2+1 no grid de 2 colunas).
             */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
              {(['comoLiderar', 'oQueEvitar', 'ondeBrilha'] as ListSectionKey[]).map((key) => (
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

        {/* Disclaimer — adaptavel ao tema */}
        <footer className="flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">{t.disclaimer}</p>
        </footer>
      </div>
    </div>
  );
}
