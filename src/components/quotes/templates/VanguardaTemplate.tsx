import type { ProposalTemplateProps } from './types';
import { formatDateTime } from '@/lib/format';
import { useLocaleFormatters } from '@/lib/format/hooks';
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
 * Vanguarda — proposta comercial premium em A4 VERTICAL, fundo escuro.
 * Mesmo nível das capas Aurora/Prisma, mas dirigido pela COR PRIMÁRIA do
 * white-label (`customization.primary_color`) como acento. É o template DEFAULT.
 *
 * Capa marcante (gradiente da cor primária + halo geométrico) + 4 seções:
 * Apresentação → Escopo → Investimento → Encerramento.
 * `.vg-page` = folha A4 (794×1123 @96dpi); quebra por página no print; no mobile
 * (≤640px) solta o min-height e vira fluxo contínuo de 1 coluna.
 *
 * White-label: marca do tenant; o logo é exibido puro (sem fundo/chip/filtro).
 *
 * O Escopo PAGINA: a lista de itens é quebrada em quantas folhas A4 forem
 * necessárias (sem corte). O total de páginas é DINÂMICO e a paginação reflete
 * o total real.
 */
export function VanguardaTemplate(props: ProposalTemplateProps) {
  const { quote, company, customization } = props;
  const d = buildProposalData(props);
  const { money, locale, timezone } = useLocaleFormatters();

  const primary = customization?.primary_color || '#22d3ee';
  const accent = customization?.accent_color || primary;
  const installments = d.installments;
  const showFolio = !!customization?.show_pagination;

  const showDisplacement = flagOn(customization?.show_displacement) && hasDisplacement(quote);
  const showGifts = flagOn(customization?.show_gifts) && hasGifts(quote);
  const validUntil = formatValidUntil(quote, locale, timezone);

  // ── Paginação do Escopo ──
  // capa(1) + apresentação(1) + N folhas de escopo + investimento(1) + encerramento(1).
  const scopePages = paginateScope(buildScopeRows(d), SCOPE_ITEMS_PER_PAGE, SCOPE_ITEMS_FIRST_PAGE);
  const totalPages = 2 + scopePages.length + 2;
  const SCOPE_FIRST_PAGE = 3; // 1=capa, 2=apresentação
  const investPage = SCOPE_FIRST_PAGE + scopePages.length;
  const closingPage = investPage + 1;

  // Todas as folhas da Vanguarda têm fundo escuro → paginação sempre clara.
  const Folio = ({ page }: { page: number }) =>
    showFolio ? <span style={pageFolioStyle(true)}>{folioLabel(page, totalPages)}</span> : null;

  // Gradiente de marca derivado da cor primária (capa, faixa de total).
  const brandGradient = `linear-gradient(125deg, ${primary} 0%, ${accent} 55%, #0a0a0c 130%)`;

  const renderGroup = (g: ScopeGroup) => (
    <div className="mb-8" key={`${g.key}-${g.rows[0]?.num}`}>
      <div className="flex items-center gap-2.5 mb-4">
        <span className="h-4 w-1 rounded-full" style={{ background: primary, ...colorAdjust }} />
        <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: primary }}>
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
                style={{ background: `${primary}26`, color: primary, ...colorAdjust }}
              >
                {String(num).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-white/95 leading-snug">{item.description}</p>
                <p className="text-xs text-white/40 mt-1">{item.quantity} un × {money(item.unit_price || 0)}</p>
              </div>
            </div>
            <p className="font-extrabold text-base tabular-nums whitespace-nowrap text-white">
              {money(item.total_price || 0)}
            </p>
          </div>
        ))}
      </div>
      {g.isGroupEnd && (
        <div className="flex justify-end mt-3">
          <div className="text-xs">
            <span className="uppercase tracking-wider text-white/40 font-bold mr-3">Subtotal</span>
            <span className="font-bold tabular-nums text-white/80">{money(g.groupSubtotal)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className="vg-root mx-auto"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", maxWidth: '794px', width: '100%', background: '#050505' }}
    >
      <style>{`
        .vg-page { width: 100%; max-width: 794px; min-height: 1123px; position: relative; background: #0a0a0c; color: #fff; padding: 56px; overflow: hidden; }
        .vg-page + .vg-page { border-top: 1px solid rgba(255,255,255,0.06); }
        @media (max-width: 640px) { .vg-page { padding: 30px 22px; min-height: 0; } }
        @media print {
          .vg-page { min-height: 1123px; }
          .vg-page + .vg-page { break-before: page; page-break-before: always; border-top: 0; }
        }
      `}</style>

      {/* ====================== CAPA ====================== */}
      <section className="vg-page flex flex-col" style={{ background: '#000', ...colorAdjust }}>
        {/* Faixa de marca na metade de baixo + halos geométricos */}
        <div className="absolute inset-0 z-0" style={{ ...colorAdjust }}>
          <div
            className="absolute inset-x-0 bottom-0 h-[58%]"
            style={{ background: brandGradient, ...colorAdjust }}
          />
          <div
            className="absolute -right-24 top-1/3 w-80 h-80 rounded-full opacity-25 blur-2xl"
            style={{ background: primary, ...colorAdjust }}
          />
          <div
            className="absolute -left-20 bottom-10 w-72 h-72 rounded-[60px] opacity-20 blur-2xl"
            style={{ background: accent, transform: 'rotate(20deg)', ...colorAdjust }}
          />
          {/* Véu escuro pra legibilidade do texto sobre o gradiente */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0.55) 100%)', ...colorAdjust }} />
        </div>

        {/* Topo: marca (esq) + contato (dir) */}
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {d.logoUrl ? (
              <img src={d.logoUrl} alt={d.companyName} className="h-12 w-auto object-contain" crossOrigin="anonymous" />
            ) : null}
            <p className="text-lg font-bold mt-3 leading-tight text-white">{d.companyName}</p>
            {company?.document && <p className="text-[11px] text-white/45 mt-0.5">CNPJ {company.document}</p>}
          </div>
          <div className="text-right text-[11px] text-white/55 leading-relaxed shrink-0">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
          </div>
        </div>

        {/* Título grande */}
        <div className="relative z-10 mt-16 sm:mt-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-white/60">Proposta</p>
          <h1
            className="font-black tracking-tight text-white"
            style={{ fontSize: 'clamp(56px, 13vw, 96px)', lineHeight: 0.92 }}
          >
            Comercial
          </h1>
          <p className="mt-6 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.32em] text-white/65 max-w-[440px] leading-relaxed">
            {d.subjectLine}
          </p>
          <div className="mt-5 inline-flex items-center gap-2 text-xs text-white/55">
            <span>Nº {quote.quote_number}</span>
            <span className="text-white/30">·</span>
            <span>{formatDateTime(quote.created_at, locale, timezone, { year: 'numeric', month: 'long', day: '2-digit', hour: undefined, minute: undefined })}</span>
          </div>
        </div>

        {/* Rodapé: preparado para / apresentado por */}
        <div className="relative z-10 mt-auto pt-12 grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: primary }}>Preparado para</p>
            <p className="font-bold text-base mt-1.5 text-white leading-tight">{d.clientName}</p>
            {d.clientDoc && <p className="text-[11px] text-white/60 mt-0.5">{d.clientDoc}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: primary }}>Apresentado por</p>
            <p className="font-bold text-base mt-1.5 text-white leading-tight">{d.companyName}</p>
            {company?.phone && <p className="text-[11px] text-white/60 mt-0.5">{company.phone}</p>}
          </div>
        </div>
        <Folio page={1} />
      </section>

      {/* ====================== APRESENTAÇÃO ====================== */}
      <section className="vg-page">
        <Kicker label="Apresentação" color={accent} />
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
          ].map((c) => (
            <div
              key={c.t}
              className="rounded-2xl p-5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}
            >
              <span className="h-2.5 w-2.5 rounded-full inline-block mb-4" style={{ background: primary, ...colorAdjust }} />
              <p className="font-bold text-sm text-white">{c.t}</p>
              <p className="text-xs text-white/50 mt-1.5 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>

        <div
          className="mt-12 rounded-2xl p-6"
          style={{ background: brandGradient, border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}
        >
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/70 font-bold mb-3">Fale conosco</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 text-sm text-white/90">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
            {d.addressLine && <p className="sm:col-span-2 text-white/70 text-xs leading-relaxed">{d.addressLine}</p>}
          </div>
        </div>
        <Folio page={2} />
      </section>

      {/* ====================== ESCOPO (1..N folhas) ====================== */}
      {scopePages.map((sp) => (
        <section className="vg-page" key={`scope-${sp.index}`}>
          <Kicker label="O que está incluído" color={accent} />
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
      <section className="vg-page flex flex-col">
        <Kicker label="Resumo financeiro" color={accent} />
        <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-2 text-white">Investimento</h2>

        <div className="mt-8 rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', ...colorAdjust }}>
          {((quote.discount_amount ?? 0) > 0 || showDisplacement) && (
            <div className="px-7 py-5 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', ...colorAdjust }}>
              {(quote.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">Subtotal</span>
                  <span className="text-white/80 tabular-nums">{money(quote.subtotal ?? 0)}</span>
                </div>
              )}
              {showDisplacement && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">
                    Deslocamento{(quote.distance_km ?? 0) > 0 ? ` (${quote.distance_km} km)` : ''}
                  </span>
                  <span className="text-white/80 tabular-nums">{money(quote.displacement_cost ?? 0)}</span>
                </div>
              )}
              {(quote.discount_amount ?? 0) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/55">Desconto</span>
                  <span className="tabular-nums font-semibold" style={{ color: primary }}>− {money(quote.discount_amount ?? 0)}</span>
                </div>
              )}
            </div>
          )}
          <div className="px-7 py-8 relative overflow-hidden" style={{ background: brandGradient, ...colorAdjust }}>
            <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-10" style={{ background: 'white', ...colorAdjust }} />
            <div className="relative z-10 flex items-end justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/75 font-bold">Valor total</p>
                {!!installments && installments > 1 && (
                  <p className="text-xs text-white/85 mt-2">
                    em até {installments}× de {money((quote.total_value ?? 0) / installments)}
                  </p>
                )}
              </div>
              <p className="font-black tabular-nums tracking-tight leading-none text-white" style={{ fontSize: 'clamp(34px, 8vw, 52px)' }}>
                {money(quote.total_value ?? 0)}
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
          <div className="mt-6 rounded-2xl p-6" style={{ border: `1px solid ${primary}55`, background: `${primary}12`, ...colorAdjust }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: primary }}>Brindes inclusos</p>
            <p className="text-sm text-white/75 leading-relaxed">
              Esta proposta acompanha brindes de cortesia, sem custo adicional.
            </p>
          </div>
        )}

        {quote.terms && (
          <div className="mt-7 rounded-2xl p-6" style={{ borderLeft: `4px solid ${primary}`, background: 'rgba(255,255,255,0.03)', ...colorAdjust }}>
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
      <section className="vg-page flex flex-col items-center justify-center text-center">
        <div className="h-1.5 w-20 rounded-full mb-8" style={{ background: brandGradient, ...colorAdjust }} />
        <h2 className="font-black tracking-tight text-white" style={{ fontSize: 'clamp(40px, 9vw, 60px)' }}>Obrigado!</h2>
        <p className="text-white/55 text-lg mt-4 max-w-md leading-relaxed">
          Estamos à disposição para esclarecer dúvidas e seguir com a execução assim que a proposta for aprovada.
        </p>

        <div className="mt-12 rounded-2xl px-8 py-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', ...colorAdjust }}>
          {d.logoUrl ? (
            <img src={d.logoUrl} alt={d.companyName} className="h-11 w-auto object-contain mx-auto mb-3" crossOrigin="anonymous" />
          ) : (
            <p className="font-black text-xl text-white">{d.companyName}</p>
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

function Kicker({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, ...colorAdjust }} />
      <p className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color }}>{label}</p>
    </div>
  );
}
