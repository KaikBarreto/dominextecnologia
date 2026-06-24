import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/utils/currency';
import {
  buildProposalData,
  colorAdjust,
  pageFolioStyle,
  folioLabel,
  flagOn,
  formatValidUntil,
  hasDisplacement,
  hasGifts,
  buildScopeRows,
  paginateScope,
  SCOPE_ITEMS_FIRST_PAGE,
  SCOPE_ITEMS_PER_PAGE,
  type ScopeGroup,
} from './shared';

/**
 * Aurora — proposta comercial premium em A4 VERTICAL, fundo escuro.
 * Inspirada na capa "Pink Purple and Black": preto com barras verticais em
 * gradiente azul→roxo→rosa na metade de baixo. A capa usa a imagem
 * `/images/proposal-bg-aurora.jpg` como background-image (cover).
 *
 * Páginas: Capa → Apresentação → Escopo → Investimento → Encerramento.
 * Cada `.au-page` é uma folha A4 (794×1123px @96dpi); no print quebra por página.
 * No mobile (≤640px) solta o min-height e vira fluxo contínuo de 1 coluna.
 *
 * White-label: marca do tenant (logo/nome/contato). O logo é exibido puro
 * (sem fundo/chip/filtro), como é.
 */
const PINK = '#ec4899';
const VIOLET = '#a855f7';
const BLUE = '#3b82f6';
const CREAM = '#f5f0e8';

export function AuroraTemplate(props: ProposalTemplateProps) {
  const { quote, company, customization } = props;
  const d = buildProposalData(props);

  const installments = d.installments;
  const showFolio = !!customization?.show_pagination;

  const showDisplacement = flagOn(customization?.show_displacement) && hasDisplacement(quote);
  const showGifts = flagOn(customization?.show_gifts) && hasGifts(quote);
  const validUntil = formatValidUntil(quote);

  // ── Paginação do Escopo ── (ver Vanguarda; total dinâmico).
  const scopePages = paginateScope(buildScopeRows(d), SCOPE_ITEMS_PER_PAGE, SCOPE_ITEMS_FIRST_PAGE);
  const totalPages = 2 + scopePages.length + 2;
  const SCOPE_FIRST_PAGE = 3;
  const investPage = SCOPE_FIRST_PAGE + scopePages.length;
  const closingPage = investPage + 1;

  // Todas as folhas do Aurora têm fundo escuro → paginação sempre clara.
  const Folio = ({ page }: { page: number }) =>
    showFolio ? <span style={pageFolioStyle(true)}>{folioLabel(page, totalPages)}</span> : null;

  // Cor do grupo: Materiais → rosa; Serviços/Itens → violeta.
  const groupDot = (key: string) => (key === 'materiais' ? PINK : VIOLET);

  const renderGroup = (g: ScopeGroup) => {
    const dot = groupDot(g.key);
    return (
      <div className="mb-8" key={`${g.key}-${g.rows[0]?.num}`}>
        <div className="flex items-center gap-2.5 mb-4">
          <span className="h-4 w-1 rounded-full" style={{ background: dot, ...colorAdjust }} />
          <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: dot }}>
            {g.label}{g.continued ? ' (continuação)' : ''}
          </p>
        </div>
        <div className="space-y-2.5">
          {g.rows.map(({ item, num }) => (
            <div
              key={num}
              className="flex justify-between items-start gap-4 rounded-2xl px-5 py-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className="text-[10px] font-bold rounded-lg h-7 w-7 flex items-center justify-center shrink-0"
                  style={{ background: `${dot}26`, color: dot, ...colorAdjust }}
                >
                  {String(num).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-white/95 leading-snug">{item.description}</p>
                  <p className="text-xs text-white/40 mt-1">{item.quantity} un × R$ {formatBRL(item.unit_price || 0)}</p>
                </div>
              </div>
              <p className="font-extrabold text-base tabular-nums whitespace-nowrap text-white">
                R$ {formatBRL(item.total_price || 0)}
              </p>
            </div>
          ))}
        </div>
        {g.isGroupEnd && (
          <div className="flex justify-end mt-3">
            <div className="text-xs">
              <span className="uppercase tracking-wider text-white/40 font-bold mr-3">Subtotal</span>
              <span className="font-bold tabular-nums text-white/80">R$ {formatBRL(g.groupSubtotal)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="au-root mx-auto"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", maxWidth: '794px', width: '100%', background: '#050505' }}
    >
      <style>{`
        .au-page { width: 100%; max-width: 794px; min-height: 1123px; position: relative; background: #0a0a0c; color: #fff; padding: 56px; overflow: hidden; }
        .au-page + .au-page { border-top: 1px solid rgba(255,255,255,0.06); }
        @media (max-width: 640px) { .au-page { padding: 30px 22px; min-height: 0; } }
        @media print {
          .au-page { min-height: 1123px; }
          .au-page + .au-page { break-before: page; page-break-before: always; border-top: 0; }
        }
      `}</style>

      {/* ====================== CAPA ====================== */}
      <section
        className="au-page flex flex-col"
        style={{
          backgroundColor: '#000',
          backgroundImage: "url('/images/proposal-bg-aurora.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          ...colorAdjust,
        }}
      >
        {/* Topo: marca (esq) + contato (dir) */}
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {d.logoUrl ? (
              <img src={d.logoUrl} alt={d.companyName} className="h-12 w-auto object-contain" crossOrigin="anonymous" />
            ) : null}
            <p className="text-lg font-bold mt-3 leading-tight" style={{ color: CREAM }}>{d.companyName}</p>
            {company?.document && <p className="text-[11px] text-white/45 mt-0.5">CNPJ {company.document}</p>}
          </div>
          <div className="text-right text-[11px] text-white/55 leading-relaxed shrink-0">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
            {d.addressLine && <p className="max-w-[180px] mt-1 text-white/35 text-[10px] ml-auto">{d.addressLine}</p>}
          </div>
        </div>

        {/* Título grande à esquerda */}
        <div className="relative z-10 mt-16 sm:mt-24">
          <h1
            className="font-black tracking-tight"
            style={{ color: CREAM, fontSize: 'clamp(56px, 13vw, 96px)', lineHeight: 0.92 }}
          >
            Proposta<br />Comercial
          </h1>
          <p className="mt-6 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.32em] text-white/55 max-w-[440px] leading-relaxed">
            {d.subjectLine}
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-xs text-white/50">
            <span>Nº {quote.quote_number}</span>
            <span className="text-white/25">·</span>
            <span>{format(new Date(quote.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
          </div>
        </div>

        {/* Rodapé: preparado para / apresentado por */}
        <div className="relative z-10 mt-auto pt-12 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: PINK }}>Preparado para</p>
            <p className="font-bold text-base mt-1.5 text-white leading-tight">{d.clientName}</p>
            {d.clientDoc && <p className="text-[11px] text-white/40 mt-0.5">{d.clientDoc}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: PINK }}>Apresentado por</p>
            <p className="font-bold text-base mt-1.5 text-white leading-tight">{d.companyName}</p>
            {company?.phone && <p className="text-[11px] text-white/40 mt-0.5">{company.phone}</p>}
          </div>
        </div>
        <Folio page={1} />
      </section>

      {/* ====================== APRESENTAÇÃO ====================== */}
      <section className="au-page">
        <Kicker label="Apresentação" />
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-2 text-white">Quem somos</h2>
        <p className="text-[15px] text-white/65 leading-[1.9] mt-5 max-w-[620px]">
          A <span className="font-semibold text-white">{d.companyName}</span> entrega soluções com excelência técnica,
          transparência e prazos cumpridos. Esta proposta foi preparada especialmente para{' '}
          <span className="font-semibold text-white">{d.clientName}</span>, reunindo escopo, materiais e valores
          necessários para executar o serviço com qualidade.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
          {[
            { t: 'Qualidade', d: 'Padrão técnico em cada etapa.' },
            { t: 'Transparência', d: 'Escopo e valores claros, sem surpresas.' },
            { t: 'Compromisso', d: 'Prazos e combinados cumpridos.' },
          ].map((c, idx) => (
            <div
              key={c.t}
              className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full inline-block mb-4"
                style={{ background: [BLUE, VIOLET, PINK][idx], ...colorAdjust }}
              />
              <p className="font-bold text-sm text-white">{c.t}</p>
              <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>

        <div
          className="mt-12 rounded-2xl p-6"
          style={{ background: `linear-gradient(120deg, ${BLUE}22 0%, ${VIOLET}22 50%, ${PINK}22 100%)`, border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/55 font-bold mb-3">Fale conosco</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 text-sm text-white/85">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
            {d.addressLine && <p className="sm:col-span-2 text-white/55 text-xs leading-relaxed">{d.addressLine}</p>}
          </div>
        </div>
        <Folio page={2} />
      </section>

      {/* ====================== ESCOPO (1..N folhas) ====================== */}
      {scopePages.map((sp) => (
        <section className="au-page" key={`scope-${sp.index}`}>
          <Kicker label="O que está incluído" />
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-2 text-white">
            Escopo do serviço{sp.index > 0 ? ' (continuação)' : ''}
          </h2>
          <div className="mt-8">
            {sp.groups.map(renderGroup)}
          </div>
          <Folio page={SCOPE_FIRST_PAGE + sp.index} />
        </section>
      ))}

      {/* ====================== INVESTIMENTO ====================== */}
      <section className="au-page flex flex-col">
        <Kicker label="Resumo financeiro" />
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-2 text-white">Investimento</h2>

        <div
          className="mt-8 rounded-3xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.1)', ...colorAdjust }}
        >
          {((quote.discount_amount ?? 0) > 0 || showDisplacement) && (
            <div className="px-7 py-5 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', ...colorAdjust }}>
              {(quote.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">Subtotal</span>
                  <span className="text-white/80 tabular-nums">R$ {formatBRL(quote.subtotal ?? 0)}</span>
                </div>
              )}
              {showDisplacement && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">
                    Deslocamento{(quote.distance_km ?? 0) > 0 ? ` (${quote.distance_km} km)` : ''}
                  </span>
                  <span className="text-white/80 tabular-nums">R$ {formatBRL(quote.displacement_cost ?? 0)}</span>
                </div>
              )}
              {(quote.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">Desconto</span>
                  <span className="tabular-nums font-semibold" style={{ color: PINK }}>− R$ {formatBRL(quote.discount_amount ?? 0)}</span>
                </div>
              )}
            </div>
          )}
          <div
            className="px-7 py-8 relative overflow-hidden"
            style={{ background: `linear-gradient(120deg, ${BLUE} 0%, ${VIOLET} 50%, ${PINK} 100%)`, ...colorAdjust }}
          >
            <div className="relative z-10 flex items-end justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/75 font-bold">Valor total</p>
                {!!installments && installments > 1 && (
                  <p className="text-xs text-white/85 mt-2">
                    em até {installments}× de R$ {formatBRL((quote.total_value ?? 0) / installments)}
                  </p>
                )}
              </div>
              <p className="font-black tabular-nums tracking-tight leading-none text-white" style={{ fontSize: 'clamp(34px, 8vw, 52px)' }}>
                R$ {formatBRL(quote.total_value ?? 0)}
              </p>
            </div>
          </div>
        </div>

        {validUntil && (
          <p className="mt-4 text-xs text-white/55">
            Proposta válida até <span className="font-semibold text-white/80">{validUntil}</span>.
          </p>
        )}

        {showGifts && (
          <div className="mt-6 rounded-2xl p-6" style={{ border: `1px solid ${PINK}55`, background: `${PINK}12`, ...colorAdjust }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: PINK }}>Brindes inclusos</p>
            <p className="text-sm text-white/75 leading-relaxed">
              Esta proposta acompanha brindes de cortesia, sem custo adicional.
            </p>
          </div>
        )}

        {quote.terms && (
          <div className="mt-7 rounded-2xl p-6" style={{ borderLeft: `4px solid ${PINK}`, background: 'rgba(255,255,255,0.03)', ...colorAdjust }}>
            <p className="text-[10px] font-bold uppercase text-white/45 tracking-[0.18em] mb-2">Condições e termos</p>
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{quote.terms}</p>
          </div>
        )}
        {quote.notes && (
          <div className="mt-4 rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}>
            <p className="text-[10px] font-bold uppercase text-white/45 tracking-[0.18em] mb-2">Observações</p>
            <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{quote.notes}</p>
          </div>
        )}
        <Folio page={investPage} />
      </section>

      {/* ====================== ENCERRAMENTO ====================== */}
      <section className="au-page flex flex-col items-center justify-center text-center">
        <div
          className="h-1.5 w-20 rounded-full mb-8"
          style={{ background: `linear-gradient(90deg, ${BLUE}, ${VIOLET}, ${PINK})`, ...colorAdjust }}
        />
        <h2 className="font-black tracking-tight" style={{ color: CREAM, fontSize: 'clamp(40px, 9vw, 60px)' }}>Obrigado!</h2>
        <p className="text-white/55 text-lg mt-4 max-w-md leading-relaxed">
          Estamos à disposição para esclarecer dúvidas e seguir com a execução assim que a proposta for aprovada.
        </p>

        <div
          className="mt-12 rounded-2xl px-8 py-6"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}
        >
          {d.logoUrl ? (
            <img src={d.logoUrl} alt={d.companyName} className="h-11 w-auto object-contain mx-auto mb-3" crossOrigin="anonymous" />
          ) : (
            <p className="font-black text-xl" style={{ color: CREAM }}>{d.companyName}</p>
          )}
          <div className="text-sm text-white/55 space-y-0.5">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
          </div>
        </div>

        <p className="text-[11px] text-white/30 mt-10 tracking-wider">
          Proposta Nº {quote.quote_number} · {d.companyName}
        </p>
        <Folio page={closingPage} />
      </section>
    </div>
  );
}

function Kicker({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: PINK, ...colorAdjust }}
      />
      <p className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: PINK }}>{label}</p>
    </div>
  );
}
