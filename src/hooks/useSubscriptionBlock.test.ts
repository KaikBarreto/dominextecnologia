import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, from, single } = vi.hoisted(() => ({
  authState: {
    user: null as { id: string } | null,
    loading: false,
    profile: null as { company_id: string | null } | null,
    isAdminUser: false,
    profileLoading: false,
  },
  from: vi.fn(),
  single: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single,
  };
  from.mockReturnValue(builder);
  return { supabase: { from } };
});
import {
  decideSubscriptionAccess,
  type SubscriptionCompanyStatus,
  useSubscriptionBlock,
} from "./useSubscriptionBlock";

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
}

function company(
  overrides: Partial<SubscriptionCompanyStatus> = {},
): SubscriptionCompanyStatus {
  return {
    subscription_expires_at: "2030-01-10T23:59:59Z",
    subscription_status: "active",
    subscription_value: 199,
    subscription_plan: "pro",
    payment_lock_bypass: false,
    ...overrides,
  };
}

describe("decideSubscriptionAccess", () => {
  const now = new Date("2030-01-12T08:00:00Z");

  it("mantém assinatura paga durante 1 dia de carência e bloqueia no segundo", () => {
    expect(decideSubscriptionAccess(company(), now).status).toBe("subscription_expired");
    expect(
      decideSubscriptionAccess(
        company({ subscription_expires_at: "2030-01-11T00:00:00Z" }),
        now,
      ).status,
    ).toBe("allowed");
  });

  it("bloqueia trial no dia seguinte e exige data válida", () => {
    expect(
      decideSubscriptionAccess(
        company({
          subscription_status: "testing",
          subscription_expires_at: "2030-01-11T23:59:59Z",
        }),
        now,
      ).status,
    ).toBe("trial_expired");
    expect(
      decideSubscriptionAccess(
        company({ subscription_status: "testing", subscription_expires_at: null }),
        now,
      ).status,
    ).toBe("trial_expired");
  });

  it("bloqueia inactive imediatamente e pending_payment sem bypass", () => {
    expect(
      decideSubscriptionAccess(
        company({ subscription_status: "inactive", subscription_expires_at: null }),
        now,
      ).status,
    ).toBe("subscription_expired");
    expect(
      decideSubscriptionAccess(company({ subscription_status: "pending_payment" }), now).status,
    ).toBe("payment_required");
    expect(
      decideSubscriptionAccess(
        company({ subscription_status: "pending_payment", payment_lock_bypass: true }),
        now,
      ).status,
    ).toBe("allowed");
  });

  it("falha fechado para status ou vencimento inválido", () => {
    expect(
      decideSubscriptionAccess(company({ subscription_status: "desconhecido" }), now).status,
    ).toBe("unavailable");
    expect(
      decideSubscriptionAccess(company({ subscription_expires_at: "invalido" }), now).status,
    ).toBe("unavailable");
  });
});

describe("useSubscriptionBlock", () => {
  beforeEach(() => {
    authState.user = null;
    authState.loading = false;
    authState.profile = null;
    authState.isAdminUser = false;
    authState.profileLoading = false;
    from.mockClear();
    single.mockReset();
  });

  it("falha fechado para usuário autenticado sem tenant", () => {
    authState.user = { id: "usuario" };
    const { result } = renderHook(() => useSubscriptionBlock(), {
      wrapper: queryWrapper(),
    });

    expect(result.current.status).toBe("unavailable");
    expect(result.current.blocked).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it("mantém loading enquanto o perfil autenticado ainda está sendo hidratado", () => {
    authState.user = { id: "usuario" };
    authState.profileLoading = true;
    const { result } = renderHook(() => useSubscriptionBlock(), {
      wrapper: queryWrapper(),
    });

    expect(result.current.status).toBe("checking");
    expect(result.current.blocked).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });

  it("não monta produto quando a consulta da assinatura falha", async () => {
    authState.user = { id: "usuario" };
    authState.profile = { company_id: "tenant" };
    single.mockResolvedValue({ data: null, error: new Error("indisponível") });

    const { result } = renderHook(() => useSubscriptionBlock(), {
      wrapper: queryWrapper(),
    });
    expect(result.current.status).toBe("checking");

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.blocked).toBe(true);
    expect(single).toHaveBeenCalledTimes(2);
  });

  it("não consulta assinatura para admin", () => {
    authState.user = { id: "admin" };
    authState.isAdminUser = true;
    const { result } = renderHook(() => useSubscriptionBlock(), {
      wrapper: queryWrapper(),
    });

    expect(result.current.status).toBe("allowed");
    expect(from).not.toHaveBeenCalled();
  });
});
