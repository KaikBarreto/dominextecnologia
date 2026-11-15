import { describe, expect, it } from 'vitest';
import { MODELOS_SUPERAQUECIMENTO, MODELO_PADRAO_ID, getModeloSuperaquecimento } from './superaquecimentoModelos';

describe('rastreabilidade dos perfis de SH e SC', () => {
  it('mantém a referência padrão explicitamente genérica, sem fonte de fabricante inventada', () => {
    const padrao = getModeloSuperaquecimento(MODELO_PADRAO_ID);
    expect(padrao).toMatchObject({ alvoSH: [4, 8], alvoSC: null, confianca: 'generico' });
    expect(padrao?.fonteUrl).toBeUndefined();
    expect(padrao?.refrigPadrao).toBeUndefined();
  });
  it('mantém os IDs dos perfis salvos, mas nenhum alvo ou gás automático sem manual confirmado', () => {
    const idsLegados = ['split-11d', 'samsung', 'comfee', 'philco-elgin', 'hitachi-hiwall', 'york-hiwall', 'rheem-k7-hiwall', 'carrier-springer-pt-k7', 'hitachi-serie-e', 'carrier-ecosplit'];
    for (const id of idsLegados) {
      const perfil = getModeloSuperaquecimento(id);
      expect(perfil?.id).toBe(id);
      expect(perfil?.label).toBeTruthy();
      expect(perfil?.alvoSH).toBeNull();
      expect(perfil?.alvoSC).toBeNull();
      expect(perfil?.confianca).toBe('generico');
      expect(perfil?.refrigPadrao).toBeUndefined();
      expect(perfil?.fonteUrl).toBeUndefined();
      expect(perfil?.nota).toContain('modelo exato');
      expect(perfil?.nota).not.toMatch(/\d.*(?:°C|g\/m)/);
    }
  });
  it('não expõe dados legados por meio da listagem pública e não oferece fontes falsas', () => {
    const verificados = MODELOS_SUPERAQUECIMENTO.filter(modelo => modelo.fonteUrl);
    expect(verificados).toHaveLength(0);
    for (const modelo of MODELOS_SUPERAQUECIMENTO) {
      expect(modelo).toEqual(getModeloSuperaquecimento(modelo.id));
    }
    expect(getModeloSuperaquecimento('modelo-inexistente')).toBeUndefined();
  });
});
