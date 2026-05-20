// TODO Fase 2: switching real com RLS context — ver docs/planos quando reabrir Fase 2.
// Hoje (Fase 1) é só visualizador da empresa ativa: card sem hover, sem cursor-pointer,
// sem chevron, sem dropdown trigger. Não pode parecer interativo.

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanySettings } from '@/hooks/useCompanySettings';

/**
 * Visualizador da empresa ativa.
 *
 * Em Fase 1 NÃO troca de tenant — é só leitura. Quando a Fase 2 do plano
 * de navegação reabrir, este card vira o trigger real do switcher (com RLS
 * context via `set_config('app.tenant_id', ...)`).
 *
 * Convivência com painel master:
 * - super_admin não tem `company_settings` (filtra fora no hook).
 *   Para ele, mostramos a marca Auctus ("Painel Auctus" como nome).
 * - Usuários de tenant veem nome + logo (white-label) da empresa ativa.
 */
export function AccountSwitcherDropdown() {
  const { isAdminUser } = useAuth();
  const { settings } = useCompanySettings();

  // Master/vendedor admin opera o painel Auctus — nunca um tenant.
  if (isAdminUser) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2"
        role="status"
        aria-label="Painel Auctus"
      >
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">AT</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">Painel Auctus</p>
          <p className="text-xs text-muted-foreground truncate">Conta ativa</p>
        </div>
      </div>
    );
  }

  const companyName = settings?.name || 'Sua empresa';
  const companyLogo = settings?.white_label_icon_url || settings?.white_label_logo_url || settings?.logo_url || undefined;
  const initials = companyName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2"
      role="status"
      aria-label="Empresa ativa"
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={companyLogo} alt={companyName} />
        <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{companyName}</p>
        <p className="text-xs text-muted-foreground truncate">Conta ativa</p>
      </div>
    </div>
  );
}
