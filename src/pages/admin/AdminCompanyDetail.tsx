import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Building2, Mail, Phone, MapPin, Calendar, CreditCard, Users, Edit, Trash2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import CompanyFormModal from '@/components/admin/CompanyFormModal';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  testing: { label: 'Em Teste', className: 'bg-blue-500 text-white' },
  active: { label: 'Ativa', className: 'bg-green-500 text-white' },
  inactive: { label: 'Inativa', className: 'bg-destructive text-white' },
};

export default function AdminCompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [notes, setNotes] = useState('');
  const [notesLoaded, setNotesLoaded] = useState(false);

  const { data: company, isLoading } = useQuery({
    queryKey: ['admin-company', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      if (!notesLoaded) {
        setNotes(data.notes || '');
        setNotesLoaded(true);
      }
      return data;
    },
    enabled: !!id,
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

  const saveNotesMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('companies').update({ notes }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: 'Observações salvas' });
      queryClient.invalidateQueries({ queryKey: ['admin-company', id] });
    },
  });

  if (isLoading || !company) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const st = STATUS_CONFIG[company.subscription_status] || STATUS_CONFIG.inactive;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/empresas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <Badge className={st.className}>{st.label}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          {company.phone && (
            <Button variant="outline" size="sm" className="gap-2" asChild>
              <a href={`https://wa.me/${company.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" /> WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowEdit(true)}>
            <Edit className="h-4 w-4" /> Editar
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-2">
                <Trash2 className="h-4 w-4" /> Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação é irreversível. Todos os dados da empresa "{company.name}" serão perdidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Informações Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { icon: Building2, label: 'CNPJ', value: company.cnpj },
              { icon: Mail, label: 'Email', value: company.email },
              { icon: Phone, label: 'Telefone', value: company.phone },
              { icon: MapPin, label: 'Endereço', value: company.address },
              { icon: Users, label: 'Responsável', value: company.contact_name },
              { icon: Calendar, label: 'Cadastro', value: company.created_at ? format(new Date(company.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-' },
              { icon: Users, label: 'Origem', value: company.origin },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3 text-sm">
                <item.icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">{item.label}: </span>
                  <span className="font-medium">{item.value || '-'}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Plano', value: company.subscription_plan?.charAt(0).toUpperCase() + company.subscription_plan?.slice(1) },
              { label: 'Valor', value: company.subscription_value > 0 ? `R$ ${Number(company.subscription_value).toFixed(2).replace('.', ',')}` : 'Grátis' },
              { label: 'Ciclo', value: company.billing_cycle === 'yearly' ? 'Anual' : 'Mensal' },
              { label: 'Máx Usuários', value: company.max_users },
              { label: 'Vencimento', value: company.subscription_expires_at ? format(new Date(company.subscription_expires_at), 'dd/MM/yyyy') : '-' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium">{item.value || '-'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Observações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Adicione observações sobre esta empresa..."
            rows={4}
          />
          <Button size="sm" onClick={() => saveNotesMutation.mutate()} disabled={saveNotesMutation.isPending}>
            {saveNotesMutation.isPending ? 'Salvando...' : 'Salvar observações'}
          </Button>
        </CardContent>
      </Card>

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
