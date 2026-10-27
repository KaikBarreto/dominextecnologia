import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const edge = readFileSync(
  `${process.cwd()}/supabase/functions/request-subscription-nfse/index.ts`,
  'utf8',
);
const webhook = readFileSync(
  `${process.cwd()}/supabase/functions/asaas-webhook/index.ts`,
  'utf8',
);
const migration = readFileSync(
  `${process.cwd()}/supabase/migrations/20261027140000_subscription_payment_nfse_ondemand.sql`,
  'utf8',
);

describe('contrato seguro da NFS-e da assinatura', () => {
  it('deriva o tenant do pagamento e não aceita company_id do navegador', () => {
    expect(edge).toMatch(
      /authorizeAsaasCompany\([\s\S]*?supabase,[\s\S]*?req\.headers\.get\("Authorization"\),[\s\S]*?null,[\s\S]*?\)/,
    );
    expect(edge).toContain('.eq("company_id", auth.userCompanyId)');
    expect(edge).not.toMatch(/body\?\.company_id|body\.company_id/);
  });

  it('usa o valor persistido e exige pagamento confirmado também no Asaas', () => {
    expect(edge).toContain('const amount = Number(payment.amount)');
    expect(edge).toContain('isPaidStatus(remotePayment?.status)');
    expect(edge).not.toMatch(/Number\(body\?\.amount\)|Number\(body\.amount\)/);
  });

  it('reserva atomicamente antes do POST e recupera invoice por cobrança', () => {
    expect(edge.indexOf('claim_subscription_payment_nfse')).toBeLessThan(
      edge.indexOf('await asaas.post<AsaasInvoiceSnapshot>("/invoices"'),
    );
    expect(edge).toContain('buildQuery({ payment: payment.asaas_payment_id, limit: 100 })');
    expect(migration).toContain('UPDATE public.subscription_payments');
    expect(migration).toContain("nfse_status = 'REQUESTING'");
    expect(migration).toContain('TO service_role');
  });

  it('trata INVOICE_* antes do gate que exige body.payment', () => {
    expect(webhook.indexOf('event.startsWith("INVOICE_")')).toBeLessThan(
      webhook.indexOf('if (!payment || !payment.id)'),
    );
    expect(webhook).toContain('.eq("nfse_invoice_id", invoice.id)');
    expect(webhook).toContain('.eq("asaas_payment_id", invoice.payment)');
    expect(webhook).toContain('.is("nfse_invoice_id", null)');
  });

  it('restringe a emissão a administrador/gestor e falha fechado em identidade divergente', () => {
    expect(edge).toContain('_role: "admin"');
    expect(edge).toContain('_role: "gestor"');
    expect(edge).toContain('const customerMismatch = !remoteCustomerId');
    expect(edge).toContain('const referenceMismatch = !paymentReferenceBelongsToCompany(');
  });
});

