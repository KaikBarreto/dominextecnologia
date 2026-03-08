import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ClassicTemplate({ quote, company, items }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');

  return (
    <div className="bg-white text-gray-900 p-8 min-h-[800px]" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-gray-800 pb-6 mb-6">
        <div>
          {company?.logo_url && (
            <img src={company.logo_url} alt="Logo" className="h-14 mb-3 object-contain" crossOrigin="anonymous" />
          )}
          <p className="font-bold text-xl text-gray-900">{company?.name || 'Empresa'}</p>
          {company?.document && <p className="text-xs text-gray-500 mt-1">{company.document}</p>}
          {company?.phone && <p className="text-xs text-gray-500">{company.phone}</p>}
          {company?.email && <p className="text-xs text-gray-500">{company.email}</p>}
          {company?.address && (
            <p className="text-xs text-gray-500">
              {company.address}{company.neighborhood ? `, ${company.neighborhood}` : ''}
              {company.city ? ` - ${company.city}` : ''}{company.state ? `/${company.state}` : ''}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gray-800 tracking-tight">PROPOSTA</p>
          <p className="text-lg text-gray-500 mt-1">#{quote.quote_number}</p>
          <p className="text-sm text-gray-400 mt-2">
            {format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* Client */}
      <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-6">
        <p className="text-xs text-gray-400 uppercase font-semibold mb-1">Destinatário</p>
        <p className="font-bold text-gray-900">{clientName}</p>
        {(quote.customers?.email || quote.prospect_email) && (
          <p className="text-sm text-gray-500">{quote.customers?.email ?? quote.prospect_email}</p>
        )}
        {(quote.customers?.phone || quote.prospect_phone) && (
          <p className="text-sm text-gray-500">{quote.customers?.phone ?? quote.prospect_phone}</p>
        )}
      </div>

      {quote.valid_until && (
        <p className="text-xs text-gray-400 mb-4">
          Válido até: <span className="font-medium text-gray-600">{format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}</span>
        </p>
      )}

      {/* Items Table */}
      {serviceItems.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Serviços</p>
          <table className="w-full text-sm border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left py-2 px-3 font-semibold border-b border-gray-200">Descrição</th>
                <th className="text-center py-2 px-3 font-semibold border-b border-gray-200 w-16">Qtd</th>
                <th className="text-right py-2 px-3 font-semibold border-b border-gray-200 w-28">Unitário</th>
                <th className="text-right py-2 px-3 font-semibold border-b border-gray-200 w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {serviceItems.sort((a, b) => a.position - b.position).map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 px-3">{item.description}</td>
                  <td className="text-center py-2 px-3">{item.quantity}</td>
                  <td className="text-right py-2 px-3">R$ {(item.unit_price || 0).toFixed(2)}</td>
                  <td className="text-right py-2 px-3 font-medium">R$ {(item.total_price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {materialItems.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-bold uppercase text-gray-400 mb-2 tracking-wider">Materiais</p>
          <table className="w-full text-sm border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left py-2 px-3 font-semibold border-b border-gray-200">Descrição</th>
                <th className="text-center py-2 px-3 font-semibold border-b border-gray-200 w-16">Qtd</th>
                <th className="text-right py-2 px-3 font-semibold border-b border-gray-200 w-28">Unitário</th>
                <th className="text-right py-2 px-3 font-semibold border-b border-gray-200 w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {materialItems.sort((a, b) => a.position - b.position).map((item, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2 px-3">{item.description}</td>
                  <td className="text-center py-2 px-3">{item.quantity}</td>
                  <td className="text-right py-2 px-3">R$ {(item.unit_price || 0).toFixed(2)}</td>
                  <td className="text-right py-2 px-3 font-medium">R$ {(item.total_price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals */}
      <div className="border-t-2 border-gray-800 pt-4 flex flex-col items-end mb-6">
        {(quote.discount_amount ?? 0) > 0 && (
          <>
            <p className="text-sm text-gray-500">Subtotal: R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
            <p className="text-sm text-gray-500">Desconto: -R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
          </>
        )}
        <p className="text-2xl font-bold mt-1">Total: R$ {(quote.total_value ?? 0).toFixed(2)}</p>
      </div>

      {/* Terms */}
      {quote.terms && (
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">Condições e Termos</p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.terms}</p>
        </div>
      )}

      {quote.notes && (
        <div>
          <p className="text-xs font-bold uppercase text-gray-400 mb-1 tracking-wider">Observações</p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{quote.notes}</p>
        </div>
      )}
    </div>
  );
}
