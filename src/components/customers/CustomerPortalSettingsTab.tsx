import { useState } from 'react';
import {
  Check,
  Clipboard,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  MonitorSmartphone,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type {
  CustomerPortalPermissions,
  CustomerPortalSettings,
} from '@/hooks/useCustomerPortalSettings';
import {
  buildCustomerPortalUrl,
  DEFAULT_CUSTOMER_PORTAL_PUBLIC_SECTIONS,
} from '@/hooks/useCustomerPortalSettings';

const PERMISSION_OPTIONS: Array<{
  key: keyof CustomerPortalPermissions;
  title: string;
  description: string;
}> = [
  {
    key: 'service_orders',
    title: 'Ordens de serviço',
    description: 'Status, histórico, acompanhamento e relatórios das OS.',
  },
  {
    key: 'equipment',
    title: 'Equipamentos',
    description: 'Cadastro, histórico e anexos liberados de cada equipamento.',
  },
  {
    key: 'contracts',
    title: 'Contratos',
    description: 'Contratos ativos e acesso ao portal de manutenção/PMOC.',
  },
  {
    key: 'charges',
    title: 'Cobranças',
    description: 'Valores, vencimentos, status e link para pagamento.',
  },
  {
    key: 'invoices',
    title: 'Notas fiscais',
    description: 'NFS-e emitidas no Dominex e notas externas liberadas para o cliente.',
  },
  {
    key: 'documents',
    title: 'Documentos',
    description: 'Contratos, anexos e documentos avulsos publicados para o cliente.',
  },
  {
    key: 'ticket_requests',
    title: 'Abrir chamados',
    description: 'Permite solicitar uma nova manutenção pelo portal.',
  },
];

/**
 * Os 3 estados de uma seção do portal. Só aparecem quando a proteção por senha
 * está LIGADA — com senha desligada a tela continua sendo o switch de sempre
 * (a esmagadora maioria dos tenants não usa senha e não pode sentir diferença).
 */
type SectionAccess = 'hidden' | 'public' | 'password';

const ACCESS_CHOICES: Array<{
  value: SectionAccess;
  label: string;
  /** Pílula ativa: fill saturado + texto branco (régua de UI). */
  activeClass: string;
}> = [
  { value: 'hidden', label: 'Oculto', activeClass: 'bg-muted-foreground text-white' },
  { value: 'public', label: 'Sem senha', activeClass: 'bg-warning text-white' },
  { value: 'password', label: 'Com senha', activeClass: 'bg-primary text-white' },
];

interface CustomerPortalSettingsTabProps {
  settings: CustomerPortalSettings;
  onSettingsChange: (settings: CustomerPortalSettings) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  passwordConfirmation: string;
  onPasswordConfirmationChange: (password: string) => void;
  isEditing: boolean;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function CustomerPortalSettingsTab({
  settings,
  onSettingsChange,
  password,
  onPasswordChange,
  passwordConfirmation,
  onPasswordConfirmationChange,
  isEditing,
  isLoading,
  error,
  onRetry,
}: CustomerPortalSettingsTabProps) {
  const [copied, setCopied] = useState(false);
  const portalUrl = settings.token ? buildCustomerPortalUrl(settings.token) : null;

  const update = (patch: Partial<CustomerPortalSettings>) => {
    onSettingsChange({ ...settings, ...patch });
  };

  const publicSections = settings.publicSections ?? DEFAULT_CUSTOMER_PORTAL_PUBLIC_SECTIONS;

  const updatePermission = (key: keyof CustomerPortalPermissions, checked: boolean) => {
    update({ permissions: { ...settings.permissions, [key]: checked } });
  };

  const resolveAccess = (key: keyof CustomerPortalPermissions): SectionAccess => {
    if (!settings.permissions[key]) return 'hidden';
    return publicSections[key] ? 'public' : 'password';
  };

  const updateAccess = (key: keyof CustomerPortalPermissions, access: SectionAccess) => {
    update({
      permissions: { ...settings.permissions, [key]: access !== 'hidden' },
      publicSections: { ...publicSections, [key]: access === 'public' },
    });
  };

  const copyLink = async () => {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Não foi possível carregar as configurações do portal.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MonitorSmartphone className="h-4 w-4" />
            Portal do cliente
          </CardTitle>
          <CardDescription>
            Controle o acesso deste cliente e compartilhe somente o que ele precisa acompanhar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/20 p-3">
            <div className="space-y-1">
              <Label htmlFor="customer-portal-active" className="font-medium">Portal ativo</Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Desligado, o link deixa de entregar qualquer dado e não aceita novos chamados.
              </p>
            </div>
            <Switch
              id="customer-portal-active"
              checked={settings.isActive}
              onCheckedChange={(isActive) => update({ isActive })}
              aria-label="Portal ativo"
            />
          </div>

          {portalUrl ? (
            <div className="space-y-2">
              <Label htmlFor="customer-portal-url">Link do portal</Label>
              <div className="flex gap-2">
                <Input id="customer-portal-url" value={portalUrl} readOnly className="font-mono text-xs" />
                <Button type="button" variant="outline" size="icon" onClick={copyLink} title="Copiar link">
                  {copied ? <Check className="h-4 w-4 text-success" /> : <Clipboard className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(portalUrl, '_blank', 'noopener,noreferrer')}
                  title="Abrir portal"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              O link exclusivo será criado automaticamente quando você salvar o novo cliente.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={!settings.isActive ? 'opacity-60' : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <LockKeyhole className="h-4 w-4" />
            Proteção por senha
          </CardTitle>
          <CardDescription>
            Sem senha, qualquer pessoa com o link consegue abrir o portal. Com senha, os dados só saem do servidor após o login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="customer-portal-password-enabled">Exigir senha para entrar</Label>
            </div>
            <Switch
              id="customer-portal-password-enabled"
              checked={settings.passwordEnabled}
              onCheckedChange={(passwordEnabled) => update({ passwordEnabled })}
              disabled={!settings.isActive}
              aria-label="Exigir senha para entrar"
            />
          </div>

          {settings.passwordEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-portal-password">
                  {settings.passwordConfigured && isEditing ? 'Nova senha' : 'Senha'}
                </Label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="customer-portal-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    placeholder={settings.passwordConfigured && isEditing ? 'Em branco mantém a atual' : 'Mínimo de 8 caracteres'}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customer-portal-password-confirmation">Confirmar senha</Label>
                <Input
                  id="customer-portal-password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  value={passwordConfirmation}
                  onChange={(event) => onPasswordConfirmationChange(event.target.value)}
                  placeholder="Digite novamente"
                  disabled={!password}
                />
              </div>
              {settings.passwordConfigured && isEditing && !password && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  A senha atual nunca é exibida. Deixe os campos em branco para mantê-la.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={!settings.isActive ? 'opacity-60' : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">O que o cliente pode ver</CardTitle>
          <CardDescription>
            As restrições são aplicadas no servidor; conteúdo desligado não é enviado ao navegador do cliente.
          </CardDescription>
          {/* Linha de ajuda SO com senha ligada: com senha desligada este card
              continua sendo, pixel a pixel, o de sempre. */}
          {settings.passwordEnabled && (
            <p className="mt-2 rounded-lg border border-dashed bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              Com a senha ligada, escolha o que aparece sem pedir login. Assim o mesmo link serve
              para a portaria e para o síndico.
            </p>
          )}
        </CardHeader>
        <CardContent className="divide-y rounded-lg border px-3">
          {PERMISSION_OPTIONS.map((option) => {
            const access = resolveAccess(option.key);
            return (
              <div
                key={option.key}
                  className={cn(
                    'flex py-3',
                    // Senha DESLIGADA = linha de sempre (switch na direita, inclusive
                    // no mobile). So o seletor de 3 estados empilha no celular, porque
                    // nao cabe ao lado do titulo em 390px.
                    settings.passwordEnabled
                      ? 'flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4'
                      : 'items-start justify-between gap-4',
                  )}
                >
                  <div className={cn('space-y-0.5', settings.passwordEnabled && 'min-w-0')}>
                    <Label htmlFor={`customer-portal-${option.key}`}>{option.title}</Label>
                    <p className="text-xs leading-relaxed text-muted-foreground">{option.description}</p>
                  </div>

                  {settings.passwordEnabled ? (
                    <div
                      role="group"
                      aria-label={option.title}
                      className="grid w-full min-w-0 shrink-0 grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-1 sm:w-auto"
                    >
                      {ACCESS_CHOICES.map((choice) => {
                        const isActive = access === choice.value;
                        return (
                          <button
                            key={choice.value}
                            type="button"
                            aria-pressed={isActive}
                            disabled={!settings.isActive}
                            onClick={() => updateAccess(option.key, choice.value)}
                            className={cn(
                              'min-w-0 truncate rounded-md px-2 py-1.5 text-xs font-semibold transition-colors',
                              'disabled:cursor-not-allowed disabled:opacity-60',
                              isActive
                                ? choice.activeClass
                                : 'border border-border bg-card text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {choice.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Switch
                      id={`customer-portal-${option.key}`}
                      checked={settings.permissions[option.key]}
                      onCheckedChange={(checked) => updatePermission(option.key, checked)}
                      disabled={!settings.isActive}
                      aria-label={option.title}
                    />
                  )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
