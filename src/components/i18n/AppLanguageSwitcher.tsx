import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import FlagIcon from '@/components/i18n/FlagIcon';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { LOCALES, type LocaleCode } from '@/lib/i18n/locales';

// ─────────────────────────────────────────────────────────────────────────────
// Seletor de idioma PESSOAL do usuário no header do app logado. Independente do
// idioma padrão da empresa (own-row em user_preferences). Aplica na hora (otimista)
// via setUserLanguage. NÃO é o seletor do site público (esse resolve por URL).
//
// Dois formatos:
//   • variant 'icon'  → trigger compacto (bandeira + chevron), pro header desktop/tablet.
//   • variant 'row'   → linha full-width (bandeira + nome + check), pra menus mobile
//                       (MobileSidebar / tela de perfil).
// ─────────────────────────────────────────────────────────────────────────────

interface AppLanguageSwitcherProps {
  variant?: 'icon' | 'row';
  className?: string;
}

export function AppLanguageSwitcher({ variant = 'icon', className }: AppLanguageSwitcherProps) {
  const { locale, setUserLanguage } = useAppLocaleContext();
  const [open, setOpen] = useState(false);

  const handleSelect = (code: LocaleCode) => {
    setOpen(false);
    if (code === locale) return;
    // Fire-and-forget: a UI já reflete otimista; erro reverte no hook.
    void setUserLanguage(code);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {variant === 'row' ? (
          <button
            type="button"
            aria-label="Selecionar idioma"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent',
              className,
            )}
          >
            <FlagIcon locale={locale} size={20} />
            <span className="flex-1 text-left">Idioma</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
          </button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Selecionar idioma"
            className={cn('h-8 gap-1 px-1.5', className)}
          >
            <FlagIcon locale={locale} size={20} />
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
          </Button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {LOCALES.map((l) => {
          const isCurrent = l.code === locale;
          return (
            <DropdownMenuItem
              key={l.code}
              onSelect={() => handleSelect(l.code)}
              className="flex cursor-pointer items-center gap-2.5"
            >
              <FlagIcon locale={l.code} size={20} />
              <span className="flex-1">{l.label}</span>
              {isCurrent && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
