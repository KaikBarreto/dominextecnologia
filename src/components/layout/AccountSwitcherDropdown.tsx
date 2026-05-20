// AccountSwitcherDropdown — entrada visual do gerenciador multi-conta.
//
// Exporta DOIS componentes que consomem o mesmo `useSavedAccounts`:
//
// 1) `AccountSwitcherDropdown` — versão STANDALONE. Tem trigger (avatar+nome)
//    + DropdownMenu próprio. Usar em pontos isolados da UI.
//
// 2) `AccountSwitcherInline` — versão SEM trigger. Renderiza só a lista de
//    contas + ação de adicionar. Usar dentro de outros dropdowns (TopNavbar)
//    ou dentro do MoreMenuDrawer (mobile) pra evitar dropdown-dentro-de-dropdown.
//
// Regra de visibilidade (ambos os modos):
// - Sem `activeAccount`: não renderiza nada.
// - Usuário comum sem contas salvas: não renderiza (não polui UI).
// - super_admin: SEMPRE renderiza (mesmo com 0 contas salvas).

import { useState } from 'react';
import { ChevronsUpDown, Plus, X, Loader2, Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useSavedAccounts, type SavedAccount, type ActiveAccount } from '@/hooks/useSavedAccounts';
import { AddAccountModal } from './AddAccountModal';
import { cn } from '@/lib/utils';

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function ActiveBadge({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  if (!isSuperAdmin) return null;
  return (
    <Badge className="bg-red-600 hover:bg-red-600 text-white font-semibold text-[10px] px-1.5 py-0">
      MASTER
    </Badge>
  );
}

function SavedBadge({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  if (!isSuperAdmin) return null;
  return (
    <Badge className="bg-red-600 hover:bg-red-600 text-white font-semibold text-[9px] px-1 py-0 gap-1 inline-flex">
      <Crown className="h-2.5 w-2.5" />
      MASTER
    </Badge>
  );
}

interface AccountRowProps {
  account: SavedAccount;
  disabled: boolean;
  onSwitch: () => void;
  onRemove: () => void;
}

function AccountRow({ account, disabled, onSwitch, onRemove }: AccountRowProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-2 transition-colors',
        disabled ? 'opacity-60' : 'hover:bg-muted/60 cursor-pointer',
      )}
      onClick={disabled ? undefined : onSwitch}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSwitch();
        }
      }}
    >
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={account.avatar_url || undefined} alt={account.full_name} />
        <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
          {initialsOf(account.full_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate leading-tight">{account.full_name}</p>
          <SavedBadge isSuperAdmin={account.is_super_admin} />
        </div>
        <p className="text-[11px] text-muted-foreground truncate leading-tight">
          {account.company_name || account.email}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remover ${account.full_name}`}
        className="h-7 w-7 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground transition-colors flex items-center justify-center shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={disabled}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface InlineProps {
  activeAccount: ActiveAccount;
  savedAccounts: SavedAccount[];
  isSwitching: boolean;
  isOffline: boolean;
  /** Esconde o cabeçalho da conta ativa (quando o caller já mostra). */
  hideHeader?: boolean;
  /** Esconde os separadores verticais (quando renderizado fora de DropdownMenu). */
  noSeparators?: boolean;
  onSwitch: (userId: string) => void;
  onRemove: (userId: string) => void;
  onAdd: () => void;
}

function AccountListInline({
  activeAccount,
  savedAccounts,
  isSwitching,
  isOffline,
  hideHeader = false,
  noSeparators = false,
  onSwitch,
  onRemove,
  onAdd,
}: InlineProps) {
  const disabled = isSwitching || isOffline;
  const Separator = noSeparators
    ? () => <div className="border-t border-border my-1" />
    : DropdownMenuSeparator;

  return (
    <div className="flex flex-col">
      {!hideHeader && (
        <div className="flex items-center gap-3 px-3 py-2.5">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={activeAccount.avatar_url || undefined} alt={activeAccount.full_name} />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
              {initialsOf(activeAccount.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold truncate leading-tight">
                {activeAccount.full_name}
              </p>
              <ActiveBadge isSuperAdmin={activeAccount.is_super_admin} />
            </div>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {activeAccount.company_name || activeAccount.email}
            </p>
          </div>
        </div>
      )}

      {savedAccounts.length > 0 && (
        <>
          {!hideHeader && <Separator />}
          <div className="px-3 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Outras contas
            </p>
          </div>
          <div className="px-1 py-1 max-h-64 overflow-y-auto">
            {savedAccounts.map((acc) => (
              <AccountRow
                key={acc.user_id}
                account={acc}
                disabled={disabled}
                onSwitch={() => onSwitch(acc.user_id)}
                onRemove={() => onRemove(acc.user_id)}
              />
            ))}
          </div>
        </>
      )}

      {savedAccounts.length > 0 && <Separator />}

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
          disabled
            ? 'text-muted-foreground/60 cursor-not-allowed'
            : 'text-foreground hover:bg-muted/60',
        )}
        title={isOffline ? 'Sem conexão' : undefined}
      >
        {isSwitching ? (
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        ) : (
          <Plus className="h-4 w-4 shrink-0" />
        )}
        <span>Adicionar conta</span>
      </button>
    </div>
  );
}

interface SwitcherProps {
  /**
   * Modo compacto: trigger é só o avatar (sem nome). Útil em sidebar collapsed.
   */
  compact?: boolean;
}

/**
 * Versão STANDALONE — tem o seu próprio trigger (botão com avatar+nome) +
 * dropdown. Usar quando não há nenhum dropdown/popover ao redor.
 */
export function AccountSwitcherDropdown({ compact = false }: SwitcherProps = {}) {
  const { hasRole } = useAuth();
  const { activeAccount, savedAccounts, isSwitching, switchToAccount, removeAccount } =
    useSavedAccounts();
  const [addOpen, setAddOpen] = useState(false);

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const isSuperAdmin = hasRole('super_admin');
  const shouldRender = !!activeAccount && (savedAccounts.length > 0 || isSuperAdmin);

  if (!shouldRender || !activeAccount) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={isSwitching}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50 disabled:opacity-60',
              compact ? 'justify-center' : 'w-full',
            )}
          >
            <Avatar className={cn('shrink-0', compact ? 'h-8 w-8' : 'h-8 w-8')}>
              <AvatarImage src={activeAccount.avatar_url || undefined} alt={activeAccount.full_name} />
              <AvatarFallback className="bg-primary text-primary-foreground text-[10px] font-bold">
                {initialsOf(activeAccount.full_name)}
              </AvatarFallback>
            </Avatar>
            {!compact && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm font-semibold truncate leading-tight">
                    {activeAccount.full_name.split(' ').slice(0, 2).join(' ')}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate leading-tight">
                    {activeAccount.company_name || activeAccount.email}
                  </p>
                </div>
                {isSwitching ? (
                  <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
                ) : (
                  <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-72 p-0">
          <AccountListInline
            activeAccount={activeAccount}
            savedAccounts={savedAccounts}
            isSwitching={isSwitching}
            isOffline={isOffline}
            onSwitch={switchToAccount}
            onRemove={removeAccount}
            onAdd={() => setAddOpen(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <AddAccountModal open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

interface InlineExportProps {
  /** Esconde o header (quando o caller já mostra avatar+nome). */
  hideHeader?: boolean;
  /** Renderiza separadores como divs simples (fora de DropdownMenu). */
  noSeparators?: boolean;
}

/**
 * Versão INLINE — renderiza só o conteúdo (header + lista + adicionar).
 * Usar dentro de outros dropdowns (TopNavbar) ou drawers (MoreMenuDrawer)
 * pra não aninhar 2 níveis de Radix dropdown (causa bugs de foco).
 */
export function AccountSwitcherInline({ hideHeader, noSeparators }: InlineExportProps = {}) {
  const { hasRole } = useAuth();
  const { activeAccount, savedAccounts, isSwitching, switchToAccount, removeAccount } =
    useSavedAccounts();
  const [addOpen, setAddOpen] = useState(false);

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const isSuperAdmin = hasRole('super_admin');
  const shouldRender = !!activeAccount && (savedAccounts.length > 0 || isSuperAdmin);

  if (!shouldRender || !activeAccount) return null;

  return (
    <>
      <AccountListInline
        activeAccount={activeAccount}
        savedAccounts={savedAccounts}
        isSwitching={isSwitching}
        isOffline={isOffline}
        hideHeader={hideHeader}
        noSeparators={noSeparators}
        onSwitch={switchToAccount}
        onRemove={removeAccount}
        onAdd={() => setAddOpen(true)}
      />

      <AddAccountModal open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
