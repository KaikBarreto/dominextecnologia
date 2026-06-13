/**
 * Ilustração do ciclo de refrigeração — diagrama SVG inline, original (sem arte
 * de terceiros). Mostra os 4 componentes principais (Compressor, Condensador,
 * Dispositivo de Expansão, Evaporador) e onde ficam o Manômetro e o Termômetro
 * na linha de sucção.
 *
 * Linhas coloridas pra ideia do fluxo: sucção (vapor frio) em azul, descarga /
 * linha de líquido (quente) em laranja/vermelho. Tudo via tokens / classes que
 * funcionam em dark mode. SVG leve, sem imagens externas (PWA offline).
 */

export function CicloRefrigeracaoIlustracao() {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Ciclo de refrigeração
      </p>
      <svg
        viewBox="0 0 360 200"
        role="img"
        aria-label="Diagrama do ciclo de refrigeração: compressor, condensador, dispositivo de expansão e evaporador, com manômetro e termômetro na linha de sucção"
        className="h-auto w-full"
      >
        {/* ===== Linhas de fluxo (desenhadas antes das caixas) ===== */}
        {/* Linha de descarga (quente) — compressor → condensador (topo) */}
        <g
          className="text-orange-500 dark:text-orange-400"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        >
          {/* compressor -> condensador */}
          <path d="M70 50 H150" markerEnd="url(#seta-quente)" />
          {/* condensador -> expansão (linha de líquido, lado direito descendo) */}
          <path d="M290 50 H320 V150 H250" markerEnd="url(#seta-quente)" />
        </g>

        {/* Linha de sucção (vapor frio) — evaporador → compressor (base/esquerda) */}
        <g
          className="text-sky-500 dark:text-sky-400"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        >
          {/* evaporador -> compressor (esquerda subindo) */}
          <path d="M150 150 H40 V50 H50" markerEnd="url(#seta-fria)" />
          {/* expansão -> evaporador */}
          <path d="M210 150 H150" markerEnd="url(#seta-fria)" />
        </g>

        {/* Definição das setas */}
        <defs>
          <marker
            id="seta-quente"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path
              d="M0 0 L6 3 L0 6 Z"
              className="fill-orange-500 dark:fill-orange-400"
            />
          </marker>
          <marker id="seta-fria" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
            <path d="M0 0 L6 3 L0 6 Z" className="fill-sky-500 dark:fill-sky-400" />
          </marker>
        </defs>

        {/* ===== Componentes (caixas) ===== */}
        {/* Compressor (canto superior esquerdo) */}
        <g>
          <rect
            x="20"
            y="30"
            width="50"
            height="40"
            rx="6"
            className="fill-muted stroke-border"
            strokeWidth="1.5"
          />
          <circle cx="45" cy="50" r="11" className="fill-card stroke-foreground" strokeWidth="1.5" />
          <path
            d="M45 41 L45 50 L52 50"
            className="stroke-foreground"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <text x="45" y="86" textAnchor="middle" className="fill-foreground text-[9px] font-semibold">
            Compressor
          </text>
        </g>

        {/* Condensador (topo direito) */}
        <g>
          <rect
            x="150"
            y="30"
            width="140"
            height="40"
            rx="6"
            className="fill-orange-500/10 stroke-orange-500/60 dark:stroke-orange-400/60"
            strokeWidth="1.5"
          />
          {/* aletas */}
          <g className="stroke-orange-500/50 dark:stroke-orange-400/50" strokeWidth="1.5">
            <path d="M165 36 V64" />
            <path d="M180 36 V64" />
            <path d="M195 36 V64" />
            <path d="M210 36 V64" />
            <path d="M225 36 V64" />
            <path d="M240 36 V64" />
            <path d="M255 36 V64" />
            <path d="M270 36 V64" />
          </g>
          <text x="220" y="22" textAnchor="middle" className="fill-foreground text-[9px] font-semibold">
            Condensador
          </text>
        </g>

        {/* Dispositivo de expansão (direita, meio-baixo) */}
        <g>
          <path
            d="M250 138 L250 162 L230 138 L230 162 Z"
            className="fill-card stroke-foreground"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <text
            x="240"
            y="186"
            textAnchor="middle"
            className="fill-foreground text-[9px] font-semibold"
          >
            Disp. de Expansão
          </text>
        </g>

        {/* Evaporador (base esquerda) */}
        <g>
          <rect
            x="70"
            y="130"
            width="140"
            height="40"
            rx="6"
            className="fill-sky-500/10 stroke-sky-500/60 dark:stroke-sky-400/60"
            strokeWidth="1.5"
          />
          {/* aletas */}
          <g className="stroke-sky-500/50 dark:stroke-sky-400/50" strokeWidth="1.5">
            <path d="M85 136 V164" />
            <path d="M100 136 V164" />
            <path d="M115 136 V164" />
            <path d="M130 136 V164" />
            <path d="M145 136 V164" />
            <path d="M160 136 V164" />
            <path d="M175 136 V164" />
            <path d="M190 136 V164" />
          </g>
          <text
            x="140"
            y="186"
            textAnchor="middle"
            className="fill-foreground text-[9px] font-semibold"
          >
            Evaporador
          </text>
        </g>

        {/* ===== Instrumentos na linha de sucção (trecho vertical esquerdo) ===== */}
        {/* Manômetro */}
        <g>
          <circle cx="40" cy="92" r="7" className="fill-card stroke-sky-500 dark:stroke-sky-400" strokeWidth="1.5" />
          <path d="M40 92 L43 88" className="stroke-sky-600 dark:stroke-sky-300" strokeWidth="1.2" strokeLinecap="round" />
          <line x1="40" y1="92" x2="14" y2="92" className="stroke-sky-500/50 dark:stroke-sky-400/50" strokeWidth="1" />
          <text x="12" y="95" textAnchor="end" className="fill-sky-600 dark:fill-sky-300 text-[8px] font-semibold">
            Manômetro
          </text>
        </g>

        {/* Termômetro */}
        <g>
          <rect x="36" y="108" width="8" height="14" rx="4" className="fill-card stroke-sky-500 dark:stroke-sky-400" strokeWidth="1.5" />
          <circle cx="40" cy="122" r="4" className="fill-sky-500 dark:fill-sky-400" />
          <line x1="36" y1="115" x2="14" y2="115" className="stroke-sky-500/50 dark:stroke-sky-400/50" strokeWidth="1" />
          <text x="12" y="118" textAnchor="end" className="fill-sky-600 dark:fill-sky-300 text-[8px] font-semibold">
            Termômetro
          </text>
        </g>
      </svg>

      {/* Legenda das linhas */}
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-sky-500 dark:bg-sky-400" />
          Sucção (vapor frio)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-orange-500 dark:bg-orange-400" />
          Descarga / líquido (quente)
        </span>
      </div>
    </div>
  );
}
