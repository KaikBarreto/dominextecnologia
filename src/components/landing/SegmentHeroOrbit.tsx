import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import './SegmentHeroOrbit.css';

interface SegmentHeroOrbitItem {
  icon: LucideIcon;
  title: string;
}

interface SegmentHeroOrbitProps {
  accentColor: string;
  items: SegmentHeroOrbitItem[];
}

function spiralPath(arm: number) {
  return Array.from({ length: 90 }, (_, index) => {
    const progress = index / 89;
    const angle = arm * ((Math.PI * 2) / 5) + progress * Math.PI * 2 * 1.08;
    const x = 600 + Math.cos(angle) * (34 + progress * 570);
    const y = 360 + Math.sin(angle) * (22 + progress * 340);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

const SPIRAL_PATHS = Array.from({ length: 5 }, (_, arm) => spiralPath(arm));

export default function SegmentHeroOrbit({ accentColor, items }: SegmentHeroOrbitProps) {
  const visibleItems = items.slice(0, 6);

  return (
    <div
      className="segment-hero-orbit"
      style={{ '--segment-orbit-accent': accentColor } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1200 720" preserveAspectRatio="none" className="segment-hero-orbit__guides">
        <circle cx="600" cy="360" r="118" />
        <circle cx="600" cy="360" r="220" />
        {SPIRAL_PATHS.map((path, index) => (
          <path d={path} key={index} />
        ))}
      </svg>

      <div className="segment-hero-orbit__plane">
        <div className="segment-hero-orbit__track">
          {visibleItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={`${item.title}-${index}`}
                className="segment-hero-orbit__item"
                style={
                  {
                    '--segment-orbit-delay': `${index * -9}s`,
                  } as CSSProperties
                }
              >
                <div className="segment-hero-orbit__card">
                  <span className="segment-hero-orbit__icon"><Icon /></span>
                  <span className="segment-hero-orbit__label">{item.title}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
