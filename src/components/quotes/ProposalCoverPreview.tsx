import { useEffect, useRef, useState } from 'react';
import type { Quote } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import type { ProposalCustomization } from './templates/types';
import { ProposalRenderer } from './ProposalRenderer';
import { cn } from '@/lib/utils';

const A4_WIDTH = 794;
const A4_HEIGHT = 1123;

interface ProposalCoverPreviewProps {
  quote: Quote;
  company: CompanySettings | null | undefined;
  templateSlug: string;
  customization?: ProposalCustomization;
  label: string;
  className?: string;
}

/**
 * Recorta a primeira folha do renderer real da proposta e a escala como uma
 * miniatura A4. A capa exibida aqui é a mesma entregue ao cliente; não há uma
 * imagem paralela que possa ficar desatualizada em relação ao template.
 */
export function ProposalCoverPreview({
  quote,
  company,
  templateSlug,
  customization,
  label,
  className,
}: ProposalCoverPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.36);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      if (container.clientWidth > 0) {
        setScale(Math.min(1, container.clientWidth / A4_WIDTH));
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      className={cn('w-full', className)}
      data-testid="proposal-cover-preview"
    >
      <div
        className="overflow-hidden rounded-lg border bg-white shadow-sm"
        style={{ height: Math.round(A4_HEIGHT * scale) }}
      >
        <div
          aria-hidden="true"
          style={{
            width: A4_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <ProposalRenderer
            quote={quote}
            company={company}
            templateSlug={templateSlug}
            customization={customization}
          />
        </div>
      </div>
    </div>
  );
}
