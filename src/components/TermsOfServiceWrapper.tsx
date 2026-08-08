import { Suspense, lazy, useEffect, useState } from 'react';

// O modal de Termos puxa o gerador de PDF (jspdf/html2canvas, ~400KB gzip). Esse
// peso NÃO pode entrar no entry da landing: este wrapper é montado app-wide, mas
// o modal só aparece sob demanda (leitura). Lazy + render condicional tira jspdf
// do caminho do primeiro paint da landing.
const TermsOfServiceModal = lazy(() =>
  import('./TermsOfServiceModal').then((m) => ({ default: m.TermsOfServiceModal }))
);

/**
 * Wrapper global de Termos de Uso — modo LEITURA sob demanda.
 *
 * IMPORTANTE — o wrapper NÃO força mais o aceite dos termos.
 * O aceite passou a ser feito no CADASTRO: o formulário de registro exibe um
 * aviso ("Ao criar sua conta, você concorda com os Termos de Uso e a Política
 * de Privacidade") e o próprio ato de criar a conta registra o aceite no
 * backend (com `terms_version`). Depois, o usuário consulta os termos aceitos
 * nas Configurações. Por isso, o antigo modal de ACEITE OBRIGATÓRIO (que
 * travava o fechamento no 1º acesso) foi removido daqui.
 *
 * O que continua aqui é apenas a LEITURA sob demanda (readOnly):
 * - Qualquer parte do app pode disparar `window.dispatchEvent(new
 *   CustomEvent('dominex:open-terms'))` pra abrir os Termos em modo leitura.
 * - É como a notificação de "Termos atualizados" abre os termos pra QUALQUER
 *   usuário, sem depender da permissão `screen:settings` (a tela de
 *   Configurações é restrita; este wrapper é global e sempre montado).
 */
export const TermsOfServiceWrapper = ({ children }: { children: React.ReactNode }) => {
  // Modal de leitura sob demanda (readOnly), controlado por evento global.
  const [showReadOnlyTerms, setShowReadOnlyTerms] = useState(false);

  // Listener global: qualquer parte do app abre os Termos em modo leitura.
  useEffect(() => {
    const handler = () => setShowReadOnlyTerms(true);
    window.addEventListener('dominex:open-terms', handler);
    return () => window.removeEventListener('dominex:open-terms', handler);
  }, []);

  // Só montamos o modal (e baixamos seu chunk com o jspdf) quando ele REALMENTE
  // vai abrir. Em landing/login/visitante anônimo nada é carregado.
  return (
    <>
      {children}
      {showReadOnlyTerms && (
        <Suspense fallback={null}>
          {/* Modal de LEITURA sob demanda (readOnly): aberto via evento global
              'dominex:open-terms'. Independente do aceite — fecha normalmente. */}
          <TermsOfServiceModal readOnly open onOpenChange={setShowReadOnlyTerms} />
        </Suspense>
      )}
    </>
  );
};
