import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261123163000_customer_email_content_editor.sql",
  ),
  "utf8",
);

describe("conteúdo personalizado dos e-mails de cobrança", () => {
  it("persiste somente eventos, campos e variáveis autorizados", () => {
    expect(migration).toContain("content_overrides jsonb");
    expect(migration).toContain("'charge_created'");
    expect(migration).toContain("'subject', 'eyebrow', 'title', 'intro'");
    expect(migration).toContain("(cliente|empresa|valor|vencimento)");
    expect(migration).toContain("customer_email_content_overrides_valid");
  });

  it("mantém permissão, gate de cobranças e isolamento por empresa", () => {
    expect(migration).toContain("public.can_manage_system(v_user_id)");
    expect(migration).toContain(
      "company_has_module(v_company_id, 'cobrancas')",
    );
    expect(migration).toContain("tc.company_id = s.company_id");
    expect(migration).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i);
    expect(migration).toMatch(
      /claim_customer_email_deliveries[\s\S]*TO service_role/i,
    );
  });

  it("entrega conteúdo e checkout ao worker sem perder o código público", () => {
    expect(migration).toContain("s.template_style, s.content_overrides");
    expect(migration).toContain("public_short_code text");
    expect(migration).toContain("tc.public_short_code");
  });
});
