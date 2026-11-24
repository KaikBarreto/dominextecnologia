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
import { cn, fuzzyIncludesAny } from '@/lib/utils';
import { GLOSSARIO } from '@/lib/glossario';
import { GLOSSARIO_CICLO } from '@/lib/glossarioCiclo';
import { GLOSSARIO_ELETRICA } from '@/lib/glossarioEletrica';
import { GLOSSARIO_GASES } from '@/lib/glossarioGases';
import { getTechToolsForSegment, type TechToolId } from '@/config/technicianArea';
import type { ToolNavPayload } from '@/pages/TechnicianArea';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const toolSearchCopy = {
  'pt-br': { label: 'Buscar ferramenta', placeholder: 'Buscar ferramenta, cálculo ou medida', empty: 'Nenhuma ferramenta encontrada.', hint: 'Tente outro nome ou limpe a busca.' },
  en: { label: 'Find a tool', placeholder: 'Find a tool, calculation or measurement', empty: 'No tools found.', hint: 'Try another name or clear the search.' },
  es: { label: 'Buscar herramienta', placeholder: 'Buscar herramienta, cálculo o medida', empty: 'No se encontraron herramientas.', hint: 'Pruebe otro nombre o borre la búsqueda.' },
  fr: { label: 'Rechercher un outil', placeholder: 'Rechercher un outil, calcul ou mesure', empty: 'Aucun outil trouvé.', hint: 'Essayez un autre nom ou effacez la recherche.' },
};

/** Ids das abas — fonte única em `@/config/technicianArea`. */
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
 * Gera as seções do glossário com rótulos e termos traduzidos pelo locale ativo.
 * Se o locale é pt-br usa os arrays estáticos originais; caso contrário usa os
 * arrays traduzidos de MESSAGES (que derivam do mesmo conjunto de ids).
 */
function buildGlossarioSecoes(
  rotulos: { measurements: string; cycle: string; electrical: string; gases: string },
  glossary: { medidas: { id: string; termo: string; descricao: string; exemplo?: string }[]; ciclo: { id: string; termo: string; descricao: string; exemplo?: string }[]; eletrica: { id: string; termo: string; descricao: string; exemplo?: string }[]; gases: { id: string; termo: string; descricao: string; exemplo?: string }[] },
  isPtBr: boolean,
): SecaoGlossario[] {
  return [
    { id: 'medidas', rotulo: rotulos.measurements, icon: Ruler, termos: isPtBr ? GLOSSARIO : glossary.medidas },
    { id: 'ciclo', rotulo: rotulos.cycle, icon: RefreshCcw, termos: isPtBr ? GLOSSARIO_CICLO : glossary.ciclo },
    { id: 'eletrica', rotulo: rotulos.electrical, icon: Cable, termos: isPtBr ? GLOSSARIO_ELETRICA : glossary.eletrica },
    { id: 'gases', rotulo: rotulos.gases, icon: Snowflake, termos: isPtBr ? GLOSSARIO_GASES : glossary.gases },
  ];
}

interface InicioProps {
  segment: string | null;
  /**
   * Troca a aba ativa em TechnicianArea (estado interno, funciona standalone e
   * no overlay da OS). `payload` opcional faz deep-link no item escolhido.
   */
  onNavigate: (id: ToolNavId, payload?: ToolNavPayload) => void;
}

export function Inicio({ segment, onNavigate }: InicioProps) {
  const { locale } = useAppLocaleContext();
  const tTools = MESSAGES[locale].app.technicianTools;
  const t = tTools.home;
  const searchCopy = toolSearchCopy[locale];

  // Cards = ferramentas do segmento atualmente selecionado no hub.
  const atalhos = getTechToolsForSegment(segment);
  const isRefrigeracao = segment === 'refrigeracao';
  const [buscaGlossario, setBuscaGlossario] = useState('');
  const [buscaFerramentas, setBuscaFerramentas] = useState('');
  const ferramentasVisiveis = atalhos.filter((a) => {
    const tr = tTools.toolsRegistry[a.id as keyof typeof tTools.toolsRegistry];
    return fuzzyIncludesAny([tr?.label ?? a.label, tr?.description ?? a.descricao], buscaFerramentas);
  });

  const GLOSSARIO_SECOES = useMemo(
    () => buildGlossarioSecoes(t.glossarySections, tTools.glossary, locale === 'pt-br'),
    [t.glossarySections, tTools.glossary, locale],
  );

  const secoesFiltradas = useMemo(() => {
    return GLOSSARIO_SECOES.map((s) => ({
      ...s,
      termos: s.termos.filter((item) => fuzzyIncludesAny([item.termo, item.descricao], buscaGlossario)),
    })).filter((s) => s.termos.length > 0);
  }, [buscaGlossario, GLOSSARIO_SECOES]);
  const semResultado = secoesFiltradas.length === 0;

  return (
    <div className="space-y-8">
      {/* Navegação pras ferramentas */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{t.toolsTitle}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground md:text-base">
            {t.toolsSubtitle}
          </p>
        </div>

        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={searchCopy.label}
            placeholder={searchCopy.placeholder}
            value={buscaFerramentas}
            onChange={(event) => setBuscaFerramentas(event.target.value)}
            className="h-12 pl-10 text-base"
          />
        </div>

        {/* Uma lista vertical no celular deixa todas as ferramentas descobríveis.
            A mesma marcação vira grade quando há espaço para comparar atalhos. */}
        <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
          {ferramentasVisiveis.map((a) => {
            const tr = tTools.toolsRegistry[a.id as keyof typeof tTools.toolsRegistry];
            const label = tr?.label ?? a.label;
            const desc = tr?.description ?? a.descricao;
            return (
              <li key={a.id}>
              <button
                type="button"
                onClick={() => onNavigate(a.id)}
                className="group grid h-full min-h-[88px] w-full grid-cols-[88px_minmax(0,1fr)_24px] items-stretch overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/40 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                  <span
                    className="flex min-h-[88px] items-center justify-center self-stretch text-white"
                    style={{ backgroundColor: a.accent }}
                  >
                    <a.icon className="h-7 w-7" />
                  </span>
                <div className="min-w-0 self-center space-y-1 px-3 py-3">
                  <p className="text-base font-semibold leading-snug text-foreground">{label}</p>
                  <p className="text-sm leading-snug text-muted-foreground">{desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 self-center text-muted-foreground" />
              </button>
              </li>
            );
          })}
        </ul>
        {ferramentasVisiveis.length === 0 && (
          <div role="status" className="space-y-1 py-8 text-center">
            <p className="font-semibold text-foreground">{searchCopy.empty}</p>
            <p className="text-sm text-muted-foreground">{searchCopy.hint}</p>
          </div>
        )}
      </section>

      {/* Termos Técnicos Explicados — exclusivo do segmento refrigeracao */}
      {isRefrigeracao && <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{t.glossaryTitle}</h2>
            <p className="text-sm text-muted-foreground md:text-base">
              {t.glossarySubtitle}
            </p>
          </div>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            inputMode="search"
            placeholder={t.glossaryPlaceholder}
            aria-label={t.glossaryPlaceholder}
            value={buscaGlossario}
            onChange={(e) => setBuscaGlossario(e.target.value)}
            className="h-12 pl-9 text-base"
          />
        </div>

        {semResultado ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t.glossaryEmpty}
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
                            <span className="font-medium text-primary">{MESSAGES[locale].app.technicianTools.home.glossaryExampleLabel}</span>
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
      </section>}
    </div>
  );
}
