import { useMemo, useState } from 'react';
import {
  Cable,
  RefreshCcw,
  BookOpen,
  ChevronRight,
  Search,
  Ruler,
  Snowflake,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { GLOSSARIO } from '@/lib/glossario';
import { GLOSSARIO_CICLO } from '@/lib/glossarioCiclo';
import { GLOSSARIO_ELETRICA } from '@/lib/glossarioEletrica';
import { GLOSSARIO_GASES } from '@/lib/glossarioGases';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { getTechToolsForSegment, type TechToolId } from '@/config/technicianTools';
import type { ToolNavPayload } from '@/pages/TechnicianTools';

/** Ids das abas — fonte única em `@/config/technicianTools`. */
export type ToolNavId = TechToolId;

interface SecaoGlossario {
  /** Id da seção — usado como prefixo dos value dos AccordionItem (globalmente únicos). */
  id: string;
  /** Rótulo de cabeçalho da seção. */
  rotulo: string;
  /** Ícone lucide do cabeçalho da seção. */
  icon: LucideIcon;
  /** Termos da seção (forma compatível: termo, descricao, exemplo?). */
  termos: { id: string; termo: string; descricao: string; exemplo?: string }[];
}

/**
 * Seções do glossário exibidas em "Termos Técnicos Explicados".
 * Os value dos AccordionItem são prefixados com o id da seção (`<secao>:<termo>`)
 * pra garantir unicidade global entre seções.
 */
const GLOSSARIO_SECOES: SecaoGlossario[] = [
  { id: 'medidas', rotulo: 'Medidas e Unidades', icon: Ruler, termos: GLOSSARIO },
  {
    id: 'ciclo',
    rotulo: 'Ciclo Básico de Refrigeração',
    icon: RefreshCcw,
    termos: GLOSSARIO_CICLO,
  },
  {
    id: 'eletrica',
    rotulo: 'Elétrica e Instalação',
    icon: Cable,
    termos: GLOSSARIO_ELETRICA,
  },
  {
    id: 'gases',
    rotulo: 'Gases e Nomenclatura',
    icon: Snowflake,
    termos: GLOSSARIO_GASES,
  },
];

interface InicioProps {
  /**
   * Troca a aba ativa em TechnicianTools (estado interno, funciona standalone e
   * no overlay da OS). `payload` opcional faz deep-link no item escolhido.
   */
  onNavigate: (id: ToolNavId, payload?: ToolNavPayload) => void;
}

/** Normaliza pra busca: minúsculas, sem acento, espaços colapsados. */
function semAcento(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function Inicio({ onNavigate }: InicioProps) {
  const { settings } = useCompanySettings();
  // Cards = ferramentas do segmento da empresa (fonte única do config).
  const atalhos = getTechToolsForSegment(settings?.segment);
  const [buscaGlossario, setBuscaGlossario] = useState('');
  const secoesFiltradas = useMemo(() => {
    const q = semAcento(buscaGlossario);
    const casa = (termo: string, descricao: string) =>
      !q || semAcento(termo).includes(q) || semAcento(descricao).includes(q);
    return GLOSSARIO_SECOES.map((s) => ({
      ...s,
      termos: s.termos.filter((t) => casa(t.termo, t.descricao)),
    })).filter((s) => s.termos.length > 0);
  }, [buscaGlossario]);
  const semResultado = secoesFiltradas.length === 0;

  return (
    <div className="space-y-8">
      {/* Navegação pras ferramentas */}
      <section className="space-y-4">
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
            {atalhos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onNavigate(a.id)}
                className="snap-start shrink-0 flex w-[185px] flex-col items-center gap-3 rounded-2xl p-5 text-center text-white shadow-sm transition-all active:scale-95"
                style={{ backgroundColor: a.accent }}
              >
                <span className="flex h-12 items-center justify-center shrink-0">
                  <a.icon className="h-9 w-9" />
                </span>
                <span className="text-base font-semibold leading-tight">{a.label}</span>
                <span className="text-xs leading-snug text-white/85">{a.descricao}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: grid de cards */}
        <div className="hidden gap-3 lg:grid lg:grid-cols-2 xl:grid-cols-4">
          {atalhos.map((a) => (
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

      {/* Termos Técnicos Explicados */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h2 className="text-base font-semibold md:text-xl">Termos Técnicos Explicados</h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Não entendeu uma sigla ou unidade? Busque e veja em linguagem simples.
            </p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="search"
            placeholder="Buscar termo (ex: BTU, capacitor, pressão)"
            value={buscaGlossario}
            onChange={(e) => setBuscaGlossario(e.target.value)}
            className="pl-9"
          />
        </div>

        {semResultado ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum termo encontrado.
          </p>
        ) : (
          <div className="space-y-6">
            {secoesFiltradas.map((secao, idx) => (
              <div key={secao.id} className={cn('space-y-3', idx > 0 && 'pt-6')}>
                {idx > 0 && <Separator className="-mt-6" />}
                {/* Cabeçalho da seção: barrinha de acento + ícone + rótulo */}
                <div className="flex items-center gap-2.5">
                  <span className="h-5 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
                  <secao.icon className="h-5 w-5 shrink-0 text-primary" />
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground md:text-base">
                    {secao.rotulo}
                  </h3>
                </div>
                <Accordion type="single" collapsible>
                  {secao.termos.map((t) => (
                    <AccordionItem
                      key={`${secao.id}:${t.id}`}
                      value={`${secao.id}:${t.id}`}
                      className="last:border-b-0"
                    >
                      <AccordionTrigger className="min-w-0 text-left text-sm font-semibold md:text-base">
                        <span className="truncate pr-2">{t.termo}</span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2">
                        <p className="text-sm text-muted-foreground">{t.descricao}</p>
                        {t.exemplo && (
                          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                            <span className="font-medium text-primary">Exemplo: </span>
                            <span className={cn('text-foreground/90')}>{t.exemplo}</span>
                          </p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
