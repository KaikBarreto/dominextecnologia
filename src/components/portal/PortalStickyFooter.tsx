import { SystemFooter } from '@/components/layout/SystemFooter';

interface PortalStickyFooterProps {
  /** Linha de status exibida acima do CTA (ex.: "Proxima manutencao 18/07"). */
  status?: React.ReactNode;
  /** Label do botao de acao principal. Se ausente, o botao nao aparece. */
  ctaLabel?: string;
  /** Callback do botao de acao principal. */
  onCta?: () => void;
  /** Cor de fundo do botao CTA (cor da empresa). Fallback: teal Dominex. */
  ctaColor?: string;
  /** Cor do texto sobre o botao CTA. Fallback: texto escuro. */
  ctaTextColor?: string;
  /** Classes extras no root (ex.: `lg:hidden`). Sem wrapper, pra o sticky pegar
   *  o containing block certo (o flex-col do shell) e fixar durante o scroll. */
  className?: string;
}

/**
 * Rodape sticky dos portais publicos.
 *
 * Segue o TEMA da pagina (portais forcam tema claro -> rodape claro), pra nao
 * gerar contraste escuro sobre o conteudo claro. Se a tela fosse escura, os
 * tokens (bg-card/border/muted) acompanhariam. Regua CEO 2026-07-27.
 *   - Fundo claro (bg-card) + borda superior sutil.
 *   - Status opcional acima do CTA.
 *   - CTA grande com a cor de marca da empresa.
 *   - SystemFooter (versao + "Desenvolvido por Auctus") na base.
 *   - Respeita safe-area-inset-bottom (notch do iPhone).
 */
export function PortalStickyFooter({
  status,
  ctaLabel,
  onCta,
  ctaColor,
  ctaTextColor,
  className,
}: PortalStickyFooterProps) {
  const brandBg = ctaColor || '#00C597';
  const textColor = ctaTextColor || '#ffffff';

  return (
    <div
      className={`sticky bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.06)] overflow-hidden ${className ?? ''}`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="px-4 pt-4 pb-3 space-y-3">
        {status && (
          <p className="text-xs text-muted-foreground text-center">{status}</p>
        )}
        {ctaLabel && (
          <button
            type="button"
            onClick={onCta}
            className="w-full rounded-lg py-3.5 font-extrabold text-sm transition-opacity active:opacity-80"
            style={{ background: brandBg, color: textColor }}
          >
            {ctaLabel}
          </button>
        )}
        <div className="pt-0.5">
          <SystemFooter variant="light" />
        </div>
      </div>
    </div>
  );
}
