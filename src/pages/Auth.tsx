import { useState, useCallback, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Mail, Lock, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { ForgotPasswordFlow } from '@/components/auth/ForgotPasswordFlow';
import { SessionConfirmDialog } from '@/components/SessionConfirmDialog';
import logoLight from '@/assets/logo-dark.png';
import logoDark from '@/assets/logo-horizontal-verde.png';
import { LoginShowcase } from '@/components/auth/LoginShowcase';
import { SystemFooter } from '@/components/layout/SystemFooter';
import { useIsDark } from '@/hooks/useIsDark';
import { supabase } from '@/integrations/supabase/client';
import { trackUsage } from '@/lib/trackUsage';
import { getDeviceInfo } from '@/lib/sessionUtils';
import { registerSession, resolvePostLoginRedirect } from '@/lib/postLogin';
import {
  isAddingAccountStandalone,
  addCurrentSessionToSavedStandalone,
  clearAddAccountFlagStandalone,
} from '@/lib/savedSessions';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { mapGotrueError } from '@/utils/authErrorMessages';

// Mensagens do schema vêm do i18n (montado dentro do componente via useMemo).
type LoginForm = {
  email: string;
  password: string;
  rememberMe: boolean;
};

// Logo "G" oficial multicolor do Google (lucide não tem). SVG inline pra não
// adicionar asset/rede. Mantém proporção via viewBox.
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// Divisor "ou" entre o form de email/senha e o botão do Google. O rótulo vem
// do i18n (passado pelo chamador) pra acompanhar o idioma da tela.
function OrDivider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center">
      <div className="flex-1 border-t border-slate-200 dark:border-white/15" />
      <span className="px-3 text-[10px] uppercase tracking-widest text-slate-400 dark:text-white/40">{label}</span>
      <div className="flex-1 border-t border-slate-200 dark:border-white/15" />
    </div>
  );
}

export default function Auth() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const isDark = useIsDark();

  // Session management state
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [existingSessionsInfo, setExistingSessionsInfo] = useState<{ device_info: string | null; last_activity: string }[]>([]);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingLoginData, setPendingLoginData] = useState<LoginForm | null>(null);
  const [disconnectOthers, setDisconnectOthers] = useState(false);

  // Ref to prevent auto-redirect while login flow is in progress
  const loginInProgressRef = useRef(false);

  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { locale, messages } = useLocale();
  const t = messages.auth;

  // Schema montado com as mensagens do locale atual (react-hook-form usa a
  // instância criada no primeiro render; o locale de auth não muda em runtime).
  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t.errorEmailRequired).email(t.errorEmailInvalid),
        password: z.string().min(1, t.errorPasswordRequired),
        rememberMe: z.boolean().default(false),
      }),
    [t],
  );

  // Erro vindo do retorno do Google (AuthCallback): chega via location.state
  // ({ authError }) ou query param ?auth_error=. Mostramos na montagem e
  // limpamos a URL/estado pra não reaparecer num refresh.
  useEffect(() => {
    const stateError = (location.state as { authError?: string } | null)?.authError;
    const params = new URLSearchParams(location.search);
    const queryError = params.get('auth_error');
    const incoming = stateError || queryError;
    if (incoming) {
      setAuthError(incoming);
      // Limpa state + query pra o erro não persistir em navegação/refresh.
      navigate(location.pathname, { replace: true });
    }
    // Só na montagem — não reagir a navegações internas posteriores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inicia o OAuth com Google. É um redirect (o browser sai pro Google), então
  // no sucesso não navegamos nem resetamos o loading — a página é descarregada.
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setAuthError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setAuthError(mapGotrueError(error, t.gotrueErrors));
      setIsLoading(false);
    }
  };

  // Limpa a flag de "relogin email" assim que o componente monta. Mantemos
  // pra o defaultValues capturar (linha abaixo) — usuário não pode ver email
  // de outra conta da próxima vez que abrir /auth manualmente.
  useEffect(() => {
    return () => {
      // Cleanup: ao desmontar, limpa o email de relogin do storage.
      localStorage.removeItem('__relogin_email');
    };
  }, []);

  // Replace PublicRoute behavior: redirect to dashboard if already logged in
  // BUT skip if login flow is in progress (session check / dialog) OR se o
  // fluxo "Adicionar conta" está ativo (flag setada antes de chegar aqui).
  // Sem essa checagem, o Supabase pode auto-restaurar a sessão e redirecionar
  // de volta pro dashboard antes do user digitar credenciais da outra conta.
  useEffect(() => {
    if (!loading && user && !loginInProgressRef.current && !isAddingAccountStandalone()) {
      // Check role + company status to determine redirect target
      const checkAndRedirect = async () => {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'super_admin')
          .maybeSingle();
        if (roleData) {
          navigate('/admin/empresas', { replace: true });
          return;
        }
        // Check company status
        const { data: profileData } = await supabase
          .from('profiles')
          .select('company_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (profileData?.company_id) {
          const { data: companyData } = await supabase
            .from('companies')
            .select('subscription_status, payment_lock_bypass')
            .eq('id', profileData.company_id)
            .maybeSingle();
          // pending_payment manda pro checkout, EXCETO se a empresa tem
          // bypass liberado (payment_lock_bypass === true) — aí segue normal.
          // Cast as any: coluna ainda não está no types.ts. Comparação
          // estrita: null/undefined nunca abre exceção.
          const hasBypass = (companyData as any)?.payment_lock_bypass === true;
          if (companyData?.subscription_status === 'pending_payment' && !hasBypass) {
            navigate('/checkout', { replace: true });
            return;
          }
        }
        navigate('/dashboard', { replace: true });
      };
      checkAndRedirect();
    }
  }, [user, loading, navigate]);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      // Prioridade: email salvo do "relogin" (sessão expirada no switcher)
      // > email "lembrar-me" persistido. Limpa __relogin_email no cleanup
      // do useEffect acima — só usa 1x.
      email:
        localStorage.getItem('__relogin_email') ||
        localStorage.getItem('rememberedEmail') ||
        '',
      password: '',
      rememberMe: !!localStorage.getItem('rememberedEmail'),
    },
  });

  // registerSession e a árvore de decisão de destino vivem em @/lib/postLogin
  // (fonte única compartilhada com o retorno do OAuth em AuthCallback).

  const disconnectOtherSessions = useCallback(async (userId: string) => {
    const currentToken = localStorage.getItem("session_token");
    if (!currentToken) return;
    await supabase
      .from('active_sessions')
      .delete()
      .eq("user_id", userId)
      .neq("session_token", currentToken);
  }, []);

  const completeLogin = async (data: LoginForm, userId: string) => {
    if (data.rememberMe) {
      localStorage.setItem('rememberedEmail', data.email);
    } else {
      localStorage.removeItem('rememberedEmail');
    }
    await registerSession(userId);

    // Adiciona/atualiza a sessão no switcher de contas e libera futuros
    // redirects automáticos. Fire-and-forget — se falhar, segue o fluxo.
    addCurrentSessionToSavedStandalone().catch((e) =>
      console.warn('[Auth] addCurrentSessionToSavedStandalone failed:', e),
    );
    clearAddAccountFlagStandalone();

    // Instrumentação MVP — fire-and-forget, não bloqueia UX
    trackUsage('login');
    toast({ title: t.toastWelcomeTitle, description: t.toastWelcomeDesc });

    // Destino pós-login: árvore de decisão compartilhada (super_admin →
    // /admin/empresas; pending_payment sem bypass → /checkout; técnico →
    // /agenda; resto → /dashboard). Fonte única em @/lib/postLogin.
    const destination = await resolvePostLoginRedirect(userId);
    // Toast específico do fluxo email/senha quando cai no checkout por
    // pagamento pendente. (O OAuth não emite esse toast.)
    if (destination === '/checkout') {
      toast({
        title: t.toastPendingPaymentTitle,
        description: t.toastPendingPaymentDesc,
      });
    }
    navigate(destination);
    loginInProgressRef.current = false;
  };

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true);
    setAuthError(null);
    // CRITICAL: Set ref BEFORE any async call to block the useEffect redirect
    loginInProgressRef.current = true;
    // Limpa flag stale de sessão admin-como-usuário: um login NORMAL neste
    // dispositivo precisa voltar a registrar em active_sessions. O branch do
    // Token de Acesso abaixo re-seta a flag quando for o caso.
    localStorage.removeItem('is_admin_token_session');

    try {
      // Call signInWithPassword directly to avoid AuthContext triggering redirect
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        // Fallback "Token de Acesso" (painel master): se a senha digitada tem a
        // cara do token global (8 hex), o login normal falhou e tentamos entrar
        // como o usuário-alvo via admin-token-login. setSession injeta os tokens
        // LOCALMENTE sem invalidar as sessões reais do usuário.
        if (/^[A-Fa-f0-9]{8}$/.test(data.password)) {
          const { data: tokenResp, error: tokenErr } = await supabase.functions.invoke(
            'admin-token-login',
            {
              body: { action: 'login', email: data.email, token: data.password, deviceInfo: getDeviceInfo() },
            },
          );
          if (!tokenErr && tokenResp?.access_token) {
            const { data: sessionResult, error: setSessionErr } = await supabase.auth.setSession({
              access_token: tokenResp.access_token,
              refresh_token: tokenResp.refresh_token,
            });
            if (!setSessionErr && sessionResult.user) {
              // Marca a sessão como admin-como-usuário: NÃO registramos em
              // active_sessions (sessão temporária, não deve expulsar nem
              // aparecer entre as sessões reais do usuário).
              localStorage.setItem('is_admin_token_session', 'true');
              await completeLogin(data, sessionResult.user.id);
              return;
            }
          }
        }

        loginInProgressRef.current = false;
        // Erros do Supabase Auth chegam em inglês → mapeados pro locale atual.
        setAuthError(mapGotrueError(error, t.gotrueErrors));
        return;
      }

      const userId = authData.user?.id;
      if (!userId) throw new Error('Authentication failed');

      // Check for existing active sessions from OTHER devices
      const currentToken = localStorage.getItem("session_token");
      const { data: otherSessions } = await supabase
        .from('active_sessions')
        .select("device_info, last_activity, session_token")
        .eq("user_id", userId)
        .neq("session_token", currentToken || "___none___");

      // Filter recent sessions (active within last 60 min)
      const recentSessions = (otherSessions || []).filter((s) => {
        const diff = (Date.now() - new Date(s.last_activity!).getTime()) / 60000;
        return diff < 60;
      });

      if (recentSessions.length > 0) {
        // Show session dialog — keep loginInProgressRef true to block redirect
        setPendingUserId(userId);
        setPendingLoginData(data);
        setExistingSessionsInfo(recentSessions.map((s: any) => ({ device_info: s.device_info, last_activity: s.last_activity })));
        setDisconnectOthers(false);
        setSessionDialogOpen(true);
        setIsLoading(false);
        return; // loginInProgressRef stays true — blocks useEffect redirect
      }

      // No other sessions - login directly
      await completeLogin(data, userId);
    } catch {
      loginInProgressRef.current = false;
      setAuthError(t.errorUnexpected);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionContinue = async () => {
    if (!pendingLoginData || !pendingUserId) return;
    setIsLoading(true);
    try {
      await completeLogin(pendingLoginData, pendingUserId);

      if (disconnectOthers) {
        await disconnectOtherSessions(pendingUserId);
        toast({ title: t.toastOtherSessionsDisconnected });
      }

      setSessionDialogOpen(false);
      setPendingLoginData(null);
      setPendingUserId(null);
      setExistingSessionsInfo([]);
    } catch {
      setAuthError(t.errorContinueLogin);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSessionCancel = () => {
    setSessionDialogOpen(false);
    setPendingLoginData(null);
    setPendingUserId(null);
    setExistingSessionsInfo([]);
    loginInProgressRef.current = false;
    // Cancelar o login só desfaz a sessão DESTE dispositivo. Sem `scope: 'local'`
    // o default 'global' revogaria os tokens dos outros dispositivos que o
    // usuário escolheu preservar.
    supabase.auth.signOut({ scope: 'local' });
    toast({ title: t.toastLoginCanceled });
  };

  const toggleTheme = () => {
    const nextIsDark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', nextIsDark);
    localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
  };

  const authShell = (content: ReactNode) => (
    <div className="min-h-[100dvh] bg-white text-[#151819] dark:bg-[#0c0f10] dark:text-white">
      <div className="grid min-h-[100dvh] md:grid-cols-[minmax(360px,46%)_1fr] xl:grid-cols-[minmax(480px,42%)_1fr]">
        <main className="relative flex min-h-[100dvh] items-center justify-center overflow-y-auto px-6 py-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),2rem)] sm:px-10 md:px-8 lg:px-12 xl:px-16">
          <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
            <LanguageSelector variant="compact" surface="light" />
            <button type="button" onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#00C597] hover:text-[#008f70] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00C597] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/70 dark:hover:border-[#00C597] dark:hover:text-white" aria-label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}>
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
          <div className="w-full max-w-[430px]">
            <div className="mb-9 md:mb-8 xl:mb-10">
              <img src={logoLight} alt="Dominex" className="h-auto w-[220px] max-w-[70%] object-contain dark:hidden" />
              <img src={logoDark} alt="Dominex" className="hidden h-auto w-[220px] max-w-[70%] object-contain dark:block" />
            </div>
            {content}
            <div className="mt-8"><SystemFooter variant={isDark ? 'dark' : 'light'} /></div>
          </div>
        </main>
        <LoginShowcase />
      </div>
    </div>
  );

  if (loading) {
    return authShell(
      <div aria-label="Carregando acesso" className="space-y-7">
        <div className="space-y-2"><div className="h-9 w-64 animate-pulse rounded bg-slate-200 dark:bg-white/10" /><div className="h-5 w-52 animate-pulse rounded bg-slate-100 dark:bg-white/[0.07]" /></div>
        <div className="space-y-5"><div className="space-y-2"><div className="h-3 w-14 animate-pulse rounded bg-slate-200 dark:bg-white/10" /><div className="h-12 w-full animate-pulse rounded-md bg-slate-100 dark:bg-white/[0.07]" /></div><div className="space-y-2"><div className="h-3 w-14 animate-pulse rounded bg-slate-200 dark:bg-white/10" /><div className="h-12 w-full animate-pulse rounded-md bg-slate-100 dark:bg-white/[0.07]" /></div><div className="h-12 w-full animate-pulse rounded-md bg-slate-200 dark:bg-white/10" /></div>
      </div>,
    );
  }

  return (
    <>
      {authShell(
        <>
          {!showForgotPassword && (
            <div className="mb-7">
              <h1 className="font-montserrat text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-[#151819] dark:text-white sm:text-[2.25rem]">Acesse sua conta</h1>
              <p className="mt-2 text-base text-slate-500 dark:text-white/60">Entre para continuar no Dominex.</p>
            </div>
          )}

          {showForgotPassword ? (
            <ForgotPasswordFlow initialEmail={form.getValues('email')} onBack={() => setShowForgotPassword(false)} />
          ) : (
            <div className="space-y-5">
              {authError && <Alert variant="destructive"><AlertDescription>{authError}</AlertDescription></Alert>}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4" autoComplete="on">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600 dark:text-white/65">{t.emailLabel}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/45" />
                          <Input {...field} type="email" placeholder={t.emailPlaceholder} autoComplete="email" autoCapitalize="none" autoFocus disabled={isLoading} className="h-12 rounded-md border-slate-200 bg-white pl-10 text-[#151819] placeholder:text-slate-400 focus-visible:border-[#00C597] focus-visible:ring-[#00C597]/15 dark:border-white/15 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/38" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="password" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-slate-600 dark:text-white/65">{t.passwordLabel}</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-white/45" />
                          <Input {...field} type={showPassword ? 'text' : 'password'} placeholder={t.passwordPlaceholder} autoComplete="current-password" disabled={isLoading} className="h-12 rounded-md border-slate-200 bg-white pl-10 pr-11 text-[#151819] placeholder:text-slate-400 focus-visible:border-[#00C597] focus-visible:ring-[#00C597]/15 dark:border-white/15 dark:bg-white/[0.05] dark:text-white dark:placeholder:text-white/38" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center text-slate-400 transition-colors hover:text-[#008f70] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#00C597] dark:text-white/45 dark:hover:text-white" disabled={isLoading} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="flex items-center justify-between gap-4">
                    <FormField control={form.control} name="rememberMe" render={({ field }) => (
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isLoading} className="border-slate-300 data-[state=checked]:border-[#00C597] data-[state=checked]:bg-[#00C597] dark:border-white/30" /></FormControl>
                        <FormLabel className="cursor-pointer text-xs text-slate-500 dark:text-white/55">{t.rememberMe}</FormLabel>
                      </FormItem>
                    )} />
                    <button type="button" onClick={() => setShowForgotPassword(true)} className="text-xs font-semibold text-[#008f70] transition-colors hover:text-[#006d56] hover:underline dark:text-[#00C597]" disabled={isLoading}>{t.forgotPassword}</button>
                  </div>

                  <Button type="submit" className="h-12 w-full rounded-md bg-[#151819] text-sm font-semibold text-white hover:bg-[#00A981] focus-visible:ring-[#00C597] dark:bg-[#00C597] dark:text-[#07110f] dark:hover:bg-[#16d7a9]" disabled={isLoading}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t.signingIn}</> : t.signIn}
                  </Button>
                </form>
              </Form>

              <OrDivider label={t.orDivider} />

              <button type="button" onClick={handleGoogleLogin} disabled={isLoading} className="flex h-12 w-full items-center justify-center gap-3 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.05] dark:text-white/80 dark:hover:bg-white/10">
                <GoogleIcon className="h-5 w-5" />{t.continueWithGoogle}
              </button>

              <div className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500 dark:border-white/10 dark:text-white/50">
                {t.noAccount}{' '}<Link to={localizeInternal('/cadastro', locale)} className="font-semibold text-[#008f70] transition-colors hover:text-[#006d56] hover:underline dark:text-[#00C597]">{t.signUp}</Link>
              </div>
            </div>
          )}
        </>,
      )}

      <SessionConfirmDialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen} existingSessions={existingSessionsInfo} disconnectOthers={disconnectOthers} onDisconnectOthersChange={setDisconnectOthers} onConfirm={handleSessionContinue} onCancel={handleSessionCancel} isLoading={isLoading} />
    </>
  );
}
