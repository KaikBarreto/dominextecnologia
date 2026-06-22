import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Calculator, X } from 'lucide-react';

interface AreaCalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe o resultado já formatado em padrão BR (vírgula decimal). */
  onApply: (areaBR: string) => void;
}

// Parse padrão BR (vírgula decimal) → number | null.
function parseBR(raw: string): number | null {
  const t = (raw ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Calculadora de Área Climatizada. Largura × Comprimento (m) → área (m²).
 * A Lei 13.589/ANVISA identifica o ambiente por m² — volume/pé-direito é cálculo
 * à parte, fora do escopo. Drawer no mobile, dialog no desktop (ResponsiveModal).
 */
export function AreaCalculatorModal({ open, onOpenChange, onApply }: AreaCalculatorModalProps) {
  const [largura, setLargura] = useState('');
  const [comprimento, setComprimento] = useState('');

  // Zera os campos a cada abertura.
  useEffect(() => {
    if (open) {
      setLargura('');
      setComprimento('');
    }
  }, [open]);

  const l = parseBR(largura);
  const c = parseBR(comprimento);
  const area = l !== null && c !== null && l > 0 && c > 0 ? l * c : null;
  // Resultado formatado em BR (vírgula), até 2 casas, sem zeros à toa.
  const areaBR =
    area === null ? '' : String(Number(area.toFixed(2))).replace('.', ',');

  const handleApply = () => {
    if (areaBR) onApply(areaBR);
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Calcular área climatizada"
      footer={
        <div className="flex w-full flex-row items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-1.5 h-4 w-4" /> Cancelar
          </Button>
          <Button onClick={handleApply} disabled={!areaBR}>
            <Calculator className="mr-1.5 h-4 w-4" /> Usar
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Informe as medidas do ambiente. A área é largura × comprimento, em metros quadrados (m²).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Largura (m)</Label>
            <NumericInput
              decimal
              value={largura}
              onValueChange={setLargura}
              placeholder="Ex: 5,0"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Comprimento (m)</Label>
            <NumericInput
              decimal
              value={comprimento}
              onValueChange={setComprimento}
              placeholder="Ex: 8,0"
            />
          </div>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3 text-center">
          <p className="text-xs text-muted-foreground">Área climatizada</p>
          <p className="text-xl font-semibold tabular-nums">
            {area === null ? '—' : `${area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²`}
          </p>
        </div>
      </div>
    </ResponsiveModal>
  );
}
