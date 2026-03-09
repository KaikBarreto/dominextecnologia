import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Edit, Trash2, AlertTriangle, Loader2, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import CompanyFormModal from '@/components/admin/CompanyFormModal';
import { cn } from '@/lib/utils';
import { cpfCnpjMask } from '@/utils/masks';

export default function AdminCompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  const { data: company, isLoading, refetch } = useQuery({
    queryKey: ['admin-company', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Master user (first user with admin role or first created)
  const { data: masterUser } = useQuery({
    queryKey: ['admin-company-master-user', id],
    queryFn: async () => {
      // Try admin role first
      const { data } = await supabase
        .from('profiles')
        .select('full_name, user_id')
        .eq('company_id', id!)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: originData } = useQuery({
    queryKey: ['company-origin', company?.origin],
    queryFn: async () => {
      if (!company?.origin) return null;
      const { data } = await supabase.from('company_origins').select('*').eq('name', company.origin).single();
      return data;
    },
    enabled: !!company?.origin,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').delete().eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Empresa excluída' });
      navigate('/admin/empresas');
    },
    onError: () => toast({ variant: 'destructive', title: 'Erro ao excluir' }),
  });

  const handleSaveNotes = async () => {
    if (!id) return;
    setIsSavingNotes(true);
    try {
      const { error } = await supabase.from('companies').update({ notes: notesValue || null }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Observações salvas!' });
      setIsEditingNotes(false);
      refetch();
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar' });
    } finally {
      setIsSavingNotes(false);
    }
  };

  if (isLoading || !company) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/empresas')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar para Empresas
        </Button>
        <div className="flex items-center gap-2">
          {company.phone && (
            <Button
              className="bg-[#25D366] hover:bg-[#25D366]/90 text-white gap-2"
              onClick={() => window.open(`https://wa.me/55${company.phone!.replace(/\D/g, '')}`, '_blank')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setShowEdit(true)}>
            <Edit className="h-4 w-4" /> Editar
          </Button>
          <Button variant="destructive" className="gap-2" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
        </div>
      </div>

      {/* Title */}
      <div>
        <h1 className="text-3xl font-bold">{company.name}</h1>
        <p className="text-muted-foreground break-all">{company.email}</p>
      </div>

      {/* Info cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Informações Gerais</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">CNPJ/CPF</span>
                <p className="font-medium">{company.cnpj ? cpfCnpjMask(company.cnpj) : 'N/A'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Telefone</span>
                <p className="font-medium">{company.phone || 'N/A'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Email</span>
                <p className="font-medium break-all">{company.email || 'N/A'}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Responsável</span>
                <p className="font-medium">{company.contact_name || masterUser?.full_name || 'N/A'}</p>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Endereço</span>
              <p className="font-medium">{company.address || 'N/A'}</p>
            </div>
            <div className="border-t pt-3 mt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Data de Cadastro</span>
                  <p className="font-medium">
                    {company.created_at ? format(new Date(company.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Origem</span>
                  {originData ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className="text-xs text-white border-0" style={{ backgroundColor: originData.color || undefined }}>
                        {originData.name}
                      </Badge>
                    </div>
                  ) : (
                    <p className="font-medium">{company.origin || 'N/A'}</p>
                  )}
                </div>
              </div>
            </div>
            {/* Notes */}
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Observações</span>
              {isEditingNotes ? (
                <div className="space-y-2 mt-1">
                  <Textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="Adicione observações..." className="resize-none text-sm" rows={3} autoFocus />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes} className="h-7 px-2 gap-1">
                      {isSavingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditingNotes(false)} className="h-7 px-2 gap-1">
                      <X className="h-3 w-3" /> Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1">
                  <p className="font-medium text-sm">{company.notes || 'Nenhuma'}</p>
                  <button onClick={() => { setNotesValue(company.notes || ''); setIsEditingNotes(true); }} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" title="Editar">
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Informações Financeiras</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                <div className="mt-0.5">
                  <Badge className={cn('text-xs text-white border-0',
                    company.subscription_status === 'active' ? 'bg-emerald-500 hover:bg-emerald-500'
                      : company.subscription_status === 'testing' ? 'bg-amber-500 hover:bg-amber-500'
                      : 'bg-rose-500 hover:bg-rose-500'
                  )}>
                    {company.subscription_status === 'active' ? 'Ativo' : company.subscription_status === 'testing' ? 'Testando' : 'Desativado'}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Plano</span>
                <p className="font-medium capitalize">{company.subscription_plan || 'N/A'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Valor Mensal</span>
                <p className="font-semibold text-lg text-primary">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(company.subscription_value || 0)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Ciclo</span>
                <p className="font-medium">{company.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'}</p>
              </div>
            </div>
            <div className="border-t pt-3 mt-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Vencimento</span>
                  <p className="font-medium">
                    {company.subscription_expires_at ? format(new Date(company.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Usuários</span>
                  <p className="font-medium">{company.max_users || 5}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { setShowDeleteDialog(open); if (!open) setDeleteConfirmText(''); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Confirmar Exclusão
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-left">
              <p className="text-sm">Excluir <strong className="text-foreground">{company.name}</strong>. Esta ação é irreversível.</p>
              <div className="space-y-2 pt-2">
                <Label>Digite o nome da empresa:</Label>
                <div className="rounded-md bg-muted p-3 mb-2">
                  <p className="text-sm font-semibold text-foreground">{company.name}</p>
                </div>
                <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Digite o nome" className="font-mono" />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              disabled={deleteConfirmText.trim() !== company.name?.trim() || deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Excluindo...</> : 'Excluir Empresa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CompanyFormModal
        open={showEdit}
        onOpenChange={setShowEdit}
        company={company}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['admin-company', id] });
          setShowEdit(false);
        }}
      />
    </div>
  );
}
