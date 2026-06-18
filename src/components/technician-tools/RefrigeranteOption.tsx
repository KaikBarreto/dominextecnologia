import { SelectItem } from '@/components/ui/select';
import { RefrigeranteInflamavel } from '@/components/technician-tools/RefrigeranteInflamavel';
import type { Refrigerante } from '@/lib/refrigerantes';

/**
 * Item do select de fluido refrigerante com a bolinha de cor do gás + nome
 * truncável + selo de inflamável. Fonte única de aparência (sem drift visual)
 * usada pela Régua de Gases e pelo Superaquecimento.
 */
export function RefrigeranteOption({ refrig }: { refrig: Refrigerante }) {
  return (
    <SelectItem value={refrig.id}>
      <span className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/20 dark:border-white/25"
          style={{ backgroundColor: refrig.cor }}
        />
        <span className="min-w-0 truncate">{refrig.nome}</span>
        <RefrigeranteInflamavel refrigId={refrig.id} />
      </span>
    </SelectItem>
  );
}
