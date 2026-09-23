import * as LucideIcons from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Calendar, DollarSign, TrendingUp, User, UserX } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { getSegment } from '@/utils/companySegments';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import type { AdminLead } from '@/hooks/useAdminCrm';

function OriginIcon({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (LucideIcons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-3 w-3'} />;
}

export interface AdminLeadCardOrigin {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
}

export interface AdminLeadCardResponsible {
  id: string;
  name: string;
  photo_url: string | null;
}

interface AdminLeadCardProps {
  lead: AdminLead;
  /** Origem resolvida pelo nome (admin_leads.source guarda o NOME, não o id). */
  origin?: AdminLeadCardOrigin | null;
  /** Vendedor resolvido a partir de `lead.responsible_id` (auth uid). */
  responsible?: AdminLeadCardResponsible | null;
  onClick: () => void;
}

/**
 * Card da oportunidade no funil do painel master Auctus.
 *
 * Espelha `src/components/crm/LeadCard.tsx` (CRM do tenant) — mesma anatomia,
 * mesma ordem de leitura: título → cliente → responsável → valor → barra de
 * probabilidade → etiquetas. Antes o card era desenhado inline dentro do
 * `AdminCRM.tsx` e tinha ficado uns seis meses atrás do card do cliente.
 *
 * Duas diferenças de propósito, porque os dados do admin são outros:
 *  - responsável é UM vendedor (`admin_leads.responsible_id`), não a lista
 *    multi-responsável do tenant — o admin não tem `lead_assignees`;
 *  - o botão de WhatsApp no hover é exclusivo do admin e foi PRESERVADO: é
 *    como o time comercial fala com o lead sem abrir o card.
 *
 * Copy em PT-BR fixo: o painel master não entra no i18n dos 4 idiomas.
 */
export function AdminLeadCard({ lead, origin, responsible, onClick }: AdminLeadCardProps) {
  const segment = getSegment(lead.segment);
  const value = Number(lead.value || 0);
  const probability = lead.probability;
  const whatsappLink = buildWhatsAppLink(lead.phone);

  const formatCurrency = (v: number) =>
    `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

  const probabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-success';
    if (prob >= 40) return 'text-warning';
    return 'text-destructive';
  };

  const probabilityBar = (prob: number) => {
    if (prob >= 70) return 'bg-success';
    if (prob >= 40) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 border-border/50 bg-card"
    >
      <CardContent className="p-4">
        {/* Título + empresa */}
        <div className="space-y-1 mb-3">
          <h4 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
            {lead.title}
          </h4>
          {lead.company_name && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{lead.company_name}</span>
            </div>
          )}
        </div>

        {/* Responsável. Sem responsável vira badge saturado (nunca outline), pra
            ninguém confundir fila compartilhada com card esquecido — mesma régua
            do card do cliente. O WhatsApp fica ao lado, aparecendo no hover. */}
        <div className="mb-3 flex items-center gap-2 min-w-0">
          {responsible ? (
            <span className="inline-flex items-center gap-2 min-w-0">
              <SalespersonAvatar
                name={responsible.name}
                photoUrl={responsible.photo_url}
                size="sm"
                className="border-2 border-card shrink-0"
              />
              <span className="text-xs text-muted-foreground truncate min-w-0">
                {responsible.name}
              </span>
            </span>
          ) : (
            <Badge variant="warning" className="gap-1 text-[10px] px-1.5 py-0.5 font-normal">
              <UserX className="h-3 w-3" />
              Sem responsável
            </Badge>
          )}

          {whatsappLink && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Abrir conversa no WhatsApp"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(whatsappLink, '_blank', 'noopener,noreferrer');
                  }}
                  className="ml-auto h-6 w-6 shrink-0 rounded-full flex items-center justify-center bg-muted text-muted-foreground opacity-0 transition-all duration-200 hover:bg-[#25D366] hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <WhatsAppIcon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">WhatsApp</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Valor */}
        {value > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <DollarSign className="h-4 w-4 text-primary" />
            <p className="text-lg font-bold text-primary">{formatCurrency(value)}</p>
          </div>
        )}

        {/* Probabilidade */}
        {probability !== null && probability !== undefined && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                Probabilidade
              </span>
              <span className={`font-medium ${probabilityColor(probability)}`}>
                {probability}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${probabilityBar(probability)}`}
                style={{ width: `${Math.min(100, Math.max(0, probability))}%` }}
              />
            </div>
          </div>
        )}

        {/* Etiquetas: origem, segmento e previsão de fechamento */}
        <div className="flex flex-wrap items-center gap-1.5">
          {origin ? (
            <Badge
              className="text-[10px] px-1.5 py-0 h-5 font-normal text-white border-0 gap-1 max-w-full"
              style={{ backgroundColor: origin.color || '#6B7280' }}
            >
              <OriginIcon name={origin.icon || 'Globe'} className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{origin.name}</span>
            </Badge>
          ) : lead.source ? (
            <Badge variant="muted" className="text-[10px] px-1.5 py-0 h-5 font-normal max-w-full">
              <span className="truncate">{lead.source}</span>
            </Badge>
          ) : null}

          {segment && (
            <Badge
              className="text-[10px] px-1.5 py-0 h-5 font-normal text-white border-0 gap-1 max-w-full"
              style={{ backgroundColor: segment.color }}
            >
              <segment.icon className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{segment.label}</span>
            </Badge>
          )}

          {lead.expected_close_date && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
              <Calendar className="h-2.5 w-2.5" />
              {new Date(`${lead.expected_close_date}T12:00:00`).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
              })}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
