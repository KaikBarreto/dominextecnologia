import { supabase } from '@/integrations/supabase/client';

/**
 * Fronteira do Supabase para as ESCRITAS do Portal do Cliente (`/portal/:token`).
 *
 * A leitura do portal continua na página, pela RPC `get_portal_data` (anterior a
 * este arquivo). Aqui vive só a abertura de chamado, que estava quebrada.
 */

/**
 * Abre um chamado (OS corretiva) a partir do Portal do Cliente.
 *
 * A página NÃO escreve em `service_orders`: o papel `anon` não tem INSERT nessa
 * tabela (a varredura de 18/10/2026 revogou o privilégio e o botão passou a
 * devolver `42501 permission denied for table service_orders` na cara do cliente
 * final). Quem cria a linha é a RPC SECURITY DEFINER
 * `create_customer_portal_ticket`, que resolve customer/company pelo PRÓPRIO
 * token do portal e revalida no servidor: portal ativo, portal público, permissão
 * `ticket_requests`, assinatura da empresa, módulo "Portal do Cliente", tamanho
 * da descrição e se o equipamento informado é mesmo daquele cliente.
 *
 * `p_session_token` vai `null` de propósito, igual à LEITURA: a RPC só consulta
 * esse parâmetro quando o portal tem `password_enabled`, e o overload
 * `get_portal_data(p_token)` que a página usa pra ler já passa `NULL` no mesmo
 * parâmetro. Portal com senha não tem nenhuma tela que emita sessão hoje (nem a
 * leitura sabe tratar o `access: 'password_required'` que a RPC devolveria), então
 * não há valor legítimo a passar. Se um dia o portal com senha ganhar tela, a
 * sessão emitida por ela entra aqui e no `get_portal_data` de 2 argumentos juntas.
 *
 * Usa o client com sessão (mesmo da leitura) e não o `supabaseAnon`: visitante
 * sem login cai em `anon`, que é o caso que estamos consertando, e membro logado
 * da empresa dona continua passando pelo atalho `v_is_company_member` da RPC.
 *
 * Erros propagados crus (o chamador traduz pelo `code`, pra sair no idioma do
 * portal e nunca como texto do banco):
 *  - `42501` — portal indisponível, privado, chamados desativados, assinatura
 *    vencida ou módulo fora.
 *  - `22023` — descrição fora da faixa de 10 a 2000 caracteres, ou equipamento
 *    que não pertence ao cliente do portal.
 */
export async function createCustomerPortalTicket(
  token: string,
  description: string,
  equipmentId?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('create_customer_portal_ticket', {
    p_token: token,
    p_session_token: null,
    p_description: description.trim(),
    // Sem equipamento = NULL explícito (a RPC só valida quando vem preenchido).
    p_equipment_id: equipmentId || null,
  });
  if (error) throw error;
}
