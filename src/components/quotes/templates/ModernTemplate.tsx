import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ModernTemplate({ quote, company, items }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');

  return (
    <div className="bg-white text-gray-900 min-h-[800px]" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Header with gradient */}
      <div className="p-8 pb-10 text-white relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #3b82f6 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
        <div className="flex justify-between items-start relative z-10">
          <div>
            {company?.logo_url ? (
              <img src={company.logo_url} alt="Logo" className="h-12 mb-4 object-contain brightness-0 invert" crossOrigin="anonymous" />
            ) : (
              <p className="text-xl font-extrabold mb-2">{company?.name || 'Empresa'}</p>
            )}
            <div className="text-blue-100 text-xs space-y-0.5 mt-1">
              {company?.phone && <p>{company.phone}</p>}
              {company?.email && <p>{company.email}</p>}
              {company?.address && (
                <p>{company.address}{company.city ? `, ${company.city}` : ''}{company.state ? `/${company.state}` : ''}</p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-200 uppercase tracking-[0.2em] font-bold">Proposta Comercial</p>
            <p className="text-5xl font-black mt-2 leading-none">#{quote.quote_number}</p>
            <p className="text-sm text-blue-200 mt-2">{format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Client + Validity cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 -mt-6">
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
            <p className="text-[10px] text-blue-600 uppercase font-extrabold tracking-[0.15em] mb-2">Para</p>
            <p className="font-bold text-lg text-gray-900">{clientName}</p>
            {(quote.customers?.email || quote.prospect_email) && (
              <p className="text-sm text-gray-500 mt-0.5">{quote.customers?.email ?? quote.prospect_email}</p>
            )}
            {(quote.customers?.phone || quote.prospect_phone) && (
              <p className="text-sm text-gray-500">{quote.customers?.phone ?? quote.prospect_phone}</p>
            )}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 text-right">
            <p className="text-[10px] text-blue-600 uppercase font-extrabold tracking-[0.15em] mb-2">Datas</p>
            <p className="text-sm text-gray-500">Emissão: <span className="font-semibold text-gray-800">{format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></p>
            {quote.valid_until && (
              <p className="text-sm text-gray-500 mt-1">Validade: <span className="font-semibold text-gray-800">{format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}</span></p>
            )}
          </div>
        </div>

        {/* Service items */}
        {serviceItems.length > 0 && (
          <div>
            <p className="text-xs font-extrabold uppercase text-blue-600 mb-3 tracking-[0.15em]">Serviços</p>
            <div className="space-y-2">
              {serviceItems.sort((a, b) => a.position - b.position).map((item, i) => (
                <div key={i} className="flex justify-between items-center rounded-xl px-5 py-4 shadow-sm border border-blue-100" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' }}>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.quantity}× R$ {(item.unit_price || 0).toFixed(2)}</p>
                  </div>
                  <p className="font-extrabold text-blue-700 text-lg tabular-nums">R$ {(item.total_price || 0).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Material items */}
        {materialItems.length > 0 && (
          <div>
            <p className="text-xs font-extrabold uppercase text-orange-600 mb-3 tracking-[0.15em]">Materiais</p>
            <div className="space-y-2">
              {materialItems.sort((a, b) => a.position - b.position).map((item, i) => (
                <div key={i} className="flex justify-between items-center rounded-xl px-5 py-4 shadow-sm border border-orange-100" style={{ background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)' }}>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.quantity}× R$ {(item.unit_price || 0).toFixed(2)}</p>
                  </div>
                  <p className="font-extrabold text-orange-700 text-lg tabular-nums">R$ {(item.total_price || 0).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All items fallback */}
        {serviceItems.length === 0 && materialItems.length === 0 && items.length > 0 && (
          <div>
            <p className="text-xs font-extrabold uppercase text-blue-600 mb-3 tracking-[0.15em]">Itens</p>
            <div className="space-y-2">
              {items.sort((a, b) => a.position - b.position).map((item, i) => (
                <div key={i} className="flex justify-between items-center rounded-xl px-5 py-4 shadow-sm border border-blue-100" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' }}>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{item.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.quantity}× R$ {(item.unit_price || 0).toFixed(2)}</p>
                  </div>
                  <p className="font-extrabold text-blue-700 text-lg tabular-nums">R$ {(item.total_price || 0).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Total */}
        <div className="rounded-2xl p-6 text-white flex flex-col items-end" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
          {(quote.discount_amount ?? 0) > 0 && (
            <div className="space-y-0.5 mb-2 text-right">
              <p className="text-sm text-gray-400">Subtotal: R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
              <p className="text-sm text-gray-400">Desconto: −R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
            </div>
          )}
          <p className="text-4xl font-black tracking-tight tabular-nums">R$ {(quote.total_value ?? 0).toFixed(2)}</p>
        </div>

        {/* Terms */}
        {quote.terms && (
          <div className="border-l-4 border-blue-500 pl-5 py-1">
            <p className="text-[10px] font-extrabold uppercase text-gray-400 mb-1 tracking-[0.15em]">Condições</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{quote.terms}</p>
          </div>
        )}

        {quote.notes && (
          <div className="border-l-4 border-gray-300 pl-5 py-1">
            <p className="text-[10px] font-extrabold uppercase text-gray-400 mb-1 tracking-[0.15em]">Observações</p>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{quote.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
