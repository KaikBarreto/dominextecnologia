import { useState } from 'react';
import { BookOpen, Image as ImageIcon, Sparkles } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { useIsDark } from '@/hooks/useIsDark';
import { useIsMobile } from '@/hooks/use-mobile';
import { GLOSSARIO_CICLO } from '@/lib/glossarioCiclo';
import { CicloRefrigeracaoIlustracao } from './CicloRefrigeracaoIlustracao';

type CicloView = 'ilustracao' | 'imagem';

/**
 * Aba "Ciclo de Refrigeração" — explica o ciclo básico de forma visual e os
 * termos técnicos envolvidos. 100% client-side / offline.
 *
 * Renderiza a ilustração do ciclo (componente compartilhado) seguida de um
 * glossário em accordion específico do ciclo básico.
 */
export function CicloRefrigeracao() {
  const [view, setView] = useState<CicloView>('ilustracao');
  const isDark = useIsDark();
  const isMobile = useIsMobile();

  // Imagem 2D escolhida cruzando tema (claro/escuro) × viewport (mobile/desktop).
  const imagemSrc = isMobile
    ? isDark
      ? '/images/ciclo-basico-escuro-mobile.png'
      : '/images/ciclo-basico-claro-mobile.png'
    : isDark
      ? '/images/ciclo-basico-escuro.png'
      : '/images/ciclo-basico-claro.png';

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight md:text-xl">
          Ciclo Básico de Refrigeração
        </h2>
        <p className="text-sm text-muted-foreground md:text-base">
          Entenda como o gás circula pelo sistema e o que cada componente faz.
        </p>
      </div>

      {/* Toggle de visão: Ilustração (off) x Imagem 2D (on) */}
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setView('ilustracao')}
          aria-pressed={view === 'ilustracao'}
          className={`flex items-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
            view === 'ilustracao' ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          Ilustração
        </button>
        <Switch
          aria-label="Alternar entre ilustração e imagem 2D"
          checked={view === 'imagem'}
          onCheckedChange={(checked) => setView(checked ? 'imagem' : 'ilustracao')}
        />
        <button
          type="button"
          onClick={() => setView('imagem')}
          aria-pressed={view === 'imagem'}
          className={`flex items-center gap-1.5 py-1.5 text-sm font-medium transition-colors ${
            view === 'imagem' ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          <ImageIcon className="h-4 w-4 shrink-0" />
          Imagem 2D
        </button>
      </div>

      {/* Visão do ciclo */}
      {view === 'ilustracao' ? (
        <CicloRefrigeracaoIlustracao />
      ) : (
        <img
          key={imagemSrc}
          src={imagemSrc}
          alt="Diagrama do ciclo básico de refrigeração"
          loading="lazy"
          className="mx-auto h-auto w-full max-w-5xl rounded-xl"
        />
      )}

      {/* Glossário do ciclo */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary shrink-0" />
          <div>
            <h2 className="text-base font-semibold md:text-xl">Termos do ciclo</h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Cada componente e conceito do ciclo, explicado.
            </p>
          </div>
        </div>

        <Accordion type="single" collapsible>
          {GLOSSARIO_CICLO.map((t) => (
            <AccordionItem key={t.id} value={t.id} className="last:border-b-0">
              <AccordionTrigger className="min-w-0 text-left text-sm font-semibold md:text-base">
                <span className="truncate pr-2">{t.termo}</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-sm text-muted-foreground">{t.descricao}</p>
                {t.exemplo && (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                    <span className="font-medium text-primary">Exemplo: </span>
                    <span className="text-foreground/90">{t.exemplo}</span>
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
