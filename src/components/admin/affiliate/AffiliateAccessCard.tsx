import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Mail, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';
import {
  useCreateAffiliateAccess,
  useResetAffiliatePassword,
  useRevokeAffiliateAccess,
  type Affiliate,
} from '@/hooks/useAffiliateData';

/**
 * Card "Acesso do afiliado" da ficha do afiliado.
 *
 * O afiliado é um parceiro EXTERNO: a conta criada aqui NÃO ganha nenhuma linha
 * em `admin_permissions` (isso o tornaria `is_admin_user()` no SQL e abriria as
 * policies amplas do painel master), nenhuma role e nenhum `company_id`. O que
 * ele enxerga vem só do vínculo `affiliates.user_id`, via as policies de
 * self-scope (`current_affiliate_id()`): a própria ficha, as próprias comissões
 * e repasses, e as empresas/pagamentos da própria carteira.
 *
 * O card não aparece pro próprio afiliado (`readOnly`) — ninguém administra o
 * próprio acesso.
 *
 * ⚠️ E-mail exibido: `auth.users` não é legível por RLS no client, então a edge
 * alinha `affiliates.email` ao e-mail usado na criação do acesso. É esse campo
 * que aparece abaixo como "e-mail de acesso", e é por isso que o modal avisa
 * que o e-mail informado passa a ser o e-mail de cadastro do afiliado.
 */

/** Mesma régua de `CompanyFormModal` — sem caracteres ambíguos (O/0, l/1/I). */
function generatePassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2">
        <KeyRound className="h-4 w-4" />
        {label}
      </Label>
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <PasswordInput
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Crie uma senha segura"
            autoComplete="new-password"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={() => onChange(generatePassword(10))}
          title="Gerar senha aleatória"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <PasswordStrengthIndicator password={value} />
    </div>
  );
}

function CreateAccessModal({
  open,
  onOpenChange,
  affiliate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  affiliate: Affiliate;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const createAccess = useCreateAffiliateAccess();

  useEffect(() => {
    if (open) {
      setEmail(affiliate.email ?? '');
      setPassword('');
      setCopied(false);
    }
  }, [open, affiliate.email]);

  const canSubmit = email.trim().length > 3 && isPasswordStrong(password);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`E-mail: ${email.trim()}\nSenha: ${password}`);
      setCopied(true);
      toast.success('Credenciais copiadas');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const handleCreate = async () => {
    try {
      await createAccess.mutateAsync({
        affiliateId: affiliate.id,
        email: email.trim(),
        password,
        fullName: affiliate.name,
      });
      onOpenChange(false);
    } catch {
      // toast de erro já disparado pelo onError do hook
    }
  };

  const footer = (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => onOpenChange(false)}
        disabled={createAccess.isPending}
      >
        Cancelar
      </Button>
      <Button
        type="button"
        className="flex-1"
        onClick={handleCreate}
        disabled={!canSubmit || createAccess.isPending}
      >
        {createAccess.isPending ? 'Criando...' : 'Criar acesso'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Criar acesso do afiliado"
      description={`Credenciais de login de ${affiliate.name}.`}
      footer={footer}
    >
      <div className="space-y-4 py-1">
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary">
            <ShieldCheck className="h-4 w-4 text-primary-foreground" />
          </span>
          <p className="text-sm text-muted-foreground">
            Com esse login o afiliado vê <span className="font-medium text-foreground">só a
            carteira dele</span>: os clientes que ele indicou, as comissões dele e os repasses
            recebidos. Ele não tem acesso ao resto do painel.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="affiliate-access-email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            E-mail de acesso *
          </Label>
          <Input
            id="affiliate-access-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="afiliado@email.com"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Este e-mail passa a ser o e-mail de cadastro do afiliado, e é com ele que o afiliado
            entra no sistema.
          </p>
        </div>

        <PasswordField
          id="affiliate-access-password"
          label="Senha *"
          value={password}
          onChange={setPassword}
        />

        {email.trim() && password && (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copiar credenciais
              </>
            )}
          </Button>
        )}
      </div>
    </ResponsiveModal>
  );
}

function ResetPasswordModal({
  open,
  onOpenChange,
  affiliate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  affiliate: Affiliate;
}) {
  const [password, setPassword] = useState('');
  const resetPassword = useResetAffiliatePassword();

  useEffect(() => {
    if (open) setPassword('');
  }, [open]);

  const handleReset = async () => {
    try {
      await resetPassword.mutateAsync({ affiliateId: affiliate.id, password });
      onOpenChange(false);
    } catch {
      // toast de erro já disparado pelo onError do hook
    }
  };

  const footer = (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => onOpenChange(false)}
        disabled={resetPassword.isPending}
      >
        Cancelar
      </Button>
      <Button
        type="button"
        className="flex-1"
        onClick={handleReset}
        disabled={!isPasswordStrong(password) || resetPassword.isPending}
      >
        {resetPassword.isPending ? 'Salvando...' : 'Redefinir senha'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Redefinir senha do afiliado"
      description={`A nova senha passa a valer na hora para ${affiliate.name}.`}
      footer={footer}
    >
      <div className="space-y-4 py-1">
        <PasswordField
          id="affiliate-reset-password"
          label="Nova senha *"
          value={password}
          onChange={setPassword}
        />
        <p className="text-xs text-muted-foreground">
          O e-mail de acesso não muda. Combine a nova senha com o afiliado antes de salvar: ele é
          desconectado na próxima vez que o app validar a sessão.
        </p>
      </div>
    </ResponsiveModal>
  );
}

export function AffiliateAccessCard({
  affiliate,
  readOnly,
}: {
  affiliate: Affiliate;
  /** `true` pro próprio afiliado — ninguém administra o próprio acesso. */
  readOnly: boolean;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isRevokeOpen, setIsRevokeOpen] = useState(false);
  const revokeAccess = useRevokeAffiliateAccess();

  if (readOnly) return null;

  const hasAccess = !!affiliate.user_id;

  const handleRevoke = async () => {
    try {
      await revokeAccess.mutateAsync(affiliate.id);
      setIsRevokeOpen(false);
    } catch {
      // toast de erro já disparado pelo onError do hook
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex min-w-0 items-center gap-2">
              <KeyRound className="h-4 w-4 shrink-0" />
              <span className="truncate">Acesso do afiliado</span>
            </span>
            {hasAccess ? (
              <Badge variant="success" className="shrink-0">
                Com acesso
              </Badge>
            ) : (
              <Badge variant="muted" className="shrink-0">
                Sem acesso
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAccess ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">E-mail de acesso</p>
                <p className="truncate font-medium">{affiliate.email || '—'}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button variant="outline" onClick={() => setIsResetOpen(true)} className="gap-2">
                  <KeyRound className="h-4 w-4" />
                  Redefinir senha
                </Button>
                <Button
                  variant="destructive-ghost"
                  onClick={() => setIsRevokeOpen(true)}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover acesso
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Este afiliado ainda não entra no sistema. Crie um login para ele acompanhar a
                carteira e as comissões dele.
              </p>
              <Button onClick={() => setIsCreateOpen(true)} className="w-full gap-2 sm:w-auto">
                <KeyRound className="h-4 w-4" />
                Criar acesso
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {!hasAccess && (
        <CreateAccessModal open={isCreateOpen} onOpenChange={setIsCreateOpen} affiliate={affiliate} />
      )}

      {hasAccess && (
        <ResetPasswordModal open={isResetOpen} onOpenChange={setIsResetOpen} affiliate={affiliate} />
      )}

      <AlertDialog
        open={isRevokeOpen}
        onOpenChange={(o) => {
          if (!o) setIsRevokeOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover o acesso de {affiliate.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele perde o login e deixa de acompanhar a carteira pelo sistema. O histórico de
              comissões e repasses continua todo aqui, e o vínculo das empresas indicadas não muda.
              Você pode criar um acesso novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeAccess.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={revokeAccess.isPending}
              onClick={(e) => {
                e.preventDefault();
                handleRevoke();
              }}
            >
              {revokeAccess.isPending ? 'Removendo...' : 'Remover acesso'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
