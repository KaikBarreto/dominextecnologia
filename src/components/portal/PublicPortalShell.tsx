import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { portalHeaderStyle } from './portalTheme';
import { PortalStickyFooter } from './PortalStickyFooter';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { idealForeground } from '@/lib/colorContrast';
import { cn } from '@/lib/utils';

// TEMA CLARO FORCADO (independente do estado dark/light do usuario). Portal
// publico e uma rota standalone (fora do AppLayout), entao forcamos tema claro
// no <html> para que todos os tokens CSS (--background/--card/etc.) resolvam
// no modo claro — mesmo que o usuario tenha dark ativado na app. Restauramos
// o estado anterior na desmontagem para nao vazar para o resto do app.
// Espelha o padrao do PontoPublico.tsx (forcou dark; aqui invertemos: forcamos claro).
function useForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.remove('dark');
    const prevColorScheme = root.style.colorScheme;
    root.style.colorScheme = 'light';
    return () => {
      if (hadDark) root.classList.add('dark');
      root.style.colorScheme = prevColorScheme;
    };
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipos publicos exportados para que os consumidores (CustomerPortal,
// PmocPublicPortal) possam tipar suas secoes de navegacao.
// ─────────────────────────────────────────────────────────────────────────────

/** Uma secao de navegacao do portal (aba no mobile, item na sidebar do desktop). */
export interface PortalNavSection {
  /** Valor unico da secao (usado como activeTab). */
  value: string;
  /** Rotulo exibido na pilula/sidebar. */
  label: string;
  /** Icone opcional (exibido na pilula mobile e na sidebar desktop). */
  icon?: ReactNode;
}

interface PublicPortalShellProps {
  /** Cor primaria da empresa (white-label). Vem do PAYLOAD (anti-FOUC).
   * Usada tambem como fill do item ativo na sidebar e nas pilulas mobile. */
  brandColor?: string | null;
  /** URL do logo da empresa. */
  logoUrl?: string | null;
  /** Nome da empresa (titulo do header). */
  title: string;
  /** Subtitulo do header (ex.: "Portal do Cliente", nome da unidade). */
  subtitle?: string;
  /** Selo/badge de saude ou status exibido no header. */
  badge?: ReactNode;
  /** Acao secundaria no canto do header (ex.: PortalContactButton). */
  headerAction?: ReactNode;
  /**
   * Secoes de navegacao. Quando informadas:
   *  - Mobile: exibe as pilulas de aba no CORPO (acima do children).
   *  - Desktop: exibe a lista vertical na sidebar esquerda.
   * Omitir = portal sem navegacao em abas (uma unica secao).
   */
  navSections?: PortalNavSection[];
  /** Aba/secao atualmente ativa. */
  activeSection?: string;
  /** Callback ao trocar de secao. */
  onSectionChange?: (value: string) => void;
  /**
   * Conteudo adicional na sidebar desktop (acima da navegacao de secoes).
   * Ex.: cartao de saudacao do cliente.
   */
  sidebarHeader?: ReactNode;
  /** Linha de status no rodape sticky. */
  footerStatus?: ReactNode;
  /** Label do CTA fixo no rodape. */
  footerCtaLabel?: string;
  /** Callback do CTA fixo no rodape. */
  onFooterCta?: () => void;
  /** Rotulo da secao de navegacao na sidebar desktop (ex.: "Menu"). Traduzido pelo consumidor. */
  navLabel?: string;
  /** Conteudo principal (corpo rolavel). */
  children: ReactNode;
}

/**
 * Casca "app-nativo" compartilhada pelos portais publicos (cliente + contrato/PMOC).
 *
 * Layout MOBILE (< lg):
 *   - Header branded arredondado (rounded-b-3xl), cor do PAYLOAD (anti-FOUC).
 *   - Pilulas de navegacao de secoes no corpo (quando navSections informado).
 *   - Corpo rolavel com folga pro rodape fixo.
 *   - Rodape sticky escuro (degrede preto-cinza) com status + CTA + SystemFooter.
 *
 * Layout DESKTOP (lg+):
 *   - Header sticky no topo (branded, rounded-b-2xl, max-w-screen-2xl).
 *   - Grid 3 colunas: sidebar (20rem) | main (1fr) | spacer (20rem).
 *   - Sidebar: identidade + sidebarHeader + lista vertical de secoes + contato.
 *   - Main: conteudo da secao ativa (max-w-3xl, centralizado).
 *   - CTA principal via portal no body (OsActionFooter, hidden lg:flex).
 *   - Rodape sticky do mobile fica OCULTO no desktop (lg:hidden).
 *
 * Regra-lei n2 anti-FOUC: cor aplicada so inline no header local; nunca
 * cacheia em localStorage, nunca toca CSS vars globais, nunca importa
 * useWhiteLabel (o portal pode ser de outro tenant que o dono do navegador).
 */
export function PublicPortalShell({
  brandColor,
  logoUrl,
  title,
  subtitle,
  badge,
  headerAction,
  navSections,
  activeSection,
  onSectionChange,
  sidebarHeader,
  footerStatus,
  footerCtaLabel,
  onFooterCta,
  navLabel = 'Menu',
  children,
}: PublicPortalShellProps) {
  // Forca tema claro para que todos os tokens (bg-card, bg-background, etc.)
  // resolvam no modo claro, independente da preferencia do usuario no app.
  useForceLightTheme();

  const effectiveBrand = brandColor || '#00C684';
  const headerStyle = portalHeaderStyle(effectiveBrand);
  const textColor = idealForeground(effectiveBrand);
  const ctaTextColor = idealForeground(effectiveBrand);

  // Mede a altura do header sticky para o offset da sidebar (espelha TechnicianOS).
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [headerH, setHeaderH] = useState(0);

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const readH = (entry?: ResizeObserverEntry) => {
      const bb = entry?.borderBoxSize?.[0];
      return Math.ceil(bb ? bb.blockSize : el.getBoundingClientRect().height);
    };
    const apply = (entry?: ResizeObserverEntry) => {
      const h = readH(entry);
      setHeaderH((prev) => (prev === h ? prev : h));
    };
    apply();
    const ro = new ResizeObserver((entries) => apply(entries[0]));
    ro.observe(el, { box: 'border-box' });
    return () => ro.disconnect();
  }, [brandColor, title, subtitle]);

  // ── Rodape desktop (via portal no body, sticky, espelha o PortalStickyFooter mobile) ──
  // Inclui: status (proxima ocorrencia), CTA e SystemFooter (copyright/versao).
  // Renderizado mesmo sem CTA (quando ha footerStatus ou sempre, pra copyright nao desaparecer no desktop).
  const hasDesktopFooter = !!(footerCtaLabel || footerStatus);
  const desktopFooter = hasDesktopFooter
    ? createPortal(
        <div
          className="fixed inset-x-0 bottom-0 z-30 hidden lg:flex flex-col border-t border-border bg-card/95 backdrop-blur shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 pt-3 pb-2">
            {footerStatus && (
              <p className="text-xs text-muted-foreground text-center">{footerStatus}</p>
            )}
            {footerCtaLabel && (
              <button
                type="button"
                onClick={onFooterCta}
                className="w-full rounded-xl py-3 font-extrabold text-sm transition-opacity active:opacity-80"
                style={{ background: effectiveBrand, color: ctaTextColor }}
              >
                {footerCtaLabel}
              </button>
            )}
            <div className="pt-0.5">
              <SystemFooter variant="light" />
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-muted/40">
      {/* ── Header branded ── */}
      <div
        ref={headerRef}
        className="sticky top-0 z-20 rounded-b-3xl lg:rounded-b-2xl shadow-md overflow-hidden"
        style={{ ...headerStyle, paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Overlay de profundidade (como no PontoPublico) */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 38%, rgba(0,0,0,0.16) 100%)',
          }}
        />

        {/* Conteudo interno — centralizado, max-w-screen-2xl no desktop */}
        <div className="relative px-4 pt-6 pb-5 text-center mx-auto w-full lg:max-w-screen-2xl lg:px-8">
          {/* Acao(oes) secundaria(s) no canto superior direito — flex para multiplos botoes */}
          {headerAction && (
            <div className="absolute right-3 lg:right-8 top-[calc(env(safe-area-inset-top)+0.75rem)] flex items-center gap-2">
              {headerAction}
            </div>
          )}

          {/* Logo da empresa */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={title}
              className="mx-auto mb-2 h-14 w-14 rounded-full object-contain border-2 border-white/40 shadow-sm bg-white/10"
            />
          ) : (
            <div
              className="mx-auto mb-2 h-14 w-14 rounded-full border-2 border-white/40 shadow-sm"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            />
          )}

          <h1 className="text-base font-extrabold leading-tight" style={{ color: textColor }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs mt-0.5 opacity-85" style={{ color: textColor }}>
              {subtitle}
            </p>
          )}
          {badge && <div className="mt-2 flex justify-center">{badge}</div>}
        </div>
      </div>

      {/* ── Grid responsivo ── */}
      <div
        className={cn(
          // Mobile: pilha vertical normal
          'flex-1',
          // Desktop: grid 3 colunas (igual ao TechnicianOS)
          'lg:grid lg:grid-cols-[20rem_minmax(0,1fr)_20rem] lg:gap-4 lg:px-8',
          'lg:w-full lg:max-w-screen-2xl lg:mx-auto lg:items-start lg:pt-4',
        )}
      >
        {/* ── Col 1: Sidebar (desktop only) ── */}
        <aside
          className="hidden lg:flex lg:flex-col lg:gap-3 lg:w-80 lg:shrink-0 lg:sticky lg:self-start lg:overflow-y-auto"
          style={{
            top: headerH + 16,
            maxHeight: `calc(100vh - ${headerH + 32}px)`,
          }}
        >
          {/* Conteudo extra da sidebar (saudacao, resumo do cliente, etc.) */}
          {sidebarHeader}

          {/* Navegacao vertical de secoes */}
          {navSections && navSections.length > 1 && (
            <div className="rounded-lg border border-border bg-card p-2">
              <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {navLabel}
              </p>
              <ul className="space-y-1">
                {navSections.map((section) => {
                  const isActive = activeSection === section.value;
                  // Ativo: fill saturado com a cor de marca (branded) + texto de contraste.
                  // Inativo: texto muted + hover com fill de marca sutil.
                  // Espelha o padrao do SettingsSidebarLayout (bg-primary text-primary-foreground),
                  // mas usa a cor de marca do portal para ser branded (white-label).
                  const activeBg = effectiveBrand;
                  const activeFg = idealForeground(effectiveBrand);
                  return (
                    <li key={section.value}>
                      <button
                        type="button"
                        onClick={() => onSectionChange?.(section.value)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
                          isActive
                            ? 'font-semibold shadow-sm'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )}
                        style={
                          isActive
                            ? { backgroundColor: activeBg, color: activeFg }
                            : undefined
                        }
                      >
                        {section.icon && (
                          <span className="shrink-0 h-4 w-4">
                            {section.icon}
                          </span>
                        )}
                        {section.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Botao de contato na sidebar — reutiliza o headerAction (PortalContactButton)
              no desktop; no mobile ja aparece no header. Quando headerAction for o
              PortalContactButton, ele e o mesmo componente que aparece no header mobile,
              entao aqui escondemos o do header no desktop e mostramos na sidebar. */}
        </aside>

        {/* ── Col 2: Conteudo principal ── */}
        <main
          className={cn(
            // Mobile: corpo inteiro rolavel com padding
            'overflow-y-auto px-4 py-4 pb-2',
            // Desktop: centralizado com espaco pro rodape fixo
            'lg:w-full lg:max-w-3xl lg:mx-auto lg:px-0 lg:py-0 lg:pb-32',
          )}
        >
          {/* Pilulas de navegacao mobile (visivel so em mobile) */}
          {navSections && navSections.length > 1 && (
            <div className="mb-4 lg:hidden">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {navSections.map((section) => {
                  const isActive = activeSection === section.value;
                  // Pilula ativa: fill saturado com cor de marca + texto de contraste (branco).
                  // Inativo: card com borda + texto normal.
                  return (
                    <button
                      key={section.value}
                      type="button"
                      onClick={() => onSectionChange?.(section.value)}
                      className={cn(
                        'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                        isActive
                          ? 'shadow-sm'
                          : 'bg-card border border-border text-foreground hover:bg-muted',
                      )}
                      style={
                        isActive
                          ? { backgroundColor: effectiveBrand, color: idealForeground(effectiveBrand) }
                          : undefined
                      }
                    >
                      {section.icon}
                      {section.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {children}
        </main>

        {/* ── Col 3: Spacer (desktop only) ── */}
        <div className="hidden lg:block" aria-hidden />
      </div>

      {/* ── Rodape mobile (sticky escuro, oculto no desktop) ── */}
      <div className="lg:hidden">
        <PortalStickyFooter
          status={footerStatus}
          ctaLabel={footerCtaLabel}
          onCta={onFooterCta}
          ctaColor={effectiveBrand}
          ctaTextColor={ctaTextColor}
        />
      </div>

      {/* ── Rodape desktop (portal no body, identico ao OsActionFooter) ── */}
      {desktopFooter}
    </div>
  );
}
