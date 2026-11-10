// Repro do bug de PERDA DE RASCUNHO no MOBILE (o drawer vaul DESMONTA o conteúdo
// ao fechar). Estes testes montam o hook REAL num componente de teste, com ciclo
// de vida real (mount/unmount + efeitos), sem depender de @testing-library/dom.
//
// Driver mínimo: react-dom/client (createRoot) + React.act. Um componente de
// teste expõe a API do hook via ref pra o teste dirigir saveDraft/flush e ler
// showResumePrompt/draftData.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { useFormDraft, type UseFormDraftReturn } from './useFormDraft';

// Habilita o modo act do React 18 (senão os useEffect do hook não rodam de forma
// síncrona dentro de act() e o teste daria falso-verde). Escopo: só este arquivo.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Draft extends Record<string, unknown> {
  name: string;
  notes: string;
}

const KEY = 'contract-form';
const STORAGE_KEY = `form-draft:${KEY}`;

// Componente de teste: instancia o hook e publica sua API num objeto externo,
// que o teste usa pra dirigir as chamadas. Reflete o uso real (isOpen=true).
function makeHarness(options: { debounceMs?: number; ignoreKeys?: string[] } = {}) {
  const api: { current: UseFormDraftReturn<Draft> | null } = { current: null };
  const Harness: React.FC<{ isOpen: boolean; formKey?: string; isEditing?: boolean }> = ({ isOpen, formKey = KEY, isEditing = false }) => {
    api.current = useFormDraft<Draft>({ key: formKey, isOpen, isEditing, ...options });
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
  vi.restoreAllMocks();
  vi.useRealTimers();
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


describe('useFormDraft — novo preenchimento com recuperação não bloqueante', () => {
  it('persiste imediatamente a primeira edição que substitui um rascunho anterior', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Anterior', notes: '' }));
    const { api, Harness } = makeHarness();
    act(() => root.render(<Harness isOpen />));
    expect(api.current!.showResumePrompt).toBe(true);
    act(() => api.current!.startNewDraft({ name: 'Primeira edição', notes: '' }));
    expect(api.current!.showResumePrompt).toBe(false);
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Primeira edição' });
    act(() => api.current!.saveDraft({ name: 'Nome completo', notes: '' }));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Nome completo' });
  });

  it('começar do zero ignora o estado vazio e continua salvando as próximas alterações', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Anterior', notes: '' }));
    const { api, Harness } = makeHarness();
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.startNewDraft());
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    act(() => api.current!.saveDraft({ name: 'Novo contrato', notes: '' }));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Novo contrato' });
  });
});

describe('useFormDraft — estado real do autosave', () => {
  it('mantém o padrão síncrono e só marca salvo depois de gravar', () => {
    const { api, Harness } = makeHarness();
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    expect(api.current!.status).toBe('idle');
    expect(api.current!.savedAt).toBeNull();
    act(() => api.current!.saveDraft({ name: 'Cliente preenchido', notes: '' }));
    expect(api.current!.status).toBe('saved');
    expect(api.current!.savedAt).toEqual(expect.any(Number));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Cliente preenchido' });
  });

  it('agrupa mudanças e não adia o timer quando o mesmo snapshot é recebido de novo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T02:00:00Z'));
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Clí', notes: '' }));
    expect(api.current!.status).toBe('saving');
    expect(api.current!.savedAt).toBeNull();
    act(() => vi.advanceTimersByTime(200));
    act(() => api.current!.saveDraft({ name: 'Clínica completa', notes: '' }));
    act(() => vi.advanceTimersByTime(200));
    act(() => api.current!.saveDraft({ name: 'Clínica completa', notes: '' }));
    act(() => vi.advanceTimersByTime(299));
    expect(writes).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(api.current!.status).toBe('saved');
    expect(api.current!.savedAt).toBe(Date.now());
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Clínica completa' });
    const savedAt = api.current!.savedAt;
    act(() => vi.advanceTimersByTime(1000));
    act(() => api.current!.saveDraft({ name: 'Clínica completa', notes: '' }));
    expect(writes).toHaveBeenCalledTimes(1);
    expect(api.current!.savedAt).toBe(savedAt);
  });

  it('flush cancela o debounce e grava sincronicamente os dados atuais', () => {
    vi.useFakeTimers();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Parcial', notes: '' }));
    act(() => api.current!.flush({ name: 'Último valor antes de fechar', notes: 'Composição completa' }));
    expect(api.current!.status).toBe('saved');
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Último valor antes de fechar', notes: 'Composição completa' });
    act(() => vi.runAllTimers());
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('unmount persiste o snapshot pendente e cancela a escrita posterior', () => {
    vi.useFakeTimers();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Última edição no celular', notes: '' }));
    act(() => root.render(null));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Última edição no celular' });
    act(() => vi.runAllTimers());
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it('não grava um baseline intacto nem em flush sem dados nem em unmount', () => {
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: 'Nome pré-preenchido', notes: '' }));
    act(() => api.current!.flush());
    act(() => root.render(null));
    expect(writes).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it.each(['clearDraft', 'discardDraft'] as const)('%s cancela os dados pendentes e não ressuscita no fechamento/reabertura', method => {
    vi.useFakeTimers();
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Não ressuscitar', notes: '' }));
    act(() => api.current![method]());
    expect(api.current!.status).toBe('idle');
    expect(api.current!.savedAt).toBeNull();
    act(() => root.render(<Harness isOpen={false} />));
    act(() => api.current!.flush({ name: 'Estado antigo do formulário', notes: '' }));
    act(() => vi.runAllTimers());
    act(() => root.render(<Harness isOpen />));
    expect(api.current!.showResumePrompt).toBe(false);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(['QuotaExceededError', 'SecurityError'])('não anuncia salvo quando setItem falha: %s', code => {
    vi.useFakeTimers();
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Armazenamento indisponível', code); });
    act(() => api.current!.saveDraft({ name: 'Ainda não gravado', notes: '' }));
    expect(api.current!.status).toBe('saving');
    act(() => vi.advanceTimersByTime(500));
    expect(api.current!.status).toBe('error');
    expect(api.current!.savedAt).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    write.mockRestore();
    act(() => api.current!.flush());
    expect(api.current!.status).toBe('saved');
    expect(api.current!.savedAt).toBe(Date.now());
  });

  it('ignora defaults assíncronos, mas preserva esses campos quando existe preenchimento real', () => {
    vi.useFakeTimers();
    const { api, Harness } = makeHarness({ debounceMs: 500, ignoreKeys: ['useBdi', 'templateId'] });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '', useBdi: true, templateId: '' }));
    act(() => api.current!.saveDraft({ name: '', notes: '', useBdi: true, templateId: 'template-padrão' }));
    act(() => vi.runAllTimers());
    expect(api.current!.status).toBe('idle');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    act(() => api.current!.saveDraft({ name: 'Cliente', notes: '', useBdi: true, templateId: 'template-padrão' }));
    act(() => vi.advanceTimersByTime(500));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Cliente', useBdi: true, templateId: 'template-padrão' });
  });

  it('mantém saveDraft estável enquanto status muda e ignoreKeys recebe outro array', () => {
    const options = { ignoreKeys: ['useBdi'] };
    const { api, Harness } = makeHarness(options);
    act(() => root.render(<Harness isOpen />));
    const save = api.current!.saveDraft;
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Novo', notes: '' }));
    options.ignoreKeys = ['useBdi', 'templateId'];
    act(() => root.render(<Harness isOpen />));
    expect(api.current!.saveDraft).toBe(save);
  });

  it('um item com composição completa é meaningful e mantém todo o snapshot do orçamento', () => {
    vi.useFakeTimers();
    const { api, Harness } = makeHarness({ debounceMs: 500, ignoreKeys: ['useBdi'] });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '', items: [], useBdi: true }));
    const item = { id: 'service-1', quantity: 2, cost_composition: { labor: { hours: 2.5, hourlyRate: 80 }, supplies: [{ name: 'Insumo', quantity: 1.5, cost: 30 }], resources: [] } };
    act(() => api.current!.saveDraft({ name: '', notes: '', items: [item], useBdi: true }));
    expect(api.current!.status).toBe('saving');
    act(() => vi.advanceTimersByTime(500));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toEqual({ name: '', notes: '', items: [item], useBdi: true });
    expect(api.current!.status).toBe('saved');
  });

  it('não toca o rascunho anterior enquanto a decisão de retomar está pendente', () => {
    vi.useFakeTimers();
    const old = JSON.stringify({ name: 'Anterior preservado', notes: '' });
    sessionStorage.setItem(STORAGE_KEY, old);
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    expect(api.current!.status).toBe('idle');
    act(() => api.current!.saveDraft({ name: 'Não substituir', notes: '' }));
    act(() => api.current!.flush({ name: 'Não substituir', notes: '' }));
    act(() => root.render(<Harness isOpen={false} />));
    act(() => root.render(null));
    act(() => vi.runAllTimers());
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe(old);
  });

  it('retomar grava o snapshot completo e só então anuncia salvo', () => {
    vi.useFakeTimers();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Anterior', notes: '' }));
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.acceptDraft());
    act(() => api.current!.saveDraft({ name: 'Anterior', notes: '', items: [{ id: 'service-1', cost: 200 }] }));
    expect(api.current!.status).toBe('saving');
    act(() => vi.advanceTimersByTime(500));
    expect(api.current!.status).toBe('saved');
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ items: [{ id: 'service-1', cost: 200 }] });
  });

  it('startNewDraft com dados persiste a primeira edição imediatamente mesmo com debounce', () => {
    vi.useFakeTimers();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: 'Anterior', notes: '' }));
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.startNewDraft({ name: 'Primeira edição', notes: '' }));
    expect(api.current!.status).toBe('saved');
    expect(api.current!.savedAt).toBe(Date.now());
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Primeira edição' });
  });

  it('limpar o preenchimento meaningful remove o rascunho anterior sem suspender o próximo autosave', () => {
    const { api, Harness } = makeHarness({ ignoreKeys: ['useBdi'] });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '', useBdi: true }));
    act(() => api.current!.saveDraft({ name: 'Não reabrir após limpar', notes: '', useBdi: true }));
    expect(api.current!.status).toBe('saved');
    act(() => api.current!.saveDraft({ name: '', notes: '', useBdi: true }));
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(api.current!.status).toBe('idle');
    expect(api.current!.savedAt).toBeNull();
    act(() => api.current!.saveDraft({ name: 'Próximo preenchimento', notes: '', useBdi: true }));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Próximo preenchimento' });
  });

  it('o reset vazio após fechar não apaga o rascunho já persistido', () => {
    const { api, Harness } = makeHarness();
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Preservar no fechamento', notes: '' }));
    act(() => root.render(<Harness isOpen={false} />));
    act(() => api.current!.flush({ name: '', notes: '' }));
    act(() => root.render(null));
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!)).toMatchObject({ name: 'Preservar no fechamento' });
  });

  it('reabrir retorna idle e exige decidir sobre o rascunho, mesmo após um salvamento bem-sucedido', () => {
    vi.useFakeTimers();
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Cliente', notes: '' }));
    act(() => vi.advanceTimersByTime(500));
    expect(api.current!.status).toBe('saved');
    act(() => root.render(<Harness isOpen={false} />));
    act(() => root.render(<Harness isOpen />));
    expect(api.current!.status).toBe('idle');
    expect(api.current!.savedAt).toBeNull();
    expect(api.current!.showResumePrompt).toBe(true);
  });

  it('trocar a chave cancela o timer antigo e bloqueia callbacks do contexto anterior', () => {
    vi.useFakeTimers();
    const oldB = JSON.stringify({ name: 'Rascunho da empresa B', notes: '' });
    sessionStorage.setItem('form-draft:company-B:user-2', oldB);
    const { api, Harness } = makeHarness({ debounceMs: 500 });
    act(() => root.render(<Harness isOpen formKey="company-A:user-1" />));
    act(() => api.current!.saveDraft({ name: '', notes: '' }));
    act(() => api.current!.saveDraft({ name: 'Não vazar para B', notes: '' }));
    const oldFlush = api.current!.flush;
    act(() => root.render(<Harness isOpen formKey="company-B:user-2" />));
    expect(api.current!.status).toBe('idle');
    expect(api.current!.savedAt).toBeNull();
    expect(api.current!.draftData).toMatchObject({ name: 'Rascunho da empresa B' });
    act(() => oldFlush({ name: 'Snapshot antigo', notes: '' }));
    act(() => vi.runAllTimers());
    act(() => root.render(null));
    expect(sessionStorage.getItem('form-draft:company-A:user-1')).toBeNull();
    expect(sessionStorage.getItem('form-draft:company-B:user-2')).toBe(oldB);
  });

  it.each(['clearDraft', 'discardDraft', 'startNewDraft'] as const)('trata removeItem bloqueado em %s sem quebrar o formulário', method => {
    const { api, Harness } = makeHarness();
    act(() => root.render(<Harness isOpen />));
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Armazenamento bloqueado', 'SecurityError'); });
    expect(() => act(() => api.current![method]())).not.toThrow();
    expect(api.current!.status).toBe('error');
    expect(api.current!.savedAt).toBeNull();
    remove.mockRestore();
  });

  it('trata removeItem bloqueado ao abrir um registro sem dados meaningful', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name: '', notes: '' }));
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Armazenamento bloqueado', 'SecurityError'); });
    const { api, Harness } = makeHarness();
    expect(() => act(() => root.render(<Harness isOpen />))).not.toThrow();
    expect(api.current!.status).toBe('error');
    expect(api.current!.savedAt).toBeNull();
  });

  it('não esconde uma falha de remoção ao começar novo com dados vazios', () => {
    const { api, Harness } = makeHarness();
    act(() => root.render(<Harness isOpen />));
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('Armazenamento bloqueado', 'SecurityError'); });
    act(() => api.current!.startNewDraft({ name: '', notes: '' }));
    expect(api.current!.status).toBe('error');
    expect(api.current!.savedAt).toBeNull();
  });
});
