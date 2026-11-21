import { describe, expect, it } from 'vitest';
import { writeFormResponse, type FormResponseClient } from './formResponseWrite';
import { NoRowsAffectedError } from '@/lib/supabaseMutation';

type Call = { op: 'select' | 'update' | 'insert'; payload?: unknown; id?: string; options?: unknown };

/** Client de mentira: cada `select` consome a próxima resposta da fila. */
function fakeClient(script: {
  selects: Array<{ data?: Array<{ id: string }>; error?: { code?: string; message?: string } }>;
  insertError?: { code?: string; message?: string } | null;
  updateCount?: number;
}) {
  const calls: Call[] = [];
  let selectIndex = 0;
  const client: FormResponseClient = {
    from() {
      return {
        select() {
          const chain: any = {
            eq: () => chain,
            is: () => chain,
            order: () => chain,
            limit: async () => {
              calls.push({ op: 'select' });
              const next = script.selects[selectIndex++] ?? { data: [] };
              return { data: next.data ?? null, error: next.error ?? null };
            },
          };
          return chain;
        },
        update(payload: unknown, options?: unknown) {
          return {
            eq: async (_column: string, id: string) => {
              calls.push({ op: 'update', payload, id, options });
              return { data: null, error: null, count: script.updateCount ?? 1 };
            },
          };
        },
        insert: async (payload: unknown) => {
          calls.push({ op: 'insert', payload });
          return { data: null, error: script.insertError ?? null };
        },
      };
    },
  };
  return { client, calls };
}

const key = { serviceOrderId: 'os-1', questionId: 'q-7', equipmentId: null };
const values = {
  response_value: 'ok',
  response_photo_url: null,
  response_video_url: null,
  responded_at: '2026-11-20T15:00:00.000Z',
  responded_by: 'user-1',
};

describe('writeFormResponse', () => {
  it('atualiza a linha existente em vez de inserir', async () => {
    const { client, calls } = fakeClient({ selects: [{ data: [{ id: 'row-1' }] }] });
    await writeFormResponse(key, values, client);
    expect(calls.map((c) => c.op)).toEqual(['select', 'update']);
    expect(calls[1].id).toBe('row-1');
  });

  it('insere quando a pergunta ainda não tem resposta', async () => {
    const { client, calls } = fakeClient({ selects: [{ data: [] }] });
    await writeFormResponse(key, values, client);
    expect(calls.map((c) => c.op)).toEqual(['select', 'insert']);
    expect(calls[1].payload).toMatchObject({
      service_order_id: 'os-1', question_id: 'q-7', equipment_id: null, response_value: 'ok',
    });
  });

  it('NÃO insere quando a procura falha (era a origem da duplicata)', async () => {
    const { client, calls } = fakeClient({ selects: [{ error: { message: 'Failed to fetch' } }] });
    await expect(writeFormResponse(key, values, client)).rejects.toMatchObject({ message: 'Failed to fetch' });
    expect(calls.map((c) => c.op)).toEqual(['select']);
  });

  it('quando outro gravador chega primeiro, atualiza a linha dele', async () => {
    const { client, calls } = fakeClient({
      selects: [{ data: [] }, { data: [{ id: 'row-raced' }] }],
      insertError: { code: '23505', message: 'duplicate key' },
    });
    await writeFormResponse(key, values, client);
    expect(calls.map((c) => c.op)).toEqual(['select', 'insert', 'select', 'update']);
    expect(calls[3].id).toBe('row-raced');
  });

  it('UPDATE barrado pela permissão (0 linhas, sem erro do banco) sobe erro em vez de fingir que gravou', async () => {
    const { client, calls } = fakeClient({ selects: [{ data: [{ id: 'row-1' }] }], updateCount: 0 });
    await expect(writeFormResponse(key, values, client)).rejects.toBeInstanceOf(NoRowsAffectedError);
    expect(calls.map((c) => c.op)).toEqual(['select', 'update']);
    expect(calls[1].options).toEqual({ count: 'exact' });
  });

  it('erro de insert que não é de unicidade sobe', async () => {
    const { client } = fakeClient({ selects: [{ data: [] }], insertError: { code: '42501', message: 'rls' } });
    await expect(writeFormResponse(key, values, client)).rejects.toMatchObject({ code: '42501' });
  });
});
