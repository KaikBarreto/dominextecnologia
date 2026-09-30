interface FaceIdFrameProps {
  progress: number;
  accentColor: string;
}

/**
 * Moldura estilo Face ID / leitor de QR: quatro colchetes (dois traços em L
 * por canto) em vez do anel circular. Usada SÓ nas telas de leitura
 * biométrica do quiosque (`FaceCaptureExperience`) — a selfie de registro da
 * batida (`CenteredSelfieCapture`) continua com `FaceScanRing`, sem mudança.
 *
 * O progresso continua comunicado, não é só estética: o braço de cada
 * colchete CRESCE com `progress` (de um terço até o braço quase inteiro) e a
 * cor mistura de branco translúcido (ainda procurando/estabilizando) para
 * `accentColor` (rosto estável/confirmado) na mesma proporção — dá pra ver
 * "quanto falta" tanto pelo tamanho do traço quanto pela cor, igual o anel
 * fazia com os tracinhos acendendo.
 */
export function FaceIdFrame({ progress, accentColor }: FaceIdFrameProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const armMin = 7;
  const armMax = 20;
  const arm = armMin + clamped * (armMax - armMin);
  const pct = Math.round(clamped * 100);
  const stroke = `color-mix(in srgb, ${accentColor} ${pct}%, rgba(255,255,255,0.45) ${100 - pct}%)`;
  const inset = 3;
  const size = 100;

  const corners: Array<{ x: number; y: number; dx: 1 | -1; dy: 1 | -1 }> = [
    { x: inset, y: inset, dx: 1, dy: 1 },
    { x: size - inset, y: inset, dx: -1, dy: 1 },
    { x: inset, y: size - inset, dx: 1, dy: -1 },
    { x: size - inset, y: size - inset, dx: -1, dy: -1 },
  ];

  return (
    <svg
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      aria-hidden
    >
      {corners.map((corner, index) => (
        <g key={index}>
          <line
            x1={corner.x}
            y1={corner.y}
            x2={corner.x + corner.dx * arm}
            y2={corner.y}
            stroke={stroke}
            strokeWidth="3.4"
            strokeLinecap="round"
            className="transition-all duration-200 motion-reduce:transition-none"
          />
          <line
            x1={corner.x}
            y1={corner.y}
            x2={corner.x}
            y2={corner.y + corner.dy * arm}
            stroke={stroke}
            strokeWidth="3.4"
            strokeLinecap="round"
            className="transition-all duration-200 motion-reduce:transition-none"
          />
        </g>
      ))}
    </svg>
  );
}

export default FaceIdFrame;
