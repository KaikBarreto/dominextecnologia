import { describe, expect, it } from 'vitest';
import { transferRecoveredDraftAttachments } from './draft-attachments';

describe('anexos da versão recuperada', () => {
  it('acompanham a cópia local exata e deixam a versão online sem arquivos da outra versão', () => {
    const photo = { name: 'foto.jpg' }, other = { name: 'foto.jpg' };
    const current = { original: [photo], unrelated: [other] };
    const next = transferRecoveredDraftAttachments(current, { id: 'original', localCopyId: 'recovered' });
    expect(next.original).toBeUndefined();
    expect(next.recovered).toEqual([photo]);
    expect(next.unrelated).toBe(current.unrelated);
    expect(current.original).toEqual([photo]);
  });
  it('preserva anexos já associados ao destino e é idempotente após transferir', () => {
    const result = transferRecoveredDraftAttachments({ original: ['local'], recovered: ['existing'] }, { id: 'original', localCopyId: 'recovered' });
    expect(result.recovered).toEqual(['existing', 'local']);
    expect(transferRecoveredDraftAttachments(result, { id: 'original', localCopyId: 'recovered' })).toBe(result);
  });
  it.each([null, 'original'])('não remove anexos quando não há nova cópia (%s)', localCopyId => {
    const current = { original: ['photo'] };
    expect(transferRecoveredDraftAttachments(current, { id: 'original', localCopyId })).toBe(current);
  });
});
