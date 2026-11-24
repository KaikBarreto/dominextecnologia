import { describe, expect, it } from 'vitest';
import { appScreenKey } from './appRouteSlugs';

describe('catalog screen identity', () => {
  it.each(['/area-tecnico', '/technician-area', '/espace-technicien'])('keeps list, brand and detail in the same catalog screen at %s', root => {
    const paths = [`${root}/catalogo`, `${root}/catalogo/ar_condicionado`, `${root}/catalogo/compressor/marca/embraco`, `${root}/catalogo/compressor/marca/embraco/modelo/emi60her`, `${root}/catalogo/fluido_refrigerante/gas/R-32`];
    expect(paths.map(appScreenKey)).toEqual(paths.map(() => 'tela:catalogo'));
  });
  it('preserves transitions of other technician tools and unrelated routes', () => {
    const paths = ['/area-tecnico', '/area-tecnico/conversao', '/area-tecnico/superaquecimento', '/area-tecnico/conversao/catalogo', '/orçamentos', '/unrelated/catalogo/ar_condicionado'];
    expect(paths.map(appScreenKey)).toEqual(paths);
  });
  it('preserves existing customer and equipment list-detail identity', () => {
    expect(appScreenKey('/clientes')).toBe(appScreenKey('/clientes/customer-a'));
    expect(appScreenKey('/equipamentos')).toBe(appScreenKey('/equipamentos/equipment-a'));
  });
});
