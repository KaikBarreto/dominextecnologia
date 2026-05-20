// AddAccountModal — form de login que SALVA a sessão atual antes de entrar
// na nova conta. Toda a lógica defensiva (snapshot, rollback em erro) está
// dentro de `useSavedAccounts.addAccountAndSwitch`.
//
// Não oferecemos "esqueci a senha" / social aqui de propósito — esse modal
// é só pra ADICIONAR conta ao switcher. Recuperação de senha vive em /auth.

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSavedAccounts } from '@/hooks/useSavedAccounts';

interface AddAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AddAccountModal({ open, onOpenChange }: AddAccountModalProps) {
  const { addAccountAndSwitch, isSwitching } = useSavedAccounts();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setPassword('');
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Informe um email válido.');
      return;
    }
    if (password.length === 0) {
      setError('Informe a senha.');
      return;
    }

    setSubmitting(true);
    try {
      await addAccountAndSwitch(email.trim(), password);
      // Em caso de sucesso, o hook chama window.location.reload() — não
      // alcançamos esse ponto. Mas mantemos o close defensivo.
      onOpenChange(false);
      reset();
    } catch {
      setError('Email ou senha incorretos.');
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || isSwitching;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar outra conta</DialogTitle>
          <DialogDescription>
            Sua conta atual será salva no menu para você voltar depois com um clique.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="add-account-email">Email</Label>
            <Input
              id="add-account-email"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="add-account-password">Senha</Label>
            <Input
              id="add-account-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={disabled}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={disabled}>
              {disabled && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Adicionar e entrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
