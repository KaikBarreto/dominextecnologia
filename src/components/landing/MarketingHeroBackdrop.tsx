import { useEffect, useState } from 'react';
import DarkVeilBackground from '@/components/ui/DarkVeilBackground';

interface MarketingHeroBackdropProps {
  accentColor?: string;
  veilHueShiftOverride?: number;
}

/** DarkVeil restrito à hero e montado somente quando o tema escuro está ativo. */
export default function MarketingHeroBackdrop({
  accentColor,
  veilHueShiftOverride,
}: MarketingHeroBackdropProps) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains('dark'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!dark) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <DarkVeilBackground
        accentColor={accentColor}
        veilHueShiftOverride={veilHueShiftOverride}
        speed={0.5}
      />
      <div className="absolute inset-0 bg-black/30" />
    </div>
  );
}
