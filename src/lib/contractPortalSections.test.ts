import { describe, expect, it } from 'vitest';

import {
  parseContractPortalSections,
  setContractPortalSectionState,
} from './contractPortalSections';

describe('contractPortalSections', () => {
  it('mantém apenas estados válidos e trata chave ausente como acesso livre', () => {
    expect(parseContractPortalSections({
      documentos: 'password',
      ocorrencias: 'hidden',
      cobrancas: 'free',
      chave_desconhecida: 'password',
    })).toEqual({ documentos: 'password', ocorrencias: 'hidden' });
  });

  it('remove a chave ao voltar para sem senha e não altera o objeto anterior', () => {
    const current = { documentos: 'password' as const, ocorrencias: 'hidden' as const };

    const next = setContractPortalSectionState(current, 'documentos', 'free');

    expect(next).toEqual({ ocorrencias: 'hidden' });
    expect(current).toEqual({ documentos: 'password', ocorrencias: 'hidden' });
  });
});
