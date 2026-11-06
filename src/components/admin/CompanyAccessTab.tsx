import { useEffect, useState } from 'react';
import { Copy, Link2, Loader2, Shield } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAdminPermissions } from '@/hooks/useAdminPermissions';
import {
  useAdminCompanyAccessUsers,
  useGenerateAdminCompanyResetLink,
} from '@/hooks/useAdminCompanyAccess';

interface CompanyAccessTabProps {
  companyId: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function CompanyAccessTab({ companyId }: CompanyAccessTabProps) {
  const { toast } = useToast();
  const { hasFunctionAccess } = useAdminPermissions();
  const canManageAccess = hasFunctionAccess('admin_empresas_acesso');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const usersQuery = useAdminCompanyAccessUsers(companyId, canManageAccess);
  const generateLink = useGenerateAdminCompanyResetLink();

  useEffect(() => {
    setSelectedUserId('');
    setGeneratedLink('');
  }, [companyId]);

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    setGeneratedLink('');
  };

  const handleGenerate = () => {
    if (!selectedUserId) return;
    generateLink.mutate(
      { companyId, userId: selectedUserId },
      {
        onSuccess: (link) => {
          setGeneratedLink(link);
          toast({
            title: 'Link gerado!',
            description: 'Use o botão “Copiar link” para compartilhar com o usuário.',
          });
        },
        onError: (error: Error) => {
          toast({
            variant: 'destructive',
            title: 'Erro ao gerar link',
            description: error.message,
          });
        },
      },
    );
  };

  const handleCopy = async () => {
    if (!generatedLink) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard indisponível');
      await navigator.clipboard.writeText(generatedLink);
      toast({ title: 'Link copiado!' });
    } catch {
      const input = document.getElementById('generated-company-reset-link') as HTMLInputElement | null;
      input?.focus();
      input?.select();

      try {
        if (document.execCommand?.('copy')) {
          toast({ title: 'Link copiado!' });
          return;
        }
      } catch {
        // O link permanece selecionado para cópia manual.
      }

      toast({
        title: 'Link selecionado',
        description: 'Copie o texto selecionado para compartilhar com o usuário.',
      });
    }
  };

  if (!canManageAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <div className="rounded-full bg-muted p-3">
          <Shield className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">
          A geração de links de redefinição de senha está disponível apenas para usuários autorizados da plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted p-4">
        <p className="text-sm text-muted-foreground">
          Gere um link seguro e de uso único para que um usuário desta empresa redefina a própria senha.
          O link expira em 60 minutos.
        </p>
        <p className="mt-2 text-xs font-medium text-foreground">
          Esta ação é aplicada imediatamente e não depende do botão “Salvar alterações”.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="company-user-reset">Usuário da empresa</Label>
        <Select value={selectedUserId} onValueChange={handleUserChange} disabled={usersQuery.isLoading}>
          <SelectTrigger id="company-user-reset">
            <SelectValue placeholder={usersQuery.isLoading ? 'Carregando usuários...' : 'Selecione um usuário'} />
          </SelectTrigger>
          <SelectContent>
            {(usersQuery.data ?? []).map((user) => {
              const displayName = user.full_name || user.email;
              return (
                <SelectItem key={user.id} value={user.id}>
                  <span className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={displayName} /> : null}
                      <AvatarFallback className="text-[9px]">{initials(displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 truncate">
                      {user.full_name ? `${user.full_name} (${user.email})` : user.email}
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {usersQuery.isError && (
          <p className="text-xs text-destructive">Não foi possível carregar os usuários desta empresa.</p>
        )}
        {!usersQuery.isLoading && !usersQuery.isError && (usersQuery.data?.length ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum usuário com e-mail de acesso foi encontrado nesta empresa.</p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={handleGenerate}
          disabled={!selectedUserId || generateLink.isPending || usersQuery.isLoading}
          className="bg-foreground text-background hover:bg-foreground/90 hover:text-background sm:flex-1"
        >
          {generateLink.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="mr-2 h-4 w-4" />
          )}
          Gerar link de redefinição
        </Button>
        <Button type="button" variant="outline" onClick={handleCopy} disabled={!generatedLink}>
          <Copy className="mr-2 h-4 w-4" />
          Copiar link
        </Button>
      </div>

      {generatedLink && (
        <div className="space-y-2">
          <Label htmlFor="generated-company-reset-link">Link gerado</Label>
          <Input id="generated-company-reset-link" value={generatedLink} readOnly />
        </div>
      )}
    </div>
  );
}
