import { calculateYearlyPrice } from '@/utils/subscriptionPricing';

export const MAX_PROPOSAL_UNITS = 20;
export const DEFAULT_PROPOSAL_PLAN = 'start';
export const DEFAULT_UNIT_NAME = 'Matriz';

export interface ProposalUnit {
  id: string;
  name: string;
  planCode: string;
}

export interface PublicProposalState {
  clientName: string;
  units: ProposalUnit[];
  pricesHidden: boolean;
}

export interface ProposalPlanPrice {
  code: string;
  price: number;
}

export interface ProposalTotals {
  monthly: number;
  yearlyFull: number;
  yearlyDiscounted: number;
  savings: number;
  pixInstallment: number;
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

export function defaultUnitName(position: number): string {
  return position <= 1 ? DEFAULT_UNIT_NAME : `Filial ${position - 1}`;
}

export function createProposalUnit(
  name = DEFAULT_UNIT_NAME,
  planCode = DEFAULT_PROPOSAL_PLAN,
): ProposalUnit {
  return {
    id: makeUnitId(),
    name: cleanText(name, 80) || DEFAULT_UNIT_NAME,
    planCode: cleanPlanCode(planCode),
  };
}

export function parsePublicProposal(searchParams: URLSearchParams): PublicProposalState {
  const clientName = cleanText(searchParams.get('c'), 120);
  const pricesHidden = searchParams.get('p') === '1';
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
    );
  });

  return { clientName, units, pricesHidden };
}

export function serializePublicProposal(state: PublicProposalState): URLSearchParams {
  const params = new URLSearchParams();
  const units = state.units.slice(0, MAX_PROPOSAL_UNITS);

  if (state.clientName.trim()) params.set('c', state.clientName.trim().slice(0, 120));
  params.set('k', String(Math.max(units.length, 1)));

  (units.length > 0 ? units : [createProposalUnit()]).forEach((unit, index) => {
    const position = index + 1;
    params.set(`t${position}`, cleanText(unit.name, 80) || defaultUnitName(position));
    params.set(`l${position}`, cleanPlanCode(unit.planCode));
  });

  if (state.pricesHidden) params.set('p', '1');
  return params;
}

export function calculateProposalTotals(
  units: ProposalUnit[],
  plans: ProposalPlanPrice[],
): ProposalTotals {
  const priceByCode = new Map(plans.map((plan) => [plan.code, Math.max(0, plan.price)]));
  const monthly = units.reduce(
    (total, unit) => total + (priceByCode.get(unit.planCode) ?? 0),
    0,
  );
  const yearlyFull = monthly * 12;
  const yearlyDiscounted = units.reduce(
    (total, unit) => total + calculateYearlyPrice(priceByCode.get(unit.planCode) ?? 0),
    0,
  );

  return {
    monthly,
    yearlyFull,
    yearlyDiscounted,
    savings: yearlyFull - yearlyDiscounted,
    pixInstallment: yearlyDiscounted / 3,
  };
}
