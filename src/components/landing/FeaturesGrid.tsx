import { useState, useRef, useEffect, useCallback } from 'react';
import { ClipboardList, MapPin, Calendar, RefreshCw, BarChart3, Smartphone, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Ordens de Serviço Digitais',
    desc: 'Crie, atribua e acompanhe OS em segundos. Com fotos, checklist, assinatura digital e histórico completo. Elimine papel e retrabalho de uma vez por todas.',
  },
  {
    icon: MapPin,
    title: 'Rastreamento em Tempo Real',
    desc: 'Veja no mapa onde cada técnico está agora. Check-in com validação por raio de 300m do endereço do cliente. Saiba exatamente o que está acontecendo em campo.',
  },
  {
    icon: Calendar,
    title: 'Agenda e Agendamento Inteligente',
    desc: 'Monte a agenda da equipe, distribua chamados pelo técnico mais próximo e evite conflitos de horário. Visualize tudo em calendário diário, semanal ou mensal.',
  },
  {
    icon: RefreshCw,
    title: 'Manutenções Recorrentes',
    desc: 'Automatize preventivas com recorrência configurável. Nunca mais esqueça um contrato de SLA. Gere OS automaticamente nos intervalos definidos.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios e Métricas',
    desc: 'Dashboard com KPIs em tempo real: OS por status, tempo médio de atendimento, avaliações dos clientes. Tome decisões baseadas em dados reais.',
  },
  {
    icon: Smartphone,
    title: 'App para o Técnico',
    desc: 'Aplicativo mobile offline-first. O técnico recebe OS, faz check-in, tira fotos e coleta assinatura — sem papel. Funciona mesmo sem internet.',
  },
];

export default function FeaturesGrid() {
  const [activeIndex, setActiveIndex] = useState(0);
  const isMobile = useIsMobile();
  const sectionRef = useScrollReveal();

  return (
    <section id="features" className="py-24 bg-[hsl(0,0%,5%)]">
      <div ref={sectionRef} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 scroll-reveal">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Tudo que sua operação precisa, em um só lugar
          </h2>
          <p className="text-white/40 max-w-2xl mx-auto">
            Do chamado ao faturamento, o Dominex cobre cada etapa
          </p>
        </div>

        {isMobile ? (
          <FeaturesShowcaseMobile activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
        ) : (
          <FeaturesShowcaseDesktop activeIndex={activeIndex} setActiveIndex={setActiveIndex} />
        )}
      </div>
    </section>
  );
}

function FeaturesShowcaseDesktop({ activeIndex, setActiveIndex }: { activeIndex: number; setActiveIndex: (i: number) => void }) {
  const active = FEATURES[activeIndex];

  return (
    <div className="w-full">
      <div className="flex gap-0 min-h-[420px] rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] overflow-hidden">
        {/* Sidebar */}
        <nav className="w-[280px] shrink-0 border-r border-white/5 py-2">
          {FEATURES.map((f, i) => (
            <button
              key={f.title}
              onClick={() => setActiveIndex(i)}
              className={cn(
                'flex items-center gap-3 w-full px-5 py-3.5 text-left transition-all text-sm font-medium',
                i === activeIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              )}
            >
              <f.icon className={cn('h-5 w-5 shrink-0', i === activeIndex ? 'text-primary-foreground' : 'text-white/30')} />
              {f.title}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 p-8 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col"
            >
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mb-6">
                <active.icon className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">{active.title}</h3>
              <p className="text-white/50 text-sm leading-relaxed max-w-lg mb-8">
                {active.desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-center mt-10">
        <Button
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-6 text-base rounded-xl transition-transform hover:scale-[1.02]"
          asChild
        >
          <Link to="/cadastro">
            Começar grátis por 14 dias
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function FeaturesShowcaseMobile({ activeIndex, setActiveIndex }: { activeIndex: number; setActiveIndex: (i: number) => void }) {
  const active = FEATURES[activeIndex];
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToActive = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const buttons = container.querySelectorAll('button');
    const btn = buttons[index];
    if (btn) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const scrollLeft = container.scrollLeft + (btnRect.left - containerRect.left) - (containerRect.width / 2) + (btnRect.width / 2);
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToActive(activeIndex);
  }, [activeIndex, scrollToActive]);

  const navigate = (dir: -1 | 1) => {
    const next = Math.max(0, Math.min(FEATURES.length - 1, activeIndex + dir));
    setActiveIndex(next);
  };

  return (
    <div className="mx-auto max-w-lg">
      {/* Tab pills with arrows */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => navigate(-1)}
          disabled={activeIndex === 0}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-white/5 text-white/60 disabled:opacity-30 transition-opacity"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
          {FEATURES.map((f, i) => (
            <button
              key={f.title}
              onClick={() => setActiveIndex(i)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all shrink-0',
                i === activeIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/5 text-white/50'
              )}
            >
              <f.icon className="h-4 w-4" />
              {f.title}
            </button>
          ))}
        </div>
        <button
          onClick={() => navigate(1)}
          disabled={activeIndex === FEATURES.length - 1}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-white/5 text-white/60 disabled:opacity-30 transition-opacity"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Content card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <div className="rounded-2xl border border-white/10 bg-[hsl(0,0%,6%)] p-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
              <active.icon className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-lg text-white mb-2">{active.title}</h3>
            <p className="text-white/50 text-sm leading-relaxed">{active.desc}</p>
          </div>

          {/* Dots indicator */}
          <div className="flex justify-center gap-1.5 mt-4">
            {FEATURES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === activeIndex ? 'w-5 bg-primary' : 'w-2 bg-white/20'
                )}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* CTA */}
      <div className="flex justify-center mt-8">
        <Button
          size="lg"
          className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 py-5 text-base rounded-xl"
          asChild
        >
          <Link to="/cadastro">
            Começar grátis por 14 dias
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
