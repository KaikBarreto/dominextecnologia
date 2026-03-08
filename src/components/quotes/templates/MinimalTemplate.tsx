import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function MinimalTemplate({ quote, company, items }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const allItems = [...items].sort((a, b) => a.position - b.position);

  return (
    <div className="bg-white text-gray-900 p-10 min-h-[800px]" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
      {/* Minimal header */}
      <div className="mb-16">
        <div className="flex justify-between items-start">
          <div>
            {company?.logo_url ? (
              <img src={company.logo_url} alt="Logo" className="h-10 mb-4 object-contain" crossOrigin="anonymous" />
            ) : (
              <p className="text-sm font-medium text-gray-400 mb-4">{company?.name || 'Empresa'}</p>
            )}
          </div>
          <p className="text-xs text-gray-400">
            {format(new Date(quote.created_at), 'dd MMM yyyy', { locale: ptBR })}
          </p>
        </div>
        
        <h1 className="text-4xl font-extralight text-gray-900 mt-8 tracking-tight">
          Proposta <span className="font-bold">#{quote.quote_number}</span>
        </h1>
        <p className="text-lg text-gray-400 mt-2">Para {clientName}</p>
      </div>

      {/* Items — simple list */}
      <div className="space-y-6 mb-16">
        {allItems.map((item, i) => (
          <div key={i} className="flex justify-between items-baseline pb-4 border-b border-gray-100">
            <div>
              <p className="text-base font-medium">{item.description}</p>
              <p className="text-sm text-gray-400 mt-0.5">
                {item.quantity} × R$ {(item.unit_price || 0).toFixed(2)}
              </p>
            </div>
            <p className="text-lg font-semibold tabular-nums">
              R$ {(item.total_price || 0).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="text-right mb-16">
        {(quote.discount_amount ?? 0) > 0 && (
          <div className="space-y-1 mb-3">
            <p className="text-sm text-gray-400">Subtotal R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
            <p className="text-sm text-gray-400">Desconto −R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
          </div>
        )}
        <p className="text-5xl font-extralight tracking-tight">
          R$ {(quote.total_value ?? 0).toFixed(2)}
        </p>
        {quote.valid_until && (
          <p className="text-xs text-gray-400 mt-3">
            Válido até {format(new Date(quote.valid_until), 'dd MMM yyyy', { locale: ptBR })}
          </p>
        )}
      </div>

      {/* Terms & Notes */}
      {quote.terms && (
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest text-gray-300 mb-2">Condições</p>
          <p className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed">{quote.terms}</p>
        </div>
      )}

      {quote.notes && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-300 mb-2">Observações</p>
          <p className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed">{quote.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-20 pt-6 border-t border-gray-100 text-xs text-gray-300 flex justify-between">
        <span>{company?.name}</span>
        <span>{company?.phone}{company?.email ? ` · ${company.email}` : ''}</span>
      </div>
    </div>
  );
}
