import { supabase } from '@/integrations/supabase/client';
import { assertRowsAffected } from '@/lib/supabaseMutation';

/**
 * Gravação única de uma resposta de checklist.
 *
 * Uma resposta é identificada pela tripla (OS, pergunta, equipamento), e só
 * pode existir UMA linha por tripla. Os dois gravadores do app (checklist do
 * técnico e checklist de atividade do PMOC) faziam "procura, senão insere" com
 * `.single()`/`.maybeSingle()` e ignoravam o erro da procura. Quando a busca
 * falhava (rede) ou já havia duas linhas, o código entendia "não existe" e
 * inseria outra: a pergunta passava a ter N respostas e o relatório listava
 * cada uma como um item (OS 13432, "Split 7" repetido).
 *
 * Regras daqui:
 *  - falha na procura NUNCA vira insert: o erro sobe e a fila do chamador
 *    mantém a pergunta pendente;
 *  - havendo mais de uma linha (resto de antes da trava do banco), atualiza a
 *    mais recente, que é a mesma que a limpeza do servidor preserva;
 *  - se o insert bater na trava de unicidade (outro gravador chegou primeiro),
 *    procura de novo e atualiza.
 */

export interface FormResponseKey {
  serviceOrderId: string;
  questionId: string;
  equipmentId?: string | null;
}

export interface FormResponseValues {
  response_value: string | null;
  response_photo_url: string | null;
  response_video_url: string | null;
  responded_at: string;
  responded_by: string | null;
}

interface ErrorLike {
  code?: string;
  message?: string;
}

interface QueryResult<T> {
  data: T | null;
  error: ErrorLike | null;
}

/** Fatia do client usada aqui, para o teste injetar um client de mentira. */
export interface FormResponseClient {
  from(table: 'form_responses'): any;
}

const UNIQUE_VIOLATION = '23505';

async function findLatestId(client: FormResponseClient, key: FormResponseKey): Promise<string | null> {
  let query = client
    .from('form_responses')
    .select('id')
    .eq('service_order_id', key.serviceOrderId)
    .eq('question_id', key.questionId);
  query = key.equipmentId
    ? query.eq('equipment_id', key.equipmentId)
    : query.is('equipment_id', null);

  const { data, error } = (await query
    .order('responded_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(1)) as QueryResult<Array<{ id: string }>>;

  if (error) throw error;
  return data?.[0]?.id ?? null;
}

async function updateById(client: FormResponseClient, id: string, values: FormResponseValues) {
  // A linha acabou de ser encontrada: 0 linhas afetadas significa que a
  // permissão barrou o UPDATE (o PostgREST não devolve erro nesse caso). Sobe
  // o erro para a fila do chamador manter a pergunta pendente.
  const result = (await client
    .from('form_responses')
    .update(values, { count: 'exact' })
    .eq('id', id)) as QueryResult<unknown> & { count?: number | null };
  assertRowsAffected({ error: result.error, count: result.count ?? null }, 'update');
}

export async function writeFormResponse(
  key: FormResponseKey,
  values: FormResponseValues,
  client: FormResponseClient = supabase as unknown as FormResponseClient,
): Promise<void> {
  const existingId = await findLatestId(client, key);
  if (existingId) {
    await updateById(client, existingId, values);
    return;
  }

  const { error } = (await client.from('form_responses').insert({
    service_order_id: key.serviceOrderId,
    question_id: key.questionId,
    equipment_id: key.equipmentId || null,
    ...values,
  })) as QueryResult<unknown>;
  if (!error) return;
  if (error.code !== UNIQUE_VIOLATION) throw error;

  // Outro gravador criou a linha entre a procura e o insert.
  const racedId = await findLatestId(client, key);
  if (!racedId) throw error;
  await updateById(client, racedId, values);
}
