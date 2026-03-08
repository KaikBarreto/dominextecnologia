import { Thermometer, Zap, Sun, Radio, Shield, HardHat, Building, Factory, Sparkles, Droplets } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const segments = [
  { icon: Thermometer, label: 'Refrigeração e Climatização' },
  { icon: Zap, label: 'Instalações Elétricas' },
  { icon: Sun, label: 'Energia Solar' },
  { icon: Radio, label: 'Telecomunicações / Provedores' },
  { icon: Shield, label: 'CFTV e Segurança Eletrônica' },
  { icon: HardHat, label: 'Construção Civil' },
  { icon: Building, label: 'Elevadores' },
  { icon: Factory, label: 'Automação Industrial' },
  { icon: Sparkles, label: 'Limpeza e Conservação' },
  { icon: Droplets, label: 'Dedetização' },
];

export default function SegmentsSection() {
  const ref = useScrollReveal();

  return (
    <section id="segments" className="py-24 bg-[hsl(0,0%,4%)]">
      <div ref={ref} className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center scroll-reveal">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Para qualquer empresa com equipe em campo
        </h2>
        <p className="text-white/40 mb-12">Atendemos diversos segmentos de serviços externos</p>

        <div className="flex flex-wrap justify-center gap-3">
          {segments.map((s) => (
            <div
              key={s.label}
              className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm text-white/60 transition-all hover:border-primary/30 hover:text-primary hover:bg-primary/5 cursor-default"
            >
              <s.icon className="h-4 w-4" />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
