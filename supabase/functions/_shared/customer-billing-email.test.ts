import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type CustomerBillingEmailEvent,
  escapeCustomerEmailHtml,
  getCustomerBillingEmailSubject,
  normalizeCustomerEmailContentOverrides,
  normalizeCustomerEmailTemplate,
  renderCustomerBillingEmail,
  safeCustomerEmailColor,
  safeCustomerEmailUrl,
  sanitizeCustomerEmailSenderName,
} from "./customer-billing-email.ts";

const base = {
  companyName: "Clima Sul",
  customerName: "Maria",
  value: 1234.5,
  billingType: "PIX",
  description: "Manutenção preventiva",
  dueDate: "2026-11-30",
  checkoutUrl: "https://www.dominex.app/pagar/cobranca-exemplo",
  invoiceUrl: "https://www.asaas.com/i/abc",
  boletoUrl: "https://www.asaas.com/b/pdf/abc",
  companyLogoUrl: "https://cdn.example.com/clima-sul.png",
  companyDocument: "12.345.678/0001-90",
  companyPhone: "(11) 3333-4444",
  companyEmail: "financeiro@climasul.com.br",
  companyAddress: "Rua das Flores",
  companyAddressNumber: "123",
  companyCity: "São Paulo",
  companyState: "SP",
  companyZipCode: "01234-567",
};

Deno.test(
  "customer billing email escapa conteúdo controlado pelo tenant e pelo cliente",
  () => {
    assertEquals(
      escapeCustomerEmailHtml('<img src=x onerror="alert(1)">'),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_created",
      customerName: "<script>alert(1)</script>",
      description: "<b>não executar</b>",
    });
    assert(!rendered.html.includes("<script>"));
    assert(!rendered.html.includes("<b>não executar</b>"));
    assertStringIncludes(rendered.html, "&lt;script&gt;");
  },
);

Deno.test("customer billing email aceita somente links HTTPS", () => {
  assertStringIncludes(
    safeCustomerEmailUrl("https://dominex.app/cobranca") ?? "",
    "https://dominex.app",
  );
  assertEquals(safeCustomerEmailUrl("http://dominex.app/cobranca"), null);
  assertEquals(safeCustomerEmailUrl("javascript:alert(1)"), null);
  assertEquals(safeCustomerEmailUrl("não é url"), null);
});

Deno.test("customer billing email normaliza o nome usado no remetente", () => {
  assertEquals(
    sanitizeCustomerEmailSenderName("ACME\r\nBcc: vítima@example.com"),
    "ACME Bcc: vítima@example.com",
  );
  assertEquals(sanitizeCustomerEmailSenderName("<ACME>"), "ACME");
});

Deno.test(
  "customer billing email normaliza modelo e cor sem aceitar CSS arbitrário",
  () => {
    assertEquals(normalizeCustomerEmailTemplate("brand_light"), "brand_light");
    assertEquals(normalizeCustomerEmailTemplate("bento_gray"), "bento_gray");
    assertEquals(
      normalizeCustomerEmailTemplate("desconhecido"),
      "classic_light",
    );
    assertEquals(safeCustomerEmailColor("#A1B2C3"), "#a1b2c3");
    assertEquals(safeCustomerEmailColor("red; background:url(x)"), "#18181b");
  },
);

Deno.test(
  "customer billing email renderiza valor, vencimento e CTAs em PT-BR",
  () => {
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_created",
    });
    assertStringIncludes(rendered.html, "R$\u00a01.234,50");
    assertStringIncludes(rendered.text, "30/11/2026");
    assertStringIncludes(rendered.html, "Pagar agora");
    assertStringIncludes(rendered.html, "Abrir boleto");
    assertStringIncludes(rendered.html, "payment-action-icon-card");
    assertStringIncludes(rendered.html, "payment-action-icon-document");
    assertStringIncludes(
      rendered.html,
      'href="https://www.dominex.app/pagar/cobranca-exemplo"',
    );
    assertStringIncludes(
      rendered.html,
      'href="https://www.asaas.com/b/pdf/abc"',
    );
    assertEquals(rendered.subject, "Nova cobrança de Clima Sul");
  },
);

Deno.test(
  "customer billing email oferece acesso seguro para copiar Pix",
  () => {
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_created",
      pixCopyPaste: "0002012636codigo-pix",
    });
    assertStringIncludes(rendered.html, "Copiar código Pix");
    assertStringIncludes(rendered.html, "&#10697;");
    assertStringIncludes(rendered.html, "text-align:right");
    assertStringIncludes(rendered.html, "background:#f4f4f5");
    assertStringIncludes(
      rendered.html,
      'href="https://www.dominex.app/pagar/cobranca-exemplo"',
    );
    assert(!rendered.html.includes("onclick="));
    assert(!rendered.html.includes("navigator.clipboard"));
    assert(
      /Pix copia e cola[\s\S]*0002012636codigo-pix[\s\S]*Copiar código Pix[\s\S]*<\/div><\/td><\/tr>/.test(
        rendered.html,
      ),
    );
  },
);

Deno.test(
  "customer billing email permite links HTTPS seguros na mensagem personalizada",
  () => {
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_created",
      contentOverrides: {
        charge_created: {
          intro:
            "Confira a [central do cliente](https://cliente.example.com/ajuda) ou [link inválido](javascript:alert(1)).",
        },
      },
    });
    assertStringIncludes(
      rendered.html,
      'href="https://cliente.example.com/ajuda"',
    );
    assertStringIncludes(rendered.html, ">central do cliente</a>");
    assert(!rendered.html.includes('href="javascript:'));
    assertStringIncludes(
      rendered.text,
      "central do cliente: https://cliente.example.com/ajuda",
    );
  },
);

Deno.test(
  "customer billing email aplica conteudo personalizado com variaveis seguras",
  () => {
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_created",
      contentOverrides: {
        charge_created: {
          subject: "Cobrança de {{valor}} — {{empresa}}",
          eyebrow: "OLÁ, {{cliente}}",
          title: "Pagamento até {{vencimento}}",
          intro: "Confira os dados enviados por {{empresa}}.",
        },
      },
    });
    assertEquals(rendered.subject, "Cobrança de R$ 1.234,50 — Clima Sul");
    assertStringIncludes(rendered.html, "OLÁ, Maria");
    assertStringIncludes(rendered.html, "Pagamento até 30/11/2026");
    assertStringIncludes(
      rendered.text,
      "Confira os dados enviados por Clima Sul.",
    );
  },
);

Deno.test(
  "customer billing email ignora campos desconhecidos e limita conteudo",
  () => {
    const normalized = normalizeCustomerEmailContentOverrides({
      charge_created: {
        title: `  ${"x".repeat(180)}  `,
        html: "<script>alert(1)</script>",
      },
      unknown_event: { title: "não usar" },
    });
    assertEquals(normalized.charge_created?.title?.length, 120);
    assertEquals(Object.hasOwn(normalized.charge_created ?? {}, "html"), false);
    assertEquals(Object.hasOwn(normalized, "unknown_event"), false);
  },
);

Deno.test(
  "customer billing email usa invoice legado somente sem checkout Dominex",
  () => {
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_created",
      checkoutUrl: null,
    });
    assertStringIncludes(rendered.html, 'href="https://www.asaas.com/i/abc"');
  },
);

Deno.test(
  "customer billing email nao oferece pagamento para cobranca paga ou estornada",
  () => {
    for (const eventType of ["charge_paid", "charge_refunded"] as const) {
      const rendered = renderCustomerBillingEmail({ ...base, eventType });
      assert(!rendered.html.includes("Pagar agora"));
      assert(!rendered.html.includes("Abrir boleto"));
      assert(!rendered.html.includes("Copiar código Pix"));
      assert(!rendered.text.includes("Pagar agora"));
    }
  },
);

for (const eventType of [
  "charge_created",
  "charge_due_reminder",
  "charge_overdue",
  "charge_paid",
  "charge_refunded",
] as CustomerBillingEmailEvent[]) {
  Deno.test(
    `customer billing email possui assunto e conteúdo para ${eventType}`,
    () => {
      const rendered = renderCustomerBillingEmail({ ...base, eventType });
      assert(getCustomerBillingEmailSubject({ ...base, eventType }).length > 0);
      assertStringIncludes(rendered.html, "Dominex");
      assert(rendered.text.length > 100);
    },
  );
}

for (const templateStyle of [
  "classic_light",
  "brand_light",
  "premium_dark",
  "bento_gray",
] as const) {
  Deno.test(
    `customer billing email renderiza cabeçalho e rodapé no modelo ${templateStyle}`,
    () => {
      const rendered = renderCustomerBillingEmail({
        ...base,
        eventType: "charge_created",
        templateStyle,
      });
      assertStringIncludes(rendered.html, "Clima Sul");
      assertStringIncludes(rendered.html, "12.345.678/0001-90");
      assertStringIncludes(rendered.html, "financeiro@climasul.com.br");
      assertStringIncludes(
        rendered.html,
        "https://cdn.example.com/clima-sul.png",
      );
      const hasDarkLogoSurface =
        templateStyle === "premium_dark" || templateStyle === "bento_gray";
      assertEquals(
        rendered.html.includes('class="company-logo-surface"'),
        hasDarkLogoSurface,
      );
      assertStringIncludes(rendered.html, "logo-horizontal-verde.png");
      assertStringIncludes(rendered.html, "www.dominex.app");
      assertStringIncludes(
        rendered.html,
        templateStyle === "bento_gray"
          ? "background:#111113"
          : templateStyle === "premium_dark"
            ? "background:#0f172a"
            : "background:#18181b",
      );
      if (templateStyle === "bento_gray") {
        assertStringIncludes(rendered.html, "font-size:32px");
        assertStringIncludes(rendered.html, "FORMA DE PAGAMENTO");
        assertStringIncludes(rendered.html, "background:#202022");
        assert(
          !rendered.html.includes(
            "background:#1b1b1d;border:1px solid #2b2b2f",
          ),
        );
      }
    },
  );
}

Deno.test(
  "customer billing email remove toda marca Dominex no white-label autorizado",
  () => {
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_paid",
      templateStyle: "brand_light",
      whiteLabelEnabled: true,
      companyPrimaryColor: "#123456",
      companyLogoUrl: "https://cdn.example.com/white-label.png",
    });
    assertStringIncludes(rendered.html, "#123456");
    assertStringIncludes(rendered.html, "white-label.png");
    assert(!rendered.html.toLowerCase().includes("dominex"));
    assert(!rendered.text.toLowerCase().includes("dominex"));
  },
);

Deno.test(
  "customer billing email nao usa cor arbitraria sem white-label",
  () => {
    const rendered = renderCustomerBillingEmail({
      ...base,
      eventType: "charge_paid",
      templateStyle: "brand_light",
      companyPrimaryColor: "#ff00ff",
      whiteLabelEnabled: false,
    });
    assert(!rendered.html.includes("#ff00ff"));
    assertStringIncludes(rendered.html, "#16a34a");
  },
);
