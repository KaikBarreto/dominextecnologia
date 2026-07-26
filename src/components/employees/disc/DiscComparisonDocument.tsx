// ─────────────────────────────────────────────────────────────────────────────
// DiscComparisonDocument — "PDF de comparação" entre DOIS funcionários no Perfil
// Comportamental (DISC). Espelha o DiscDossierDocument (dossiê individual), mas
// cruza os perfis A x B.
//
// Documento A4 vertical, TEMA CLARO PREMIUM hardcoded (mesma paleta do dossiê).
// NÃO faz fetch: recebe tudo por prop. Renderizado offscreen por
// discComparisonPdf.ts e capturado pelo pdfPageRenderer.
//
// TEMA: SEMPRE claro/branco hardcoded. Nada de tokens que seguem o tema do app —
// só cinzas explícitos + acentos na cor do fator primário de cada pessoa. Força
// CSS vars claras pros gráficos reusados (recharts/SVG usam currentColor /
// text-foreground) saírem legíveis no fundo branco.
//
// i18n: idioma da EMPRESA (prop `locale`). Lê MESSAGES[locale] DIRETO (não
// depende de provider — roda offscreen sem AppLocaleProvider).
// ─────────────────────────────────────────────────────────────────────────────

import type { DiscFactor } from '@/lib/disc/questions';
import type { DiscScores } from '@/lib/disc/scoring';
import { FACTOR_COLOR, resolveProfile } from '@/lib/disc/profiles';
import { relationshipKey } from '@/lib/disc/relationships';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { DiscCompareLineChart } from './DiscCompareLineChart';
import { DiscCompareRadar } from './DiscCompareRadar';
import { DiscEmotionalCompareRadar } from './DiscEmotionalCompareRadar';

// Cores das séries (iguais à tela de comparação: A azul, B laranja).
const COLOR_A = '#2563EB';
const COLOR_B = '#F59E0B';

// ── Paleta clara hardcoded (não segue o tema do app) ──────────────────────────
const INK = '#0F172A'; // slate-900 — títulos
const INK_SOFT = '#334155'; // slate-700 — corpo
const MUTED = '#64748B'; // slate-500 — legendas
const HAIRLINE = '#E2E8F0'; // slate-200 — bordas
const SURFACE = '#F8FAFC'; // slate-50 — cartões suaves

export interface DiscComparisonDocumentProps {
  scoresA: DiscScores;
  scoresB: DiscScores;
  nameA: string;
  nameB: string;
  positionA?: string | null;
  positionB?: string | null;
  /** Códigos de perfil (ex.: 'DI', 'DC'). */
  codeA: string;
  codeB: string;
  branding: { companyName: string; logoUrl?: string | null; isWhiteLabel: boolean };
  locale: LocaleCode;
  /** Data já formatada no locale da empresa. */
  generatedAtLabel: string;
}

// ── Título de seção com acento (cor do fator primário de A) ───────────────────
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

// ── Bloco de insight da relação (lista de bullets ou texto) ───────────────────
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
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: accent }}>
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

// ── Pill do perfil (código + nome, na cor do fator primário) ──────────────────
function ProfilePill({
  code,
  name,
  color,
  size = 'md',
}: {
  code: string;
  name: string;
  color: string;
  size?: 'sm' | 'md';
}) {
  const isSm = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? 6 : 10,
        padding: isSm ? '5px 12px' : '9px 18px',
        borderRadius: 999,
        background: color,
        color: '#FFFFFF',
      }}
    >
      <span style={{ fontSize: isSm ? 13 : 17, fontWeight: 900, letterSpacing: 1 }}>{code}</span>
      <span style={{ fontSize: isSm ? 12 : 15, fontWeight: 700 }}>{name}</span>
    </span>
  );
}

export function DiscComparisonDocument({
  scoresA,
  scoresB,
  nameA,
  nameB,
  positionA,
  positionB,
  codeA,
  codeB,
  branding,
  locale,
  generatedAtLabel,
}: DiscComparisonDocumentProps) {
  // i18n direto do dicionário do locale da empresa (sem provider).
  const t = MESSAGES[locale].app.discProfile;
  const d = t.dossier;
  const emp = MESSAGES[locale].app.employees.form.disc;
  const compare = emp.overview.compare;
  const pp = emp.profilePage;

  const metaA = resolveProfile(codeA);
  const metaB = resolveProfile(codeB);
  const primaryA = codeA[0] as DiscFactor;
  const primaryB = codeB[0] as DiscFactor;
  const accent = FACTOR_COLOR[primaryA];

  const nameProfileA: string = (t.profiles[metaA.code]?.nome as string) ?? metaA.code;
  const nameProfileB: string = (t.profiles[metaB.code]?.nome as string) ?? metaB.code;

  // Relação canônica do par (pode faltar se um par não tiver conteúdo curado).
  const rel = (
    t.relationships as Record<
      string,
      { friction: string[]; synergy: string[]; communication: string; dynamic: string }
    >
  )[relationshipKey(primaryA, primaryB)];

  // Coluna de um funcionário na seção "Perfis comparados".
  const PersonColumn = ({
    name,
    position,
    code,
    profileName,
    color,
  }: {
    name: string;
    position?: string | null;
    code: string;
    profileName: string;
    color: string;
  }) => (
    <div
      style={{
        breakInside: 'avoid',
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 14,
        padding: 18,
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: INK, lineHeight: 1.2 }}>{name}</div>
        {position && (
          <div style={{ fontSize: 13, color: MUTED, marginTop: 3 }}>
            {d.roleLabel}: {position}
          </div>
        )}
      </div>
      <div>
        <ProfilePill code={code} name={profileName} color={color} size="sm" />
      </div>
    </div>
  );

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
          // Força tema CLARO nos gráficos reusados (usam text-foreground /
          // currentColor). Sem isso, em dark mode os rótulos saem brancos e somem.
          '--foreground': '15 23 42', // slate-900
          '--muted-foreground': '100 116 139', // slate-500
          '--popover': '0 0% 100%',
          '--popover-foreground': '222 47% 11%',
          '--border': '214 32% 91%',
        } as React.CSSProperties
      }
    >
      {/* ══ 1. CAPA ══════════════════════════════════════════════════════════ */}
      <div
        data-pdf-keep
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
        <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, color: INK, lineHeight: 1.08 }}>
          {d.comparisonTitle}
        </h1>
        <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.55, color: MUTED, maxWidth: 520 }}>
          {d.comparisonSubtitle}
        </p>

        {/* Os dois nomes + selos dos perfis */}
        <div style={{ marginTop: 36, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: INK, lineHeight: 1.1 }}>{nameA}</div>
            <ProfilePill code={codeA} name={nameProfileA} color={FACTOR_COLOR[primaryA]} />
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, color: MUTED }}>×</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: INK, lineHeight: 1.1 }}>{nameB}</div>
            <ProfilePill code={codeB} name={nameProfileB} color={FACTOR_COLOR[primaryB]} />
          </div>
        </div>

        <div style={{ marginTop: 34, fontSize: 12.5, color: MUTED }}>
          {d.generatedAt}: {generatedAtLabel}
        </div>
      </div>

      {/* Corpo com padding consistente */}
      <div style={{ padding: '44px 56px' }}>
        {/* ══ 2. PERFIS COMPARADOS ═══════════════════════════════════════════ */}
        <section data-pdf-keep style={{ breakInside: 'avoid', marginBottom: 44 }}>
          <SectionTitle title={d.comparedLabel} accent={accent} />
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PersonColumn
                name={nameA}
                position={positionA}
                code={codeA}
                profileName={nameProfileA}
                color={FACTOR_COLOR[primaryA]}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PersonColumn
                name={nameB}
                position={positionB}
                code={codeB}
                profileName={nameProfileB}
                color={FACTOR_COLOR[primaryB]}
              />
            </div>
          </div>
        </section>

        {/* ══ 3. GRÁFICO DISC CRUZADO ════════════════════════════════════════ */}
        <section data-pdf-keep style={{ breakInside: 'avoid', marginBottom: 44 }}>
          <SectionTitle title={compare.discChartTitle} accent={accent} />
          <div style={{ width: 460, maxWidth: '100%', margin: '0 auto' }}>
            <DiscCompareLineChart
              scoresA={scoresA}
              scoresB={scoresB}
              nameA={nameA}
              nameB={nameB}
              colorA={COLOR_A}
              colorB={COLOR_B}
              codeA={codeA}
              codeB={codeB}
              locale={locale}
            />
          </div>
        </section>

        {/* ══ 4. RADAR DE COMPETÊNCIAS CRUZADO ═══════════════════════════════ */}
        {/* Box de LARGURA E ALTURA FIXAS: recharts precisa medir. */}
        <section data-pdf-keep style={{ breakInside: 'avoid', marginBottom: 44 }}>
          <SectionTitle title={compare.radarTitle} accent={accent} />
          <div style={{ width: 520, height: 440, maxWidth: '100%', margin: '0 auto' }}>
            <DiscCompareRadar
              scoresA={scoresA}
              scoresB={scoresB}
              nameA={nameA}
              nameB={nameB}
              colorA={COLOR_A}
              colorB={COLOR_B}
              codeA={codeA}
              codeB={codeB}
              locale={locale}
              className="lg:h-full"
            />
          </div>
        </section>

        {/* ══ 5. RADAR EMOCIONAL CRUZADO ═════════════════════════════════════ */}
        <section data-pdf-keep style={{ breakInside: 'avoid', marginBottom: 44 }}>
          <SectionTitle title={d.emotionalTitle} accent={accent} />
          <div style={{ width: 520, height: 440, maxWidth: '100%', margin: '0 auto' }}>
            <DiscEmotionalCompareRadar
              scoresA={scoresA}
              scoresB={scoresB}
              nameA={nameA}
              nameB={nameB}
              colorA={COLOR_A}
              colorB={COLOR_B}
              codeA={codeA}
              codeB={codeB}
              locale={locale}
              className="lg:h-full"
            />
          </div>
        </section>

        {/* ══ 6 + 7. DINÂMICA + ATRITOS/SINERGIAS/COMUNICAÇÃO ════════════════ */}
        {/* Se o par não tem conteúdo curado (rel undefined), esconde graciosamente. */}
        {rel && (
          <>
            {rel.dynamic && (
              <section data-pdf-keep style={{ breakInside: 'avoid', marginBottom: 44 }}>
                <SectionTitle title={pp.interactionsTitle} accent={accent} />
                <p
                  style={{
                    margin: 0,
                    border: `1px solid ${HAIRLINE}`,
                    borderRadius: 14,
                    padding: 16,
                    background: '#FFFFFF',
                    fontSize: 13,
                    lineHeight: 1.65,
                    color: INK_SOFT,
                  }}
                >
                  {rel.dynamic}
                </p>
              </section>
            )}

            <section style={{ marginBottom: 44 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <InsightBlock title={pp.friction} items={rel.friction} accent="#D97706" />
                <InsightBlock title={pp.synergy} items={rel.synergy} accent="#16A34A" />
                <InsightBlock title={pp.communication} text={rel.communication} accent="#0284C7" />
              </div>
            </section>
          </>
        )}

        {/* ══ 8. RODAPÉ ═══════════════════════════════════════════════════════ */}
        {/* Disclaimer sempre; assinatura Dominex só no NÃO white-label. */}
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
