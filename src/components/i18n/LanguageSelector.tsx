// ─────────────────────────────────────────────────────────────────────────────
// Seletor de idioma do SITE PÚBLICO.
//
// • Site público NÃO puxa white-label: a cor de destaque é o verde FIXO da marca
//   (#00C597), nunca --primary (que o tenant logado sobrescreve).
// • Ao escolher um idioma: grava o cookie dnx_lang (passa a mandar sobre a
//   auto-detecção) e navega pra MESMA página no idioma escolhido (troca o prefixo
//   via localizePath/stripLocale). Fase 1: só troca de rota, sem tradução.
// • Dois temas de superfície: 'dark' (LandingNavbar, fundo escuro) e 'light'
//   (BlogNavbar no claro; ganha variantes dark: pro tema escuro do blog).
// • Variante 'corner': pill compacto fixo no canto superior direito — renderizado
//   via createPortal em document.body (fora do backdrop-blur do nav, que criaria
//   um containing block e quebraria position:fixed). Só bandeira + código no
//   trigger; nome nativo nos itens do dropdown.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LOCALES, type LocaleCode } from '@/lib/i18n';
import { useLocale } from '@/lib/i18n';
import { writeLangCookie } from '@/lib/i18n';
import { switchLocalePath } from '@/lib/i18n';
import FlagIcon from './FlagIcon';

/** Verde FIXO da marca Dominex — o seletor nunca usa cor de tenant. */
const BRAND_GREEN = '#00C597';

/** Código curto exibido no trigger da variante 'corner' (ex: "PT" / "EN"). */
const LOCALE_SHORT: Record<LocaleCode, string> = {
  'pt-br': 'PT',
  en: 'EN',
  es: 'ES',
  fr: 'FR',
};

/** Código de arquivo da bandeira em /public/flags/ para cada locale. */
const FLAG_CODE: Record<LocaleCode, string> = {
  'pt-br': 'br',
  en: 'us',
  es: 'es',
  fr: 'fr',
};

type Surface = 'dark' | 'light';
type Variant = 'default' | 'corner';

interface LanguageSelectorProps {
  /** Superfície onde o seletor vive. 'dark' = LandingNavbar; 'light' = BlogNavbar. */
  surface?: Surface;
  /** Ocupa a largura toda (uso dentro do menu hambúrguer mobile). */
  fullWidth?: boolean;
  /** 'corner' = pill fixo no canto superior direito, renderizado via portal. */
  variant?: Variant;
  className?: string;
}

// ── Lógica compartilhada de troca de idioma ───────────────────────────────────
function useLanguageSwitch() {
  const navigate = useNavigate();
  const { locale } = useLocale();

  const handleSelect = (code: LocaleCode, onDone?: () => void) => {
    writeLangCookie(code);
    // Leva pra MESMA página no idioma escolhido. switchLocalePath mapeia o slug
    // de segmento/módulo pro slug do idioma de destino (slug→key→slug); pra
    // demais páginas só troca o prefixo. Preserva query e hash.
    const target = switchLocalePath(
      window.location.pathname + window.location.search + window.location.hash,
      locale,
      code,
    );
    navigate(target);
    onDone?.();
  };

  return { locale, handleSelect };
}

// ── Variante padrão (usada no cluster de botões do nav e no menu mobile) ──────
function DefaultSelector({
  surface = 'dark',
  fullWidth = false,
  className,
}: {
  surface?: Surface;
  fullWidth?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { locale, handleSelect } = useLanguageSwitch();
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];
  const isDark = surface === 'dark';

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Selecionar idioma"
          className={cn(
            'inline-flex items-center gap-1.5 rounded border px-2.5 py-2 text-sm font-medium transition-colors',
            fullWidth && 'w-full justify-between',
            isDark
              ? 'border-white/15 text-white/80 hover:bg-white/5 hover:text-white'
              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/10',
            className,
          )}
        >
          <FlagIcon locale={current.code} size={20} />
          <span>{current.label}</span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            'z-[60] min-w-[10rem] overflow-hidden rounded-xl border p-1 shadow-2xl',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            isDark
              ? 'border-white/10 bg-[hsl(0,0%,8%)]'
              : 'border-neutral-200 bg-white dark:border-white/10 dark:bg-[hsl(0,0%,8%)]',
          )}
        >
          {LOCALES.map((l) => {
            const isCurrent = l.code === locale;
            return (
              <DropdownMenu.Item
                key={l.code}
                onSelect={() => handleSelect(l.code, () => setOpen(false))}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-colors',
                  isDark
                    ? 'text-white/85 focus:bg-white/10 focus:text-white data-[highlighted]:bg-white/10'
                    : 'text-neutral-700 focus:bg-neutral-100 data-[highlighted]:bg-neutral-100 dark:text-white/85 dark:focus:bg-white/10 dark:data-[highlighted]:bg-white/10',
                )}
              >
                <FlagIcon locale={l.code} size={20} />
                <span className="flex-1">{l.label}</span>
                {isCurrent && (
                  <Check className="h-4 w-4 shrink-0" style={{ color: BRAND_GREEN }} />
                )}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ── Variante corner — pill fixo no canto superior direito, via createPortal ───
//
// Por que createPortal:
//   O LandingNavbar tem `backdrop-blur` (backdrop-filter), que cria um containing
//   block na spec CSS. Um `position:fixed` descendente do nav ancora no topo do
//   próprio nav, não na viewport. O portal escapa da subárvore do nav e ancora
//   corretamente no canto da tela. (Ver memory: backdrop-filter-containing-block)
//
// Mobile: hidden — o seletor já está dentro do menu mobile (fullWidth). Não
//   empilha pills nem colide com o botão hambúrguer/CTA do rodapé sticky.
//
// z-index: 55 — acima da navbar (z-50) e dos mega menus (z-50), abaixo dos
//   modais/overlays (z-60+). O dropdown Content usa z-[60] via Portal Radix.
function CornerSelector() {
  const [open, setOpen] = useState(false);
  const { locale, handleSelect } = useLanguageSwitch();
  const current = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

  if (typeof document === 'undefined') return null;

  return createPortal(
    // hidden no mobile (md:flex): evita colisão com hamburger/CTA sticky.
    <div
      className="hidden md:flex items-center"
      style={{
        position: 'fixed',
        top: 0,
        right: 16,
        height: 64, // = h-16 do header: centraliza o pill verticalmente com os itens do header
        zIndex: 55,
      }}
    >
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          {/* Trigger corner:
              - Bordas RETAS: sem rounded-* em nenhum nível (overflow-hidden corta).
              - Bandeira edge-to-edge: items-stretch + h-full + p-0 garantem que a
                imagem toca as bordas esq/top/bottom sem folga.
              - width 42px: cobre a proporção 1.5:1 das bandeiras a 30px de altura.
              - object-cover: preenche sem distorcer mesmo entre bandeiras com
                proporções ligeiramente diferentes (br=160x112, us=160x84 etc.) */}
          <button
            type="button"
            aria-label="Selecionar idioma"
            className={cn(
              'inline-flex items-stretch p-0 overflow-hidden border border-white/15',
              'bg-white/5 backdrop-blur-sm',
              'text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white',
              'transition-colors shadow-sm',
            )}
            style={{ height: 30 }}
          >
            {/* Bloco da bandeira: sem padding, sem rounded, sangra até a borda. */}
            <span
              className="shrink-0 block overflow-hidden"
              style={{ height: '100%', width: 42, minWidth: 42 }}
            >
              <img
                src={`/flags/${FLAG_CODE[current.code]}.png`}
                alt=""
                aria-hidden="true"
                draggable={false}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
            </span>
            {/* Código do idioma + chevron com padding próprio */}
            <span className="inline-flex items-center gap-1 px-2">
              <span>{LOCALE_SHORT[current.code]}</span>
              <ChevronDown
                className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')}
              />
            </span>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className={cn(
              'z-[60] min-w-[10rem] overflow-hidden rounded-xl border border-white/10',
              'bg-[hsl(0,0%,8%)] p-1 shadow-2xl',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            )}
          >
            {LOCALES.map((l) => {
              const isCurrent = l.code === locale;
              return (
                <DropdownMenu.Item
                  key={l.code}
                  onSelect={() => handleSelect(l.code, () => setOpen(false))}
                  className="flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/85 outline-none transition-colors focus:bg-white/10 focus:text-white data-[highlighted]:bg-white/10"
                >
                  <FlagIcon locale={l.code} size={20} />
                  <span className="flex-1">{l.label}</span>
                  {isCurrent && (
                    <Check className="h-4 w-4 shrink-0" style={{ color: BRAND_GREEN }} />
                  )}
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>,
    document.body,
  );
}

// ── Export principal ───────────────────────────────────────────────────────────
export default function LanguageSelector({
  surface = 'dark',
  fullWidth = false,
  variant = 'default',
  className,
}: LanguageSelectorProps) {
  if (variant === 'corner') {
    return <CornerSelector />;
  }
  return (
    <DefaultSelector surface={surface} fullWidth={fullWidth} className={className} />
  );
}
