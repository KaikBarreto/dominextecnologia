// Filtro "Atende como" (Serviço/Loja) da lista de Clientes — módulo PDV.
//
// A trava que importa: cliente marcado como OS DOIS tipos tem que aparecer
// nos dois filtros. Se a checagem virasse igualdade estrita em vez de "tem a
// flag", o cliente que é Serviço E Loja desapareceria de ambos os filtros
// específicos (só sobreviveria em "Todos"), que é exatamente o caso de uso
// citado pelo CEO: a refrigeração que atende o condomínio e também vende
// peça pra ele no balcão.
import { describe, it, expect } from 'vitest';
import { matchesCustomerKindFilter, type CustomerKindFilter } from './Customers';

type MinimalCustomer = { is_service_customer?: boolean; is_store_customer?: boolean };

const soServico: MinimalCustomer = { is_service_customer: true, is_store_customer: false };
const soLoja: MinimalCustomer = { is_service_customer: false, is_store_customer: true };
const osDois: MinimalCustomer = { is_service_customer: true, is_store_customer: true };
const nenhum: MinimalCustomer = { is_service_customer: false, is_store_customer: false };
const legadoSemFlag: MinimalCustomer = {}; // customer.is_service_customer/is_store_customer undefined

describe('matchesCustomerKindFilter', () => {
  it('"all" não filtra nada, inclusive quem não marcou nenhum dos dois', () => {
    for (const c of [soServico, soLoja, osDois, nenhum, legadoSemFlag]) {
      expect(matchesCustomerKindFilter(c, 'all')).toBe(true);
    }
  });

  it('filtro "servico" pega só serviço E o cliente que é os dois', () => {
    expect(matchesCustomerKindFilter(soServico, 'servico')).toBe(true);
    expect(matchesCustomerKindFilter(osDois, 'servico')).toBe(true);
    expect(matchesCustomerKindFilter(soLoja, 'servico')).toBe(false);
    expect(matchesCustomerKindFilter(nenhum, 'servico')).toBe(false);
  });

  it('filtro "loja" pega só loja E o cliente que é os dois', () => {
    expect(matchesCustomerKindFilter(soLoja, 'loja')).toBe(true);
    expect(matchesCustomerKindFilter(osDois, 'loja')).toBe(true);
    expect(matchesCustomerKindFilter(soServico, 'loja')).toBe(false);
    expect(matchesCustomerKindFilter(nenhum, 'loja')).toBe(false);
  });

  it('cliente marcado como os DOIS tipos aparece nos dois filtros específicos (não só em "Todos")', () => {
    const filtros: CustomerKindFilter[] = ['servico', 'loja'];
    for (const f of filtros) {
      expect(matchesCustomerKindFilter(osDois, f)).toBe(true);
    }
  });

  it('cliente legado sem a flag definida (undefined) não quebra e não aparece em filtro específico', () => {
    expect(matchesCustomerKindFilter(legadoSemFlag, 'servico')).toBe(false);
    expect(matchesCustomerKindFilter(legadoSemFlag, 'loja')).toBe(false);
    expect(matchesCustomerKindFilter(legadoSemFlag, 'all')).toBe(true);
  });
});
