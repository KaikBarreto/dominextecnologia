import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261123160000_customer_email_checkout_actions.sql",
  ),
  "utf8",
);

describe("acoes de checkout nos e-mails de cobranca", () => {
  it("entrega o codigo publico da cobranca ao worker", () => {
    expect(migration).toContain("public_short_code text");
    expect(migration).toContain("tc.public_short_code");
  });

  it("preserva tenant, gate de modulo e acesso exclusivo do service role", () => {
    expect(migration).toContain("tc.company_id = s.company_id");
    expect(migration).toContain(
      "company_has_module(s.company_id, 'cobrancas')",
    );
    expect(migration).toMatch(
      /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/i,
    );
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/i);
  });
});
