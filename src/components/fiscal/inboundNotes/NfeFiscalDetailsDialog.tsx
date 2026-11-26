import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import type { NfeParseResult, NfeParsedTax } from '@/lib/nfeParser';
import { formatMoney } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: NfeParseResult | null;
}

function TaxValues({ value }: { value: NfeParsedTax }) {
  const { locale, currency } = useAppLocaleContext();
  if (value.base == null && value.rate == null && value.amount == null) return <span>—</span>;
  return (
    <span className="whitespace-nowrap">
      BC {value.base == null ? '—' : formatMoney(value.base, currency, locale)} ·{' '}
      {value.rate == null ? '—' : `${value.rate.toLocaleString('pt-BR')}%`} ·{' '}
      {value.amount == null ? '—' : formatMoney(value.amount, currency, locale)}
    </span>
  );
}

export function NfeFiscalDetailsDialog({ open, onOpenChange, note }: Props) {
  const { locale, currency } = useAppLocaleContext();
  if (!note) return null;
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Dados fiscais da NF-e ${note.number || ''}`.trim()}
      description="Códigos e tributos informados pelo emitente no XML autorizado."
      className="sm:max-w-[1100px]"
    >
      <div className="space-y-4">
        <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
          <p><span className="text-muted-foreground">Emitente:</span> {note.supplier.name || '—'}</p>
          <p><span className="text-muted-foreground">Destinatário:</span> {note.recipient.name || '—'}</p>
          <p><span className="text-muted-foreground">Chave:</span> <span className="break-all font-mono text-xs">{note.accessKey || '—'}</span></p>
          <p><span className="text-muted-foreground">Total:</span> {note.total == null ? '—' : formatMoney(note.total, currency, locale)}</p>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {['Produto', 'NCM', 'CEST', 'CFOP', 'CST/CSOSN', 'Origem', 'ICMS (BC · % · valor)', 'IPI', 'PIS', 'COFINS'].map((label) => (
                  <th key={label} className="px-3 py-2 font-medium">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {note.items.map((item, index) => (
                <tr key={`${item.cProd}-${index}`}>
                  <td className="max-w-56 px-3 py-2">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-muted-foreground">{item.quantity} {item.unit.toUpperCase()}</p>
                  </td>
                  <td className="px-3 py-2 font-mono">{item.ncm || '—'}</td>
                  <td className="px-3 py-2 font-mono">{item.cest || '—'}</td>
                  <td className="px-3 py-2 font-mono">{item.cfop || '—'}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{item.cst || item.csosn || '—'}</Badge></td>
                  <td className="px-3 py-2">{item.origem || '—'}</td>
                  <td className="px-3 py-2"><TaxValues value={item.icms} /></td>
                  <td className="px-3 py-2"><TaxValues value={item.ipi} /></td>
                  <td className="px-3 py-2"><TaxValues value={item.pis} /></td>
                  <td className="px-3 py-2"><TaxValues value={item.cofins} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ResponsiveModal>
  );
}
