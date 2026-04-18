import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Download, Trash2, Shield } from 'lucide-react';

export default function MyData() {
  const { user, profile, signOut } = useAuth();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [deletionRequested, setDeletionRequested] = useState(false);

  const handleExportData = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const [profileRes, rolesRes, consentsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('user_roles').select('*').eq('user_id', user.id),
        supabase.from('consent_records' as any).select('*').eq('user_id', user.id),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email, created_at: user.created_at },
        profile: profileRes.data,
        roles: rolesRes.data,
        consent_records: consentsRes.data,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meus-dados-dominex-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'Dados exportados com sucesso!' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao exportar dados' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!user) return;
    setIsRequesting(true);
    try {
      await supabase
        .from('profiles')
        .update({ deletion_requested_at: new Date().toISOString() } as any)
        .eq('user_id', user.id);

      setDeletionRequested(true);
      toast({
        title: 'Solicitação de exclusão enviada',
        description: 'Nossa equipe processará sua solicitação em até 15 dias úteis conforme o Art. 18 da LGPD.',
      });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao registrar solicitação' });
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">← Voltar ao painel</Link>
        </div>

        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Central de Privacidade</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus dados pessoais (Art. 18 LGPD)</p>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seus dados pessoais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><strong>Nome:</strong> {profile?.full_name || '—'}</p>
              <p><strong>E-mail:</strong> {user?.email || '—'}</p>
              <p><strong>Telefone:</strong> {profile?.phone || '—'}</p>
              <p><strong>Conta criada em:</strong> {user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4" />
                Exportar meus dados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Baixe uma cópia dos seus dados em formato JSON (portabilidade — Art. 18 V LGPD).
              </p>
              <Button onClick={handleExportData} disabled={isExporting} variant="outline">
                {isExporting ? 'Exportando...' : 'Baixar meus dados'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                Solicitar exclusão da conta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Solicite a exclusão permanente da sua conta e dados pessoais (Art. 18 VI LGPD).
                Dados fiscais e contábeis podem ser mantidos pelo prazo legal (5 anos).
                O processamento ocorre em até 15 dias úteis.
              </p>
              {deletionRequested ? (
                <p className="text-sm text-green-600 font-medium">
                  ✓ Solicitação registrada. Nossa equipe entrará em contato.
                </p>
              ) : (
                <Button
                  variant="destructive"
                  onClick={handleRequestDeletion}
                  disabled={isRequesting}
                >
                  {isRequesting ? 'Registrando...' : 'Solicitar exclusão'}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contato com o DPO</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Para exercer outros direitos (correção, portabilidade, revogação de consentimento) ou tirar dúvidas sobre o tratamento dos seus dados:
              </p>
              <a
                href="mailto:privacidade@dominex.com.br"
                className="text-sm text-primary underline"
              >
                privacidade@dominex.com.br
              </a>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            <Link to="/privacidade" className="underline">Política de Privacidade</Link>
            {' · '}
            <Link to="/termos" className="underline">Termos de Uso</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
