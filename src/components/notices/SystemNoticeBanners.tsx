import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { useSystemNotices } from '@/hooks/useSystemNotices';
import type { NoticeScope } from '@/lib/systemNotices';

/**
 * Faixa de aviso publicada pela Dominex e exibida ao tenant.
 *
 * Visual: `NoticeBanner` SATURADO (fundo na cor + texto/ícone na cor de
 * foreground). Nada de tint pastel — régua do CEO.
 *
 * Onde entra:
 *   - `scope="dashboard"` no painel inicial (pega os dois escopos);
 *   - `scope="global"` nos shells do AppLayout (pega só os marcados como
 *     globais, pra aviso crítico).
 *
 * ⚠️ NÃO renderiza pra usuário do painel master: o super_admin passa pela
 * policy de admin e enxergaria avisos de TODAS as empresas empilhados no topo
 * da tela. Marca que o tenant vê é Dominex; Auctus é bastidor.
 */
export function SystemNoticeBanners({ scope }: { scope: NoticeScope }) {
  const { isAdminUser } = useAuth();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.notices;
  // `!isAdminUser`: no painel master o super_admin enxerga avisos de TODAS as
  // empresas pela policy de admin. Nem consulta.
  const { notices, dismiss } = useSystemNotices(scope, !isAdminUser);

  if (isAdminUser) return null;
  if (notices.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {notices.map((notice) => (
        <NoticeBanner
          key={notice.id}
          variant={notice.variant}
          title={notice.title}
          className="items-start"
          action={
            <span className="flex items-center gap-2">
              {notice.action_url && (
                <a
                  href={notice.action_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2"
                >
                  {notice.action_label || t.readMore}
                </a>
              )}
              {notice.is_dismissible && (
                <button
                  type="button"
                  onClick={() => dismiss(notice.id)}
                  aria-label={t.dismiss}
                  // `text-inherit`: herda a cor de foreground da variante do
                  // NoticeBanner. Nunca `text-white` cravado (régua de UI).
                  className="-mr-1 rounded p-1 text-inherit opacity-80 transition-opacity hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </span>
          }
        >
          {notice.message}
        </NoticeBanner>
      ))}
    </div>
  );
}
