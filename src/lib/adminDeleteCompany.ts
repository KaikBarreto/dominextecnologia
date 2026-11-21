import { supabase } from '@/integrations/supabase/client';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

/**
 * Exclusão de empresa pelo painel master. Caminho ÚNICO: a RPC
 * `admin_delete_company`, a mesma da lista de empresas.
 *
 * Por que não `DELETE` direto em `companies`: a RPC confere a permissão no
 * servidor e apaga, na ordem certa e numa transação só, todos os dados do
 * tenant (PDV, financeiro, usuários, profiles, auth.users). O DELETE direto
 * pulava essa limpeza e dependia só da policy da tabela.
 *
 * A RPC devolve `void`, então não há contagem de linhas. A conferência que
 * existia (assertRowsAffected) vira uma leitura depois da RPC: se a empresa
 * ainda existe, a exclusão não aconteceu e o toast de sucesso seria mentira.
 * Se a empresa já não existia, o resultado final é o pedido (empresa fora),
 * então é sucesso.
 */
export async function deleteCompanyAsAdmin(companyId: string): Promise<void> {
  if (!companyId) throw new Error('Empresa não informada.');

  const { error } = await supabase.rpc('admin_delete_company', { p_company_id: companyId });
  if (error) throw error;

  const { data: stillThere, error: checkError } = await supabase
    .from('companies')
    .select('id')
    .eq('id', companyId)
    .maybeSingle();
  if (checkError) throw checkError;
  if (stillThere) throw new NoRowsAffectedError('delete');
}
