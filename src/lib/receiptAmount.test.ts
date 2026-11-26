import { describe, expect, it } from 'vitest';
import { parseReceiptAmount } from './receiptAmount';
describe('valor digitado no recebimento', () => {
 it.each(['2600', '2600,00', '2600.00', '2.600,00', '2.600'])('interpreta %s como 2600 sem multiplicar o pagamento por 100', value => expect(parseReceiptAmount(value)).toBe(2600));
 it.each(['-1', '12,345', '1.2.3', 'NaN', 'Infinity', 'abc', '2,600.00'])('recusa valor ambíguo ou inválido %s', value => expect(parseReceiptAmount(value)).toBeNaN());
 it('mantém campo vazio como zero para a tarifa opcional', () => expect(parseReceiptAmount('')).toBe(0));
});
