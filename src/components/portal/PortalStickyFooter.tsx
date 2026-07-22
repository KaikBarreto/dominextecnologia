import { SystemFooter } from '@/components/layout/SystemFooter';
import { PORTAL_FOOTER_GRADIENT } from './portalTheme';

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
}

/**
 * Rodape sticky escuro dos portais publicos.
 *
 * Padrao visual identico ao rodape do PontoPublico / TechnicianOS:
 *   - Degrede preto-cinza (#0a0a0a -> #27272a).
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
}: PortalStickyFooterProps) {
  const brandBg = ctaColor || '#00C597';
  const textColor = ctaTextColor || '#04150f';

  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-30 border-t border-white/10 shadow-[0_-4px_16px_rgba(0,0,0,0.25)] overflow-hidden"
      style={{
        background: PORTAL_FOOTER_GRADIENT,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="px-4 pt-4 pb-3 space-y-3">
        {status && (
          <p className="text-xs text-zinc-300 text-center">{status}</p>
        )}
        {ctaLabel && (
          <button
            type="button"
            onClick={onCta}
            className="w-full rounded-xl py-3.5 font-extrabold text-sm transition-opacity active:opacity-80"
            style={{ background: brandBg, color: textColor }}
          >
            {ctaLabel}
          </button>
        )}
        <div className="pt-0.5">
          <SystemFooter variant="dark" />
        </div>
      </div>
    </div>
  );
}
