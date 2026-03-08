import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ModernTemplate({ quote, company, items }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');

  return (
    <div className="bg-white text-gray-900 min-h-[800px]" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header with colored bg */}
      <div className="bg-blue-600 text-white p-8 rounded-t-xl">
        <div className="flex justify-between items-start">
          <div>
            {company?.logo_url && (
              <img src={company.logo_url} alt="Logo" className="h-12 mb-3 object-contain brightness-0 invert" crossOrigin="anonymous" />
            )}
            <p className="font-bold text-xl">{company?.name || 'Empresa'}</p>
            <div className="text-blue-100 text-xs mt-1 space-y-0.5">
              {company?.phone && <p>{company.phone}</p>}
              {company?.email && <p>{company.email}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-blue-200 uppercase tracking-widest">Proposta Comercial</p>
            <p className="text-4xl font-black mt-1">#{quote.quote_number}</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Client + Date cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Para</p>
            <p className="font-bold text-lg">{clientName}</p>
            {(quote.customers?.email || quote.prospect_email) && (
              <p className="text-sm text-gray-500">{quote.customers?.email ?? quote.prospect_email}</p>
            )}
            {(quote.customers?.phone || quote.prospect_phone) && (
              <p className="text-sm text-gray-500">{quote.customers?.phone ?? quote.prospect_phone}</p>
            )}
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-right">
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Data</p>
            <p className="font-semibold">{format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
            {quote.valid_until && (
              <>
                <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1 mt-3">Validade</p>
                <p className="font-semibold">{format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}</p>
              </>
            )}
          </div>
        </div>

        {/* Items as cards */}
        {serviceItems.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase text-blue-600 mb-3 tracking-wider">Serviços</p>
            <div className="space-y-2">
              {serviceItems.sort((a, b) => a.position - b.position).map((item, i) => (
                <div key={i} className="flex justify-between items-center bg-blue-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{item.description}</p>
                    <p className="text-xs text-gray-400">{item.quantity}x R$ {(item.unit_price || 0).toFixed(2)}</p>
                  </div>
                  <p className="font-bold text-blue-700">R$ {(item.total_price || 0).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {materialItems.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase text-blue-600 mb-3 tracking-wider">Materiais</p>
            <div className="space-y-2">
              {materialItems.sort((a, b) => a.position - b.position).map((item, i) => (
                <div key={i} className="flex justify-between items-center bg-orange-50 rounded-lg px-4 py-3">
                  <div>
                    <p className="font-medium text-sm">{item.description}</p>
                    <p className="text-xs text-gray-400">{item.quantity}x R$ {(item.unit_price || 0).toFixed(2)}</p>
                  </div>
                  <p className="font-bold text-orange-700">R$ {(item.total_price || 0).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Total */}
        <div className="bg-gray-900 text-white rounded-xl p-5 flex flex-col items-end">
          {(quote.discount_amount ?? 0) > 0 && (
            <>
              <p className="text-sm text-gray-400">Subtotal: R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
              <p className="text-sm text-gray-400">Desconto: -R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
            </>
          )}
          <p className="text-3xl font-black mt-1">R$ {(quote.total_value ?? 0).toFixed(2)}</p>
        </div>

        {/* Terms */}
        {quote.terms && (
          <div className="border-l-4 border-blue-500 pl-4">
            <p className="text-xs font-bold uppercase text-gray-400 mb-1">Condições</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.terms}</p>
          </div>
        )}

        {quote.notes && (
          <div className="border-l-4 border-gray-300 pl-4">
            <p className="text-xs font-bold uppercase text-gray-400 mb-1">Observações</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
