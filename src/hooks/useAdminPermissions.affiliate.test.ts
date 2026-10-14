// Prova que o afiliado-only (parceiro EXTERNO, sem linha em
// `admin_permissions`) enxerga UMA tela do painel e nada mais. A segurança real
// é a RLS de self-scope; este teste trava a régua de UX/runtime contra uma
// "simplificação" futura que alargasse o gate.
import { createElement, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState, maybeSingle } = vi.hoisted(() => ({
  authState: {
    user: { id: "afiliado-user" } as { id: string } | null,
    roles: [] as string[],
    linkedAffiliateId: null as string | null,
    affiliateLoading: false,
  },
  maybeSingle: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/integrations/supabase/client", () => {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle,
    then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
  };
  return { supabase: { from: vi.fn(() => builder) } };
});

import { ADMIN_SCREEN_PERMISSIONS, useAdminPermissions } from "./useAdminPermissions";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: PropsWithChildren) =>
    createElement(QueryClientProvider, { client }, children);
}

describe("useAdminPermissions — afiliado externo", () => {
  beforeEach(() => {
    authState.user = { id: "afiliado-user" };
    authState.roles = [];
    authState.linkedAffiliateId = null;
    authState.affiliateLoading = false;
    maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it("afiliado-only enxerga SOMENTE a tela de afiliados", () => {
    authState.linkedAffiliateId = "afiliado-1";
    const { result } = renderHook(() => useAdminPermissions(), { wrapper: wrapper() });

    expect(result.current.isAffiliateOnly).toBe(true);
    expect(result.current.hasMasterAccess).toBe(false);
    for (const screen of ADMIN_SCREEN_PERMISSIONS) {
      expect(result.current.hasScreenAccess(screen.key)).toBe(
        screen.key === "admin_afiliados",
      );
    }
    // Telas do painel que não estão no catálogo de permissões também ficam fora.
    for (const key of ["admin_cobrancas", "admin_blog", "admin_estatisticas", "admin_domiflix"]) {
      expect(result.current.hasScreenAccess(key)).toBe(false);
    }
  });

  it("super_admin com ficha de afiliado continua vendo tudo", () => {
    authState.roles = ["super_admin"];
    authState.linkedAffiliateId = "afiliado-1";
    const { result } = renderHook(() => useAdminPermissions(), { wrapper: wrapper() });

    expect(result.current.isAffiliateOnly).toBe(false);
    expect(result.current.hasScreenAccess("admin_empresas")).toBe(true);
  });

  it("usuário sem vínculo de afiliado não ganha a tela", () => {
    const { result } = renderHook(() => useAdminPermissions(), { wrapper: wrapper() });

    expect(result.current.isAffiliateOnly).toBe(false);
    expect(result.current.hasScreenAccess("admin_afiliados")).toBe(false);
  });
});

describe("wiring do acesso do afiliado", () => {
  it("o gate de rota do painel libera o afiliado em UMA screenKey só", () => {
    const authSource = readFileSync(`${process.cwd()}/src/contexts/AuthContext.tsx`, "utf8");
    // A liberação por vínculo é condicionada à key; qualquer outra cai no
    // `adminPermissions.includes`, que pro afiliado é sempre vazio.
    expect(authSource).toContain(
      "if (key === 'admin_afiliados' && !!linkedAffiliateId) return true;",
    );
    // E o afiliado NUNCA é admin no runtime.
    expect(authSource).toContain(
      "const isAdminUser = isMaster || adminPermissions.length > 0;",
    );
  });

  it("as duas rotas de afiliados ficam sob AdminScreenRoute", () => {
    const appSource = readFileSync(`${process.cwd()}/src/App.tsx`, "utf8");
    expect(appSource).toContain(
      '<Route path="/admin/afiliados" element={<AdminScreenRoute screenKey="admin_afiliados"><AdminAffiliates /></AdminScreenRoute>} />',
    );
    expect(appSource).toContain(
      '<Route path="/admin/afiliados/:id" element={<AdminScreenRoute screenKey="admin_afiliados"><AdminAffiliateDetail /></AdminScreenRoute>} />',
    );
  });
});
