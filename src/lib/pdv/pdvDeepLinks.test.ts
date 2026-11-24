import { describe, expect, it } from 'vitest';
import { resolveRequestedPdvOrderId } from './pdvDeepLinks';

describe('resolveRequestedPdvOrderId', () => {
  it('prefere o parâmetro atual pedido', () => {
    expect(resolveRequestedPdvOrderId(new URLSearchParams('pedido=atual&order=legado'))).toBe('atual');
  });

  it('mantém compatibilidade com links antigos dos relatórios', () => {
    expect(resolveRequestedPdvOrderId(new URLSearchParams('order=legado'))).toBe('legado');
  });

  it('não inventa pedido quando o link não informa um', () => {
    expect(resolveRequestedPdvOrderId(new URLSearchParams())).toBeNull();
  });
});
