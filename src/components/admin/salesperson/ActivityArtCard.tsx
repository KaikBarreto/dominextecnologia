// ─────────────────────────────────────────────────────────────────────────────
// ActivityArtCard — card compartilhável (1080×1350, formato 4:5) com o resumo
// de atividade comercial de um período (manhã/tarde) de um vendedor.
//
// Componente PURO de apresentação: sem hook de dados, sem `useQuery`, sem
// `supabase`. Todos os números já chegam prontos via props — quem monta os
// dados é `src/utils/salespersonActivityArt.ts` (geração da imagem) e o hook
// de atividade do vendedor (fora do escopo deste arquivo).
//
// RESTRIÇÃO DURA: este componente é renderizado OFF-SCREEN e capturado como
// imagem via `html-to-image`. Por isso:
// - Dimensões fixas em px (nunca vw/%/dvh).
// - Sem `position: sticky`, sem `backdrop-filter`, sem animação/transição.
// - Sem dependência de contexto React (sem AppLocaleProvider/tema). Copy
//   PT-BR chumbada — o painel Auctus é PT-BR only (memória `admin_auctus_fica_em_ptbr`).
// - Identidade visual É da marca Dominex, não do tenant: cores chumbadas,
//   nunca `white_label`/CSS vars que variam por empresa.
// ─────────────────────────────────────────────────────────────────────────────

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import logoHorizontalVerde from '@/assets/logo-horizontal-verde.png';
import { formatConversionRate, goalProgress, type ActivityPeriod } from '@/utils/activityArtFormat';

export type { ActivityPeriod };

export interface ActivityArtCardProps {
  salespersonName: string;
  /** Já convertida em data URL pelo util; pode ser null (cai no monograma). */
  salespersonPhotoDataUrl: string | null;
  /** 'yyyy-MM-dd' */
  activityDate: string;
  period: ActivityPeriod;
  /** Números DO PERÍODO. */
  contacts: number;
  meetingsScheduled: number;
  meetingsHeld: number;
  salesCount: number;
  notes: string | null;
  /** Acumulado do DIA (manhã + tarde) — é o que compara com a meta. */
  dayContacts: number;
  dayMeetingsScheduled: number;
  /** Metas DIÁRIAS do vendedor (hoje: 200 contatos, 5 reuniões agendadas). */
  goalContacts: number;
  goalMeetingsScheduled: number;
  /** Instante ISO da geração — vira "gerado em DD/MM/AAAA às HH:MM". */
  generatedAtIso: string;
}

// ── Cores da marca (chumbadas — esta arte não é white-label) ────────────────
const BG = '#0C0C0C';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const TEAL = '#00C684';
const TEAL_SOFT = 'rgba(0,198,132,0.14)';
const AMBER = '#F59E0B';
const AMBER_SOFT = 'rgba(245,158,11,0.14)';
const NEUTRAL = '#0EA5E9';
const NEUTRAL_SOFT = 'rgba(100,116,139,0.16)';
const TEXT = '#F8F8F8';
const TEXT_MUTED = '#9CA3AF';
const TEXT_FAINT = '#6B7280';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

// ── Helpers puros internos (sem necessidade de export — não fazem parte do
// contrato testável: só formatam copy, sem lógica de cálculo). ──────────────

function parseIsoDateOnly(isoDate: string): Date {
  // 'yyyy-MM-dd' — construir via split evita o bug clássico de `new
  // Date('yyyy-MM-dd')` (interpretado como UTC meia-noite, que em fuso
  // negativo "volta" um dia na hora de exibir).
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatActivityDate(isoDate: string): string {
  try {
    return format(parseIsoDateOnly(isoDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return isoDate;
  }
}

function formatGeneratedAt(isoInstant: string): string {
  try {
    return format(new Date(isoInstant), "dd/MM/yyyy 'às' HH:mm");
  } catch {
    return '';
  }
}

function periodLabel(period: ActivityPeriod): string {
  return period === 'morning' ? 'MANHÃ' : 'TARDE';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

interface GoalTone {
  color: string;
  soft: string;
  label: string;
}

// Nunca vermelho — é relatório, não alarme. Longe = neutro, perto = âmbar,
// batida = verde da marca (régua de UI do CEO).
function goalTone(percent: number): GoalTone {
  if (percent >= 100) return { color: TEAL, soft: TEAL_SOFT, label: 'Meta batida' };
  if (percent >= 50) return { color: AMBER, soft: AMBER_SOFT, label: 'Quase lá' };
  return { color: NEUTRAL, soft: NEUTRAL_SOFT, label: 'Em andamento' };
}

// ── Subcomponentes de apresentação ──────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 20,
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: TEXT_MUTED,
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 68, fontWeight: 800, color: TEXT, lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

function GoalBar({
  label,
  value,
  goal,
}: {
  label: string;
  value: number;
  goal: number;
}) {
  const { percent, barPercent } = goalProgress(value, goal);
  const tone = goalTone(percent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: TEXT }}>{label}</span>
        <span style={{ fontSize: 20, fontWeight: 700, color: TEXT_MUTED }}>
          {value}/{goal} <span style={{ color: tone.color, fontWeight: 800 }}>({percent}%)</span>
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 18,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${barPercent}%`,
            height: '100%',
            borderRadius: 999,
            background: tone.color,
          }}
        />
      </div>
    </div>
  );
}

function ConversionStat({ label, rate }: { label: string; rate: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: TEAL, lineHeight: 1 }}>{rate}</div>
      <div
        style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: 600,
          color: TEXT_FAINT,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function ActivityArtCard({
  salespersonName,
  salespersonPhotoDataUrl,
  activityDate,
  period,
  contacts,
  meetingsScheduled,
  meetingsHeld,
  salesCount,
  notes,
  dayContacts,
  dayMeetingsScheduled,
  goalContacts,
  goalMeetingsScheduled,
  generatedAtIso,
}: ActivityArtCardProps) {
  const contactToScheduled = formatConversionRate(meetingsScheduled, contacts);
  const scheduledToHeld = formatConversionRate(meetingsHeld, meetingsScheduled);
  const heldToSale = formatConversionRate(salesCount, meetingsHeld);

  return (
    <div
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        background: BG,
        color: TEXT,
        fontFamily: "'Montserrat', system-ui, -apple-system, 'Segoe UI', sans-serif",
        padding: '64px 72px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Faixa de destaque superior na cor da marca */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          background: TEAL,
        }}
      />

      {/* ── Topo: logo + vendedor ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <img src={logoHorizontalVerde} alt="Dominex" style={{ height: 40, width: 'auto' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 26, fontWeight: 700, color: TEXT, maxWidth: 420, textAlign: 'right' }}>
            {salespersonName}
          </span>
          {salespersonPhotoDataUrl ? (
            <img
              src={salespersonPhotoDataUrl}
              alt={salespersonName}
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                objectFit: 'cover',
                border: `2px solid ${TEAL}`,
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                background: TEAL_SOFT,
                border: `2px solid ${TEAL}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                fontWeight: 800,
                color: TEAL,
                flexShrink: 0,
              }}
            >
              {getInitials(salespersonName)}
            </div>
          )}
        </div>
      </div>

      {/* ── Faixa de identificação: data + período ─────────────────────── */}
      <div
        style={{
          marginTop: 36,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <span
          style={{
            background: TEAL,
            color: '#07110C',
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: 1,
            padding: '10px 22px',
            borderRadius: 999,
          }}
        >
          {periodLabel(period)}
        </span>
        <span style={{ fontSize: 22, fontWeight: 500, color: TEXT_MUTED }}>
          {formatActivityDate(activityDate)}
        </span>
      </div>

      {/* ── Números grandes do período ──────────────────────────────────── */}
      <div style={{ marginTop: 36, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <StatCell label="Contatos / Prospecções" value={contacts} />
          <StatCell label="Reuniões agendadas" value={meetingsScheduled} />
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          <StatCell label="Reuniões realizadas" value={meetingsHeld} />
          <StatCell label="Vendas" value={salesCount} />
        </div>
      </div>

      {/* ── Meta do dia (acumulado manhã + tarde) ───────────────────────── */}
      <div
        style={{
          marginTop: 36,
          background: 'rgba(255,255,255,0.03)',
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 20,
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <span
          style={{
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: TEXT_FAINT,
          }}
        >
          Meta do dia
        </span>
        <GoalBar label="Contatos" value={dayContacts} goal={goalContacts} />
        <GoalBar label="Reuniões agendadas" value={dayMeetingsScheduled} goal={goalMeetingsScheduled} />
      </div>

      {/* ── Taxas de conversão do período ────────────────────────────────── */}
      <div
        style={{
          marginTop: 32,
          display: 'flex',
          alignItems: 'center',
          padding: '20px 8px',
        }}
      >
        <ConversionStat label="Contato → agendada" rate={contactToScheduled} />
        <ConversionStat label="Agendada → realizada" rate={scheduledToHeld} />
        <ConversionStat label="Realizada → venda" rate={heldToSale} />
      </div>

      {/* ── Observação (truncada com elegância) ─────────────────────────── */}
      {notes?.trim() ? (
        <div
          style={{
            marginTop: 24,
            fontSize: 17,
            lineHeight: 1.5,
            color: TEXT_MUTED,
            fontStyle: 'italic',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          “{notes.trim()}”
        </div>
      ) : null}

      {/* Empurra o rodapé pro fim do card, mesmo com conteúdo variável acima. */}
      <div style={{ flex: 1 }} />

      {/* ── Rodapé ───────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 24,
          borderTop: `1px solid ${CARD_BORDER}`,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: TEXT_MUTED, letterSpacing: 0.3 }}>
          Dominex
        </span>
        <span style={{ fontSize: 14, fontWeight: 500, color: TEXT_FAINT }}>
          gerado em {formatGeneratedAt(generatedAtIso)}
        </span>
      </div>
    </div>
  );
}
