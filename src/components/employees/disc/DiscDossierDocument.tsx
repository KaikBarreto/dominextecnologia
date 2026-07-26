// ─────────────────────────────────────────────────────────────────────────────
// DiscDossierDocument — "dossiê PDF" do Perfil Comportamental (DISC).
//
// Documento A4 vertical, TEMA CLARO PREMIUM (estilo "Prisma", mas claro). NÃO faz
// fetch: recebe tudo por prop. É renderizado offscreen por discDossierPdf.ts e
// capturado pelo pdfPageRenderer (html2canvas + fatiamento A4).
//
// TEMA: SEMPRE claro/branco hardcoded (regra "relatório é sempre branco"). Nada
// de text-foreground / tokens que seguem o tema do app — só cinzas explícitos +
// acentos na cor do fator primário (FACTOR_COLOR[primary]).
//
// i18n: idioma da EMPRESA (prop `locale`). Lê MESSAGES[locale].app.discProfile
// DIRETO (não depende de provider — roda offscreen sem AppLocaleProvider).
// ─────────────────────────────────────────────────────────────────────────────

import { DISC_FACTORS, type DiscFactor } from '@/lib/disc/questions';
import { classify, type DiscScores } from '@/lib/disc/scoring';
import { FACTOR_COLOR, resolveProfile } from '@/lib/disc/profiles';
import {
  computeCompetencies,
  type CompetencyKey,
} from '@/lib/disc/competencies';
import {
  computeEmotional,
  type EmotionalKey,
} from '@/lib/disc/emotional';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { DiscLineChart } from './DiscLineChart';
import { DiscRadar } from './DiscRadar';
import { DiscEmotionalRadar } from './DiscEmotionalRadar';

// Cor VIOLETA fixa do radar/lista emocional (combina com DiscEmotionalRadar).
const EMOTIONAL_VIOLET = '#7C3AED';

// ── Paleta clara hardcoded (não segue o tema do app) ──────────────────────────
const INK = '#0F172A'; // slate-900 — títulos
const INK_SOFT = '#334155'; // slate-700 — corpo
const MUTED = '#64748B'; // slate-500 — legendas
const HAIRLINE = '#E2E8F0'; // slate-200 — bordas
const SURFACE = '#F8FAFC'; // slate-50 — cartões suaves

export interface DiscDossierDocumentProps {
  scores: DiscScores;
  profileCode: string;
  employeeName: string;
  employeePosition?: string | null;
  branding: { companyName: string; logoUrl?: string | null; isWhiteLabel: boolean };
  locale: LocaleCode;
  /** Data já formatada no locale da empresa. */
  generatedAtLabel: string;
}

/** Converte string com \n\n em parágrafos limpos. */
function toParagraphs(text: string | undefined | null): string[] {
  return (text ?? '')
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Cor do acento por faixa de score (verde alto → neutro → vermelho baixo). */
function scoreTone(score: number): { accent: string; row: string } {
  if (score >= 60) return { accent: '#16A34A', row: 'rgba(22,163,74,0.08)' }; // verde
  if (score >= 35) return { accent: '#2563EB', row: 'rgba(37,99,235,0.07)' }; // neutro/azul
  return { accent: '#DC2626', row: 'rgba(220,38,38,0.07)' }; // vermelho
}

// ── Título de seção com acento na cor do fator primário ───────────────────────
function SectionTitle({
  kicker,
  title,
  accent,
}: {
  kicker?: string;
  title: string;
  accent: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      {kicker && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: accent,
            marginBottom: 4,
          }}
        >
          {kicker}
        </div>
      )}
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: INK, lineHeight: 1.2 }}>
        {title}
      </h2>
      <div
        style={{
          marginTop: 8,
          width: 46,
          height: 4,
          borderRadius: 999,
          background: accent,
        }}
      />
    </div>
  );
}

// ── Bloco genérico (lista de bullets ou texto corrido) ────────────────────────
function InsightBlock({
  title,
  items,
  text,
  accent,
}: {
  title: string;
  items?: readonly string[];
  text?: string;
  accent: string;
}) {
  return (
    <div
      data-pdf-keep
      style={{
        breakInside: 'avoid',
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 14,
        padding: 16,
        background: '#FFFFFF',
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          fontSize: 14,
          fontWeight: 800,
          color: accent,
        }}
      >
        {title}
      </h3>
      {items ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {items.map((item, i) => (
            <li
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                fontSize: 12.5,
                lineHeight: 1.55,
                color: INK_SOFT,
                marginBottom: 7,
              }}
            >
              <span
                style={{
                  marginTop: 7,
                  flex: 'none',
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: accent,
                }}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: INK_SOFT }}>{text}</p>
      )}
    </div>
  );
}

export function DiscDossierDocument({
  scores,
  profileCode,
  employeeName,
  employeePosition,
  branding,
  locale,
  generatedAtLabel,
}: DiscDossierDocumentProps) {
  // i18n direto do dicionário do locale da empresa (sem provider).
  const t = MESSAGES[locale].app.discProfile;
  const d = t.dossier;
  const career = t.careerMotivators;

  const classification = classify(scores);
  const meta = resolveProfile(profileCode);
  const primary = meta.primary as DiscFactor;
  const secondary = classification.secondary;
  const accent = FACTOR_COLOR[primary];

  const profileText = t.profiles[meta.code] ?? {};
  const profileName: string = profileText.nome ?? meta.code;

  // Nome do par por LETRAS CRUAS (como no ProfileBadge da tela).
  const rawP = profileCode[0] as DiscFactor;
  const rawS = profileCode[1] as DiscFactor | undefined;

  const bioParagraphs = toParagraphs(profileText.biografia);

  // Competências (deriva das 13 dims), ordenadas do maior score pro menor.
  // MESMA fonte usada tanto pelo parágrafo (top-4) quanto pela lista ranqueada.
  const rankedCompetencies = computeCompetencies(scores)
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((c) => ({
      key: c.key,
      value: c.value,
      label: (t.competencies[c.key as CompetencyKey] as string) ?? c.key,
    }));

  const topCompetencies = rankedCompetencies
    .slice(0, 4)
    .map((c) => c.label)
    .filter(Boolean);

  const competenciesParagraph = `${d.competenciesLead} ${topCompetencies.join(', ')}.`;

  // Perfil emocional (espelho das competências): 8 dimensões derivadas do DISC,
  // ordenadas do maior score pro menor. Barras/valores em VIOLETA fixo.
  const rankedEmotional = computeEmotional(scores)
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((e) => ({
      key: e.key,
      value: e.value,
      label: (t.emotional[e.key as EmotionalKey] as string) ?? e.key,
    }));

  // Seções em profundidade (rótulo de t.sections, conteúdo de t.profiles[code]).
  const listSections: Array<{ key: string; items?: readonly string[] }> = [
    { key: 'qualidades', items: profileText.qualidades },
    { key: 'pontosDeAtencao', items: profileText.pontosDeAtencao },
    { key: 'ondeBrilha', items: profileText.ondeBrilha },
    { key: 'comoLiderar', items: profileText.comoLiderar },
    { key: 'oQueEvitar', items: profileText.oQueEvitar },
  ];
  const textSections: Array<{ key: string; text?: string }> = [
    { key: 'comunicacaoIdeal', text: profileText.comunicacaoIdeal },
    { key: 'sobEstresse', text: profileText.sobEstresse },
  ];

  // Bloco reutilizável de motivadores por fator.
  const CareerColumn = ({ factor, label }: { factor: DiscFactor; label: string }) => {
    const m = career?.[factor];
    if (!m) return null;
    return (
      <div
        style={{
          breakInside: 'avoid',
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 14,
          padding: 18,
          background: '#FFFFFF',
        }}
      >
        {/* Cabeçalho da coluna (rótulo + pill do fator + headline) = 1 folha keep. */}
        <div data-pdf-keep>
          <div style={{ marginBottom: 10 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
                color: MUTED,
                marginBottom: 5,
              }}
            >
              {label}
            </div>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 14px',
                borderRadius: 999,
                background: FACTOR_COLOR[factor],
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: 0.2,
              }}
            >
              {t.factors[factor].name}
            </span>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 700, color: INK, lineHeight: 1.45 }}>
            {m.headline}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {m.points.map((pt, i) => (
            <div data-pdf-keep key={i}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: FACTOR_COLOR[factor], marginBottom: 2 }}>
                {pt.title}
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: INK_SOFT }}>{pt.body}</p>
            </div>
          ))}
        </div>
        {m.questions?.length > 0 && (
          <div data-pdf-keep style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
              {d.reflectionLabel}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {m.questions.map((q, i) => (
                <li
                  key={i}
                  style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.5, color: INK_SOFT, marginBottom: 5 }}
                >
                  <span style={{ color: FACTOR_COLOR[factor], fontWeight: 800 }}>?</span>
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      data-pdf-margins
      data-pdf-margin-top="72"
      data-pdf-margin-top-first="0"
      data-pdf-margin-bottom="64"
      style={
        {
          width: 794,
          background: '#FFFFFF',
          color: INK_SOFT,
          fontFamily: "'Montserrat', system-ui, -apple-system, sans-serif",
          // Força tema CLARO nos gráficos reusados (DiscLineChart/DiscRadar usam
          // text-foreground / currentColor). Sem isso, se o app estiver em dark
          // mode, os rótulos saem brancos e somem no fundo branco do dossiê.
          '--foreground': '15 23 42', // slate-900
          '--muted-foreground': '100 116 139', // slate-500
          '--popover': '0 0% 100%',
          '--popover-foreground': '222 47% 11%',
          '--border': '214 32% 91%',
        } as React.CSSProperties
      }
    >
      {/* ══ 1. CAPA PREMIUM ══════════════════════════════════════════════════ */}
      <div
        style={{
          position: 'relative',
          padding: '56px 56px 44px',
          background: `linear-gradient(150deg, ${SURFACE} 0%, #FFFFFF 60%)`,
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        {/* Faixa de acento no topo */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: accent }} />

        {/* Cabeçalho da empresa */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 40 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: INK, letterSpacing: 0.3 }}>
            {branding.companyName}
          </div>
          {branding.logoUrl && (
            <img
              data-pdf-logo
              src={branding.logoUrl}
              alt={branding.companyName}
              crossOrigin="anonymous"
              style={{ height: 40, maxWidth: 180, objectFit: 'contain' }}
            />
          )}
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: accent,
            marginBottom: 12,
          }}
        >
          {d.coverKicker}
        </div>
        <h1 style={{ margin: 0, fontSize: 40, fontWeight: 900, color: INK, lineHeight: 1.05 }}>
          {d.coverTitle}
        </h1>
        <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.55, color: MUTED, maxWidth: 520 }}>
          {d.coverSubtitle}
        </p>

        {/* Nome do funcionário + cargo + selo do perfil */}
        <div style={{ marginTop: 40 }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: INK, lineHeight: 1.1 }}>{employeeName}</div>
          {employeePosition && (
            <div style={{ fontSize: 15, color: MUTED, marginTop: 4 }}>
              {d.roleLabel}: {employeePosition}
            </div>
          )}
          <div
            style={{
              marginTop: 18,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 18px',
              borderRadius: 999,
              background: accent,
              color: '#FFFFFF',
            }}
          >
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: 1 }}>{profileCode}</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{profileName}</span>
          </div>
        </div>

        <div style={{ marginTop: 34, fontSize: 12.5, color: MUTED }}>
          {d.generatedAt}: {generatedAtLabel}
        </div>
      </div>

      {/* Corpo com padding consistente */}
      <div style={{ padding: '44px 56px' }}>
        {/* ══ 2. SOBRE O MÉTODO ═══════════════════════════════════════════════ */}
        {/* Seção curta: keep no bloco inteiro (título + parágrafos juntos). */}
        <section data-pdf-keep style={{ breakInside: 'avoid', marginBottom: 44 }}>
          <SectionTitle title={d.method.title} accent={accent} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(d.method.paragraphs as string[]).map((para, i) => (
              <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: INK_SOFT }}>
                {para}
              </p>
            ))}
          </div>
        </section>

        {/* ══ 3. SEU PERFIL ═══════════════════════════════════════════════════ */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle kicker={profileCode + ' · ' + profileName} title={d.profileSectionTitle} accent={accent} />
          {/* Bio pode ser longa (vários parágrafos): keep POR PARÁGRAFO pra
              nunca ultrapassar uma página inteira e virar bloco impróprio. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {bioParagraphs.map((para, i) => (
              <p data-pdf-keep key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.65, color: INK_SOFT }}>
                {para}
              </p>
            ))}
          </div>
          {/* Título do gráfico + gráfico = um bloco só (não separar do rótulo). */}
          <div data-pdf-keep style={{ breakInside: 'avoid' }}>
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: MUTED, marginBottom: 10 }}>
              {t.charts.barTitle}
            </div>
            <div style={{ maxWidth: 420, margin: '0 auto' }}>
              <DiscLineChart scores={scores} locale={locale} />
            </div>
          </div>
        </section>

        {/* ══ 4. PONTUAÇÃO POR FATOR (formatação condicional) ═════════════════ */}
        <section style={{ breakInside: 'avoid', marginBottom: 44 }}>
          <SectionTitle title={d.scoreTableTitle} accent={accent} />
          <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
            {d.scoreTableSubtitle}
          </p>
          <div data-pdf-keep style={{ border: `1px solid ${HAIRLINE}`, borderRadius: 14, overflow: 'hidden' }}>
            {DISC_FACTORS.map((f, i) => {
              const value = scores[f];
              const tone = scoreTone(value);
              return (
                <div
                  key={f}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '13px 16px',
                    background: tone.row,
                    borderTop: i > 0 ? `1px solid ${HAIRLINE}` : 'none',
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: FACTOR_COLOR[f],
                      color: '#FFFFFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 14,
                    }}
                  >
                    {f}
                  </span>
                  <span style={{ flex: 'none', width: 150, fontSize: 13, fontWeight: 700, color: INK }}>
                    {t.factors[f].name}
                  </span>
                  <span style={{ flex: 1, height: 10, borderRadius: 999, background: '#EEF2F6', position: 'relative', overflow: 'hidden' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${Math.max(2, Math.min(100, value))}%`,
                        borderRadius: 999,
                        background: tone.accent,
                      }}
                    />
                  </span>
                  <span style={{ flex: 'none', width: 46, textAlign: 'right', fontSize: 15, fontWeight: 800, color: tone.accent }}>
                    {Math.round(value)}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Legenda de faixas */}
          <div style={{ display: 'flex', gap: 18, marginTop: 12, flexWrap: 'wrap' }}>
            {[
              { c: '#16A34A', label: d.scoreLegendHigh },
              { c: '#2563EB', label: d.scoreLegendMid },
              { c: '#DC2626', label: d.scoreLegendLow },
            ].map((leg) => (
              <span key={leg.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: MUTED }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: leg.c }} />
                {leg.label}
              </span>
            ))}
          </div>
        </section>

        {/* ══ 5. COMPETÊNCIAS ═════════════════════════════════════════════════ */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle title={d.competenciesTitle} accent={accent} />
          {/* Radar (esquerda, largura FIXA p/ recharts medir) + lista ranqueada
              (direita, do maior ao menor). Cada lado é um bloco atômico. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div data-pdf-keep style={{ width: 400, flexShrink: 0 }}>
              <DiscRadar scores={scores} primary={primary} locale={locale} />
            </div>
            <div data-pdf-keep style={{ flex: 1, minWidth: 0 }}>
              {rankedCompetencies.map((c) => (
                <div
                  key={c.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 0',
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      width: 118,
                      fontSize: 12,
                      fontWeight: 700,
                      color: INK,
                      lineHeight: 1.25,
                    }}
                  >
                    {c.label}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 999,
                      background: '#EEF2F6',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${Math.max(2, Math.min(100, c.value))}%`,
                        borderRadius: 999,
                        background: accent,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      flex: 'none',
                      width: 30,
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 800,
                      color: accent,
                    }}
                  >
                    {Math.round(c.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p data-pdf-keep style={{ margin: '16px 0 0', fontSize: 13, lineHeight: 1.65, color: INK_SOFT }}>
            {competenciesParagraph}
          </p>
        </section>

        {/* ══ 5b. PERFIL EMOCIONAL ════════════════════════════════════════════ */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle title={d.emotionalTitle} accent={accent} />
          <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
            {d.emotionalLead}
          </p>
          {/* Radar emocional (esquerda, largura FIXA p/ recharts medir) + lista
              ranqueada (direita, maior→menor). Barras em VIOLETA fixo pra
              diferenciar da lista de competências (que usa a cor do primário). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div data-pdf-keep style={{ width: 400, flexShrink: 0 }}>
              <DiscEmotionalRadar scores={scores} primary={primary} locale={locale} />
            </div>
            <div data-pdf-keep style={{ flex: 1, minWidth: 0 }}>
              {rankedEmotional.map((e) => (
                <div
                  key={e.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 0',
                  }}
                >
                  <span
                    style={{
                      flex: 'none',
                      width: 118,
                      fontSize: 12,
                      fontWeight: 700,
                      color: INK,
                      lineHeight: 1.25,
                    }}
                  >
                    {e.label}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      height: 8,
                      borderRadius: 999,
                      background: '#EEF2F6',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${Math.max(2, Math.min(100, e.value))}%`,
                        borderRadius: 999,
                        background: EMOTIONAL_VIOLET,
                      }}
                    />
                  </span>
                  <span
                    style={{
                      flex: 'none',
                      width: 30,
                      textAlign: 'right',
                      fontSize: 13,
                      fontWeight: 800,
                      color: EMOTIONAL_VIOLET,
                    }}
                  >
                    {Math.round(e.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══ 6. PERFIL EM PROFUNDIDADE ═══════════════════════════════════════ */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle title={d.inDepthTitle} accent={accent} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {listSections.map((s) => (
              <InsightBlock key={s.key} title={t.sections[s.key]} items={s.items} accent={accent} />
            ))}
            {textSections.map((s) => (
              <InsightBlock key={s.key} title={t.sections[s.key]} text={s.text} accent={accent} />
            ))}
          </div>
        </section>

        {/* ══ 7. MOTIVADORES DE CARREIRA ══════════════════════════════════════ */}
        <section style={{ marginBottom: 44 }}>
          <SectionTitle title={d.careerTitle} accent={accent} />
          <p style={{ margin: '-6px 0 16px', fontSize: 12.5, color: MUTED, lineHeight: 1.55 }}>
            {d.careerLead}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: secondary && secondary !== primary ? '1fr 1fr' : '1fr', gap: 16 }}>
            <CareerColumn factor={primary} label={d.careerPrimaryLabel} />
            {secondary && secondary !== primary && (
              <CareerColumn factor={secondary} label={d.careerSecondaryLabel} />
            )}
          </div>
        </section>

        {/* ══ 8. RODAPÉ ═══════════════════════════════════════════════════════ */}
        {/* Disclaimer é conteúdo do relatório (aparece sempre). A assinatura
            Dominex (linha + logo preto + dominex.app) só no NÃO white-label —
            nunca expor a marca Dominex numa tela de tenant white-label. */}
        <footer data-pdf-keep style={{ breakInside: 'avoid' }}>
          <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.55, color: MUTED, maxWidth: 520 }}>
            {d.footerDisclaimer}
          </p>
          {!branding.isWhiteLabel && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: '1px solid rgba(0,0,0,0.08)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                textAlign: 'center',
              }}
            >
              <img
                data-pdf-logo
                src={DOMINEX_LOGO_BLACK_BASE64}
                alt="Dominex"
                crossOrigin="anonymous"
                style={{ height: 20, width: 'auto', objectFit: 'contain', display: 'block' }}
              />
              <span style={{ fontSize: 11, fontWeight: 400, color: MUTED, letterSpacing: 0.2 }}>
                dominex.app
              </span>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
