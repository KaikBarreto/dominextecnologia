import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Edit, Trash2, AlertTriangle, Loader2, Pencil, X, Check, User as UserIcon, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import CompanyFormModal from '@/components/admin/CompanyFormModal';
import { CompanyPaymentHistory } from '@/components/admin/CompanyPaymentHistory';
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

  const { data: masterUser } = useQuery({
    queryKey: ['admin-company-master-user', id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('full_name, user_id')
        .eq('company_id', id!).order('created_at', { ascending: true }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: originData } = useQuery({
    queryKey: ['company-origin', company?.origin],
    queryFn: async () => {
      if (!company?.origin) return null;
      const { data } = await supabase.from('company_origins').select('*').eq('name', company.origin).maybeSingle();
      return data;
    },
    enabled: !!company?.origin,
  });

  const { data: salesperson } = useQuery({
    queryKey: ['admin-company-salesperson', company?.salesperson_id],
    queryFn: async () => {
      if (!company?.salesperson_id) return null;
      const { data } = await supabase.from('salespeople').select('id, name, referral_code').eq('id', company.salesperson_id).maybeSingle();
      return data;
    },
    enabled: !!company?.salesperson_id,
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

  const formatBRL = (v: number | null | undefined) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

  const hasPromo = company.custom_price != null && Number(company.custom_price) > 0;
  const promoActive = hasPromo && (
    company.custom_price_permanent ||
    (company.custom_price_months && (company.custom_price_payments_made || 0) < company.custom_price_months)
  );

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <Button variant="ghost" onClick={() => navigate('/admin/empresas')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar para Empresas
        </Button>
        <div className="flex items-center gap-2">
          {company.phone && (
            <Button className="bg-[#25D366] hover:bg-[#25D366]/90 text-white gap-2"
              onClick={() => window.open(`https://wa.me/55${company.phone!.replace(/\D/g, '')}`, '_blank')}>
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

      <div>
        <h1 className="text-3xl font-bold">{company.name}</h1>
        <p className="text-muted-foreground break-all">{company.email}</p>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="grid grid-cols-2 max-w-md">
          <TabsTrigger value="info">Informações</TabsTrigger>
          <TabsTrigger value="payments">Histórico de Pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6">
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
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Cadastro</span>
                      <p className="font-medium">
                        {company.created_at ? format(new Date(company.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Origem</span>
                      {originData ? (
                        <div className="mt-0.5">
                          <Badge className="text-xs text-white border-0" style={{ backgroundColor: originData.color || undefined }}>
                            {originData.name}
                          </Badge>
                        </div>
                      ) : <p className="font-medium">{company.origin || 'N/A'}</p>}
                    </div>
                  </div>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Vendedor</span>
                  <div className="mt-0.5">
                    {salesperson ? (
                      <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
                        <UserIcon className="h-3 w-3" /> {salesperson.name}
                        {salesperson.referral_code && <span className="text-muted-foreground/70 ml-1">({salesperson.referral_code})</span>}
                      </Badge>
                    ) : (
                      <p className="font-medium text-sm text-muted-foreground">Sem vendedor</p>
                    )}
                  </div>
                </div>
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
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Valor</span>
                    <div className="mt-0.5">
                      {promoActive ? (
                        <>
                          <p className="font-semibold text-lg text-amber-600">
                            {formatBRL(Number(company.custom_price))}
                            <span className="text-xs text-muted-foreground ml-1">{company.billing_cycle === 'yearly' ? '/ano' : '/mês'}</span>
                          </p>
                          {Number(company.subscription_value || 0) > 0 && (
                            <p className="text-xs line-through text-muted-foreground">{formatBRL(company.subscription_value)}</p>
                          )}
                        </>
                      ) : (
                        <p className="font-semibold text-lg text-primary">
                          {formatBRL(company.subscription_value)}
                          <span className="text-xs text-muted-foreground ml-1">{company.billing_cycle === 'yearly' ? '/ano' : '/mês'}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Ciclo</span>
                    <p className="font-medium">{company.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'}</p>
                  </div>
                </div>
                {promoActive && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
                    <Gift className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-semibold text-amber-700">Promoção ativa</p>
                      <p className="text-muted-foreground">
                        {company.custom_price_permanent
                          ? 'Preço permanente'
                          : `${company.custom_price_payments_made || 0} de ${company.custom_price_months} pagamentos promocionais realizados`}
                      </p>
                    </div>
                  </div>
                )}
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
        </TabsContent>

        <TabsContent value="payments" className="mt-6">
          <CompanyPaymentHistory companyId={company.id} companyName={company.name} />
        </TabsContent>
      </Tabs>

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
