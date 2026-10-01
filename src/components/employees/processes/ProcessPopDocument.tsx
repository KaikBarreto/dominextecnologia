// ─────────────────────────────────────────────────────────────────────────────
// ProcessPopDocument — o POP (Procedimento Operacional Padrão) em A4 claro.
//
// É o entregável que justifica a feature: o desenho serve pra ver o todo, mas
// quem precisa EXECUTAR (ou auditar) precisa de um documento com objetivo,
// escopo, responsáveis e passo a passo numerado. É o papel que o cliente
// corporativo e a auditoria pedem.
//
// Convenções herdadas do dossiê DISC (`DiscDossierDocument.tsx`):
// - estilo INLINE, não Tailwind: o documento é montado offscreen e capturado
//   por html2canvas; depender de classe utilitária aqui é pedir surpresa;
// - `data-pdf-keep` + `breakInside: 'avoid'` em todo bloco que não pode ser
//   cortado no meio pela fatiadora de páginas do `pdfPageRenderer`;
// - recebe `locale` por prop e lê MESSAGES direto, SEM AppLocaleProvider, pra
//   funcionar também fora do app logado.
//
// Rodapé Dominex suprimido quando o tenant é white-label.
// ─────────────────────────────────────────────────────────────────────────────

import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';
import { buildPopOutline, type PopStep } from '@/lib/flowchart/popOutline';
import type { ProcessGraph, ProcessMeta } from '@/lib/flowchart/types';

const INK = '#0F172A';
const MUTED = '#64748B';
const HAIRLINE = '#E2E8F0';
const ACCENT = '#0EA5E9';
const PAGE_PADDING = 48;

export interface ProcessPopDocumentProps {
  processName: string;
  graph: ProcessGraph;
  meta: ProcessMeta;
  version: number;
  /** Código curto público — serve de código do documento. */
  code: string | null;
  /** Desenho do fluxograma como data URL. `null` = seção omitida. */
  flowchartImage: string | null;
  /** Resolve `responsibleEmployeeId`/`ownerEmployeeId` em nome legível. */
  employeeNameById: Record<string, string>;
  /**
   * `companyName` vazio OMITE a linha. Nunca caia pra 'Dominex' aqui: este é o
   * documento DO CLIENTE, e imprimir a nossa marca como se fosse o nome da
   * empresa dele é vazamento de marca — não um fallback inofensivo.
   */
  branding: { companyName: string; logoUrl?: string | null; isWhiteLabel: boolean };
  locale: LocaleCode;
  /** Data já formatada no locale da empresa. */
  generatedAtLabel: string;
}

/** Interpola `{chave}` numa string de i18n. */
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// ── Título de seção numerado ────────────────────────────────────────────────
function SectionTitle({ index, title }: { index: number; title: string }) {
  return (
    <div data-pdf-keep style={{ marginTop: 28, marginBottom: 12 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 800,
          color: INK,
          letterSpacing: 0.2,
        }}
      >
        <span style={{ color: ACCENT, marginRight: 8 }}>{index}.</span>
        {title}
      </h2>
      <div style={{ marginTop: 8, height: 1, background: HAIRLINE }} />
    </div>
  );
}

/** Parágrafo de texto livre, com reticência honesta quando está vazio. */
function Prose({ text, empty }: { text?: string; empty: string }) {
  const value = (text ?? '').trim();
  return (
    <p
      style={{
        margin: 0,
        fontSize: 12,
        lineHeight: 1.65,
        color: value ? INK : MUTED,
        fontStyle: value ? 'normal' : 'italic',
        whiteSpace: 'pre-wrap',
      }}
    >
      {value || empty}
    </p>
  );
}

/** Lista de itens (entradas, saídas, indicadores). */
function BulletList({ items, empty }: { items?: string[]; empty: string }) {
  const clean = (items ?? []).map((i) => i.trim()).filter(Boolean);
  if (clean.length === 0) {
    return <Prose empty={empty} />;
  }
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {clean.map((item, i) => (
        <li key={i} style={{ fontSize: 12, lineHeight: 1.7, color: INK }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Uma etapa do passo a passo. Bloco indivisível na quebra de página. */
function StepRow({
  step,
  t,
  responsibleName,
}: {
  step: PopStep;
  t: (typeof MESSAGES)['pt-br']['app']['processes']['pop'];
  responsibleName?: string;
}) {
  // Instrução do que fazer depois — a parte que transforma desenho em roteiro.
  const nextLines: string[] = step.next.map((n) => {
    const vars = { condition: n.condition ?? '', number: n.number, label: n.label };
    if (n.condition && n.isLoopBack) return fill(t.nextLoopBack, vars);
    if (n.condition) return fill(t.nextConditional, vars);
    if (n.isLoopBack) return fill(t.nextLoopBackPlain, vars);
    return fill(t.nextSingle, vars);
  });
  if (nextLines.length === 0) nextLines.push(t.nextEnd);

  return (
    <div
      data-pdf-keep
      style={{
        breakInside: 'avoid',
        display: 'flex',
        gap: 14,
        padding: '14px 0',
        borderTop: `1px solid ${HAIRLINE}`,
      }}
    >
      <div
        style={{
          flex: '0 0 32px',
          height: 32,
          borderRadius: 10,
          background: step.unreachable ? '#FEF3C7' : 'rgba(14,165,233,0.12)',
          color: step.unreachable ? '#92400E' : ACCENT,
          fontSize: 13,
          fontWeight: 800,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {step.number}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.4 }}>
          {step.label}
        </div>

        {/* Linha de atributos: responsável, raia, espera, aviso de fora do fluxo. */}
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            fontSize: 10.5,
            color: MUTED,
          }}
        >
          {(responsibleName || step.responsibleLabel) && (
            <span>
              {t.stepResponsible}: <strong style={{ color: INK }}>{responsibleName || step.responsibleLabel}</strong>
            </span>
          )}
          {step.laneLabel && <span>{step.laneLabel}</span>}
          {step.duration && <span>{fill(t.stepWait, { duration: step.duration })}</span>}
          {step.shape === 'subprocess' && <span>{t.stepSubprocess}</span>}
          {step.unreachable && (
            <span style={{ color: '#92400E', fontWeight: 700 }}>{t.stepUnreachable}</span>
          )}
        </div>

        {step.description && (
          <p
            style={{
              margin: '8px 0 0',
              fontSize: 11.5,
              lineHeight: 1.6,
              color: '#334155',
              whiteSpace: 'pre-wrap',
            }}
          >
            {step.description}
          </p>
        )}

        {step.informs.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 10.5, color: MUTED }}>
            {fill(t.stepInforms, {
              items: step.informs.map((i) => i.label).filter(Boolean).join(', '),
            })}
          </div>
        )}

        <div style={{ marginTop: 8 }}>
          {nextLines.map((line, i) => (
            <div key={i} style={{ fontSize: 11, color: ACCENT, fontWeight: 600, lineHeight: 1.6 }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProcessPopDocument({
  processName,
  graph,
  meta,
  version,
  code,
  flowchartImage,
  employeeNameById,
  branding,
  locale,
  generatedAtLabel,
}: ProcessPopDocumentProps) {
  const messages = MESSAGES[locale].app.processes;
  const t = messages.pop;
  const outline = buildPopOutline(graph);

  const ownerName =
    (meta.ownerEmployeeId ? employeeNameById[meta.ownerEmployeeId] : undefined) ||
    meta.ownerLabel ||
    t.notDefined;

  // Responsáveis que aparecem no desenho mas não têm raia — a seção de
  // responsabilidades precisa cobrir os dois casos, senão mente por omissão.
  const responsibleSet = new Set<string>();
  for (const step of outline.steps) {
    const name =
      (step.responsibleEmployeeId ? employeeNameById[step.responsibleEmployeeId] : undefined) ||
      step.responsibleLabel;
    if (name) responsibleSet.add(name);
  }

  let section = 0;
  const nextSection = () => ++section;

  return (
    <div
      style={{
        width: 794,
        padding: PAGE_PADDING,
        boxSizing: 'border-box',
        background: '#FFFFFF',
        color: INK,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* ── Cabeçalho ───────────────────────────────────────────────────── */}
      <div
        data-pdf-keep
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          paddingBottom: 18,
          borderBottom: `2px solid ${INK}`,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: MUTED,
            }}
          >
            {t.documentTitle}
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 25, fontWeight: 800, lineHeight: 1.15 }}>
            {processName}
          </h1>
          {branding.companyName.trim() && (
            <div style={{ marginTop: 6, fontSize: 12, color: MUTED }}>{branding.companyName}</div>
          )}
        </div>

        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt=""
            style={{ maxHeight: 54, maxWidth: 180, objectFit: 'contain' }}
          />
        )}
      </div>

      {/* ── Ficha: código, versão, data, área, dono, frequência ─────────── */}
      <div
        data-pdf-keep
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          padding: 16,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: 12,
          background: '#F8FAFC',
        }}
      >
        {[
          { label: t.codeLabel, value: code ?? t.notDefined },
          { label: t.versionLabel, value: String(version) },
          { label: t.dateLabel, value: generatedAtLabel },
          { label: t.areaLabel, value: meta.area?.trim() || t.notDefined },
          { label: t.ownerLabel, value: ownerName },
          { label: t.frequencyLabel, value: meta.frequency?.trim() || t.notDefined },
        ].map((field) => (
          <div key={field.label}>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: MUTED,
              }}
            >
              {field.label}
            </div>
            <div style={{ marginTop: 3, fontSize: 12, fontWeight: 600, color: INK }}>
              {field.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── 1. Objetivo ─────────────────────────────────────────────────── */}
      <SectionTitle index={nextSection()} title={t.sections.objective} />
      <Prose text={meta.objective} empty={t.notDefined} />

      {/* ── 2. Escopo + gatilho ─────────────────────────────────────────── */}
      <SectionTitle index={nextSection()} title={t.sections.scope} />
      <Prose text={meta.scope} empty={t.notDefined} />
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, marginBottom: 4 }}>
          {t.sections.trigger}
        </div>
        <Prose text={meta.trigger} empty={t.notDefined} />
      </div>

      {/* ── 3. Entradas e saídas ────────────────────────────────────────── */}
      <SectionTitle index={nextSection()} title={`${t.sections.inputs} / ${t.sections.outputs}`} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, marginBottom: 6 }}>
            {t.sections.inputs}
          </div>
          <BulletList items={meta.inputs} empty={t.noItems} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: MUTED, marginBottom: 6 }}>
            {t.sections.outputs}
          </div>
          <BulletList items={meta.outputs} empty={t.noItems} />
        </div>
      </div>

      {/* ── 4. Responsabilidades ───────────────────────────────────────── */}
      <SectionTitle index={nextSection()} title={t.sections.responsibilities} />
      {outline.lanes.length > 0 && (
        <div style={{ fontSize: 11.5, color: MUTED, marginBottom: 8 }}>{t.lanesIntro}</div>
      )}
      <BulletList
        items={[...outline.lanes.map((l) => l.label).filter(Boolean), ...responsibleSet]}
        empty={t.noItems}
      />

      {/* ── 5. Fluxograma ──────────────────────────────────────────────── */}
      {flowchartImage && (
        <>
          <SectionTitle index={nextSection()} title={t.sections.flowchart} />
          <div
            data-pdf-keep
            style={{
              breakInside: 'avoid',
              border: `1px solid ${HAIRLINE}`,
              borderRadius: 12,
              padding: 8,
              background: '#FFFFFF',
            }}
          >
            <img
              src={flowchartImage}
              alt=""
              style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
            />
          </div>
        </>
      )}

      {/* ── 6. Descrição das etapas ─────────────────────────────────────── */}
      <SectionTitle index={nextSection()} title={t.sections.steps} />
      {outline.steps.length === 0 ? (
        <Prose empty={t.noSteps} />
      ) : (
        <div>
          {outline.steps.map((step) => (
            <StepRow
              key={step.nodeId}
              step={step}
              t={t}
              responsibleName={
                step.responsibleEmployeeId ? employeeNameById[step.responsibleEmployeeId] : undefined
              }
            />
          ))}
        </div>
      )}

      {/* ── 7. Observações (anotações do desenho) ───────────────────────── */}
      {outline.notes.length > 0 && (
        <>
          <SectionTitle index={nextSection()} title={t.sections.notes} />
          <BulletList items={outline.notes.map((n) => n.label)} empty={t.noItems} />
        </>
      )}

      {/* ── 8. Indicadores ─────────────────────────────────────────────── */}
      <SectionTitle index={nextSection()} title={t.sections.indicators} />
      <BulletList items={meta.indicators} empty={t.noItems} />

      {/* ── 9. Histórico de revisões ───────────────────────────────────── */}
      <SectionTitle index={nextSection()} title={t.sections.revisions} />
      <BulletList
        items={[fill(t.revisionRow, { version: String(version), date: generatedAtLabel })]}
        empty={t.noItems}
      />

      {/* ── Rodapé ─────────────────────────────────────────────────────── */}
      <div
        data-pdf-keep
        style={{
          marginTop: 32,
          paddingTop: 14,
          borderTop: `1px solid ${HAIRLINE}`,
          fontSize: 9.5,
          lineHeight: 1.6,
          color: MUTED,
        }}
      >
        <div>{t.disclaimer}</div>
        {!branding.isWhiteLabel && (
          <div style={{ marginTop: 6, textAlign: 'center', fontWeight: 600 }}>dominex.app</div>
        )}
      </div>
    </div>
  );
}
