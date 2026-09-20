interface FaceScanRingProps {
  progress: number;
  accentColor: string;
}

/** Anel segmentado compartilhado pelo cadastro, reconhecimento e selfie. */
export function FaceScanRing({ progress, accentColor }: FaceScanRingProps) {
  const ticks = 48;
  const active = Math.round(Math.max(0, Math.min(1, progress)) * ticks);
  return (
    <div className="pointer-events-none absolute -inset-3" aria-hidden>
      <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
        {Array.from({ length: ticks }).map((_, index) => (
          <line
            key={index}
            x1="50"
            y1="0.8"
            x2="50"
            y2="3.6"
            stroke={index < active ? accentColor : 'rgba(255,255,255,0.18)'}
            strokeWidth="0.7"
            strokeLinecap="round"
            transform={`rotate(${index * (360 / ticks)} 50 50)`}
            className="transition-colors duration-200 motion-reduce:transition-none"
          />
        ))}
      </svg>
    </div>
  );
}

export default FaceScanRing;
