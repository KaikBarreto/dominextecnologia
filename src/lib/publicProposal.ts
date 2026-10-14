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
export const DEFAULT_PROPOSAL_DISCOUNT_PERCENT = 20;
export const MIN_PROPOSAL_DISCOUNT_PERCENT = 0;
export const MAX_PROPOSAL_DISCOUNT_PERCENT = 40;
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

export interface PublicProposalState {
  clientName: string;
  units: ProposalUnit[];
  pricesHidden: boolean;
  discountPercent: number;
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
  monthly: number;
  yearlyFull: number;
  yearlyDiscounted: number;
  savings: number;
  pixInstallment: number;
  discountPercent: number;
  installments: number;
}

export interface ProposalCalculationOptions {
  discountPercent?: number;
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

export function cleanProposalDiscount(value: string | number | null | undefined): number {
  return cleanIntegerInRange(
    value,
    DEFAULT_PROPOSAL_DISCOUNT_PERCENT,
    MIN_PROPOSAL_DISCOUNT_PERCENT,
    MAX_PROPOSAL_DISCOUNT_PERCENT,
  );
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
  const discountPercent = cleanProposalDiscount(searchParams.get('d'));
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

  return { clientName, units, pricesHidden, discountPercent, installments };
}

export function serializePublicProposal(state: PublicProposalState): URLSearchParams {
  const params = new URLSearchParams();
  const units = state.units.slice(0, MAX_PROPOSAL_UNITS);

  if (state.clientName.trim()) params.set('c', state.clientName.trim().slice(0, 120));
  params.set('k', String(Math.max(units.length, 1)));
  const discountPercent = cleanProposalDiscount(state.discountPercent);
  const installments = cleanProposalInstallments(state.installments);
  if (discountPercent !== DEFAULT_PROPOSAL_DISCOUNT_PERCENT) {
    params.set('d', String(discountPercent));
  }
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
  const discountPercent = cleanProposalDiscount(options.discountPercent);
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
  const monthly = monthlyPrices.reduce((total, value) => total + value, 0);
  const yearlyFull = monthly * 12;
  const yearlyDiscounted = monthlyPrices.reduce(
    (total, value) => total + Math.round(value * 12 * (1 - discountPercent / 100)),
    0,
  );

  return {
    monthly,
    yearlyFull,
    yearlyDiscounted,
    savings: yearlyFull - yearlyDiscounted,
    pixInstallment: yearlyDiscounted / installments,
    discountPercent,
    installments,
  };
}
