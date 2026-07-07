// Repro do bug de PERDA DE RASCUNHO no MOBILE (o drawer vaul DESMONTA o conteúdo
// ao fechar). Estes testes montam o hook REAL num componente de teste, com ciclo
// de vida real (mount/unmount + efeitos), sem depender de @testing-library/dom.
//
// Driver mínimo: react-dom/client (createRoot) + React.act. Um componente de
// teste expõe a API do hook via ref pra o teste dirigir saveDraft/flush e ler
// showResumePrompt/draftData.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useFormDraft, type UseFormDraftReturn } from './useFormDraft';

// Habilita o modo act do React 18 (senão os useEffect do hook não rodam de forma
// síncrona dentro de act() e o teste daria falso-verde). Escopo: só este arquivo.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface Draft extends Record<string, any> {
  name: string;
  notes: string;
}

const KEY = 'contract-form';
const STORAGE_KEY = `form-draft:${KEY}`;

// Componente de teste: instancia o hook e publica sua API num objeto externo,
// que o teste usa pra dirigir as chamadas. Reflete o uso real (isOpen=true).
function makeHarness() {
  const api: { current: UseFormDraftReturn<Draft> | null } = { current: null };
  const Harness: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
    api.current = useFormDraft<Draft>({ key: KEY, isOpen, isEditing: false });
    return null;
  };
  return { api, Harness };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useFormDraft — persistência básica', () => {
  it('persiste no sessionStorage só a partir da 2ª chamada (dados reais)', () => {
    const { api, Harness } = makeHarness();
    act(() => root.render(<Harness isOpen />));

    act(() => api.current!.saveDraft({ name: '', notes: '' })); // snapshot inicial
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    act(() => api.current!.saveDraft({ name: 'Contrato X', notes: '' }));
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toMatchObject({ name: 'Contrato X' });
  });
});

describe('useFormDraft — remontar oferece retomar (drawer mobile)', () => {
  it('após persistir e DESMONTAR, um novo mount mostra o prompt com os dados', () => {
    // Sessão 1: abre, digita, persiste.
    const h1 = makeHarness();
    act(() => root.render(<h1.Harness isOpen />));
    act(() => h1.api.current!.saveDraft({ name: '', notes: '' }));
    act(() => h1.api.current!.saveDraft({ name: 'Contrato X', notes: 'obs' }));
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

    // Mobile: o drawer desmonta o conteúdo ao fechar (sem passar por isOpen=false).
    act(() => root.unmount());

    // Sessão 2: novo root, novo mount (isOpen=true desde o início).
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const h2 = makeHarness();
    act(() => root.render(<h2.Harness isOpen />));

    expect(h2.api.current!.showResumePrompt).toBe(true);
    expect(h2.api.current!.draftData).toMatchObject({ name: 'Contrato X', notes: 'obs' });
  });

  // Harness que ESPELHA o ContractFormDialog CORRIGIDO: estado `name`, efeito de
  // save gated em (open && !showResumePrompt), FLUSH no caminho de fechar (espelha
  // o `handleUserClose` → `draft.flush(snapshot)` ANTES do reset), e efeito de
  // reset gated em (!open). Reproduz a diferença DESKTOP (fecha via open=false,
  // conteúdo continua montado) × MOBILE (drawer vaul DESMONTA o conteúdo ao fechar
  // — unmount abrupto), agora com o flush que garante que o último valor digitado
  // sobrevive ao fechar mesmo quando digitar+fechar caem no MESMO tick.
  //
  // Por que continua um teste válido: o save segue gated em `open` (idêntico ao
  // pré-fix), então SÓ o flush persiste o último valor no fechamento em mesmo
  // tick. Contra a lógica pré-fix (hook sem `flush`), este harness quebra — o
  // caminho de persistência do último valor deixa de existir. Não afrouxamos
  // nenhuma asserção: o teste do bug continua exigindo o valor exato no storage.
  function makeDialogHarness() {
    const ctl: {
      setName: (v: string) => void;
      draft: UseFormDraftReturn<Draft> | null;
    } = { setName: () => {}, draft: null };

    const Dialog: React.FC<{ open: boolean }> = ({ open }) => {
      const [name, setName] = React.useState('');
      ctl.setName = setName;
      const draft = useFormDraft<Draft>({ key: KEY, isOpen: open, isEditing: false });
      ctl.draft = draft;

      // Efeito de PERSISTÊNCIA (espelha ~linha 537 do ContractFormDialog).
      React.useEffect(() => {
        if (open && !draft.showResumePrompt) {
          draft.saveDraft({ name, notes: '' });
        }
      }, [name, open, draft.showResumePrompt]); // eslint-disable-line

      // Efeito de FLUSH ao fechar (espelha o `handleUserClose` do ContractFormDialog:
      // captura o snapshot ATUAL do formulário e persiste ANTES do reset). Deps
      // `[open]` só — roda uma vez por transição de fechamento, com o `name` do
      // commit em que `open` virou false (o valor mais recente digitado). Declarado
      // ANTES do reset pra rodar com o estado ainda preenchido.
      React.useEffect(() => {
        if (!open) draft.flush({ name, notes: '' });
      }, [open]); // eslint-disable-line

      // Efeito de RESET ao fechar (espelha ~linha 622).
      React.useEffect(() => {
        if (!open) setName('');
      }, [open]);

      return null;
    };
    return { ctl, Dialog };
  }

  it('DESKTOP: digitar e fechar via open=false persiste o rascunho', () => {
    const { ctl, Dialog } = makeDialogHarness();
    act(() => root.render(<Dialog open />));
    act(() => ctl.setName('Contrato Desktop'));
    // Fecha SEM desmontar (desktop Dialog mantém o React tree; só muda open).
    act(() => root.render(<Dialog open={false} />));

    // Reabre (mesmo tree): rascunho recuperável.
    act(() => root.render(<Dialog open />));
    expect(ctl.draft!.showResumePrompt).toBe(true);
    expect(ctl.draft!.draftData).toMatchObject({ name: 'Contrato Desktop' });
  });

  // Harness que reproduz a ORDEM real dos efeitos do ContractFormDialog quando o
  // modal fecha: além do reset de `name`, o efeito de reset também zera os campos
  // de rascunho (looseItems/machineConfigs/commonChecklists). O efeito de save
  // depende desses campos → o reset RE-DISPARA o save. Se algum caminho salvar
  // com `open` ainda true (ou com timing infeliz), grava vazio por cima.
  function makeFullDialogHarness() {
    const ctl: {
      setName: (v: string) => void;
      draft: UseFormDraftReturn<Draft> | null;
      savedSnapshots: string[];
    } = { setName: () => {}, draft: null, savedSnapshots: [] };

    const Dialog: React.FC<{ open: boolean }> = ({ open }) => {
      const [name, setName] = React.useState('');
      const [items, setItems] = React.useState<string[]>([]);
      ctl.setName = (v: string) => { setName(v); setItems([v]); };
      const draft = useFormDraft<Draft>({ key: KEY, isOpen: open, isEditing: false });
      ctl.draft = draft;

      // Efeito de PERSISTÊNCIA (deps incluem `items`, como no real).
      React.useEffect(() => {
        if (open && !draft.showResumePrompt) {
          ctl.savedSnapshots.push(JSON.stringify({ name, items }));
          draft.saveDraft({ name, notes: '', items } as Draft);
        }
      }, [name, items, open, draft.showResumePrompt]); // eslint-disable-line

      // Efeito de RESET ao fechar (espelha ~622: zera name E os campos de rascunho).
      React.useEffect(() => {
        if (!open) { setName(''); setItems([]); }
      }, [open]);

      return null;
    };
    return { ctl, Dialog };
  }

  it('DIAGNÓSTICO: fechar via open=false não deve gravar vazio por cima do rascunho', () => {
    const { ctl, Dialog } = makeFullDialogHarness();
    act(() => root.render(<Dialog open />));
    act(() => ctl.setName('Contrato Cheio'));
    const rawBeforeClose = sessionStorage.getItem(STORAGE_KEY);
    expect(rawBeforeClose).not.toBeNull();

    // Fecha (open=false). O reset zera os campos → o efeito de save re-dispara,
    // mas o guard `open` deve impedir gravar vazio.
    act(() => root.render(<Dialog open={false} />));
    const rawAfterClose = sessionStorage.getItem(STORAGE_KEY);
    expect(rawAfterClose).toEqual(rawBeforeClose); // não pode ter sido sobrescrito
    expect(JSON.parse(rawAfterClose!)).toMatchObject({ name: 'Contrato Cheio' });
  });

  it('MOBILE (REPRO DO BUG): digitar e fechar no MESMO tick persiste o último valor via flush', () => {
    // Este é o repro fiel: no browser, o toque no handle/X do drawer e a última
    // digitação podem cair no MESMO batch. O efeito de save do ÚLTIMO valor NÃO
    // roda antes de `open` virar false; ao rodar, o guard `if (open)` bloqueia.
    // Sem o fix, o último valor digitado nunca é persistido; COM o fix, o flush do
    // caminho de fechar captura o snapshot atual e o persiste.
    const { ctl, Dialog } = makeDialogHarness();
    act(() => root.render(<Dialog open />));

    // Digita E fecha no MESMO act (sem flush de efeito entre eles) — como o
    // usuário que digita e imediatamente arrasta o drawer pra fechar.
    act(() => {
      ctl.setName('Contrato Mobile');
      root.render(<Dialog open={false} />);
    });

    // Com o FIX (flush no fechar), o storage tem "Contrato Mobile". Contra a lógica
    // pré-fix (save gated, sem flush) o último valor não seria persistido e este
    // expect FALHARIA — asserção mantida forte de propósito.
    const raw = sessionStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toMatchObject({ name: 'Contrato Mobile' });
  });

  it('CENÁRIO-BUG: snapshot pendente no unmount se perde sem flush', () => {
    // A race do mobile: o usuário digitou (o componente tem o dado no estado), mas
    // o último snapshot com dados só existe no ESTADO — não foi persistido — e o
    // fechamento desmonta o conteúdo. Sem um flush no unmount, nada é salvo.
    const pending: Draft = { name: 'Contrato Só No Estado', notes: '' };

    const h1 = makeHarness();
    act(() => root.render(<h1.Harness isOpen />));
    act(() => h1.api.current!.saveDraft({ name: '', notes: '' })); // só o snapshot inicial

    // Desmonta antes de qualquer saveDraft(pending) — o storage segue vazio.
    act(() => root.unmount());
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

    // Reabre: sem persistência, não há prompt → RASCUNHO PERDIDO.
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const h2 = makeHarness();
    act(() => root.render(<h2.Harness isOpen />));
    expect(h2.api.current!.showResumePrompt).toBe(false);

    void pending;
  });
});
