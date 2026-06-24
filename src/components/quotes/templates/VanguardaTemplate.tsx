import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/utils/currency';

/**
 * Vanguarda — template de proposta comercial moderno, A4 VERTICAL (retrato),
 * multi-seção. Pensado pra ficar excelente tanto na tela pública (mobile/desktop)
 * quanto no PDF por impressão (Ctrl+P → A4).
 *
 * White-label: usa a marca do TENANT — logo (`company.logo_url`), nome e dados
 * cadastrais, e a paleta de `customization` (primary/accent/header_bg). NUNCA
 * referencia Auctus/Dominex — proposta é sempre a cara do cliente.
 *
 * Seções (cada uma quebra de página no print): Capa → Quem Somos → Escopo →
 * Investimento → Encerramento.
 *
 * Print-friendly: cada `.vg-page` é uma "folha" A4; `print:break-before-page`
 * força o quebra-página por seção. As faixas/figuras usam `print-color-adjust`
 * pra preservar as cores de fundo na impressão.
 */
export function VanguardaTemplate({ quote, company, items, customization }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const clientDoc = (quote.customers as any)?.document;
  const clientEmail = quote.customers?.email ?? quote.prospect_email;
  const clientPhone = quote.customers?.phone ?? quote.prospect_phone;

  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');
  const hasGroups = serviceItems.length > 0 || materialItems.length > 0;

  const primary = customization?.primary_color || '#0f172a';
  const accent = customization?.accent_color || '#f97316';
  const headerBg = customization?.header_bg || primary;

  const companyName = company?.name || 'Empresa';
  // Logo da proposta (custom) vence; sem ele, cai no logo da empresa.
  const logoUrl = customization?.logo_url || company?.logo_url;

  const sumTotal = (rows: typeof items) => rows.reduce((s, i) => s + (i.total_price || 0), 0);
  const installments = (quote as any).card_installments as number | undefined;

  // Estilo p/ preservar cores de fundo na impressão (faixas, blocos coloridos).
  const colorAdjust: React.CSSProperties = {
    WebkitPrintColorAdjust: 'exact',
    printColorAdjust: 'exact',
  };

  const renderItems = (label: string, rows: typeof items, color: string, startNum: number) => (
    <div className="mb-7">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="h-5 w-1.5 rounded-full" style={{ background: color, ...colorAdjust }} />
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em]" style={{ color }}>{label}</p>
      </div>
      <div className="space-y-2.5">
        {rows.sort((a, b) => a.position - b.position).map((item, i) => (
          <div
            key={i}
            className="flex justify-between items-start gap-4 rounded-2xl px-5 py-4 bg-white"
            style={{ border: '1px solid #e5e7eb', ...colorAdjust }}
          >
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="text-[10px] font-bold rounded-lg h-7 w-7 flex items-center justify-center shrink-0"
                style={{ background: `${color}14`, color, ...colorAdjust }}
              >
                {String(startNum + i).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 leading-snug">{item.description}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {item.quantity} un × R$ {formatBRL(item.unit_price || 0)}
                </p>
              </div>
            </div>
            <p className="font-extrabold text-base tabular-nums whitespace-nowrap" style={{ color: primary }}>
              R$ {formatBRL(item.total_price || 0)}
            </p>
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-2.5">
        <div className="text-xs">
          <span className="uppercase tracking-wider text-gray-400 font-bold mr-3">Subtotal</span>
          <span className="font-bold tabular-nums text-gray-700">R$ {formatBRL(sumTotal(rows))}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="vg-root bg-white text-gray-900 mx-auto"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif", maxWidth: '794px', width: '100%' }}
    >
      <style>{`
        .vg-page { padding: 48px; min-height: 1123px; position: relative; }
        @media (max-width: 640px) { .vg-page { padding: 28px 22px; min-height: 0; } }
        @media print {
          .vg-page { min-height: 1123px; }
          .vg-page + .vg-page { break-before: page; page-break-before: always; }
        }
      `}</style>

      {/* ====================== CAPA ====================== */}
      <section className="vg-page flex flex-col" style={{ ...colorAdjust }}>
        {/* Faixa geométrica de topo */}
        <div className="absolute inset-x-0 top-0 h-[42%] overflow-hidden" style={{ ...colorAdjust }}>
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${headerBg} 0%, ${primary} 100%)`, ...colorAdjust }} />
          <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full opacity-10" style={{ background: 'white', ...colorAdjust }} />
          <div
            className="absolute -left-10 bottom-0 w-72 h-72 opacity-[0.07]"
            style={{ background: accent, transform: 'rotate(25deg)', borderRadius: '40px', ...colorAdjust }}
          />
          {/* Diagonal de base da faixa */}
          <div
            className="absolute inset-x-0 bottom-0 h-16 bg-white"
            style={{ clipPath: 'polygon(0 100%, 100% 0, 100% 100%)', ...colorAdjust }}
          />
        </div>

        {/* Conteúdo da capa sobre a faixa */}
        <div className="relative z-10 pt-2">
          {logoUrl ? (
            // Chip claro: preserva o logo como é (sem filtro), legível sobre o fundo escuro da capa.
            <span className="inline-flex items-center bg-white rounded-lg px-3 py-2 shadow-sm">
              <img src={logoUrl} alt={companyName} className="h-12 object-contain" crossOrigin="anonymous" />
            </span>
          ) : (
            <p className="text-2xl font-black tracking-tight text-white">{companyName}</p>
          )}
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center text-white" style={{ minHeight: '180px' }}>
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-white/70">Proposta Comercial</p>
          <h1 className="text-5xl sm:text-6xl font-black leading-[0.95] mt-3 tracking-tight">
            Nº {quote.quote_number}
          </h1>
          <div
            className="h-1.5 w-20 rounded-full mt-5"
            style={{ background: accent, ...colorAdjust }}
          />
        </div>

        {/* Bloco destinatário + datas (corpo branco da capa) */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-5 mt-auto">
          <div className="rounded-2xl p-6 bg-gray-50" style={{ border: '1px solid #eef0f3', ...colorAdjust }}>
            <p className="text-[10px] uppercase font-extrabold tracking-[0.2em] mb-2" style={{ color: primary }}>Preparado para</p>
            <p className="font-bold text-xl text-gray-900 leading-tight">{clientName}</p>
            {clientDoc && <p className="text-xs text-gray-400 mt-1.5">CPF/CNPJ: {clientDoc}</p>}
            {clientEmail && <p className="text-sm text-gray-500 mt-1">{clientEmail}</p>}
            {clientPhone && <p className="text-sm text-gray-500">{clientPhone}</p>}
          </div>
          <div className="rounded-2xl p-6 bg-gray-50" style={{ border: '1px solid #eef0f3', ...colorAdjust }}>
            <p className="text-[10px] uppercase font-extrabold tracking-[0.2em] mb-2" style={{ color: primary }}>Detalhes</p>
            <div className="space-y-2 text-sm">
              <p className="text-gray-500">Emissão<br /><span className="font-semibold text-gray-800">{format(new Date(quote.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span></p>
              {quote.valid_until && (
                <p className="text-gray-500">Validade<br /><span className="font-semibold text-gray-800">{format(new Date(quote.valid_until), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span></p>
              )}
            </div>
          </div>
        </div>

        <p className="relative z-10 text-center text-[10px] text-gray-300 mt-6 tracking-wider">
          {companyName}{company?.document ? ` · CNPJ ${company.document}` : ''}
        </p>
      </section>

      {/* ====================== QUEM SOMOS ====================== */}
      <section className="vg-page">
        <SectionHeading kicker="Apresentação" title="Quem somos" color={primary} accent={accent} />
        <p className="text-[15px] text-gray-600 leading-[1.9] mt-2">
          A <span className="font-semibold text-gray-900">{companyName}</span> tem o compromisso de entregar
          soluções com excelência técnica, transparência e prazos cumpridos. Esta proposta foi preparada
          especialmente para <span className="font-semibold text-gray-900">{clientName}</span>, reunindo o escopo,
          os materiais e os valores necessários para a execução do serviço com qualidade.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          {[
            { t: 'Qualidade', d: 'Padrão técnico em cada etapa.' },
            { t: 'Transparência', d: 'Escopo e valores claros, sem surpresas.' },
            { t: 'Compromisso', d: 'Prazos e combinados cumpridos.' },
          ].map((c) => (
            <div key={c.t} className="rounded-2xl p-5 bg-gray-50" style={{ border: '1px solid #eef0f3', ...colorAdjust }}>
              <div className="h-9 w-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${primary}12`, ...colorAdjust }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent, ...colorAdjust }} />
              </div>
              <p className="font-bold text-sm text-gray-900">{c.t}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{c.d}</p>
            </div>
          ))}
        </div>

        {/* Dados de contato da empresa */}
        <div className="mt-10 rounded-2xl p-6" style={{ background: `linear-gradient(135deg, ${headerBg} 0%, ${primary} 100%)`, ...colorAdjust }}>
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-bold mb-3">Fale conosco</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1.5 gap-x-6 text-sm text-white/90">
            {company?.phone && <p>📞 {company.phone}</p>}
            {company?.email && <p>✉️ {company.email}</p>}
            {company?.address && (
              <p className="sm:col-span-2 text-white/70 text-xs leading-relaxed">
                {company.address}{company.complement ? `, ${company.complement}` : ''}
                {company.neighborhood ? ` — ${company.neighborhood}` : ''}
                {company.city ? `, ${company.city}` : ''}{company.state ? `/${company.state}` : ''}
                {company.zip_code ? ` · CEP ${company.zip_code}` : ''}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ====================== ESCOPO / ITENS ====================== */}
      <section className="vg-page">
        <SectionHeading kicker="O que está incluído" title="Escopo do serviço" color={primary} accent={accent} />
        <div className="mt-4">
          {hasGroups ? (
            <>
              {serviceItems.length > 0 && renderItems('Serviços', serviceItems, primary, 1)}
              {materialItems.length > 0 && renderItems('Materiais', materialItems, accent, serviceItems.length + 1)}
            </>
          ) : (
            renderItems('Itens', items, primary, 1)
          )}
        </div>
      </section>

      {/* ====================== INVESTIMENTO ====================== */}
      <section className="vg-page flex flex-col">
        <SectionHeading kicker="Resumo financeiro" title="Investimento" color={primary} accent={accent} />

        <div className="mt-6 rounded-3xl overflow-hidden" style={{ border: '1px solid #e5e7eb', ...colorAdjust }}>
          {(quote.discount_amount ?? 0) > 0 && (
            <div className="px-7 py-5 space-y-2 bg-gray-50" style={{ ...colorAdjust }}>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-700 tabular-nums">R$ {formatBRL(quote.subtotal ?? 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Desconto</span>
                <span className="tabular-nums font-semibold" style={{ color: accent }}>− R$ {formatBRL(quote.discount_amount ?? 0)}</span>
              </div>
            </div>
          )}
          <div className="px-7 py-7 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${headerBg} 0%, ${primary} 100%)`, ...colorAdjust }}>
            <div className="absolute -right-12 -top-12 w-48 h-48 rounded-full opacity-10" style={{ background: 'white', ...colorAdjust }} />
            <div className="relative z-10 flex items-end justify-between flex-wrap gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-bold">Valor total</p>
                {!!installments && installments > 1 && (
                  <p className="text-xs text-white/70 mt-2">
                    em até {installments}× de R$ {formatBRL((quote.total_value ?? 0) / installments)}
                  </p>
                )}
              </div>
              <p className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight leading-none">
                R$ {formatBRL(quote.total_value ?? 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Condições e observações */}
        {quote.terms && (
          <div className="mt-7 rounded-2xl p-6" style={{ borderLeft: `4px solid ${accent}`, background: '#fafafa', ...colorAdjust }}>
            <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-[0.18em] mb-2">Condições e termos</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{quote.terms}</p>
          </div>
        )}
        {quote.notes && (
          <div className="mt-4 rounded-2xl p-6" style={{ background: '#fafafa', border: '1px solid #eef0f3', ...colorAdjust }}>
            <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-[0.18em] mb-2">Observações</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{quote.notes}</p>
          </div>
        )}
      </section>

      {/* ====================== ENCERRAMENTO ====================== */}
      <section className="vg-page flex flex-col items-center justify-center text-center" style={{ ...colorAdjust }}>
        <div className="h-1.5 w-16 rounded-full mb-8" style={{ background: accent, ...colorAdjust }} />
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight" style={{ color: primary }}>Obrigado!</h2>
        <p className="text-gray-500 text-lg mt-4 max-w-md leading-relaxed">
          Estamos à disposição para esclarecer qualquer dúvida e seguir com a execução assim que a proposta for aprovada.
        </p>

        <div className="mt-12 rounded-2xl px-8 py-6 bg-gray-50" style={{ border: '1px solid #eef0f3', ...colorAdjust }}>
          {logoUrl ? (
            <img src={logoUrl} alt={companyName} className="h-10 object-contain mx-auto mb-3" crossOrigin="anonymous" />
          ) : (
            <p className="font-black text-xl" style={{ color: primary }}>{companyName}</p>
          )}
          <div className="text-sm text-gray-500 space-y-0.5">
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
          </div>
        </div>

        <p className="text-[11px] text-gray-300 mt-10 tracking-wider">
          Proposta Nº {quote.quote_number} · {companyName}
        </p>
      </section>
    </div>
  );
}

function SectionHeading({ kicker, title, color, accent }: { kicker: string; title: string; color: string; accent: string }) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent, WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties} />
        <p className="text-[11px] font-extrabold uppercase tracking-[0.25em]" style={{ color: accent }}>{kicker}</p>
      </div>
      <h2 className="text-3xl sm:text-4xl font-black tracking-tight mt-2" style={{ color }}>{title}</h2>
    </div>
  );
}
