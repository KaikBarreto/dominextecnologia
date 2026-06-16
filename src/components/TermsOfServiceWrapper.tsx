import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTermsOfService } from '@/hooks/useTermsOfService';
import { TermsOfServiceModal } from './TermsOfServiceModal';

/**
 * Envolve as rotas autenticadas e força o aceite dos Termos de Uso no PRIMEIRO
 * ACESSO do usuário (quando `profiles.terms_accepted_at` ainda é NULL).
 *
 * Regras:
 * - Só decide depois que o status carregou (anti-flicker).
 * - Nunca aparece em rotas públicas / portais públicos / autenticação /
 *   checkout (empresa pendente de pagamento fica travada no /checkout).
 * - No modo aceite o modal é obrigatório (não fecha sem aceitar).
 *
 * Modo LEITURA sob demanda (independente do aceite):
 * - Qualquer parte do app pode disparar `window.dispatchEvent(new
 *   CustomEvent('dominex:open-terms'))` pra abrir os Termos em modo leitura.
 * - É como a notificação de "Termos atualizados" abre os termos pra QUALQUER
 *   usuário, sem depender da permissão `screen:settings` (a tela de
 *   Configurações é restrita; este wrapper é global e sempre montado).
 */
export const TermsOfServiceWrapper = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const { hasAccepted, isLoading } = useTermsOfService();
  const location = useLocation();

  // Modal de leitura sob demanda (readOnly), controlado por evento global.
  const [showReadOnlyTerms, setShowReadOnlyTerms] = useState(false);

  // Guard anti-flicker: só libera o modal depois que o 1º fetch completou.
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  useEffect(() => {
    if (user && !isLoading) setInitialLoadDone(true);
  }, [user, isLoading]);

  // Listener global: qualquer parte do app abre os Termos em modo leitura.
  useEffect(() => {
    const handler = () => setShowReadOnlyTerms(true);
    window.addEventListener('dominex:open-terms', handler);
    return () => window.removeEventListener('dominex:open-terms', handler);
  }, []);

  // Reset quando perde o usuário (logout) pra que o próximo ciclo reavalie.
  useEffect(() => {
    if (!user) setInitialLoadDone(false);
  }, [user]);

  // Rotas onde o termo NUNCA deve aparecer: landing pública, autenticação,
  // checkout e portais públicos (acessados sem login / por token).
  const isBlockedRoute = useMemo(() => {
    const path = location.pathname;
    if (path === '/') return true; // landing pública
    const blockedPrefixes = [
      '/login',
      '/auth',
      '/cadastro',
      '/reset-password',
      '/checkout',
      '/os-tecnico',
      '/orcamento',
      '/proposta',
      '/portal',
      '/contrato/unidade',
      '/pmoc/unidade',
    ];
    return blockedPrefixes.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
  }, [location.pathname]);

  const showTermsModal =
    !!user && initialLoadDone && !hasAccepted && !isBlockedRoute;

  return (
    <>
      {children}
      {/* Modal de ACEITE obrigatório (1º acesso): trava o fechamento. */}
      <TermsOfServiceModal
        open={showTermsModal}
        // Modo obrigatório: o modal ignora qualquer tentativa de fechar que não
        // seja via aceite. Passamos noop por segurança.
        onOpenChange={() => {}}
      />
      {/* Modal de LEITURA sob demanda (readOnly): aberto via evento global
          'dominex:open-terms'. Independente do aceite — fecha normalmente. */}
      <TermsOfServiceModal
        readOnly
        open={showReadOnlyTerms}
        onOpenChange={setShowReadOnlyTerms}
      />
    </>
  );
};
