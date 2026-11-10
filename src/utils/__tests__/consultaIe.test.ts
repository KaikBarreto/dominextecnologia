import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  consultarIe,
  ieDaUf,
  mesmaIe,
  cnpjBaixado,
  resultadoDeCampos,
} from '@/utils/consultaIe';

/**
 * Testes de `src/utils/consultaIe.ts` com `fetch` mockado.
 *
 * Os payloads abaixo são RECORTES de respostas reais medidas (só os campos que
 * a função lê). Cada bloco corresponde a um caso-limite documentado no arquivo:
 * CNPJ com 14 inscrições (uma por UF), inscrição inativa, lista vazia com
 * situação "Ativa", zeros à esquerda, divergência real, limite de requisições,
 * JSON malformado e rede caindo.
 */

function mockFetchJson(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

function inscricao(ie: string, uf: string, ativo = true, atualizado = '2026-01-15') {
  return {
    inscricao_estadual: ie,
    ativo,
    atualizado_em: atualizado,
    estado: { sigla: uf, ibge_id: 0 },
  };
}

function resposta(opts: {
  situacao?: string | null;
  uf?: string;
  inscricoes?: unknown;
}) {
  const est: Record<string, unknown> = {
    situacao_cadastral: opts.situacao ?? 'Ativa',
    estado: { sigla: opts.uf ?? 'SP', ibge_id: 35 },
  };
  if (opts.inscricoes !== undefined) est.inscricoes_estaduais = opts.inscricoes;
  return { razao_social: 'EMPRESA TESTE SA', estabelecimento: est };
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('consultarIe — contrato básico', () => {
  it('não gasta requisição com CNPJ incompleto', async () => {
    const f = mockFetchJson(200, resposta({}));
    const r = await consultarIe('1746970100491');
    expect(r.success).toBe(false);
    expect(r.error).toBe('cnpj_invalido');
    expect(f).not.toHaveBeenCalled();
  });

  it('aceita CNPJ mascarado e consulta só os dígitos', async () => {
    const f = mockFetchJson(200, resposta({ inscricoes: [inscricao('110042490114', 'SP')] }));
    const r = await consultarIe('62.991.441/0001-50');
    expect(r.success).toBe(true);
    expect(String(f.mock.calls[0][0])).toContain('/62991441000150');
  });
});

describe('17469701004911 — 14 inscrições, uma por UF', () => {
  const ufs = ['MG', 'SP', 'RJ', 'BA', 'PE', 'CE', 'PR', 'RS', 'SC', 'GO', 'ES', 'PA', 'DF', 'MT'];
  const payload = resposta({
    uf: 'MG',
    inscricoes: ufs.map((uf, i) => inscricao(String(100000000 + i), uf)),
  });

  it('devolve a inscrição da UF pedida, não a primeira da lista', async () => {
    mockFetchJson(200, payload);
    const r = await consultarIe('17469701004911');
    expect(r.success).toBe(true);
    expect(r.inscricoes).toHaveLength(14);

    const mt = ieDaUf(r, 'MT');
    expect(mt?.uf).toBe('MT');
    // A primeira da lista é de OUTRO estado: pegar inscricoes[0] entregaria a IE errada.
    expect(r.inscricoes?.[0].uf).toBe('MG');
    expect(mt?.inscricao_estadual).not.toBe(r.inscricoes?.[0].inscricao_estadual);
  });

  it('nunca devolve IE de UF não solicitada', async () => {
    mockFetchJson(200, payload);
    const r = await consultarIe('17469701004911');
    expect(ieDaUf(r, 'AC')).toBeNull();
    expect(ieDaUf(r, 'sp ')?.uf).toBe('SP'); // trim + case-insensitive
    expect(ieDaUf(r, '')).toBeNull();
    expect(ieDaUf(r, '   ')).toBeNull();
  });
});

describe('47960950000121 — 3 inscrições, uma inativa', () => {
  const payload = resposta({
    inscricoes: [
      inscricao('110042490114', 'SP', true),
      inscricao('0010203040', 'PE', false),
      inscricao('0622890260023', 'MG', true),
    ],
  });

  it('ignora inscrição com ativo:false', async () => {
    mockFetchJson(200, payload);
    const r = await consultarIe('47960950000121');
    expect(r.inscricoes).toHaveLength(3);
    expect(ieDaUf(r, 'PE')).toBeNull();
    expect(ieDaUf(r, 'SP')?.inscricao_estadual).toBe('110042490114');
  });

  it('trata ativo não-booleano como inativo', async () => {
    mockFetchJson(200, resposta({ inscricoes: [{ ...inscricao('110042490114', 'SP'), ativo: 'true' }] }));
    const r = await consultarIe('47960950000121');
    expect(r.success).toBe(true);
    expect(r.inscricoes?.[0].ativo).toBe(false);
    expect(ieDaUf(r, 'SP')).toBeNull();
  });
});

describe('19131243000197 — lista vazia é AFIRMAÇÃO de ausência', () => {
  it('success:true com inscricoes:[] e situação Ativa', async () => {
    mockFetchJson(200, resposta({ situacao: 'Ativa', inscricoes: [] }));
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(true);
    expect(r.inscricoes).toEqual([]);
    expect(r.situacaoCadastral).toBe('Ativa');
    expect(cnpjBaixado(r)).toBe(false);
    expect(ieDaUf(r, 'SP')).toBeNull();
  });

  it('chave inscricoes_estaduais AUSENTE não é ausência de IE', async () => {
    mockFetchJson(200, resposta({}));
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.inscricoes).toBeUndefined();
  });
});

describe('mesmaIe — zeros à esquerda e divergência real', () => {
  it('62991441000150: 141501855 (base) == 00141501855 (API)', () => {
    expect(mesmaIe('141501855', '00141501855')).toBe(true);
    expect(mesmaIe('00141501855', '141501855')).toBe(true);
    expect(mesmaIe('141.501.855', '00141501855')).toBe(true);
  });

  it('39505336000141: 24714360 (base) != 243714360 (API)', () => {
    expect(mesmaIe('24714360', '243714360')).toBe(false);
  });

  it('lado sem dígitos nunca afirma igualdade', () => {
    expect(mesmaIe('', '')).toBe(false);
    expect(mesmaIe('ISENTO', '243714360')).toBe(false);
    expect(mesmaIe(null, undefined)).toBe(false);
    expect(mesmaIe('0', '00')).toBe(false); // nada sobra após remover zeros
  });
});

describe('situação cadastral', () => {
  it.each([
    ['Baixada', true],
    ['Suspensa', true],
    ['Inapta', true],
    ['Nula', true],
    ['Ativa', false],
  ] as const)('%s → cnpjBaixado %s', async (situacao, esperado) => {
    mockFetchJson(200, resposta({ situacao, inscricoes: [] }));
    const r = await consultarIe('47960950000121');
    expect(r.situacaoCadastral).toBe(situacao);
    expect(cnpjBaixado(r)).toBe(esperado);
  });

  it('situação desconhecida ou consulta falha não acusam nada', async () => {
    mockFetchJson(200, resposta({ situacao: null, inscricoes: [] }));
    const r = await consultarIe('47960950000121');
    expect(cnpjBaixado(r)).toBe(false);
    expect(cnpjBaixado({ success: false })).toBe(false);
  });
});

describe('falhas — nunca lançam e nunca viram fato fiscal', () => {
  it('429 marca rateLimited', async () => {
    mockFetchJson(429, { status: 429, titulo: 'Muitas requisições' });
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.rateLimited).toBe(true);
    expect(r.inscricoes).toBeUndefined();
  });

  it('404 é falha, não ausência de IE', async () => {
    mockFetchJson(404, { titulo: 'Não encontrado' });
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.rateLimited).toBeUndefined();
    expect(r.error).toBe('http_404');
    expect(r.inscricoes).toBeUndefined();
  });

  it('500 é falha', async () => {
    mockFetchJson(500, {});
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.error).toBe('http_500');
  });

  it('JSON malformado não lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      })),
    );
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.error).toBe('falha_rede');
  });

  it('corpo sem estabelecimento é resposta inesperada', async () => {
    mockFetchJson(200, { razao_social: 'X' });
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.error).toBe('resposta_inesperada');
  });

  it('rede caindo não lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.error).toBe('falha_rede');
    expect(r.inscricoes).toBeUndefined();
  });

  it('inscrição ilegível não vira lista vazia', async () => {
    mockFetchJson(200, resposta({ inscricoes: [{ inscricao_estadual: 'ISENTO', ativo: true }] }));
    const r = await consultarIe('19131243000197');
    expect(r.success).toBe(false);
    expect(r.error).toBe('inscricao_ilegivel');
  });

  it('ieDaUf em resultado falho devolve null', () => {
    expect(ieDaUf({ success: false, rateLimited: true }, 'SP')).toBeNull();
  });
});

describe('resultadoDeCampos — adaptador dos campos achatados', () => {
  it('lista presente vira success:true', () => {
    const r = resultadoDeCampos({
      inscricoes: [
        { inscricao_estadual: '110042490114', uf: 'SP', ativo: true, atualizado_em: null },
      ],
      situacaoCadastral: 'Ativa',
    });
    expect(r.success).toBe(true);
    expect(ieDaUf(r, 'SP')?.inscricao_estadual).toBe('110042490114');
  });

  it('indisponível ou sem lista vira success:false (nunca ausência)', () => {
    expect(resultadoDeCampos({ inscricoes: [], indisponivel: true }).success).toBe(false);
    expect(resultadoDeCampos({}).success).toBe(false);
    expect(resultadoDeCampos({ inscricoes: [] }).success).toBe(true);
  });
});
