import { describe, expect, it } from 'vitest';
import { getImportOfxFooterAction, getImportOfxView } from './ImportOfxDialog';
import type { CreateImportResult } from '@/lib/reconciliation/types';

/**
 * Bug real reportado pelo Tech Lead (QA no navegador, 2026-10-18): reimportar
 * um extrato com o MESMO conteúdo (FITID reemitido, caso Santander) fazia a
 * RPC `create_bank_statement_import` responder HTTP 200 com `nothing_new:
 * true` e `import_id: null` — mas o diálogo ficava parado na tela de
 * escolher arquivo, em silêncio (sem toast, sem erro, sem resumo).
 *
 * A causa raiz NÃO era este componente: era um `useMemo` em
 * `useBankReconciliation` cujo array de deps (`[stateQuery.data,
 * stateQuery.isLoading, importId]`) não incluía `importOfx`. Como
 * `nothing_new` nunca produz um `import_id` novo, `importId` continuava
 * `null` e o `useMemo` nunca recomputava — o componente ficava recebendo
 * pra sempre o `importOfx` "idle" de antes do `.mutate()`, mesmo com a
 * mutation já resolvida com dados reais (confirmado com `renderHook` real:
 * a RPC mockada respondia e `rpc` era chamado, mas o objeto devolvido pelo
 * hook ficava congelado em `status: 'idle'`/`data: undefined`).
 *
 * Este teste trava a regressão na camada de VIEW: dado o shape de retorno
 * real da RPC, qual tela e qual botão de footer aparecem. A fixture
 * `nothingNewFixture` é a resposta HTTP 200 capturada no DevTools durante o
 * bug (reexportação do Santander, 3 linhas, todas duplicadas).
 */

const nothingNewFixture: CreateImportResult = {
  already_imported: false,
  nothing_new: true,
  import_id: null,
  status: null,
  file_name: 'santander_reexportado.ofx',
  inserted_count: 0,
  total_entries: 3,
  skipped_count: 3,
  skipped_dup_count: 3,
  skipped_samples: [
    { memo: 'PIX RECEBIDO BOM', name: null, amount: 200, posted_at: '2026-08-01T15:00:00+00:00' },
    { memo: 'TARIFA PACOTE CORRETA', name: null, amount: -42.5, posted_at: '2026-08-02T15:00:00+00:00' },
    { memo: 'COMPRA CARTAO', name: null, amount: -95, posted_at: '2026-08-03T15:00:00+00:00' },
  ],
  pending_count: 0,
  opening_balance: 0,
  ledger_balance: 62.5,
  acct_warning: false,
  acct_warning_previous: null,
  sign_suspect_count: 0,
};

const alreadyImportedFixture: CreateImportResult = {
  ...nothingNewFixture,
  nothing_new: false,
  already_imported: true,
  import_id: 'imp-existing-1',
  status: 'open',
};

const insertedFixture: CreateImportResult = {
  ...nothingNewFixture,
  nothing_new: false,
  already_imported: false,
  import_id: 'imp-new-1',
  status: 'open',
  inserted_count: 3,
  skipped_count: 0,
  skipped_dup_count: 0,
  skipped_samples: [],
};

describe('getImportOfxView', () => {
  it('sem resultado ainda (nenhuma RPC resolvida): tela de escolher arquivo', () => {
    expect(getImportOfxView(null)).toBe('chooseFile');
  });

  it('REGRESSÃO DO BUG REAL: nothing_new (import_id null) tem que virar a view "nothingNew", nunca ficar em "chooseFile"', () => {
    expect(getImportOfxView(nothingNewFixture)).toBe('nothingNew');
  });

  it('already_imported (import_id real) vira a view "alreadyImported"', () => {
    expect(getImportOfxView(alreadyImportedFixture)).toBe('alreadyImported');
  });

  it('inseriu linhas novas vira a view "inserted"', () => {
    expect(getImportOfxView(insertedFixture)).toBe('inserted');
  });

  it('nothing_new ganha de already_imported se a RPC um dia mandar os dois true (não existe import pra continuar)', () => {
    expect(getImportOfxView({ ...alreadyImportedFixture, nothing_new: true })).toBe('nothingNew');
  });
});

describe('getImportOfxFooterAction — nenhum ramo pode terminar em silêncio', () => {
  it('chooseFile: footer é o formulário (cancelar/importar)', () => {
    expect(getImportOfxFooterAction('chooseFile')).toEqual({ kind: 'form' });
  });

  it('REGRESSÃO DO BUG REAL: nothingNew só tem o botão de fechar — nunca "continuar" (não há import_id pra abrir)', () => {
    expect(getImportOfxFooterAction('nothingNew')).toEqual({ kind: 'close' });
  });

  it('alreadyImported: footer é "continuar" com a CTA de já importado', () => {
    expect(getImportOfxFooterAction('alreadyImported')).toEqual({ kind: 'continue', ctaKey: 'alreadyImportedCta' });
  });

  it('inserted: footer é "continuar" com a CTA padrão de resultado', () => {
    expect(getImportOfxFooterAction('inserted')).toEqual({ kind: 'continue', ctaKey: 'resultContinue' });
  });
});
