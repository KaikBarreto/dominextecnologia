import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROPOSAL_PLAN,
  CUSTOM_PLAN_CODE,
  MAX_PROPOSAL_UNITS,
  calculateProposalTotals,
  createProposalUnit,
  parsePublicProposal,
  serializePublicProposal,
} from './publicProposal';
import { CUSTOMER_PORTAL_MODULE_CODE } from './subscriptionCatalog';

describe('publicProposal', () => {
  it('abre com uma matriz no plano inicial quando a URL está vazia', () => {
    const state = parsePublicProposal(new URLSearchParams());

    expect(state.clientName).toBe('');
    expect(state.pricesHidden).toBe(false);
    expect(state.units).toHaveLength(1);
    expect(state.units[0]).toMatchObject({ name: 'Matriz', planCode: DEFAULT_PROPOSAL_PLAN });
  });

  it('preserva cliente, unidades, planos e visibilidade no link compartilhável', () => {
    const state = {
      clientName: 'Grupo Clima Forte',
      pricesHidden: true,
      units: [
        createProposalUnit('Matriz', 'master'),
        createProposalUnit('Filial Norte', 'avancado'),
      ],
    };

    const parsed = parsePublicProposal(serializePublicProposal(state));

    expect(parsed.clientName).toBe(state.clientName);
    expect(parsed.pricesHidden).toBe(true);
    expect(parsed.units.map(({ name, planCode }) => ({ name, planCode }))).toEqual([
      { name: 'Matriz', planCode: 'master' },
      { name: 'Filial Norte', planCode: 'avancado' },
    ]);
  });

  it('preserva módulos e usuários do plano personalizado no link', () => {
    const state = {
      clientName: 'Grupo Personalizado',
      pricesHidden: false,
      units: [
        createProposalUnit('Matriz', CUSTOM_PLAN_CODE, ['basic', 'crm', 'rh'], 7),
      ],
    };

    const parsed = parsePublicProposal(serializePublicProposal(state));

    expect(parsed.units[0]).toMatchObject({
      planCode: CUSTOM_PLAN_CODE,
      moduleCodes: ['basic', CUSTOMER_PORTAL_MODULE_CODE, 'crm', 'rh'],
      users: 7,
    });
  });

  it('restaura módulos obrigatórios quando o link personalizado tenta removê-los', () => {
    const parsed = parsePublicProposal(
      new URLSearchParams('k=1&l1=personalizado&m1=crm,extra_user&u1=2'),
    );

    expect(parsed.units[0].moduleCodes).toEqual(['basic', CUSTOMER_PORTAL_MODULE_CODE, 'crm']);
  });

  it('limita URLs adulteradas e rejeita código de plano inválido', () => {
    const parsed = parsePublicProposal(
      new URLSearchParams(`k=999&l1=%3Cscript%3E&t1=${'A'.repeat(200)}`),
    );

    expect(parsed.units).toHaveLength(MAX_PROPOSAL_UNITS);
    expect(parsed.units[0].name).toHaveLength(80);
    expect(parsed.units[0].planCode).toBe(DEFAULT_PROPOSAL_PLAN);
  });

  it('soma os planos por unidade e calcula o anual com 20% de desconto', () => {
    const units = [
      createProposalUnit('Matriz', 'master'),
      createProposalUnit('Filial 1', 'avancado'),
    ];

    expect(
      calculateProposalTotals(units, [
        { code: 'master', price: 697 },
        { code: 'avancado', price: 447 },
      ]),
    ).toEqual({
      monthly: 1144,
      yearlyFull: 13728,
      yearlyDiscounted: 10982,
      savings: 2746,
      pixInstallment: 10982 / 3,
    });
  });

  it('não deixa preço negativo contaminar o orçamento', () => {
    const units = [createProposalUnit('Matriz', 'start')];
    expect(calculateProposalTotals(units, [{ code: 'start', price: -10 }]).monthly).toBe(0);
  });

  it('calcula personalizado sem expor a composição do valor', () => {
    const units = [
      createProposalUnit('Matriz', CUSTOM_PLAN_CODE, ['basic', 'crm', 'rh'], 4),
    ];
    const totals = calculateProposalTotals(
      units,
      [],
      [
        { code: 'basic', price: 197 },
        { code: CUSTOMER_PORTAL_MODULE_CODE, price: 0 },
        { code: 'crm', price: 50 },
        { code: 'rh', price: 100 },
      ],
      50,
    );

    expect(totals.monthly).toBe(447);
    expect(totals.yearlyFull).toBe(5364);
    expect(totals.yearlyDiscounted).toBe(4291);
  });
});
