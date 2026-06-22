import type { ReactNode } from 'react';
import { Wrench, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { SignedImg } from '@/components/ui/SignedImg';

/**
 * Cabeçalho de equipamento COMPARTILHADO entre a OS NORMAL (não-PMOC) e a VISITA
 * PMOC. Mesma identidade visual nos dois fluxos (foto 14x14 colada de altura
 * cheia / cantos esquerdos arredondados, nome `text-base font-bold`, ambiente em
 * fonte leve " | …"). O que muda são só as INFORMAÇÕES:
 *  - OS normal: NÃO tem visita/frequência (omitir `visit`); mostra o ambiente/
 *    local do equipamento quando existir.
 *  - PMOC: mostra a linha "Visita X · níveis" + contagem de itens.
 *
 * O selo de status à direita (concluído / pendente / não-conforme) varia por
 * fluxo e entra por `statusBadge` (ReactNode), renderizado pelo chamador.
 *
 * Esse componente renderiza APENAS o conteúdo interno do `AccordionTrigger`
 * (o quê o técnico vê na barra). Sticky, sentinel, single-open e full-bleed do
 * stuck continuam responsabilidade de cada item (OsEquipmentAccordionItem /
 * VisitChecklistItem) — ver `equipmentChecklistHeaderClasses`.
 */
export function EquipmentChecklistHeader({
  photo,
  name,
  category,
  subtitle,
  brandModel,
  environmentName,
  visit,
  itemsLabel,
  statusBadge,
  onPreviewPhoto,
}: {
  photo: string | null;
  name: string;
  category: { name: string; color: string | null } | null;
  /**
   * Subtítulo opcional logo abaixo do nome (ex.: nome do checklist quando o mesmo
   * equipamento tem vários). Só a OS normal usa. null/undefined = não mostra.
   */
  subtitle?: ReactNode;
  /** "Marca Modelo" já concatenado (vazio = não mostra). */
  brandModel?: string;
  /** Ambiente/local do equipamento (" | 1º Andar"). null/'' = não mostra. */
  environmentName?: string | null;
  /**
   * Linha de visita/frequência — SÓ PMOC. Omitir na OS normal (não há plano de
   * visita). `niveis` são os checklists exibidos.
   */
  visit?: { tipo: string; niveis: string[] };
  /** Rótulo de contagem ("3 itens") — opcional (PMOC usa; OS normal não). */
  itemsLabel?: string;
  /** Selo de status à direita (varia por fluxo) — renderizado pelo chamador. */
  statusBadge?: ReactNode;
  /** Abre a foto em tela cheia (mesmo viewer dos dois fluxos). */
  onPreviewPhoto?: (url: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
      {photo ? (
        <SignedImg
          src={photo}
          alt={name}
          className="h-14 w-14 rounded-md object-cover shrink-0 border cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            onPreviewPhoto?.(photo);
          }}
        />
      ) : (
        <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Wrench className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-base truncate min-w-0">
            <span className="font-bold">{name}</span>
            {environmentName && (
              <span className="font-normal text-muted-foreground"> | {environmentName}</span>
            )}
          </p>
          {category && (
            <Badge
              className="text-[10px] shrink-0 text-white border-0"
              style={category.color ? { backgroundColor: category.color } : undefined}
            >
              {category.name}
            </Badge>
          )}
        </div>
        {subtitle && (
          <p className="text-xs font-medium text-primary truncate mt-0.5">{subtitle}</p>
        )}
        {brandModel && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{brandModel}</p>
        )}
        {/* Linha de visita/frequência: SÓ PMOC. OS normal não passa `visit`. */}
        {visit && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5 min-w-0">
            <CalendarClock className="h-3 w-3 shrink-0 text-primary" />
            <span className="truncate">
              <span className="font-medium text-foreground">Visita {visit.tipo}</span>
              {' · '}
              {visit.niveis.join(' + ')}
            </span>
          </p>
        )}
        {itemsLabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{itemsLabel}</p>
        )}
      </div>
      {statusBadge}
    </div>
  );
}

/**
 * Classes do `AccordionTrigger` (botão) e do `<Header>` (wrapper sticky) — fonte
 * ÚNICA compartilhada entre OS normal e PMOC pra os cabeçalhos ficarem idênticos.
 *
 * Item 2 (full-bleed no stuck): quando GRUDADO, o cabeçalho "vaza" os paddings do
 * container (main `p-3 sm:p-4` + CardContent `px-3 sm:px-6` = 24px no mobile /
 * 40px no sm+) com margens horizontais negativas e readiciona o mesmo padding
 * interno pra alinhar o conteúdo. Assim o fundo sólido cobre as laterais de ponta
 * a ponta e não sobra o canto do card. Fora do stuck mantém o card arredondado.
 * `-mx-6 px-6` = 24px (mobile); `sm:-mx-10 sm:px-10` = 40px (sm+).
 */
export function equipmentChecklistHeaderClasses(stickyOn: boolean, isStuck: boolean) {
  return {
    trigger: cn(
      'hover:no-underline py-3 gap-2 min-w-0 overflow-hidden bg-card',
      // Não-stuck: arredonda o card pra combinar com os cantos da foto.
      // Stuck (grudado no topo): reto + full-bleed (escapa o padding do container).
      stickyOn && !isStuck && 'rounded-lg',
      stickyOn && isStuck && '-mx-6 px-6 sm:-mx-10 sm:px-10',
    ),
    // Sticky no WRAPPER (Header). Fundo sólido (bg-card). z-10 < z-20 do header da
    // tela (laranja), que sempre fica ACIMA. Sombra só no stuck; fora disso cantos
    // arredondados e sem sombra. PDF/Imprimir: estático e sem sombra.
    header: cn(
      stickyOn && 'sticky z-10 bg-card print:static print:shadow-none transition-shadow',
      stickyOn && (isStuck
        ? 'shadow-[0_4px_12px_rgba(0,0,0,0.12)]'
        : 'shadow-none rounded-lg'),
    ),
  };
}
