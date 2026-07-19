import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { canonicalAppPath } from '@/lib/i18n/appRouteSlugs';

// ─────────────────────────────────────────────────────────────────────────────
// Redirect CANÔNICO das rotas do app logado por idioma.
//
// Quando o usuário abre uma tela num slug de OUTRO idioma (ex.: usuário 'en' num
// bookmark '/configuracoes'), remapeia (navigate replace) pro slug do idioma dele
// ('/settings'), preservando query + hash. Ao trocar o idioma no seletor, a rota
// atual re-mapeia sozinha (o effect roda de novo com o novo locale).
//
// Segurança anti-loop: só navega quando o path CANÔNICO difere do atual
// (`canonicalAppPath` devolve null se já estiver no slug certo OU se a rota não
// pertencer ao registro — admin, redirects, públicas ficam intocados).
//
// Não age enquanto o locale ainda carrega (evita redirect pt-br→pt-br→idioma que
// pisca a URL). Montado UMA vez no AppLayout (dentro do AppLocaleProvider).
// ─────────────────────────────────────────────────────────────────────────────
export function useCanonicalAppRoute() {
  const { locale, isLoading } = useAppLocaleContext();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    const target = canonicalAppPath(location.pathname, locale);
    if (!target || target === location.pathname) return;
    navigate(`${target}${location.search}${location.hash}`, { replace: true });
  }, [locale, isLoading, location.pathname, location.search, location.hash, navigate]);
}
