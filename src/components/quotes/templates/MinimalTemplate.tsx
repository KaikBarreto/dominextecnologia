import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/utils/currency';

export function MinimalTemplate({ quote, company, items, customization }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const clientDoc = (quote.customers as any)?.document;
  const clientEmail = quote.customers?.email ?? quote.prospect_email;
  const clientPhone = quote.customers?.phone ?? quote.prospect_phone;

  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');
  const hasGroups = serviceItems.length > 0 || materialItems.length > 0;

  const primary = customization?.primary_color || '#111827';

  const sumTotal = (rows: typeof items) => rows.reduce((s, i) => s + (i.total_price || 0), 0);

  const renderGroup = (label: string | null, rows: typeof items) => (
    <div className="mb-8">
      {label && <p className="text-[10px] uppercase tracking-[0.3em] text-gray-300 mb-4">{label}</p>}
      {rows.sort((a, b) => a.position - b.position).map((item, i) => (
        <div key={i} className="flex justify-between items-baseline py-4" style={{ borderBottom: '1px solid #f3f4f6' }}>
          <div className="flex-1">
            <p className="text-base font-normal text-gray-800">{item.description}</p>
            <p className="text-xs text-gray-300 mt-1 tracking-wide">
              {item.quantity} un × R$ {formatBRL(item.unit_price || 0)}
            </p>
          </div>
          <p className="text-xl font-light tabular-nums ml-8" style={{ color: primary }}>
            R$ {formatBRL(item.total_price || 0)}
          </p>
        </div>
      ))}
      {label && (
        <div className="flex justify-end mt-2">
          <p className="text-xs text-gray-300 tabular-nums">Subtotal: R$ {formatBRL(sumTotal(rows))}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white text-gray-900 px-12 py-14 min-h-[800px]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-16">
        <div>
          {company?.logo_url ? (
            <img src={company.logo_url} alt="Logo" className="h-8 object-contain opacity-60 mb-3" crossOrigin="anonymous" />
          ) : (
            <p className="text-xs font-medium text-gray-300 uppercase tracking-[0.3em] mb-3">{company?.name || 'Empresa'}</p>
          )}
          <div className="text-[10px] text-gray-300 space-y-0.5 leading-relaxed">
            {company?.document && <p>{company.document}</p>}
            {company?.address && (
              <p>
                {company.address}{company.complement ? `, ${company.complement}` : ''}
                {company.neighborhood ? ` — ${company.neighborhood}` : ''}
                {company.city ? `, ${company.city}` : ''}{company.state ? `/${company.state}` : ''}
              </p>
            )}
            {(company?.phone || company?.email) && (
              <p>{company?.phone}{company?.email ? ` · ${company.email}` : ''}</p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-300 tracking-wider">
            {format(new Date(quote.created_at), 'dd MMM yyyy', { locale: ptBR }).toUpperCase()}
          </p>
          {quote.valid_until && (
            <p className="text-[10px] text-gray-200 tracking-wider mt-1">
              VÁLIDO ATÉ {format(new Date(quote.valid_until), 'dd MMM yyyy', { locale: ptBR }).toUpperCase()}
            </p>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="mb-16">
        <h1 className="text-5xl font-extralight tracking-tight leading-tight" style={{ color: primary }}>
          Proposta
        </h1>
        <div className="flex items-baseline gap-4 mt-2">
          <span className="text-5xl font-bold" style={{ color: primary }}>#{quote.quote_number}</span>
        </div>
        <div className="mt-4">
          <p className="text-xl text-gray-300 font-light">Para {clientName}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-300">
            {clientDoc && <span>{clientDoc}</span>}
            {clientEmail && <span>{clientEmail}</span>}
            {clientPhone && <span>{clientPhone}</span>}
          </div>
        </div>
      </div>

      {/* Items */}
      {hasGroups ? (
        <>
          {serviceItems.length > 0 && renderGroup('Serviços', serviceItems)}
          {materialItems.length > 0 && renderGroup('Materiais', materialItems)}
        </>
      ) : (
        renderGroup(null, items)
      )}

      {/* Total */}
      <div className="mb-16" style={{ borderTop: `2px solid ${primary}` }}>
        <div className="pt-6 text-right">
          {(quote.discount_amount ?? 0) > 0 && (
            <div className="space-y-1 mb-4">
              <p className="text-sm text-gray-300">Subtotal R$ {formatBRL(quote.subtotal ?? 0)}</p>
              <p className="text-sm text-gray-300">Desconto −R$ {formatBRL(quote.discount_amount ?? 0)}</p>
            </div>
          )}
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-300 mb-2">Valor Total</p>
          <p className="text-6xl font-extralight tracking-tight" style={{ color: primary }}>
            R$ {formatBRL(quote.total_value ?? 0)}
          </p>
        </div>
      </div>

      {/* Terms & Notes */}
      {quote.terms && (
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-300 mb-3">Condições</p>
          <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed font-light">{quote.terms}</p>
        </div>
      )}

      {quote.notes && (
        <div className="mb-10">
          <p className="text-[10px] uppercase tracking-[0.3em] text-gray-300 mb-3">Observações</p>
          <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed font-light">{quote.notes}</p>
        </div>
      )}

      {/* Signature */}
      <div className="mt-20 grid grid-cols-2 gap-20">
        <div className="text-center">
          <div className="border-b border-gray-200 mb-2 h-10" />
          <p className="text-[10px] text-gray-300 tracking-wider">{company?.name?.toUpperCase()}</p>
        </div>
        <div className="text-center">
          <div className="border-b border-gray-200 mb-2 h-10" />
          <p className="text-[10px] text-gray-300 tracking-wider">{clientName.toUpperCase()}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-16 pt-6 text-[10px] text-gray-200 flex justify-between tracking-wider" style={{ borderTop: '1px solid #f3f4f6' }}>
        <span>{company?.name?.toUpperCase()}</span>
        <span>#{quote.quote_number}</span>
      </div>
    </div>
  );
}
