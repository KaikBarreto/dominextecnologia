import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { CargaTermica } from '@/components/technician-area/CargaTermica';

interface CargaTermicaCalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recebe o resultado em TR (Tonelada de Refrigeração), já formatado em padrão BR (vírgula). */
  onApply: (trBR: string) => void;
}

/**
 * Calculadora de carga térmica do contrato PMOC. Reusa a MESMA ferramenta da
 * Área do Técnico (mesmo motor de cálculo e inputs), rodando embutida e devolvendo
 * o valor em TR pro campo do ambiente. Drawer no mobile, dialog no desktop.
 */
export function CargaTermicaCalculatorModal({
  open,
  onOpenChange,
  onApply,
}: CargaTermicaCalculatorModalProps) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Calcular carga térmica">
      <CargaTermica
        onApply={(trBR) => {
          onApply(trBR);
          onOpenChange(false);
        }}
      />
    </ResponsiveModal>
  );
}
