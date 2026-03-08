import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function ClassicTemplate({ quote, company, items }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');
  const allItems = [...serviceItems, ...materialItems].length === 0 ? items : null;

  const renderTable = (label: string, rows: typeof items) => (
    <div className="mb-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-gray-500 mb-3 border-b border-gray-300 pb-1">{label}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-gray-800">
            <th className="text-left py-2.5 px-3 font-bold text-gray-800" style={{ fontFamily: "'Georgia', serif" }}>Descrição</th>
            <th className="text-center py-2.5 px-3 font-bold text-gray-800 w-16" style={{ fontFamily: "'Georgia', serif" }}>Qtd</th>
            <th className="text-right py-2.5 px-3 font-bold text-gray-800 w-28" style={{ fontFamily: "'Georgia', serif" }}>Unitário</th>
            <th className="text-right py-2.5 px-3 font-bold text-gray-800 w-28" style={{ fontFamily: "'Georgia', serif" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.sort((a, b) => a.position - b.position).map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
              <td className="py-2.5 px-3 text-gray-700">{item.description}</td>
              <td className="text-center py-2.5 px-3 text-gray-600">{item.quantity}</td>
              <td className="text-right py-2.5 px-3 text-gray-600 tabular-nums">R$ {(item.unit_price || 0).toFixed(2)}</td>
              <td className="text-right py-2.5 px-3 font-semibold text-gray-800 tabular-nums">R$ {(item.total_price || 0).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="bg-white text-gray-900 p-10 min-h-[800px]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      {/* Header with double border */}
      <div className="border-t-4 border-b-2 border-gray-800 py-6 mb-8 flex justify-between items-start">
        <div>
          {company?.logo_url ? (
            <img src={company.logo_url} alt="Logo" className="h-16 mb-3 object-contain" crossOrigin="anonymous" />
          ) : (
            <p className="text-2xl font-bold text-gray-800 mb-1">{company?.name || 'Empresa'}</p>
          )}
          <div className="text-xs text-gray-500 space-y-0.5 mt-2" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
            {company?.document && <p>CNPJ: {company.document}</p>}
            {company?.phone && <p>Tel: {company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
            {company?.address && (
              <p>
                {company.address}{company.neighborhood ? `, ${company.neighborhood}` : ''}
                {company.city ? ` — ${company.city}` : ''}{company.state ? `/${company.state}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tracking-tight text-gray-800">PROPOSTA</p>
          <p className="text-lg text-gray-500 mt-1">Nº {quote.quote_number}</p>
          <p className="text-xs text-gray-400 mt-3" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
            {format(new Date(quote.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* Client info */}
      <div className="bg-gray-50 border border-gray-200 rounded p-5 mb-8">
        <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-bold mb-2" style={{ fontFamily: "'Segoe UI', sans-serif" }}>Destinatário</p>
        <p className="text-lg font-bold text-gray-900">{clientName}</p>
        <div className="flex gap-6 mt-1.5 text-sm text-gray-500" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
          {(quote.customers?.email || quote.prospect_email) && (
            <span>{quote.customers?.email ?? quote.prospect_email}</span>
          )}
          {(quote.customers?.phone || quote.prospect_phone) && (
            <span>{quote.customers?.phone ?? quote.prospect_phone}</span>
          )}
        </div>
      </div>

      {quote.valid_until && (
        <p className="text-xs text-gray-400 mb-6" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
          Válido até: <span className="font-semibold text-gray-600">{format(new Date(quote.valid_until), "dd/MM/yyyy", { locale: ptBR })}</span>
        </p>
      )}

      {/* Items */}
      {allItems ? renderTable('Itens', items) : (
        <>
          {serviceItems.length > 0 && renderTable('Serviços', serviceItems)}
          {materialItems.length > 0 && renderTable('Materiais', materialItems)}
        </>
      )}

      {/* Totals */}
      <div className="border-t-4 border-gray-800 pt-5 flex flex-col items-end mb-8">
        {(quote.discount_amount ?? 0) > 0 && (
          <div className="space-y-1 mb-2 text-right" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
            <p className="text-sm text-gray-500">Subtotal: R$ {(quote.subtotal ?? 0).toFixed(2)}</p>
            <p className="text-sm text-gray-500">Desconto: −R$ {(quote.discount_amount ?? 0).toFixed(2)}</p>
          </div>
        )}
        <p className="text-3xl font-bold tracking-tight">
          Total: R$ {(quote.total_value ?? 0).toFixed(2)}
        </p>
      </div>

      {/* Terms */}
      {quote.terms && (
        <div className="mb-6 border-l-4 border-gray-800 pl-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-bold mb-1" style={{ fontFamily: "'Segoe UI', sans-serif" }}>Condições e Termos</p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "'Segoe UI', sans-serif" }}>{quote.terms}</p>
        </div>
      )}

      {quote.notes && (
        <div className="mb-6 border-l-4 border-gray-300 pl-4">
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-bold mb-1" style={{ fontFamily: "'Segoe UI', sans-serif" }}>Observações</p>
          <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed" style={{ fontFamily: "'Segoe UI', sans-serif" }}>{quote.notes}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-16 pt-4 border-t-2 border-gray-800 text-xs text-gray-400 flex justify-between" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
        <span>{company?.name}</span>
        <span>Proposta #{quote.quote_number}</span>
      </div>
    </div>
  );
}
