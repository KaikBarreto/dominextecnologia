import { describe, it, expect } from 'vitest';
import {
  fuzzyIncludes,
  fuzzyIncludesAny,
  fuzzyIncludesPhone,
  normalizeSearch,
  onlyDigits,
} from './utils';

describe('normalizeSearch', () => {
  it('tira acento, caixa e espaço sobrando', () => {
    expect(normalizeSearch('  Marcos   ANTÔNIO ')).toBe('marcos antonio');
    expect(normalizeSearch('Orçamento')).toBe('orcamento');
    expect(normalizeSearch('Instalação à Válvula')).toBe('instalacao a valvula');
  });
});

describe('onlyDigits', () => {
  it('extrai só os dígitos e tolera nulo', () => {
    expect(onlyDigits('(21) 96830-1901')).toBe('21968301901');
    expect(onlyDigits('123.456.789-00')).toBe('12345678900');
    expect(onlyDigits(null)).toBe('');
    expect(onlyDigits(undefined)).toBe('');
  });
});

describe('fuzzyIncludes — comportamento antigo preservado', () => {
  it('busca vazia passa tudo', () => {
    expect(fuzzyIncludes('qualquer coisa', '')).toBe(true);
    expect(fuzzyIncludes('qualquer coisa', '   ')).toBe(true);
  });

  it('haystack vazio nunca casa', () => {
    expect(fuzzyIncludes('', 'marcos')).toBe(false);
    expect(fuzzyIncludes(null, 'marcos')).toBe(false);
    expect(fuzzyIncludes(undefined, 'marcos')).toBe(false);
  });

  it('substring simples e sem espaço', () => {
    expect(fuzzyIncludes('Maria da Luz', 'da luz')).toBe(true);
    expect(fuzzyIncludes('Maria da Luz', 'daluz')).toBe(true);
    expect(fuzzyIncludes('Maria da Luz', 'joao')).toBe(false);
  });
});

describe('fuzzyIncludes — acento', () => {
  it('acha com e sem acento, nos dois sentidos', () => {
    expect(fuzzyIncludes('Marcos Antônio Moraes Braga', 'antonio')).toBe(true);
    expect(fuzzyIncludes('Marcos Antonio Moraes Braga', 'antônio')).toBe(true);
    expect(fuzzyIncludes('Manutenção Preventiva', 'manutencao')).toBe(true);
    expect(fuzzyIncludes('Conserto de Split', 'conserto')).toBe(true);
  });
});

describe('fuzzyIncludes — palavras soltas e fora de ordem', () => {
  const nome = 'Marcos Antônio Moraes Braga';

  it('acha o cliente digitando só o primeiro e o último nome', () => {
    expect(fuzzyIncludes(nome, 'Marcos Braga')).toBe(true);
    expect(fuzzyIncludes(nome, 'marcos braga')).toBe(true);
  });

  it('acha fora de ordem', () => {
    expect(fuzzyIncludes(nome, 'braga marcos')).toBe(true);
    expect(fuzzyIncludes(nome, 'braga antonio')).toBe(true);
  });

  it('exige que TODAS as palavras apareçam', () => {
    expect(fuzzyIncludes(nome, 'marcos silva')).toBe(false);
    expect(fuzzyIncludes(nome, 'braga joao')).toBe(false);
  });

  it('continua achando o prefixo literal que já funcionava', () => {
    expect(fuzzyIncludes(nome, 'Marcos an')).toBe(true);
  });
});

describe('fuzzyIncludes — telefone e documento (modo número)', () => {
  const telefone = '(21) 96830-1901';

  it('acha o telefone com qualquer máscara', () => {
    expect(fuzzyIncludes(telefone, '21 96830-1901')).toBe(true);
    expect(fuzzyIncludes(telefone, '21968301901')).toBe(true);
    expect(fuzzyIncludes(telefone, '(21) 96830-1901')).toBe(true);
    expect(fuzzyIncludes(telefone, '968301901')).toBe(true);
    expect(fuzzyIncludes(telefone, '9683')).toBe(true);
  });

  it('acha telefone salvo sem máscara digitando com máscara', () => {
    expect(fuzzyIncludes('21968301901', '(21) 96830-1901')).toBe(true);
  });

  it('ignora o +55 na frente', () => {
    expect(fuzzyIncludes('+55 21 96830-1901', '21968301901')).toBe(true);
  });

  it('não casa telefone de outro cliente', () => {
    expect(fuzzyIncludes(telefone, '21999998888')).toBe(false);
  });

  it('acha CPF/CNPJ sem precisar da pontuação', () => {
    expect(fuzzyIncludes('123.456.789-00', '12345678900')).toBe(true);
    expect(fuzzyIncludes('12345678900', '123.456.789-00')).toBe(true);
    expect(fuzzyIncludes('12.345.678/0001-99', '12345678000199')).toBe(true);
  });

  it('nome sem dígito nenhum não casa busca numérica', () => {
    expect(fuzzyIncludes('Marcos Antônio', '21968301901')).toBe(false);
  });

  it('busca com 1 ou 2 dígitos continua sendo texto (sem ruído)', () => {
    expect(fuzzyIncludes('(21) 96830-1901', '21')).toBe(true);
    expect(fuzzyIncludes('(11) 96830-1901', '21')).toBe(false);
  });

  it('acha número de OS com zeros à esquerda', () => {
    expect(fuzzyIncludes('OS-000123', '123')).toBe(true);
    expect(fuzzyIncludes('OS-000123', '000123')).toBe(true);
  });
});

describe('fuzzyIncludesAny', () => {
  const cliente = {
    name: 'Marcos Antônio Moraes Braga',
    phone: '(21) 3333-4444',
    celular: '(21) 96830-1901',
    email: 'marcos@empresa.com.br',
    document: '123.456.789-00',
  };
  const campos = [cliente.name, cliente.phone, cliente.celular, cliente.email, cliente.document];

  it('casa por qualquer um dos campos', () => {
    expect(fuzzyIncludesAny(campos, 'marcos braga')).toBe(true);
    expect(fuzzyIncludesAny(campos, '21968301901')).toBe(true);
    expect(fuzzyIncludesAny(campos, '33334444')).toBe(true);
    expect(fuzzyIncludesAny(campos, 'marcos@empresa')).toBe(true);
    expect(fuzzyIncludesAny(campos, '12345678900')).toBe(true);
  });

  it('não casa o que não existe em campo nenhum', () => {
    expect(fuzzyIncludesAny(campos, 'joao silva')).toBe(false);
    expect(fuzzyIncludesAny(campos, '21999998888')).toBe(false);
  });

  it('tolera campo nulo e busca vazia', () => {
    expect(fuzzyIncludesAny([null, undefined, ''], 'marcos')).toBe(false);
    expect(fuzzyIncludesAny([null, undefined], '')).toBe(true);
  });
});

describe('fuzzyIncludesPhone — telas com número próprio (OS, orçamento)', () => {
  const celular = '(21) 96830-1901';

  it('casa quando a busca é um telefone', () => {
    expect(fuzzyIncludesPhone(celular, '96830-1901')).toBe(true);
    expect(fuzzyIncludesPhone(celular, '21968301901')).toBe(true);
    expect(fuzzyIncludesPhone(celular, '(21) 96830-1901')).toBe(true);
  });

  it('ignora busca curta, pra nº de OS não puxar telefone', () => {
    expect(fuzzyIncludesPhone(celular, '123')).toBe(false);
    expect(fuzzyIncludesPhone(celular, '1901')).toBe(false);
    expect(fuzzyIncludesPhone(celular, '96830')).toBe(false);
  });

  it('ignora busca com letra', () => {
    expect(fuzzyIncludesPhone(celular, 'OS-968301')).toBe(false);
    expect(fuzzyIncludesPhone(celular, 'marcos')).toBe(false);
  });

  it('tolera campo vazio', () => {
    expect(fuzzyIncludesPhone(null, '21968301901')).toBe(false);
    expect(fuzzyIncludesPhone('', '21968301901')).toBe(false);
    expect(fuzzyIncludesPhone(celular, '')).toBe(false);
  });
});
