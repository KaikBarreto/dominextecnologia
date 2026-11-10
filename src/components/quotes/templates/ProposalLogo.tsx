import { useState, type SyntheticEvent } from 'react';
import { proposalLogoPlate } from '@/lib/proposal-logo-contrast';

export function ProposalLogo({ src, alt, height }: { src: string; alt: string; height: number }) {
  const [contrast, setContrast] = useState<{ src: string; plate: string | null }>({ src, plate: null });
  const plate = contrast.src === src ? contrast.plate : null;
  const loaded = (event: SyntheticEvent<HTMLImageElement>) => {
    setContrast({ src, plate: proposalLogoPlate(event.currentTarget) });
  };
  return <span className="inline-flex max-w-full min-w-0 shrink-0 items-center self-start rounded-md" style={{ backgroundColor: plate ?? undefined, padding: plate ? 6 : undefined }}>
    <img src={src} alt={alt} crossOrigin="anonymous" onLoad={loaded} className="min-w-0 max-w-full object-contain" style={{ height, width: 'auto' }} />
  </span>;
}
