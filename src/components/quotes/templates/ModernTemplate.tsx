import type { ProposalTemplateProps } from './types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/utils/currency';

export function ModernTemplate({ quote, company, items, customization }: ProposalTemplateProps) {
  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const clientDoc = (quote.customers as any)?.document;
  const clientEmail = quote.customers?.email ?? quote.prospect_email;
  const clientPhone = quote.customers?.phone ?? quote.prospect_phone;
  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra');
  const materialItems = items.filter(i => i.item_type === 'material');

  const primary = customization?.primary_color || '#2563eb';
  const accent = customization?.accent_color || '#f97316';
  const headerBg = customization?.header_bg || '#1e3a5f';

  const statusLabel: Record<string, string> = {
    rascunho: 'Rascunho', enviado: 'Enviada', aprovado: 'Aprovada', rejeitado: 'Rejeitada',
  };
  const statusColor: Record<string, string> = {
    rascunho: '#94a3b8', enviado: '#3b82f6', aprovado: '#22c55e', rejeitado: '#ef4444',
  };

  const sumTotal = (rows: typeof items) => rows.reduce((s, i) => s + (i.total_price || 0), 0);

  const renderItemGroup = (label: string, rows: typeof items, color: string, startNum: number) => {
    const sectionTotal = sumTotal(rows);
    return (
      <div>
        <p className="text-xs font-extrabold uppercase mb-3 tracking-[0.15em]" style={{ color }}>{label}</p>
        <div className="space-y-2">
          {rows.sort((a, b) => a.position - b.position).map((item, i) => (
            <div key={i} className="flex justify-between items-center rounded-xl px-5 py-4 bg-white border border-gray-200" style={{ borderLeft: `4px solid ${color}` }}>
              <div className="flex items-start gap-3">
                <span className="text-[10px] font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${color}15`, color }}>{String(startNum + i).padStart(2, '0')}</span>
                <div>
                  <p className="font-semibold text-sm text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.quantity} un × R$ {formatBRL(item.unit_price || 0)}</p>
                </div>
              </div>
              <p className="font-extrabold text-lg tabular-nums" style={{ color }}>R$ {formatBRL(item.total_price || 0)}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-end mt-2">
          <div className="bg-gray-50 rounded-lg px-4 py-2 text-right">
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold mr-3">Subtotal</span>
            <span className="font-bold text-sm tabular-nums text-gray-800">R$ {formatBRL(sectionTotal)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white text-gray-900 min-h-[800px]" style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div className="p-8 pb-10 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${headerBg} 0%, ${primary} 100%)` }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
        <div className="flex justify-between items-start relative z-10">
          <div>
            {company?.logo_url ? (
              <img src={company.logo_url} alt="Logo" className="h-12 mb-4 object-contain brightness-0 invert" crossOrigin="anonymous" />
            ) : (
              <p className="text-xl font-extrabold mb-2">{company?.name || 'Empresa'}</p>
            )}
            <div className="text-white/70 text-xs space-y-0.5 mt-1">
              {company?.document && <p>CNPJ: {company.document}</p>}
              {company?.phone && <p>{company.phone}</p>}
              {company?.email && <p>{company.email}</p>}
              {company?.address && (
                <p>
                  {company.address}{company.complement ? `, ${company.complement}` : ''}
                  {company.neighborhood ? ` — ${company.neighborhood}` : ''}
                  {company.city ? `, ${company.city}` : ''}{company.state ? `/${company.state}` : ''}
                  {company.zip_code ? ` · CEP ${company.zip_code}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-3">
              <p className="text-xs text-white/60 uppercase tracking-[0.2em] font-bold">Proposta Comercial</p>
              {quote.status && statusLabel[quote.status] && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full" style={{ background: statusColor[quote.status] || '#94a3b8' }}>
                  {statusLabel[quote.status]}
                </span>
              )}
            </div>
            <p className="text-5xl font-black mt-2 leading-none">#{quote.quote_number}</p>
            <p className="text-sm text-white/60 mt-2">{format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
          </div>
        </div>
      </div>

      <div className="p-8 space-y-6">
        {/* Client + Validity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 -mt-6">
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100">
            <p className="text-[10px] uppercase font-extrabold tracking-[0.15em] mb-2" style={{ color: primary }}>Para</p>
            <p className="font-bold text-lg text-gray-900">{clientName}</p>
            {clientDoc && <p className="text-xs text-gray-400 mt-0.5">CPF/CNPJ: {clientDoc}</p>}
            {clientEmail && <p className="text-sm text-gray-500 mt-0.5">{clientEmail}</p>}
            {clientPhone && <p className="text-sm text-gray-500">{clientPhone}</p>}
          </div>
          <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 text-right">
            <p className="text-[10px] uppercase font-extrabold tracking-[0.15em] mb-2" style={{ color: primary }}>Datas</p>
            <p className="text-sm text-gray-500">Emissão: <span className="font-semibold text-gray-800">{format(new Date(quote.created_at), 'dd/MM/yyyy', { locale: ptBR })}</span></p>
            {quote.valid_until && (
              <p className="text-sm text-gray-500 mt-1">Validade: <span className="font-semibold text-gray-800">{format(new Date(quote.valid_until), 'dd/MM/yyyy', { locale: ptBR })}</span></p>
            )}
          </div>
        </div>

        {/* Items */}
        {serviceItems.length > 0 && renderItemGroup('Serviços', serviceItems, primary, 1)}
        {materialItems.length > 0 && renderItemGroup('Materiais', materialItems, accent, serviceItems.length + 1)}

        {serviceItems.length === 0 && materialItems.length === 0 && items.length > 0 && renderItemGroup('Itens', items, primary, 1)}

        {/* Total */}
        <div className="rounded-2xl p-6 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${headerBg} 0%, #1e293b 100%)` }}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-5" style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)', transform: 'translate(30%, -30%)' }} />
          <div className="relative z-10 flex flex-col items-end">
            {(quote.discount_amount ?? 0) > 0 && (
              <div className="space-y-0.5 mb-3 text-right">
                <p className="text-sm text-gray-400">Subtotal: R$ {formatBRL(quote.subtotal ?? 0)}</p>
                <p className="text-sm text-gray-400">Desconto: −R$ {formatBRL(quote.discount_amount ?? 0)}</p>
              </div>
            )}
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold mb-1">Valor Total</p>
            <p className="text-4xl font-black tracking-tight tabular-nums">R$ {formatBRL(quote.total_value ?? 0)}</p>
          </div>
        </div>

        {/* Terms */}
        {quote.terms && (
          <div className="rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 rounded-full" style={{ background: primary }} />
              <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-[0.15em]">Condições e Termos</p>
            </div>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed pl-3">{quote.terms}</p>
          </div>
        )}

        {quote.notes && (
          <div className="rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 rounded-full bg-gray-300" />
              <p className="text-[10px] font-extrabold uppercase text-gray-400 tracking-[0.15em]">Observações</p>
            </div>
            <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed pl-3">{quote.notes}</p>
          </div>
        )}

        {/* Footer */}
        <div className="pt-6 mt-6 border-t border-gray-200 flex justify-between items-end text-xs text-gray-400">
          <div>
            <p className="font-bold text-gray-600">{company?.name}</p>
            {company?.phone && <p>{company.phone}</p>}
            {company?.email && <p>{company.email}</p>}
          </div>
          <p>Proposta #{quote.quote_number}</p>
        </div>
      </div>
    </div>
  );
}
