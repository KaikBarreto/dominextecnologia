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
import {
  CUSTOMER_PORTAL_MODULE_CODE,
  REQUIRED_CUSTOM_MODULE_CODES,
} from './subscriptionCatalog';

describe('publicProposal', () => {
  it('abre com uma matriz no plano inicial quando a URL está vazia', () => {
    const state = parsePublicProposal(new URLSearchParams());

    expect(state.clientName).toBe('');
    expect(state.pricesHidden).toBe(false);
    expect(state.discountPercent).toBe(20);
    expect(state.installments).toBe(3);
    expect(state.units).toHaveLength(1);
    expect(state.units[0]).toMatchObject({ name: 'Matriz', planCode: DEFAULT_PROPOSAL_PLAN });
  });

  it('preserva cliente, unidades, planos e visibilidade no link compartilhável', () => {
    const state = {
      clientName: 'Grupo Clima Forte',
      pricesHidden: true,
      discountPercent: 35,
      installments: 6,
      units: [
        createProposalUnit('Matriz', 'master'),
        createProposalUnit('Filial Norte', 'avancado'),
      ],
    };

    const parsed = parsePublicProposal(serializePublicProposal(state));

    expect(parsed.clientName).toBe(state.clientName);
    expect(parsed.pricesHidden).toBe(true);
    expect(parsed.discountPercent).toBe(35);
    expect(parsed.installments).toBe(6);
    expect(parsed.units.map(({ name, planCode }) => ({ name, planCode }))).toEqual([
      { name: 'Matriz', planCode: 'master' },
      { name: 'Filial Norte', planCode: 'avancado' },
    ]);
  });

  it('preserva módulos e usuários do plano personalizado no link', () => {
    const state = {
      clientName: 'Grupo Personalizado',
      pricesHidden: false,
      discountPercent: 20,
      installments: 3,
      units: [
        createProposalUnit('Matriz', CUSTOM_PLAN_CODE, ['basic', 'crm', 'rh'], 7),
      ],
    };

    const parsed = parsePublicProposal(serializePublicProposal(state));

    expect(parsed.units[0]).toMatchObject({
      planCode: CUSTOM_PLAN_CODE,
      moduleCodes: [...REQUIRED_CUSTOM_MODULE_CODES, 'crm', 'rh'],
      users: 7,
    });
  });

  it('restaura módulos obrigatórios quando o link personalizado tenta removê-los', () => {
    const parsed = parsePublicProposal(
      new URLSearchParams('k=1&l1=personalizado&m1=crm,extra_user,finance_advanced&u1=2'),
    );

    expect(parsed.units[0].moduleCodes).toEqual([...REQUIRED_CUSTOM_MODULE_CODES, 'crm']);
    expect(parsed.units[0].users).toBe(5);
  });

  it('mantém todo o Financeiro como recurso-base gratuito', () => {
    const unit = createProposalUnit(
      'Matriz',
      CUSTOM_PLAN_CODE,
      ['basic', 'finance_advanced', 'cobrancas'],
      5,
    );

    expect(unit.moduleCodes).toContain('finance_advanced');
    expect(unit.moduleCodes).toContain('cobrancas');
    expect(calculateProposalTotals(
      [unit],
      [],
      [
        { code: 'basic', price: 197 },
        { code: 'finance_advanced', price: 0 },
        { code: 'cobrancas', price: 0 },
      ],
      20,
    ).monthly).toBe(197);
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
        { code: 'master', price: 847 },
        { code: 'avancado', price: 547 },
      ]),
    ).toEqual({
      monthly: 1394,
      yearlyFull: 16728,
      yearlyDiscounted: 13382,
      savings: 3346,
      pixInstallment: 13382 / 3,
      discountPercent: 20,
      installments: 3,
    });
  });

  it('recalcula desconto, economia e parcelas com condições personalizadas', () => {
    const units = [createProposalUnit('Matriz', 'start')];

    expect(calculateProposalTotals(
      units,
      [{ code: 'start', price: 100 }],
      [],
      0,
      { discountPercent: 40, installments: 6 },
    )).toEqual({
      monthly: 100,
      yearlyFull: 1200,
      yearlyDiscounted: 720,
      savings: 480,
      pixInstallment: 120,
      discountPercent: 40,
      installments: 6,
    });
  });

  it('limita condições adulteradas da URL aos intervalos comerciais', () => {
    const parsed = parsePublicProposal(new URLSearchParams('d=99&x=1'));

    expect(parsed.discountPercent).toBe(40);
    expect(parsed.installments).toBe(3);
  });

  it('não deixa preço negativo contaminar o orçamento', () => {
    const units = [createProposalUnit('Matriz', 'start')];
    expect(calculateProposalTotals(units, [{ code: 'start', price: -10 }]).monthly).toBe(0);
  });

  it('calcula personalizado sem expor a composição do valor', () => {
    const units = [
      createProposalUnit('Matriz', CUSTOM_PLAN_CODE, ['basic', 'crm', 'rh'], 6),
    ];
    const totals = calculateProposalTotals(
      units,
      [],
      [
        { code: 'basic', price: 197 },
        { code: CUSTOMER_PORTAL_MODULE_CODE, price: 0 },
        { code: 'pricing_advanced', price: 0 },
        { code: 'video_questions', price: 0 },
        { code: 'crm', price: 50 },
        { code: 'rh', price: 100 },
      ],
      20,
    );

    expect(totals.monthly).toBe(367);
    expect(totals.yearlyFull).toBe(4404);
    expect(totals.yearlyDiscounted).toBe(3523);
  });

  it('cobra o nível comercial de WhatsApp no plano personalizado', () => {
    const units = [
      createProposalUnit('Matriz', CUSTOM_PLAN_CODE, ['basic', 'whatsapp'], 5),
    ];

    expect(calculateProposalTotals(
      units,
      [],
      [
        { code: 'basic', price: 197 },
        { code: CUSTOMER_PORTAL_MODULE_CODE, price: 0 },
        { code: 'pricing_advanced', price: 0 },
        { code: 'video_questions', price: 0 },
        { code: 'whatsapp', price: 49 },
      ],
      20,
    ).monthly).toBe(246);
  });
});
