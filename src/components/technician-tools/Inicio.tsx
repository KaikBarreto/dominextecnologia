import { Boxes, Thermometer, ArrowLeftRight, Zap, BookOpen, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { GLOSSARIO } from '@/lib/glossario';

/** Ids das abas — devem bater com os de TechnicianTools.tsx. */
export type ToolNavId = 'equipamentos' | 'carga-termica' | 'conversao' | 'calculo-capacitor';

interface AtalhoFerramenta {
  id: ToolNavId;
  label: string;
  descricao: string;
  icon: LucideIcon;
  /** Cor de destaque do ícone (HSL via token quando possível). */
  accent: string;
}

const ATALHOS: AtalhoFerramenta[] = [
  {
    id: 'equipamentos',
    label: 'Equipamentos',
    descricao: 'Consulte modelos, capacidades e códigos de erro.',
    icon: Boxes,
    accent: 'hsl(217 91% 60%)',
  },
  {
    id: 'carga-termica',
    label: 'Carga Térmica',
    descricao: 'Calcule os BTUs ideais para o ambiente.',
    icon: Thermometer,
    accent: 'hsl(0 84% 60%)',
  },
  {
    id: 'conversao',
    label: 'Conversão',
    descricao: 'Converta pressão, temperatura, potência e medidas.',
    icon: ArrowLeftRight,
    accent: 'hsl(142 71% 45%)',
  },
  {
    id: 'calculo-capacitor',
    label: 'Cálculo de Capacitor',
    descricao: 'Encontre o capacitor certo pelo BTU e tensão.',
    icon: Zap,
    accent: 'hsl(38 92% 50%)',
  },
];

interface InicioProps {
  /** Troca a aba ativa em TechnicianTools (estado interno, funciona standalone e no overlay da OS). */
  onNavigate: (id: ToolNavId) => void;
}

export function Inicio({ onNavigate }: InicioProps) {
  return (
    <div className="space-y-6">
      {/* Navegação pras ferramentas */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold md:text-xl">Ferramentas</h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Escolha uma ferramenta para começar.
          </p>
        </div>

        {/* Mobile: carrossel horizontal snap-x */}
        <div className="relative -mx-3 lg:hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
          <div className="flex gap-3 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {ATALHOS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onNavigate(a.id)}
                className="snap-start shrink-0 flex w-[185px] flex-col items-center gap-3 rounded-2xl p-5 text-center text-white shadow-sm transition-all active:scale-95"
                style={{ backgroundColor: a.accent }}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 shrink-0">
                  <a.icon className="h-7 w-7" />
                </span>
                <span className="text-base font-semibold leading-tight">{a.label}</span>
                <span className="text-xs leading-snug text-white/85">{a.descricao}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: grid de cards */}
        <div className="hidden gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-4">
          {ATALHOS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onNavigate(a.id)}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-center justify-between">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white shrink-0"
                  style={{ backgroundColor: a.accent }}
                >
                  <a.icon className="h-5 w-5" />
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">{a.label}</p>
                <p className="text-xs text-muted-foreground leading-snug">{a.descricao}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Glossário */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h2 className="text-base font-semibold md:text-xl">Glossário</h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Termos e unidades usados nas ferramentas, explicados.
            </p>
          </div>
        </div>

        <Accordion type="single" collapsible>
          {GLOSSARIO.map((t) => (
            <AccordionItem key={t.id} value={t.id} className="last:border-b-0">
              <AccordionTrigger className="min-w-0 text-left text-sm font-semibold md:text-base">
                <span className="truncate pr-2">{t.termo}</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{t.descricao}</p>
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="font-medium text-primary">Exemplo: </span>
                  <span className={cn('text-foreground/90')}>{t.exemplo}</span>
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
