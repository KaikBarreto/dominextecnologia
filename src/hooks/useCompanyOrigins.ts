import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export interface CompanyOrigin {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  created_at: string | null;
  /** Texto curto que o cliente final lê no cadastro público. */
  description: string | null;
  /** Liga a origem na etapa Origem do cadastro público (via get_signup_origins). */
  show_in_signup: boolean;
  /** Ordem de exibição (menor primeiro). */
  sort_order: number;
}

/** Campos editáveis da origem (nome é o único obrigatório na criação). */
interface OriginFields {
  name?: string;
  icon?: string;
  color?: string;
  description?: string | null;
  show_in_signup?: boolean;
  sort_order?: number;
}

/** Quantas empresas e leads do painel apontam pra um nome de origem. */
export interface OriginUsage {
  companies: number;
  leads: number;
  total: number;
}

function isDuplicateOriginError(e: any): boolean {
  if (!e) return false;
  if (e.code === '23505') return true;
  const msg = String(e.message || '').toLowerCase();
  return msg.includes('duplicate key') || msg.includes('company_origins_name_unique');
}

/**
 * `ilike` sem curinga = igualdade case-insensitive, que é a régua de casamento de
 * origem do painel (ver src/utils/companyOriginCatalog.ts). Mas `%` e `_` dentro
 * do nome viram curinga de verdade e contariam linha errada, então escapam aqui.
 */
function ilikeLiteral(value: string): string {
  return value.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function useCompanyOrigins() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['company-origins'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_origins')
        .select('*')
        // Ordem configurada no painel master manda; nome é só o desempate.
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as CompanyOrigin[];
    },
  });

  const createOrigin = useMutation({
    mutationFn: async (input: OriginFields & { name: string }) => {
      const { data, error } = await supabase.from('company_origins').insert(input).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-origins'] }); toast({ title: 'Origem criada!' }); },
    onError: (e) => {
      if (isDuplicateOriginError(e)) {
        toast({ variant: 'destructive', title: 'Nome já utilizado', description: 'Já existe uma origem com esse nome. Escolha outro nome.' });
        return;
      }
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) });
    },
  });

  const updateOrigin = useMutation({
    mutationFn: async ({ id, ...input }: OriginFields & { id: string }) => {
      const { error } = await supabase.from('company_origins').update(input).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-origins'] });
      // Renomear propaga pro histórico (trigger no banco): a listagem de
      // empresas e o CRM do painel precisam recarregar pra não exibir o nome
      // antigo até o próximo refresh.
      qc.invalidateQueries({ queryKey: ['admin-companies'] });
      qc.invalidateQueries({ queryKey: ['admin-leads'] });
      toast({ title: 'Origem atualizada!' });
    },
    onError: (e) => {
      if (isDuplicateOriginError(e)) {
        toast({ variant: 'destructive', title: 'Nome já utilizado', description: 'Já existe uma origem com esse nome. Escolha outro nome.' });
        return;
      }
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) });
    },
  });

  /**
   * Conta o uso de um nome de origem no histórico.
   *
   * Existe porque a trigger do banco cobre RENOMEAR, não EXCLUIR: apagar uma
   * origem em uso deixa `companies.origin` / `admin_leads.source` apontando pra
   * um nome que não existe mais, que é exatamente o bug do badge sem cor. A tela
   * usa esta contagem pra exigir uma decisão antes de excluir.
   */
  const countOriginUsage = async (name: string): Promise<OriginUsage> => {
    const pattern = ilikeLiteral(name);
    const [companiesRes, leadsRes] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact', head: true }).ilike('origin', pattern),
      supabase.from('admin_leads').select('id', { count: 'exact', head: true }).ilike('source', pattern),
    ]);
    if (companiesRes.error) throw companiesRes.error;
    if (leadsRes.error) throw leadsRes.error;
    const companies = companiesRes.count || 0;
    const leads = leadsRes.count || 0;
    return { companies, leads, total: companies + leads };
  };

  const deleteOrigin = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('company_origins').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['company-origins'] }); toast({ title: 'Origem removida!' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  /**
   * Move o histórico pra outra origem e só então exclui.
   *
   * Ordem importa: primeiro reatribui empresas e leads, por último apaga a linha
   * do catálogo. Se algo falhar no meio, a origem continua existindo e nada fica
   * órfão — o pior caso é parte do histórico já apontando pro destino, que é um
   * nome válido do catálogo.
   *
   * A reconferência antes do DELETE não é paranoia: a RLS filtra o UPDATE linha
   * por linha, então um admin sem alcance em todas as empresas reatribuiria só
   * parte do histórico e o DELETE deixaria o resto órfão. Sobrou linha, aborta.
   */
  const reassignAndDeleteOrigin = useMutation({
    mutationFn: async ({ id, fromName, toName }: { id: string; fromName: string; toName: string }) => {
      const pattern = ilikeLiteral(fromName);
      const { error: companiesError } = await supabase
        .from('companies').update({ origin: toName }).ilike('origin', pattern);
      if (companiesError) throw companiesError;
      const { error: leadsError } = await supabase
        .from('admin_leads').update({ source: toName }).ilike('source', pattern);
      if (leadsError) throw leadsError;

      const left = await countOriginUsage(fromName);
      if (left.total > 0) {
        throw new Error(
          'Parte do histórico não pôde ser movida, então a origem não foi excluída. Tente de novo ou peça para um administrador com acesso total.',
        );
      }

      const { error: deleteError } = await supabase.from('company_origins').delete().eq('id', id);
      if (deleteError) throw deleteError;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['company-origins'] });
      qc.invalidateQueries({ queryKey: ['admin-companies'] });
      qc.invalidateQueries({ queryKey: ['admin-leads'] });
      qc.invalidateQueries({ queryKey: ['admin-company-origins-colors'] });
      toast({ title: 'Origem removida!', description: `O histórico passou para "${vars.toName}".` });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(e) }),
  });

  return {
    origins: query.data || [],
    isLoading: query.isLoading,
    createOrigin,
    updateOrigin,
    deleteOrigin,
    reassignAndDeleteOrigin,
    countOriginUsage,
  };
}
