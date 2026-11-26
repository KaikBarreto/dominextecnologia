import { describe, expect, it } from 'vitest';
import { resolveTenantPublicTitle } from './usePageTitle';

describe('título da aba nos links públicos do tenant', () => {
  it('mantém o título com o nome da empresa entregue pelo servidor', () => {
    expect(resolveTenantPublicTitle('/pagar/cobranca-abc', 'Pagamento · Clima Exemplo'))
      .toBe('Pagamento · Clima Exemplo');
    expect(resolveTenantPublicTitle('/os-tecnico/os-abc', 'OS #631 · Clima Exemplo'))
      .toBe('OS #631 · Clima Exemplo');
  });

  it('troca o título da plataforma pelo tipo do link, sem citar a Dominex', () => {
    const shell = 'Dominex | Sistema de Ordem de Serviço, PMOC e Gestão';
    const cases: Array<[string, string]> = [
      ['/pagar/x', 'Pagamento'],
      ['/assinar/x', 'Assinatura'],
      ['/orcamento/x', 'Orçamento'],
      ['/proposta/x', 'Proposta'],
      ['/portal/x', 'Portal do Cliente'],
      ['/contrato/unidade/x', 'Contrato'],
      ['/pmoc/unidade/x', 'Contrato'],
      ['/c/x', 'Validação de certificado'],
      ['/cadastro/form-x', 'Cadastro'],
      ['/ponto/joao', 'Ponto eletrônico'],
      ['/ponto/empresa/loja', 'Ponto eletrônico'],
      ['/ativar-ponto/x', 'Cadastro facial'],
      ['/cadastro-facial/x', 'Cadastro facial'],
      ['/avaliacao/x', 'Perfil comportamental'],
      ['/os-tecnico/x', 'Ordem de Serviço'],
    ];
    for (const [path, label] of cases) {
      const title = resolveTenantPublicTitle(path, shell);
      expect(title).toBe(label);
      expect(title).not.toMatch(/dominex/i);
    }
  });

  it('não confia em título com separador que ainda cita a plataforma', () => {
    expect(resolveTenantPublicTitle('/portal/x', 'Portal do Cliente · Dominex')).toBe('Portal do Cliente');
  });

  it('não mexe nas telas do sistema nem nas páginas da própria Dominex', () => {
    for (const path of ['/dashboard', '/cadastro', '/proposta', '/contratos/123', '/clientes/9', '/login', '/']) {
      expect(resolveTenantPublicTitle(path, 'qualquer')).toBeNull();
    }
  });
});
