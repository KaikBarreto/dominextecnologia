import { supabase } from '@/integrations/supabase/client';
import {
  parsePublicFormQuestions,
  type PublicFormQuestion,
} from '@/lib/publicFormQuestions';

/**
 * Fronteira do Supabase para as ESCRITAS do Portal do Cliente (`/portal/:token`).
 *
 * A leitura do portal continua na página, pela RPC `get_portal_data` (anterior a
 * este arquivo). Aqui vivem a abertura de chamado, que estava quebrada, e os
 * formulários publicados no portal (listagem e envio).
 */

/**
 * Envia um chamado para a caixa de entrada do Portal do Cliente.
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
 * `sessionToken` é a sessão do PORTAL COM SENHA (não a sessão do app). A RPC só
 * consulta esse parâmetro quando o portal tem `password_enabled`, comparando
 * `sha256(token)` com `customer_portal_sessions.token_hash` ainda vigente. A
 * página mantém esse token (`CustomerPortal.tsx`) e o repassa também na leitura,
 * então o chamado segue a MESMA sessão que autorizou a leitura. Portal sem senha
 * manda `null` e a RPC nem olha.
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
export interface PortalTicketReceipt {
  portalCallId: string;
  protocolNumber: number;
}

export async function createCustomerPortalTicket(
  token: string,
  description: string,
  sessionToken: string | null,
  equipmentId?: string | null,
): Promise<PortalTicketReceipt> {
  const { data, error } = await supabase.rpc('create_customer_portal_ticket', {
    p_token: token,
    p_session_token: sessionToken || null,
    p_description: description.trim(),
    // Sem equipamento = NULL explícito (a RPC só valida quando vem preenchido).
    p_equipment_id: equipmentId || null,
  });
  if (error) throw error;
  const payload = data as { portal_call_id?: unknown; protocol_number?: unknown } | null;
  if (
    !payload
    || typeof payload.portal_call_id !== 'string'
    || typeof payload.protocol_number !== 'number'
  ) {
    throw new Error('portal_ticket_receipt_invalid');
  }
  return {
    portalCallId: payload.portal_call_id,
    protocolNumber: payload.protocol_number,
  };
}

/**
 * Formulário publicado no Portal do Cliente (`show_in_customer_portal`), no shape
 * que a UI consome. As perguntas já saem normalizadas e ordenadas por
 * `parsePublicFormQuestions` (descarta tipo desconhecido).
 */
export interface CustomerPortalForm {
  id: string;
  /**
   * Código do formulário. No portal ele serve SÓ pra subir foto e assinatura:
   * a edge `lead-capture-upload-photo` exige um `short_code` de formulário vivo
   * (amarração anti-abuso). O envio das respostas NÃO usa o link público, que
   * criaria um cliente novo em formulário de captação; usa a RPC do portal.
   * Pode vir `null` de um banco que ainda não devolve o código: nesse caso as
   * perguntas de foto/assinatura ficam desabilitadas em vez de falhar no envio.
   */
  shortCode: string | null;
  title: string;
  description: string | null;
  /** `lead` ou `generic`. No portal nunca cria cliente, em nenhum dos dois. */
  purpose: 'lead' | 'generic';
  successMessage: string | null;
  questions: PublicFormQuestion[];
}

/**
 * Lista os formulários disponíveis pro cliente do token.
 *
 * Quem decide o que aparece é a RPC SECURITY DEFINER `get_customer_portal_forms`:
 * ela resolve a empresa pelo customer do PRÓPRIO token (nunca por parâmetro do
 * client) e só devolve formulário marcado pra aparecer no portal, ativo, dentro
 * da validade e do limite de respostas, depois de revalidar portal ativo, sessão
 * (quando o portal tem senha), assinatura da empresa e módulo "Portal do
 * Cliente". Não existe chave `forms` em `portal_settings.permissions`: a seção
 * some do portal quando esta lista vem vazia.
 *
 * Erros propagados crus (o chamador decide; a página trata como "sem
 * formulários" e esconde a seção, sem mostrar nada ao cliente final):
 *  - `42501` — portal indisponível, privado, sessão de senha ausente/vencida,
 *    assinatura vencida ou módulo fora.
 */
export async function fetchCustomerPortalForms(
  token: string,
  sessionToken: string | null,
): Promise<CustomerPortalForm[]> {
  const { data, error } = await supabase.rpc('get_customer_portal_forms', {
    p_token: token,
    p_session_token: sessionToken || null,
  });
  if (error) throw error;
  if (!Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>)
    .map((row): CustomerPortalForm | null => {
      const id = typeof row.id === 'string' ? row.id : '';
      if (!id) return null;
      return {
        id,
        shortCode: typeof row.short_code === 'string' && row.short_code ? row.short_code : null,
        title: typeof row.title === 'string' ? row.title : '',
        description: typeof row.description === 'string' && row.description.trim() ? row.description : null,
        purpose: row.purpose === 'generic' ? 'generic' : 'lead',
        successMessage:
          typeof row.success_message === 'string' && row.success_message.trim() ? row.success_message : null,
        questions: parsePublicFormQuestions(row.questions),
      };
    })
    .filter((form): form is CustomerPortalForm => form !== null);
}

/**
 * Envia as respostas de um formulário pelo Portal do Cliente.
 *
 * Mesma razão do chamado: a página não escreve em `public_form_submissions`
 * (INSERT é só `service_role`, anti-falsificação). A RPC SECURITY DEFINER
 * `submit_customer_portal_form` resolve cliente e empresa pelo token, confere que
 * o formulário é DAQUELA empresa e está publicado no portal, aplica o mesmo
 * rate-limit (por cliente+formulário) e a mesma validação por pergunta do link
 * público, e grava a resposta já vinculada ao cliente do token. NUNCA cria nem
 * altera cliente. `answers` é `{ "<question_id>": valor }` (use
 * `buildAnswersPayload`); foto e assinatura entram como URL do nosso Storage.
 *
 * Erros propagados crus (o chamador traduz pelo `code`):
 *  - `42501` — portal ou formulário indisponível.
 *  - `22023` — muitas tentativas seguidas, ou resposta inválida/formulário
 *    desatualizado.
 */
export async function submitCustomerPortalForm(
  token: string,
  sessionToken: string | null,
  formId: string,
  answers: Record<string, unknown>,
): Promise<{ submissionId: string | null }> {
  const { data, error } = await supabase.rpc('submit_customer_portal_form', {
    p_token: token,
    p_session_token: sessionToken || null,
    p_form_id: formId,
    // Os campos de cadastro não se aplicam: o cliente já está identificado pelo
    // token e a RPC nunca mexe em `customers`.
    p_fields: {},
    p_answers: answers as never,
  });
  if (error) throw error;
  const submissionId = (data as { submission_id?: unknown } | null)?.submission_id;
  return { submissionId: typeof submissionId === 'string' ? submissionId : null };
}
