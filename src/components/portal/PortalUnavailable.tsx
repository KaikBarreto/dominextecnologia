import { Clock } from 'lucide-react';
import DarkVeil from '@/components/ui/DarkVeil';
import { MESSAGES } from '@/lib/i18n/messages';
import { detectMachineLocale } from '@/lib/i18n/detectLocale';
import type { LocaleCode } from '@/lib/i18n/locales';

/**
 * Tela sóbria (estilo 404/DarkVeil) exibida ao CLIENTE FINAL quando o portal
 * público não está disponível — porque a empresa dona NÃO tem o módulo
 * "Portal do Cliente" na assinatura.
 *
 * Quem vê é o cliente final do tenant (não o dono da empresa), então a copy é
 * NEUTRA: sem botão de upgrade, sem CTA de assinatura, sem jargão. É uma tela
 * puramente informativa.
 *
 * Usada por:
 *  - CustomerPortal — quando `get_portal_data` devolve `access: 'module_unavailable'`.
 *  - PmocPublicPortal — quando `pmoc-portal-share` devolve `error: 'module_unavailable'`.
 *
 * `locale` é opcional. Quando não fornecido, usa `detectMachineLocale()` (idioma
 * do navegador do visitante) com fallback pt-br — ambas renderizam ANTES do
 * PublicAppLocaleProvider (sem dados do tenant ainda).
 */
export default function PortalUnavailable({
  companyName,
  locale,
}: {
  companyName?: string | null;
  locale?: LocaleCode | null;
}) {
  const resolvedLocale: LocaleCode = locale ?? detectMachineLocale() ?? 'pt-br';
  const t = MESSAGES[resolvedLocale].app.customers.portal;

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>

      <div
        className="relative z-10 w-full max-w-md space-y-6 px-6 text-center"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
          <Clock className="h-8 w-8 text-white" aria-hidden="true" />
        </div>

        {companyName && (
          <p className="text-sm font-medium uppercase tracking-widest text-white/50">
            {companyName}
          </p>
        )}

        <div className="space-y-3">
          <h1 className="text-2xl font-bold leading-tight text-white sm:text-3xl">
            {t.unavailableTitle}
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-white/60">
            {t.unavailableDesc}
          </p>
        </div>
      </div>
    </div>
  );
}
