import type { ReactNode } from 'react';

/** Texto padrão genérico do rodapé das ferramentas de cálculo. */
const TEXTO_PADRAO =
  'Ferramenta de apoio. Os valores são estimativas de referência — confira sempre a placa do equipamento, os manuais do fabricante e as normas técnicas aplicáveis antes de executar.';

interface ToolDisclaimerProps {
  /** Texto custom (sobrepõe o padrão). Aceita também children. */
  texto?: ReactNode;
  children?: ReactNode;
}

/**
 * Nota de rodapé discreta para telas de cálculo (ferramenta de apoio).
 * Baixa ênfase: texto pequeno e esmaecido, com leve separador no topo.
 * Componente puro de apresentação — sem rota/hook, seguro no modo embedded.
 */
export function ToolDisclaimer({ texto, children }: ToolDisclaimerProps) {
  return (
    <p className="mt-2 border-t border-border pt-3 text-center text-xs leading-relaxed text-muted-foreground">
      {children ?? texto ?? TEXTO_PADRAO}
    </p>
  );
}
