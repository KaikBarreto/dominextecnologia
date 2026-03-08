import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function MinimalTemplate({ quote, company, items, customization }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const allItems = [...items].sort((a, b) => a.position - b.position);

  const primary = customization?.primary_color || '#111827';

  return (
    <div className="bg-white text-gray-900 px-12 py-14 min-h-[800px]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Minimal header */}
      <div className="flex justify-between items-center mb-20">
        {company?.logo_url ? (
          <img src={company.logo_url} alt="Logo" className="h-8 object-contain opacity-60" crossOrigin="anonymous" />
        ) : (
          <p className="text-xs font-medium text-gray-300 uppercase tracking-[0.3em]">{company?.name || 'Empresa'}</p>
        )}
        <p className="text-xs text-gray-300 tracking-wider">
          {format(new Date(quote.created_at), 'dd MMM yyyy', { locale: ptBR }).toUpperCase()}
        </p>
      </div>

      {/* Title */}
      <div className="mb-20">
        <h1 className="text-5xl font-extralight tracking-tight leading-tight" style={{ color: primary }}>
          Proposta
        </h1>
        <div className="flex items-baseline gap-4 mt-2">
          <span className="text-5xl font-bold" style={{ color: primary }}>#{quote.quote_number}</span>
        </div>
        <p className="text-xl text-gray-300 mt-4 font-light">Para {clientName}</p>
      </div>

      {/* Items */}
      <div className="mb-20">
        {allItems.map((item, i) => (
          <div key={i} className="flex justify-between items-baseline py-5" style={{ borderBottom: '1px solid #f3f4f6' }}>
            <div className="flex-1">
              <p className="text-base font-normal text-gray-800">{item.description}</p>
              <p className="text-xs text-gray-300 mt-1 tracking-wide">
                {item.quantity} × R$ {(item.unit_price || 0).toFixed(2)}
              </p>
            </div>
            <p className="text-xl font-light tabular-nums ml-8" style={{ color: primary }}>
              R$ {(item.total_price || 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="text-right mb-20">
        {(quote.discount_amount ?? 0) > 0 && (
          <div className="space-y-1 mb-4">
            <p className="text-sm text-gray-300">Subtotal R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
            <p className="text-sm text-gray-300">Desconto −R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
          </div>
        )}
        <p className="text-6xl font-extralight tracking-tight" style={{ color: primary }}>
          R$ {(quote.total_value ?? 0).toFixed(2)}
        </p>
        {quote.valid_until && (
          <p className="text-xs text-gray-300 mt-4 tracking-wider">
            VÁLIDO ATÉ {format(new Date(quote.valid_until), 'dd MMM yyyy', { locale: ptBR }).toUpperCase()}
          </p>
        )}
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

      {/* Footer */}
      <div className="mt-24 pt-8 text-[10px] text-gray-200 flex justify-between tracking-wider" style={{ borderTop: '1px solid #f3f4f6' }}>
        <span>{company?.name?.toUpperCase()}</span>
        <span>{company?.phone}{company?.email ? ` · ${company.email}` : ''}</span>
      </div>
    </div>
  );
}
