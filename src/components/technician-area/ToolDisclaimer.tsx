import type { ReactNode } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface ToolDisclaimerProps {
  /** Texto custom (sobrepõe o padrão traduzido). Aceita também children. */
  texto?: ReactNode;
  children?: ReactNode;
}

/**
 * Nota de rodapé discreta para telas de cálculo (ferramenta de apoio).
 * Baixa ênfase: texto pequeno e esmaecido, com leve separador no topo.
 * Componente puro de apresentação — sem rota/hook, seguro no modo embedded.
 * O texto padrão é traduzido pelo locale ativo; a prop `texto` sobrepõe.
 */
export function ToolDisclaimer({ texto, children }: ToolDisclaimerProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools;
  const textoPadrao = t.disclaimer.default;
  return (
    <p className="mt-2 border-t border-border pt-3 text-center text-xs leading-relaxed text-muted-foreground">
      {children ?? texto ?? textoPadrao}
    </p>
  );
}
