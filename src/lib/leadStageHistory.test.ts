import { describe, it, expect } from 'vitest';
import {
  shouldLogStageChange,
  buildStageChangeDescription,
  parseStageChangeDescription,
  STAGE_CHANGE_INTERACTION_TYPE,
} from './leadStageHistory';

describe('shouldLogStageChange — soltar na mesma coluna não pode virar ruído no histórico', () => {
  it('mesmo estágio (drop na própria coluna) não loga', () => {
    expect(shouldLogStageChange('stage-1', 'stage-1')).toBe(false);
  });

  it('estágio diferente loga', () => {
    expect(shouldLogStageChange('stage-1', 'stage-2')).toBe(true);
  });

  it('lead sem estágio anterior (fila) indo pra um estágio loga', () => {
    expect(shouldLogStageChange(null, 'stage-2')).toBe(true);
  });

  it('update que não mexe em stage_id (next undefined) não loga', () => {
    expect(shouldLogStageChange('stage-1', undefined)).toBe(false);
  });

  it('next null (limpando o estágio) não loga — não tem "para onde" registrar', () => {
    expect(shouldLogStageChange('stage-1', null)).toBe(false);
  });
});

describe('buildStageChangeDescription / parseStageChangeDescription — round-trip', () => {
  it('serializa e reconstrói o snapshot igual', () => {
    const snapshot = {
      from_stage_id: 'stage-1',
      from_stage_name: 'Leads',
      to_stage_id: 'stage-2',
      to_stage_name: 'Negociação',
    };
    const raw = buildStageChangeDescription(snapshot);
    expect(parseStageChangeDescription(raw)).toEqual(snapshot);
  });

  it('lead sem estágio anterior serializa from null e volta null', () => {
    const snapshot = {
      from_stage_id: null,
      from_stage_name: null,
      to_stage_id: 'stage-2',
      to_stage_name: 'Negociação',
    };
    const raw = buildStageChangeDescription(snapshot);
    expect(parseStageChangeDescription(raw)).toEqual(snapshot);
  });

  it('description nula (interação sem descrição) não quebra, vira null', () => {
    expect(parseStageChangeDescription(null)).toBeNull();
    expect(parseStageChangeDescription(undefined)).toBeNull();
  });

  it('description de uma interação manual antiga (texto livre, não JSON) vira null em vez de quebrar', () => {
    expect(parseStageChangeDescription('Cliente pediu desconto, vou retornar amanhã.')).toBeNull();
  });

  it('JSON válido mas sem to_stage_id (formato inesperado) vira null', () => {
    expect(parseStageChangeDescription(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });
});

describe('STAGE_CHANGE_INTERACTION_TYPE', () => {
  it('é um valor estável (chave usada tanto na gravação quanto na leitura)', () => {
    expect(STAGE_CHANGE_INTERACTION_TYPE).toBe('mudanca_estagio');
  });
});
