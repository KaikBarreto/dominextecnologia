import {
  BASE_SUBSCRIPTION_MODULE_CODE,
  CUSTOM_PLAN_INCLUDED_USERS,
  EXTRA_USER_MODULE_CODE,
  isRetiredProposalModule,
  withRequiredCustomModules,
} from '@/lib/subscriptionCatalog';

export const MAX_PROPOSAL_UNITS = 20;
export const MAX_PROPOSAL_USERS = 999;
export const DEFAULT_PROPOSAL_PLAN = 'start';
export const DEFAULT_UNIT_NAME = 'Matriz';
export const CUSTOM_PLAN_CODE = 'personalizado';
export const BASE_MODULE_CODE = BASE_SUBSCRIPTION_MODULE_CODE;
export const DEFAULT_PROPOSAL_ANNUAL_DISCOUNT_PERCENT = 20;
export const DEFAULT_PROPOSAL_MONTHLY_DISCOUNT_PERCENT = 0;
export const MIN_PROPOSAL_DISCOUNT_PERCENT = 0;
export const MAX_PROPOSAL_ANNUAL_DISCOUNT_PERCENT = 40;
export const MAX_PROPOSAL_MONTHLY_DISCOUNT_PERCENT = 50;
export const MAX_PROPOSAL_DISCOUNT_AMOUNT = 1_000_000_000;
export const DEFAULT_PROPOSAL_INSTALLMENTS = 3;
export const MIN_PROPOSAL_INSTALLMENTS = 3;
export const MAX_PROPOSAL_INSTALLMENTS = 6;
export { CUSTOM_PLAN_INCLUDED_USERS };

export interface ProposalUnit {
  id: string;
  name: string;
  planCode: string;
  moduleCodes: string[];
  users: number;
}

export type ProposalDiscountMode = 'percent' | 'amount';
export type ProposalDiscountPeriod = 'annual' | 'monthly';

export interface ProposalDiscount {
  mode: ProposalDiscountMode;
  value: number;
}

export interface PublicProposalState {
  clientName: string;
  units: ProposalUnit[];
  pricesHidden: boolean;
  annualDiscount: ProposalDiscount;
  monthlyDiscount: ProposalDiscount;
  installments: number;
}

export interface ProposalPlanPrice {
  code: string;
  price: number;
}

export interface ProposalModulePrice {
  code: string;
  price: number;
}

export interface ProposalTotals {
  monthlyFull: number;
  monthly: number;
  monthlyDiscountAmount: number;
  monthlyDiscount: ProposalDiscount;
  yearlyFull: number;
  yearlyDiscounted: number;
  annualDiscountAmount: number;
  annualDiscount: ProposalDiscount;
  savings: number;
  pixInstallment: number;
  installments: number;
}

export interface ProposalCalculationOptions {
  annualDiscount?: Partial<ProposalDiscount>;
  monthlyDiscount?: Partial<ProposalDiscount>;
  installments?: number;
}

function makeUnitId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `unidade-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanText(value: string | null, maxLength: number): string {
  return (value ?? '').trim().slice(0, maxLength);
}

function cleanPlanCode(value: string | null): string {
  const code = cleanText(value, 64).toLowerCase();
  return /^[a-z0-9_-]+$/.test(code) ? code : DEFAULT_PROPOSAL_PLAN;
}

function cleanModuleCode(value: string): string | null {
  const code = cleanText(value, 64).toLowerCase();
  return /^[a-z0-9_-]+$/.test(code) ? code : null;
}

export function ensureRequiredProposalModules(codes: string[]): string[] {
  const unique = new Set<string>();
  codes.slice(0, 30).forEach((value) => {
    const code = cleanModuleCode(value);
    if (code && code !== EXTRA_USER_MODULE_CODE && !isRetiredProposalModule(code)) unique.add(code);
  });
  return withRequiredCustomModules(Array.from(unique));
}

function cleanUsers(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return CUSTOM_PLAN_INCLUDED_USERS;
  return Math.min(Math.max(Math.trunc(parsed), CUSTOM_PLAN_INCLUDED_USERS), MAX_PROPOSAL_USERS);
}

function cleanIntegerInRange(
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanDecimalInRange(
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof value === 'number'
    ? value
    : value === ''
      ? 0
      : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return roundCurrency(Math.min(Math.max(parsed, min), max));
}

export function maxProposalDiscountPercent(period: ProposalDiscountPeriod): number {
  return period === 'monthly'
    ? MAX_PROPOSAL_MONTHLY_DISCOUNT_PERCENT
    : MAX_PROPOSAL_ANNUAL_DISCOUNT_PERCENT;
}

export function cleanProposalDiscount(
  discount: Partial<ProposalDiscount> | null | undefined,
  period: ProposalDiscountPeriod,
): ProposalDiscount {
  const mode: ProposalDiscountMode = discount?.mode === 'amount' ? 'amount' : 'percent';
  const defaultValue = period === 'annual'
    ? DEFAULT_PROPOSAL_ANNUAL_DISCOUNT_PERCENT
    : DEFAULT_PROPOSAL_MONTHLY_DISCOUNT_PERCENT;
  return {
    mode,
    value: cleanDecimalInRange(
      discount?.value,
      defaultValue,
      MIN_PROPOSAL_DISCOUNT_PERCENT,
      mode === 'percent' ? maxProposalDiscountPercent(period) : MAX_PROPOSAL_DISCOUNT_AMOUNT,
    ),
  };
}

export function proposalDiscountAmount(
  fullPrice: number,
  discount: ProposalDiscount,
  period: ProposalDiscountPeriod,
): number {
  const safeFullPrice = roundCurrency(Math.max(0, fullPrice));
  const cleanedDiscount = cleanProposalDiscount(discount, period);
  const maximumAmount = roundCurrency(
    safeFullPrice * maxProposalDiscountPercent(period) / 100,
  );
  const requestedAmount = cleanedDiscount.mode === 'percent'
    ? roundCurrency(safeFullPrice * cleanedDiscount.value / 100)
    : cleanedDiscount.value;
  return roundCurrency(Math.min(requestedAmount, maximumAmount));
}

export function cleanProposalInstallments(value: string | number | null | undefined): number {
  return cleanIntegerInRange(
    value,
    DEFAULT_PROPOSAL_INSTALLMENTS,
    MIN_PROPOSAL_INSTALLMENTS,
    MAX_PROPOSAL_INSTALLMENTS,
  );
}

export function defaultUnitName(position: number): string {
  return position <= 1 ? DEFAULT_UNIT_NAME : `Filial ${position - 1}`;
}

export function createProposalUnit(
  name = DEFAULT_UNIT_NAME,
  planCode = DEFAULT_PROPOSAL_PLAN,
  moduleCodes: string[] = [BASE_MODULE_CODE],
  users: string | number | null | undefined = CUSTOM_PLAN_INCLUDED_USERS,
): ProposalUnit {
  return {
    id: makeUnitId(),
    name: cleanText(name, 80) || DEFAULT_UNIT_NAME,
    planCode: cleanPlanCode(planCode),
    moduleCodes: ensureRequiredProposalModules(moduleCodes),
    users: cleanUsers(users),
  };
}

export function parsePublicProposal(searchParams: URLSearchParams): PublicProposalState {
  const clientName = cleanText(searchParams.get('c'), 120);
  const pricesHidden = searchParams.get('p') === '1';
  const annualDiscountValue = searchParams.get('ad') ?? searchParams.get('d');
  const monthlyDiscountValue = searchParams.get('md');
  const annualDiscount = cleanProposalDiscount({
    mode: searchParams.get('at') === 'r' ? 'amount' : 'percent',
    value: annualDiscountValue === null ? undefined : Number(annualDiscountValue),
  }, 'annual');
  const monthlyDiscount = cleanProposalDiscount({
    mode: searchParams.get('mt') === 'r' ? 'amount' : 'percent',
    value: monthlyDiscountValue === null ? undefined : Number(monthlyDiscountValue),
  }, 'monthly');
  const installments = cleanProposalInstallments(searchParams.get('x'));
  const rawCount = Number.parseInt(searchParams.get('k') ?? '', 10);
  const count = Number.isFinite(rawCount)
    ? Math.min(Math.max(rawCount, 1), MAX_PROPOSAL_UNITS)
    : 1;

  const units = Array.from({ length: count }, (_, index) => {
    const position = index + 1;
    const legacyPlan = position === 1 ? searchParams.get('plano') : null;
    return createProposalUnit(
      cleanText(searchParams.get(`t${position}`), 80) || defaultUnitName(position),
      searchParams.get(`l${position}`) ?? legacyPlan ?? DEFAULT_PROPOSAL_PLAN,
      (searchParams.get(`m${position}`) ?? BASE_MODULE_CODE).split(','),
      searchParams.get(`u${position}`),
    );
  });

  return { clientName, units, pricesHidden, annualDiscount, monthlyDiscount, installments };
}

export function serializePublicProposal(state: PublicProposalState): URLSearchParams {
  const params = new URLSearchParams();
  const units = state.units.slice(0, MAX_PROPOSAL_UNITS);

  if (state.clientName.trim()) params.set('c', state.clientName.trim().slice(0, 120));
  params.set('k', String(Math.max(units.length, 1)));
  const annualDiscount = cleanProposalDiscount(state.annualDiscount, 'annual');
  const monthlyDiscount = cleanProposalDiscount(state.monthlyDiscount, 'monthly');
  const installments = cleanProposalInstallments(state.installments);
  if (
    annualDiscount.value !== DEFAULT_PROPOSAL_ANNUAL_DISCOUNT_PERCENT
    || annualDiscount.mode !== 'percent'
  ) {
    params.set('ad', String(annualDiscount.value));
  }
  if (annualDiscount.mode === 'amount') params.set('at', 'r');
  if (
    monthlyDiscount.value !== DEFAULT_PROPOSAL_MONTHLY_DISCOUNT_PERCENT
    || monthlyDiscount.mode !== 'percent'
  ) {
    params.set('md', String(monthlyDiscount.value));
  }
  if (monthlyDiscount.mode === 'amount') params.set('mt', 'r');
  if (installments !== DEFAULT_PROPOSAL_INSTALLMENTS) {
    params.set('x', String(installments));
  }

  (units.length > 0 ? units : [createProposalUnit()]).forEach((unit, index) => {
    const position = index + 1;
    params.set(`t${position}`, cleanText(unit.name, 80) || defaultUnitName(position));
    params.set(`l${position}`, cleanPlanCode(unit.planCode));
    if (unit.planCode === CUSTOM_PLAN_CODE) {
      params.set(`m${position}`, ensureRequiredProposalModules(unit.moduleCodes).join(','));
      params.set(`u${position}`, String(cleanUsers(unit.users)));
    }
  });

  if (state.pricesHidden) params.set('p', '1');
  return params;
}

export function calculateProposalTotals(
  units: ProposalUnit[],
  plans: ProposalPlanPrice[],
  modules: ProposalModulePrice[] = [],
  extraUserPrice = 0,
  options: ProposalCalculationOptions = {},
): ProposalTotals {
  const annualDiscount = cleanProposalDiscount(options.annualDiscount, 'annual');
  const monthlyDiscount = cleanProposalDiscount(options.monthlyDiscount, 'monthly');
  const installments = cleanProposalInstallments(options.installments);
  const priceByCode = new Map(plans.map((plan) => [plan.code, Math.max(0, plan.price)]));
  const modulePriceByCode = new Map(
    modules.map((module) => [module.code, Math.max(0, module.price)]),
  );
  const monthlyPrices = units.map((unit) => {
    if (unit.planCode !== CUSTOM_PLAN_CODE) return priceByCode.get(unit.planCode) ?? 0;
    const modulesTotal = ensureRequiredProposalModules(unit.moduleCodes).reduce(
      (total, code) => total + (modulePriceByCode.get(code) ?? 0),
      0,
    );
    const extraUsers = Math.max(0, cleanUsers(unit.users) - CUSTOM_PLAN_INCLUDED_USERS);
    return modulesTotal + extraUsers * Math.max(0, extraUserPrice);
  });
  const monthlyFull = roundCurrency(monthlyPrices.reduce((total, value) => total + value, 0));
  const monthlyDiscountAmount = proposalDiscountAmount(monthlyFull, monthlyDiscount, 'monthly');
  const monthly = roundCurrency(monthlyFull - monthlyDiscountAmount);
  // Os dois descontos partem do preço cheio. O anual nunca usa o mensal já
  // descontado, evitando desconto composto ou conflito entre as condições.
  const yearlyFull = roundCurrency(monthlyFull * 12);
  const annualDiscountAmount = proposalDiscountAmount(yearlyFull, annualDiscount, 'annual');
  const yearlyDiscounted = roundCurrency(yearlyFull - annualDiscountAmount);

  return {
    monthlyFull,
    monthly,
    monthlyDiscountAmount,
    monthlyDiscount,
    yearlyFull,
    yearlyDiscounted,
    annualDiscountAmount,
    annualDiscount,
    savings: annualDiscountAmount,
    pixInstallment: roundCurrency(yearlyDiscounted / installments),
    installments,
  };
}
