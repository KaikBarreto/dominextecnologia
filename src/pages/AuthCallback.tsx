import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  registerSession,
  hasSystemAccess,
  resolvePostLoginRedirect,
} from '@/lib/postLogin';
import { addCurrentSessionToSavedStandalone } from '@/lib/savedSessions';
import { trackUsage } from '@/lib/trackUsage';
import logoWhite from '@/assets/logo-horizontal-verde.png';
import DarkVeil from '@/components/ui/DarkVeil';

// Mensagem PT-BR mostrada na tela de /login quando a conta do Google ainda não
// tem vínculo no Dominex (sem auto-cadastro — decisão de produto travada).
// Reversível: pra habilitar auto-cadastro depois, basta trocar este branch por
// um fluxo de provisionamento em vez do signOut + bounce.
const NO_ACCESS_MESSAGE =
  'Esta conta do Google ainda não tem acesso ao Dominex. Entre com email e senha ou peça acesso ao administrador.';
const GENERIC_ERROR_MESSAGE =
  'Não foi possível concluir o login com o Google. Tente novamente.';

/**
 * Trata o retorno do OAuth (Google). O Supabase já estabeleceu a sessão quando
 * chegamos aqui (ou está estabelecendo) — esperamos `user && !loading`.
 *
 * Regra de produto: Google só entra com conta que JÁ EXISTE no sistema. Conta
 * Google desconhecida (sem super_admin nem user_role) é DESLOGADA (scope local)
 * e mandada de volta pro /login com mensagem PT-BR. NUNCA auto-cadastra.
 */
export default function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  // Guard de execução única: o useEffect pode re-rodar (loading→user em 2
  // ticks, re-render). Sem o ref, registraríamos sessão / navegaríamos 2x.
  const ranRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    // Sem sessão após o redirect do Google → algo falhou (usuário cancelou,
    // erro no provider). Volta pro login sem mensagem específica.
    if (!user) {
      if (ranRef.current) return;
      ranRef.current = true;
      navigate('/login', { replace: true });
      return;
    }

    if (ranRef.current) return;
    ranRef.current = true;

    const finish = async () => {
      // Bounce padrão: desloga LOCAL (scope local — regra-lei: nunca derrubar
      // outros dispositivos) e volta pro login com a mensagem dada.
      const bounce = async (message: string) => {
        await supabase.auth.signOut({ scope: 'local' });
        navigate('/login', { replace: true, state: { authError: message } });
      };

      try {
        const allowed = await hasSystemAccess(user.id);
        if (!allowed) {
          // Conta Google desconhecida — sem auto-cadastro.
          await bounce(NO_ACCESS_MESSAGE);
          return;
        }

        // Conta com acesso: registra a sessão (single-session enforcement) e
        // espelha o destino do completeLogin do login email/senha.
        await registerSession(user.id);
        addCurrentSessionToSavedStandalone().catch((e) =>
          console.warn('[AuthCallback] addCurrentSessionToSavedStandalone failed:', e),
        );
        trackUsage('login');

        const destination = await resolvePostLoginRedirect(user.id);
        navigate(destination, { replace: true });
      } catch (e) {
        console.error('[AuthCallback] erro inesperado no retorno do Google:', e);
        await bounce(GENERIC_ERROR_MESSAGE);
      }
    };

    finish();
  }, [user, loading, navigate]);

  // Tela de "Entrando…" — mesmo veil/logo do Auth, mobile-first.
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-6">
      <div className="absolute inset-0 z-0">
        <DarkVeil hueShift={53} speed={0.5} />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-5 text-white">
        <img src={logoWhite} alt="Dominex" className="h-12 w-auto" onError={() => {}} />
        <div className="flex items-center gap-2 text-sm text-white/80">
          <Loader2 className="h-4 w-4 animate-spin" />
          Entrando…
        </div>
      </div>
    </div>
  );
}
