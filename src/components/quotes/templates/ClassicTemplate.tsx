import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/utils/currency';

export function ClassicTemplate({ quote, company, items, customization }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const clientDoc = quote.customers?.document;
  const clientEmail = quote.customers?.email ?? quote.prospect_email;
  const clientPhone = quote.customers?.phone ?? quote.prospect_phone;

  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');
  const hasGroups = serviceItems.length > 0 || materialItems.length > 0;
  const allItems = hasGroups ? null : items;

  const primary = customization?.primary_color || '#1f2937';

  const statusLabel: Record<string, string> = {
    rascunho: 'Rascunho', enviado: 'Enviada', aprovado: 'Aprovada', rejeitado: 'Rejeitada',
  };

  const sumTotal = (rows: typeof items) => rows.reduce((s, i) => s + (i.total_price || 0), 0);

  const renderTable = (label: string, rows: typeof items, startNum: number) => {
    const sectionTotal = sumTotal(rows);
    return (
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.15em] mb-3 border-b pb-1" style={{ color: primary, borderColor: primary }}>{label}</p>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `2px solid ${primary}` }}>
              <th className="text-left py-2 px-2 font-bold text-gray-800 w-10" style={{ fontFamily: "'Georgia', serif" }}>#</th>
              <th className="text-left py-2 px-2 font-bold text-gray-800" style={{ fontFamily: "'Georgia', serif" }}>Descrição</th>
              <th className="text-center py-2 px-2 font-bold text-gray-800 w-14" style={{ fontFamily: "'Georgia', serif" }}>Qtd</th>
              <th className="text-right py-2 px-2 font-bold text-gray-800 w-28" style={{ fontFamily: "'Georgia', serif" }}>Unitário</th>
              <th className="text-right py-2 px-2 font-bold text-gray-800 w-28" style={{ fontFamily: "'Georgia', serif" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.sort((a, b) => a.position - b.position).map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                <td className="py-2 px-2 text-gray-400 text-xs">{String(startNum + i).padStart(2, '0')}</td>
                <td className="py-2 px-2 text-gray-700">{item.description}</td>
                <td className="text-center py-2 px-2 text-gray-600">{item.quantity}</td>
                <td className="text-right py-2 px-2 text-gray-600 tabular-nums">R$ {formatBRL(item.unit_price || 0)}</td>
                <td className="text-right py-2 px-2 font-semibold text-gray-800 tabular-nums">R$ {formatBRL(item.total_price || 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `1px solid ${primary}40` }}>
              <td colSpan={4} className="text-right py-2 px-2 text-xs font-bold uppercase tracking-wider text-gray-500">Subtotal {label}</td>
              <td className="text-right py-2 px-2 font-bold tabular-nums text-gray-800">R$ {formatBRL(sectionTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  return (
    <div className="bg-white text-gray-900 p-10 min-h-[800px]" style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}>
      {/* Header */}
      <div className="py-6 mb-8 flex justify-between items-start" style={{ borderTopWidth: 4, borderTopStyle: 'solid', borderTopColor: primary, borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: primary }}>
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
                {company.address}{company.complement ? `, ${company.complement}` : ''}
                {company.neighborhood ? ` — ${company.neighborhood}` : ''}
                {company.city ? `, ${company.city}` : ''}{company.state ? `/${company.state}` : ''}
                {company.zip_code ? ` — CEP ${company.zip_code}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tracking-tight" style={{ color: primary }}>PROPOSTA</p>
          <p className="text-lg text-gray-500 mt-1">Nº {quote.quote_number}</p>
          {quote.status && statusLabel[quote.status] && (
            <span className="inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border" style={{ borderColor: primary, color: primary }}>
              {statusLabel[quote.status]}
            </span>
          )}
          <p className="text-xs text-gray-400 mt-3" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
            {format(new Date(quote.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </p>
        </div>
      </div>

      {/* Client info */}
      <div className="bg-gray-50 border border-gray-200 rounded p-5 mb-8">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-2" style={{ color: primary, fontFamily: "'Segoe UI', sans-serif" }}>Destinatário</p>
        <p className="text-lg font-bold text-gray-900">{clientName}</p>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-1.5 text-sm text-gray-500" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
          {clientDoc && <span>CPF/CNPJ: {clientDoc}</span>}
          {clientEmail && <span>{clientEmail}</span>}
          {clientPhone && <span>{clientPhone}</span>}
        </div>
      </div>

      {/* Dates */}
      <div className="flex gap-8 mb-8 text-sm text-gray-500" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
        <p>Emissão: <span className="font-semibold text-gray-700">{format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></p>
        {quote.valid_until && (
          <p>Validade: <span className="font-semibold text-gray-700">{format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}</span></p>
        )}
      </div>

      {/* Items */}
      {allItems ? renderTable('Itens', items, 1) : (
        <>
          {serviceItems.length > 0 && renderTable('Serviços', serviceItems, 1)}
          {materialItems.length > 0 && renderTable('Materiais', materialItems, serviceItems.length + 1)}
        </>
      )}

      {/* Totals */}
      <div className="pt-5 flex flex-col items-end mb-8" style={{ borderTopWidth: 4, borderTopStyle: 'solid', borderTopColor: primary }}>
        {(quote.discount_amount ?? 0) > 0 && (
          <div className="space-y-1 mb-2 text-right" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
            <p className="text-sm text-gray-500">Subtotal: R$ {formatBRL(quote.subtotal ?? 0)}</p>
            <p className="text-sm text-gray-500">Desconto: −R$ {formatBRL(quote.discount_amount ?? 0)}</p>
          </div>
        )}
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1" style={{ fontFamily: "'Segoe UI', sans-serif" }}>Valor Total</p>
          <p className="text-3xl font-bold tracking-tight">R$ {formatBRL(quote.total_value ?? 0)}</p>
        </div>
      </div>

      {/* Terms */}
      {quote.terms && (
        <div className="mb-6 pl-4" style={{ borderLeft: `4px solid ${primary}` }}>
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

      {/* Signature */}
      <div className="mt-16 grid grid-cols-2 gap-16">
        <div className="text-center">
          <div className="border-b border-gray-400 mb-2 h-12" />
          <p className="text-xs text-gray-500" style={{ fontFamily: "'Segoe UI', sans-serif" }}>{company?.name || 'Empresa'}</p>
        </div>
        <div className="text-center">
          <div className="border-b border-gray-400 mb-2 h-12" />
          <p className="text-xs text-gray-500" style={{ fontFamily: "'Segoe UI', sans-serif" }}>{clientName}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 pt-4 text-xs text-gray-400 flex justify-between" style={{ borderTopWidth: 2, borderTopStyle: 'solid', borderTopColor: primary, fontFamily: "'Segoe UI', sans-serif" }}>
        <span>{company?.name}</span>
        <span>Proposta #{quote.quote_number}</span>
      </div>
    </div>
  );
}
