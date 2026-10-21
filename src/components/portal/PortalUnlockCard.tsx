import { useState, type FormEvent } from 'react';
import { Loader2, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorContrast';
import { supabaseAnon } from '@/integrations/supabase/anonClient';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';

/**
 * Fonte UNICA do login dos portais publicos (Cliente e Contrato/PMOC).
 *
 * Usado em tres lugares, com o MESMO tratamento de erro, de lockout e de
 * carregando:
 *  - `variant="page"`: portal inteiro protegido (`access: 'password_required'`),
 *    tela cheia sobre o DarkVeil.
 *  - `variant="inline"`: uma secao protegida dentro de um portal parcialmente
 *    aberto (`partial: true` + a chave em `locked_sections`).
 *  - `variant="plain"`: dentro de um modal/drawer (sem a casca de Card).
 *
 * A senha NUNCA sai daqui: o componente fala direto com a RPC de login (anon) e
 * devolve so o `session_token` pro pai.
 *
 * Serve os DOIS portais, sem componente gemeo (`loginRpc`):
 *  - `customer_portal_login`  — Portal do Cliente (`/portal/:token`), default.
 *  - `contract_portal_login`  — Portal do Contrato (`/contrato/unidade/:token`).
 * A senha e a sessao sao as MESMAS nos dois (uma senha por cliente), e o
 * tratamento de erro/lockout fica aqui, numa fonte so.
 */
interface PortalUnlockCardProps {
  /** Token publico do portal (`/portal/:token` ou `/contrato/unidade/:token`). */
  token: string;
  /**
   * Qual RPC de login chamar. Default = Portal do Cliente, pra nao mexer em
   * nenhuma das tres chamadas que ja existiam.
   */
  loginRpc?: 'customer_portal_login' | 'contract_portal_login';
  /** Locale ja resolvido pelo pai (contexto do portal ou detectMachineLocale). */
  locale: LocaleCode;
  /** Recebe a sessao recem-criada: o pai persiste e recarrega o portal. */
  onUnlocked: (sessionToken: string) => void | Promise<void>;
  variant?: 'page' | 'inline' | 'plain';
  /**
   * Cor de marca do portal (white-label). SO inline, nunca em CSS var global e
   * nunca cacheada: este portal pode ser de outro tenant que o dono do browser
   * (regra-lei anti-vazamento de white-label).
   */
  brandColor?: string | null;
  /** Sobrescreve o titulo (default: "Portal protegido"). */
  title?: string;
  /** Sobrescreve a descricao. */
  description?: string;
  /** Precisa ser unico quando ha mais de um card na mesma tela. */
  inputId?: string;
  autoFocus?: boolean;
  className?: string;
}

export function PortalUnlockCard({
  token,
  loginRpc = 'customer_portal_login',
  locale,
  onUnlocked,
  variant = 'inline',
  brandColor,
  title,
  description,
  inputId = 'customer-portal-login-password',
  autoFocus = false,
  className,
}: PortalUnlockCardProps) {
  const t = MESSAGES[locale].app.customers.portal;
  // Texto/ícone sobre a cor de marca seguem a luminância dela, não branco fixo:
  // tenant com marca clara (amarelo, lima) ficaria ilegível. Mesma régua do
  // cabeçalho do portal, que já usa `idealForeground(brandColor)`.
  const onBrand = brandColor ? idealForeground(brandColor) : undefined;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || submitting || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      // Dois ramos LITERAIS de propósito: `rpc(variavel)` não resolve o overload
      // tipado do supabase-js e cairia em `any`. Os args são iguais nas duas RPCs.
      const { data, error: rpcError } = loginRpc === 'contract_portal_login'
        ? await supabaseAnon.rpc('contract_portal_login', {
            p_token: token,
            p_password: password,
          })
        : await supabaseAnon.rpc('customer_portal_login', {
            p_token: token,
            p_password: password,
          });
      if (rpcError || !data || typeof data !== 'object') {
        setError(t.unlockErrorGeneric);
        return;
      }
      const result = data as Record<string, unknown>;
      if (result.ok !== true || typeof result.session_token !== 'string') {
        // Resposta neutra: o portal nunca diz "este cliente nao existe".
        setError(result.error === 'locked' ? t.unlockErrorLocked : t.unlockErrorInvalid);
        return;
      }
      const nextSession = result.session_token;
      setPassword('');
      await onUnlocked(nextSession);
    } catch {
      setError(t.unlockErrorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  // Tela cheia e o H1 da pagina; card de secao/modal entra como H2.
  const Heading = variant === 'page' ? 'h1' : 'h2';

  const body = (
    <div className={cn('space-y-6', variant === 'plain' ? 'p-1' : 'p-6')}>
      <div className="space-y-2 text-center">
        {/* No modal/drawer o titulo ja vem do proprio ResponsiveModal: nao
            repetimos cabecalho aqui, so a explicacao. */}
        {variant !== 'plain' && (
          <>
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"
              style={brandColor ? { backgroundColor: brandColor, color: onBrand } : undefined}
            >
              <LockKeyhole className="h-6 w-6" />
            </div>
            <Heading
              className={cn(
                'font-bold',
                variant === 'page' ? 'text-2xl' : 'text-lg',
              )}
            >
              {title ?? t.unlockTitle}
            </Heading>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          {description ?? t.unlockDesc}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={inputId}>{t.unlockPasswordLabel}</Label>
          <Input
            id={inputId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoFocus={autoFocus}
          />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button
          type="submit"
          className="w-full"
          disabled={submitting || !password}
          style={brandColor ? { backgroundColor: brandColor, color: onBrand } : undefined}
        >
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t.unlockSubmit}
        </Button>
      </form>
    </div>
  );

  if (variant === 'plain') return <div className={className}>{body}</div>;

  return (
    <Card
      className={cn(
        variant === 'page'
          ? 'relative z-10 w-full max-w-sm border-white/15 bg-background/95 shadow-2xl backdrop-blur'
          : 'mx-auto w-full max-w-sm',
        className,
      )}
    >
      <CardContent className="p-0">{body}</CardContent>
    </Card>
  );
}

export default PortalUnlockCard;
