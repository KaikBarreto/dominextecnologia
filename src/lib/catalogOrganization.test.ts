import { describe, expect, it } from 'vitest';
import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import { catalogCodeMatches, catalogSectionKey, organizeCatalog, withCatalogNavigation } from './catalogOrganization';

function model(id: string, type: string, line?: string, domain = 'ar_condicionado'): EquipmentModel {
  return { id, code: id, brand_id: 'manufacturer', name: id, domain, category_id: type, category: { id: type, name: type },
    image_url: null, manual_url: null, refrigerant: null, potencia_w: null, consumo_kwh_mes: null, created_at: '',
    ...(line ? { catalog_reference: { line, unit_kind: 'indoor', record_scope: 'model', source_url: 'https://example.org', document: '', pages: [], reviewed_at: '' } } : {}) };
}

describe('organização do catálogo por arquitetura e família', () => {
  it('encontra códigos com formatação diferente sem confundir nomes ou números isolados', () => {
    expect(catalogCodeMatches('GWH12ATC-D6DNA1A/I', 'GWH(12)ATC-D6DNA1A/I')).toBe(true);
    expect(catalogCodeMatches('42AGVCI09M5', '42 AGVCI 09 M5')).toBe(true);
    expect(catalogCodeMatches('42AGVCI09M5', '09')).toBe(false);
    expect(catalogCodeMatches(null, 'ARUN100')).toBe(false);
  });
  it('distingue VRF de multi-split mesmo quando ambos usam evaporadora cassete', () => {
    expect(catalogSectionKey(model('1', 'Cassete', 'Multi Split Lite Smart'))).toBe('split');
    expect(catalogSectionKey(model('2', 'Cassete', 'VRV 6'))).toBe('vrf');
    expect(catalogSectionKey(model('3', 'Cassete', 'LG Multi V 5'))).toBe('vrf');
    expect(catalogSectionKey(model('4', 'Cassete', 'GMV6'))).toBe('vrf');
    expect(catalogSectionKey(model('5', 'Cassete', 'DVM S2'))).toBe('vrf');
  });
  it('não usa capacidade ou prefixo do SKU para presumir categoria', () => {
    expect(catalogSectionKey(model('30AJ', 'Chiller a ar'))).toBe('industrial');
    expect(catalogSectionKey(model('AG042KSVANH/EU', 'Chiller', 'DVM Chiller sem bomba'))).toBe('industrial');
    expect(catalogSectionKey(model('AMNW07GSJR0', 'ARTCOOL Mirror', 'Multi Inverter'))).toBe('split');
    expect(catalogSectionKey(model('published-configuration', 'Comercial leve', 'G-Prime Plus II'))).toBe('split');
    expect(catalogSectionKey(model('9000BTU', 'Não identificado'))).toBe('other');
    expect(catalogSectionKey(model('purifier', 'Purificador de ar', undefined, 'linha_branca'))).toBe('air');
    expect(catalogSectionKey(model('fridge', 'Geladeira', undefined, 'linha_branca'))).toBe('appliances');
    expect(catalogSectionKey(model('compressor', 'Scroll', undefined, 'compressor'))).toBe('compressors');
  });
  it('inclui cada referência uma vez e agrupa famílias sem depender de quantidade', () => {
    const models = [model('a', 'Cassete', 'GMV6'), model('b', 'Dutado', 'GMV6'), model('c', 'Chiller', 'Industrial')];
    const sections = organizeCatalog(models);
    expect(sections.flatMap(section => section.models)).toHaveLength(3);
    expect(sections.find(section => section.key === 'vrf')?.families).toHaveLength(1);
    expect(sections.find(section => section.key === 'vrf')?.families[0].models.map(item => item.id)).toEqual(['a', 'b']);
  });
  it('preserva somente a navegação relevante ao abrir e voltar do diagnóstico', () => {
    const scope = new URLSearchParams({ categoria: 'vrf', familia: 'multi-v-5', busca: 'ARUN', token: 'do-not-copy' });
    const url = withCatalogNavigation('/area-tecnico/catalogo/modelo?codigo=CH01&from=marca', scope);
    expect(url).toContain('categoria=vrf'); expect(url).toContain('familia=multi-v-5'); expect(url).toContain('busca=ARUN');
    expect(url).toContain('codigo=CH01'); expect(url).not.toContain('token=');
    expect(withCatalogNavigation('marca/lg/modelo/multi-v?codigo=CH01', scope)).toMatch(/^marca\/lg\/modelo\/multi-v\?/);
    expect(withCatalogNavigation('../ar_condicionado', new URLSearchParams())).toBe('../ar_condicionado');
  });
});
