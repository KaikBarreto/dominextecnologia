import { describe, expect, it } from 'vitest';
import { emptyPreorderWorkspace, mergePreorderWorkspaces, parsePreorderWorkspace, preorderTabStorageKey, type PdvPreorderTab } from './preorder-workspace';

const owner = { companyId: 'company-a', userId: 'user-a', cashSessionId: 'cash-a' };
function tab(text: string): PdvPreorderTab<{ text: string }> {
  const id = crypto.randomUUID();
  return { id, draftId: id, preorderId: null, revision: null, customerId: null, number: null, total: 10, hasContent: true, editorState: { text }, version: crypto.randomUUID(), updatedAt: 10 };
}
const workspace = (...tabs: ReturnType<typeof tab>[]) => ({ ...emptyPreorderWorkspace<{ text: string }>(owner), tabs, activeId: tabs[0]?.id ?? null });

describe('preorder workspace — conteúdo pessoal separado de venda', () => {
  it('separa empresa, usuário e abertura de caixa e recusa um envelope de outro contexto', () => {
    const original = workspace(tab('original'));
    for (const other of [{ ...owner, companyId: 'b' }, { ...owner, userId: 'b' }, { ...owner, cashSessionId: 'b' }, { ...owner, cashSessionId: null }]) {
      expect(preorderTabStorageKey(other)).not.toBe(preorderTabStorageKey(owner));
      expect(() => parsePreorderWorkspace(JSON.stringify(original), other)).toThrow();
    }
  });

  it('não transforma ausência em exclusão', () => {
    const original = tab('não apagar');
    const base = workspace(original);
    expect(mergePreorderWorkspaces(base, workspace(), base).tabs).toEqual([original]);
  });

  it('fecha somente a versão explicitamente confirmada', () => {
    const first = tab('fechar'), second = tab('manter');
    const base = workspace(first, second), local = { ...workspace(second), closed: { [first.id]: first.version } };
    expect(mergePreorderWorkspaces(base, local, base).tabs).toEqual([second]);
  });

  it('preserva duas edições divergentes sem usar relógio local para escolher vencedora', () => {
    const original = tab('base'), base = workspace(original);
    const ours = { ...original, editorState: { text: 'local' }, version: crypto.randomUUID(), updatedAt: 1 };
    const theirs = { ...original, editorState: { text: 'outra janela' }, version: crypto.randomUUID(), updatedAt: 999999 };
    const merged = mergePreorderWorkspaces(base, workspace(ours), workspace(theirs));
    expect(merged.tabs.map(item => item.editorState?.text)).toEqual(['local', 'outra janela']);
    expect(merged.tabs[1]).toMatchObject({ id: theirs.version, draftId: theirs.version, recovered: true });
    expect(merged.activeId).toBe(ours.id);
  });

  it('uma edição posterior ao fechamento é recuperada', () => {
    const original = tab('base'), base = workspace(original);
    const local = { ...workspace(), closed: { [original.id]: original.version } };
    const theirs = { ...original, version: crypto.randomUUID(), editorState: { text: 'editado depois' } };
    expect(mergePreorderWorkspaces(base, local, workspace(theirs)).tabs[0]).toMatchObject({ editorState: { text: 'editado depois' }, recovered: true });
  });

  it('não trunca abas excedentes recuperadas', () => {
    const tabs = Array.from({ length: 64 }, (_, i) => tab(`conteúdo ${i}`));
    const parsed = parsePreorderWorkspace(JSON.stringify(workspace(...tabs)), owner);
    expect(parsed.tabs).toHaveLength(64);
    expect(mergePreorderWorkspaces(workspace(), workspace(...tabs.slice(0, 32)), workspace(...tabs.slice(32))).tabs).toHaveLength(64);
  });

  it('não aceita metadados locais inválidos como identidade ou total', () => {
    const valid = workspace(tab('original'));
    for (const patch of [{ id: '__proto__' }, { total: -1 }, { revision: 1.5 }, { version: 'not-a-version' }]) {
      expect(() => parsePreorderWorkspace(JSON.stringify({ ...valid, tabs: [{ ...valid.tabs[0], ...patch }] }), owner)).toThrow();
    }
  });
});
