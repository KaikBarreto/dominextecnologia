import { HelpCircle, CheckCircle2 } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { getNfseStatusMeta } from '@/components/fiscal/nfseStatus';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/** Status que aparecem na legenda compacta, na ordem do ciclo de vida da nota. */
const LEGEND_STATUSES = [
  'rascunho',
  'processando',
  'autorizada',
  'rejeitada',
  'cancelada',
] as const;

/**
 * Acordeão "Como funciona?" da tela de Notas Fiscais — fechado por padrão.
 *
 * Existe porque NFS-e é assunto de contador e o usuário aqui é dono de empresa
 * de refrigeração: o texto explica em português de gente o que é a nota, quando
 * emitir e o que a prefeitura exige, mais a legenda dos status que ele vai ver
 * na lista. Nada de jargão fiscal solto.
 */
export function NfseComoFunciona() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const hw = t.howItWorks;
  const tStatus = t.status as Record<string, string>;

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="como-funciona" className="border rounded-lg bg-card px-4">
        <AccordionTrigger className="hover:no-underline py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <HelpCircle className="h-4 w-4 text-primary" />
            {hw.trigger}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
              <p className="font-semibold text-foreground">{hw.title}</p>
              <p>{hw.summary}</p>
            </div>

            <ul className="space-y-2">
              {hw.items.map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">{item.label}</strong>
                    {', '}
                    {item.desc}
                  </span>
                </li>
              ))}
            </ul>

            {/* Legenda de status em linha compacta (mesmos ícones da lista). */}
            <div className="border-t border-border/40 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70 mb-2">
                {hw.legendTitle}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                {LEGEND_STATUSES.map((status) => {
                  const meta = getNfseStatusMeta(status);
                  const Icon = meta.icon;
                  return (
                    <span key={status} className="inline-flex items-center gap-1">
                      <Icon className={cn('h-3.5 w-3.5', meta.iconClass)} />
                      <strong className="text-foreground font-medium">
                        {tStatus[status] ?? status}
                      </strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
