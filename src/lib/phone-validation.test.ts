import { describe, expect, it } from 'vitest';
import { isValidBrazilianPhone } from './phone-validation';
import { isValidBrazilianPhone as isValidBrazilianPhoneAtEdge } from '../../supabase/functions/_shared/phone-validation';

describe('isValidBrazilianPhone', () => {
  it.each(['(21) 98765-4321', '11987654321', '(11) 3333-4444'])(
    'aceita telefone brasileiro completo: %s',
    (phone) => expect(isValidBrazilianPhone(phone)).toBe(true),
  );

  it.each(['5550199', '(00) 99999-9999', '11111111111', '(21) 1234-5678', '(21) 88765-4321'])(
    'rejeita telefone incompleto ou impossível: %s',
    (phone) => expect(isValidBrazilianPhone(phone)).toBe(false),
  );

  it.each(['(21) 98765-4321', '(11) 3333-4444', '5550199', '(00) 99999-9999'])(
    'mantém frontend e edge function com a mesma decisão: %s',
    (phone) => expect(isValidBrazilianPhoneAtEdge(phone)).toBe(isValidBrazilianPhone(phone)),
  );
});
