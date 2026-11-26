/**
 * Regressão de orçamento → OS → recebimentos → recibos em PostgreSQL local migrado.
 * Não mocka permissões, RLS, portal, constraints ou triggers. Usa claims PostgREST.
 * Bloqueia host remoto. Exige usuário local com SET ROLE e fixtures fictícias.
 * As migrations precisam estar aplicadas. Não valida GoTrue nem gateway externo.
 *
 * DOMINEX_QA_DATABASE_URL=postgresql://postgres@127.0.0.1:54322/postgres \
 * deno run --no-lock --node-modules-dir=none --allow-read --allow-env --allow-net=127.0.0.1:54322 scripts/qa/os-commercial-postgres.mjs
 */
// deno-lint-ignore no-import-prefix -- Runner isolado sem dependência na aplicação.
import pg from "npm:pg@8.16.3";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const databaseUrl = new URL(
  process.env.DOMINEX_QA_DATABASE_URL ||
    "postgresql://postgres@127.0.0.1:54322/postgres",
);
if (!["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname)) {
  throw new Error(
    "Este teste cria fixtures e só pode rodar em PostgreSQL local isolado.",
  );
}
export const options = { connectionString: databaseUrl.toString() };
export async function fixture(db) {
  await db.query(
    "SET search_path=public,extensions;INSERT INTO nfse_tiers(tier,name,price) VALUES(1,'Faixa fictícia',0) ON CONFLICT DO NOTHING;INSERT INTO whatsapp_tiers(tier,name,price) VALUES(1,'Faixa QA',0) ON CONFLICT DO NOTHING;",
  );
  const x = Object.fromEntries(
    [
      "company",
      "otherCompany",
      "admin",
      "tech",
      "otherUser",
      "customer",
      "otherCustomer",
      "os",
      "quote",
      "account",
      "service",
      "equipment",
      "template",
    ].map((k) => [k, randomUUID()]),
  );
  x.plan = "qa-receipts-" + randomUUID();
  await db.query(
    'INSERT INTO subscription_plans(code,name,included_modules) VALUES($1,\'Plano QA\',\'["basic","customer_portal","finance","service_operations"]\')',
    [x.plan],
  );
  await db.query(
    "INSERT INTO companies(id,name,subscription_status,subscription_plan) VALUES($1,'Empresa fictícia QA','active',$3),($2,'Outro tenant QA','active',$3)",
    [x.company, x.otherCompany, x.plan],
  );
  for (const id of [x.admin, x.tech, x.otherUser]) {
    await db.query(
      'INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,\'{"full_name":"Pessoa QA"}\')',
      [id, id + "@example.invalid"],
    );
  }
  await db.query(
    "UPDATE profiles SET company_id=$1,is_active=true WHERE user_id=ANY($2)",
    [x.company, [x.admin, x.tech]],
  );
  await db.query(
    "UPDATE profiles SET company_id=$1,is_active=true WHERE user_id=$2",
    [x.otherCompany, x.otherUser],
  );
  await db.query(
    "INSERT INTO user_roles(user_id,role) VALUES($1,'admin'),($2,'tecnico'),($3,'admin')",
    [x.admin, x.tech, x.otherUser],
  );
  await db.query(
    "INSERT INTO user_permissions(user_id,permissions,is_active) VALUES($1,'[\"*\"]',true),($2,'[]',true),($3,'[\"*\"]',true)",
    [x.admin, x.tech, x.otherUser],
  );
  await db.query(
    "INSERT INTO customers(id,company_id,name) VALUES($1,$2,'Cliente fictício'),($3,$4,'Outro cliente fictício')",
    [x.customer, x.company, x.otherCustomer, x.otherCompany],
  );
  await db.query(
    "INSERT INTO company_settings(company_id,name,currency,timezone) VALUES($1,'Empresa fictícia','BRL','America/Sao_Paulo')",
    [x.company],
  );
  await db.query(
    "INSERT INTO financial_accounts(id,company_id,name,type,is_active) VALUES($1,$2,'Banco QA','banco',true)",
    [x.account, x.company],
  );
  await db.query(
    "INSERT INTO financial_categories(company_id,name,type,is_active) VALUES($1,'Receita QA','entrada',true),($1,'Tarifa QA','saida',true)",
    [x.company],
  );
  await db.query(
    "INSERT INTO service_types(id,company_id,name,default_price,is_active) VALUES($1,$2,'Serviço comercial',3300,true)",
    [x.service, x.company],
  );
  await db.query(
    "INSERT INTO equipment(id,company_id,customer_id,name) VALUES($1,$2,$3,'Equipamento QA')",
    [x.equipment, x.company, x.customer],
  );
  await db.query(
    "INSERT INTO form_templates(id,company_id,name,is_active) VALUES($1,$2,'Checklist independente',true)",
    [x.template, x.company],
  );
  await db.query(
    "INSERT INTO service_orders(id,company_id,customer_id,technician_id,status,total_value,show_values_to_customer) VALUES($1,$2,$3,$4,'concluida',3300,true)",
    [x.os, x.company, x.customer, x.tech],
  );
  await db.query(
    "INSERT INTO service_order_budget_items(service_order_id,company_id,item_type,description,quantity,unit_price,total_price,position) VALUES($1,$2,'servico','Manutenção QA',1,3300,3300,0)",
    [x.os, x.company],
  );
  return x;
}
export async function actor(db, id, role = "authenticated") {
  await db.query(`SET ROLE ${role}`);
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: id, role }),
  ]);
}
export async function expectCode(db, fn, code) {
  await db.query("SAVEPOINT expected_failure");
  try {
    await fn();
    assert.fail("Operação deveria ser recusada: " + code);
  } catch (e) {
    await db.query("ROLLBACK TO SAVEPOINT expected_failure");
    assert.equal(e.code, code, e.message);
  }
  await db.query("RELEASE SAVEPOINT expected_failure");
}
async function testFlow() {
  const db = new pg.Client(options);
  await db.connect();
  try {
    await db.query("BEGIN");
    const x = await fixture(db);
    console.log("PASS fixtures com constraints e triggers do banco migrado");
    await actor(db, x.admin);
    const req = randomUUID();
    const args = [
      x.os,
      req,
      null,
      3300,
      2600,
      null,
      x.account,
      "pix",
      "2026-11-26",
      null,
      "Receita QA",
    ];
    const bill = () =>
      db.query(
        "SELECT public.bill_os_receive_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result",
        args,
      );
    const first = (await bill()).rows[0].result;
    assert.equal(first.remaining, 700);
    assert.deepEqual((await bill()).rows[0].result, first);
    console.log(
      "PASS faturar 3300, receber 2600 e repetir pedido sem duplicar",
    );
    const root = first.transaction_id;
    const sums = (await db.query(
      "SELECT amount,amount_received,is_paid FROM financial_transactions WHERE id=$1",
      [root],
    )).rows[0];
    assert.equal(Number(sums.amount), 3300);
    assert.equal(Number(sums.amount_received), 2600);
    assert.equal(sums.is_paid, false);
    const child = (await db.query(
      "SELECT id FROM financial_transactions WHERE parent_transaction_id=$1 AND transaction_type='entrada'",
      [root],
    )).rows[0].id;
    const r =
      (await db.query("SELECT get_financial_payment_receipt($1) result", [
        child,
      ])).rows[0].result;
    assert.equal(r.received, 2600);
    assert.equal(r.remaining, 700);
    assert.equal(r.is_partial, true);
    assert.equal(r.items[0].description, "Manutenção QA");
    console.log("PASS recibo parcial com itens e saldo");
    await expectCode(
      db,
      () =>
        db.query(
          "INSERT INTO financial_transactions(company_id,service_order_id,transaction_type,amount,description,transaction_date) VALUES($1,$2,'entrada',3300,'Duplicada',current_date)",
          [x.company, x.os],
        ),
      "OSC02",
    );
    await actor(db, x.otherUser);
    await expectCode(
      db,
      () => db.query("SELECT get_financial_payment_receipt($1)", [child]),
      "42501",
    );
    assert.equal(
      (await db.query(
        "SELECT count(*) FROM financial_transactions WHERE company_id=$1",
        [x.company],
      )).rows[0].count,
      "0",
    );
    console.log("PASS tenant diferente sem leitura de recibo/lançamentos");
    await actor(db, x.tech);
    await expectCode(
      db,
      () => db.query("SELECT get_financial_payment_receipt($1)", [child]),
      "42501",
    );
    console.log(
      "PASS técnico sem permissão financeira não emite recibo interno",
    );
    await actor(db, x.admin);
    await db.query(
      "SELECT public.bill_os_receive_payment($1,$2,$3,3300,700,2600,$4,'pix','2026-11-26',NULL,'Receita QA')",
      [x.os, randomUUID(), root, x.account],
    );
    const p =
      (await db.query("SELECT get_os_commercial_document($1,true) result", [
        x.os,
      ])).rows[0].result;
    assert.equal(p.receipt.received, 3300);
    assert.equal(p.receipt.remaining, 0);
    console.log("PASS quitação final sem dupla contagem");

    await expectCode(
      db,
      () =>
        db.query("SELECT save_os_field_budget($1,0,$2,'[]',true)", [
          x.os,
          randomUUID(),
        ]),
      "OSC02",
    );
    console.log("PASS comercial faturado bloqueia mudança de preço em campo");
    await db.query("RESET ROLE");
    const emptyOs = randomUUID();
    await db.query(
      "INSERT INTO service_orders(id,company_id,customer_id,status) VALUES($1,$2,$3,'concluida')",
      [emptyOs, x.company, x.customer],
    );
    await actor(db, x.admin);
    const feeArgs = [
      emptyOs,
      randomUUID(),
      null,
      500,
      200,
      null,
      x.account,
      "pix",
      "2026-11-26",
      null,
      "Receita QA",
      5,
      "Tarifa QA",
    ];
    const feeResult = (await db.query(
      "SELECT bill_os_receive_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result",
      feeArgs,
    )).rows[0].result;
    await db.query(
      "SELECT bill_os_receive_payment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
      feeArgs,
    );
    assert.equal(feeResult.remaining, 300);
    assert.equal(
      Number(
        (await db.query("SELECT total_value FROM service_orders WHERE id=$1", [
          emptyOs,
        ])).rows[0].total_value,
      ),
      500,
    );
    const ledger = (await db.query(
      "SELECT transaction_type,sum(amount) amount,count(*) count FROM financial_transactions WHERE parent_transaction_id=$1 OR parent_transaction_id IN(SELECT id FROM financial_transactions WHERE parent_transaction_id=$1) GROUP BY transaction_type",
      [feeResult.transaction_id],
    )).rows;
    assert.equal(
      ledger.find((r) => r.transaction_type === "saida").amount,
      "5.00",
    );
    assert.equal(ledger.find((r) => r.transaction_type === "saida").count, "1");
    console.log(
      "PASS OS sem orçamento cria comercial canônico, parcial e tarifa única no replay",
    );
    await db.query("RESET ROLE");
    const charge = randomUUID();
    await db.query(
      "INSERT INTO tenant_charges(id,company_id,customer_id,source_type,value,status,payment_date,billing_type,description) VALUES($1,$2,$3,'avulso',250,'CONFIRMED','2026-11-27T02:30Z','PIX','Cobrança QA')",
      [charge, x.company, x.customer],
    );
    await actor(db, x.admin);
    const chargeReceipt =
      (await db.query("SELECT get_charge_payment_receipt($1) result", [charge]))
        .rows[0].result;
    assert.equal(chargeReceipt.received, 250);
    assert.equal(chargeReceipt.payments[0].paid_date, "2026-11-26");
    await db.query("RESET ROLE");
    await db.query("UPDATE tenant_charges SET status='REFUNDED' WHERE id=$1", [
      charge,
    ]);
    await actor(db, x.admin);
    await expectCode(
      db,
      () => db.query("SELECT get_charge_payment_receipt($1)", [charge]),
      "ORC01",
    );
    console.log(
      "PASS recibo de cobrança sem espelho, fuso da empresa e bloqueio após estorno",
    );
    await db.query("RESET ROLE");
    const gatewayOs = randomUUID(),
      gatewayCharge = randomUUID(),
      mirror = randomUUID();
    await db.query(
      "INSERT INTO service_orders(id,company_id,customer_id,status,total_value,show_values_to_customer) VALUES($1,$2,$3,'concluida',100,true)",
      [gatewayOs, x.company, x.customer],
    );
    await db.query(
      "INSERT INTO tenant_charges(id,company_id,customer_id,source_type,source_id,value,status,payment_date,billing_type) VALUES($1,$2,$3,'service_order',$4,100,'CONFIRMED',now(),'PIX')",
      [gatewayCharge, x.company, x.customer, gatewayOs],
    );
    await db.query(
      "INSERT INTO financial_transactions(id,company_id,customer_id,service_order_id,tenant_charge_id,transaction_type,amount,description,transaction_date,paid_date,is_paid) VALUES($1,$2,$3,$4,$5,'entrada',100,'Espelho QA',current_date,current_date,true)",
      [mirror, x.company, x.customer, gatewayOs, gatewayCharge],
    );
    await actor(db, x.admin);
    const gatewayDocument = (await db.query(
      "SELECT get_os_commercial_document($1,true) result",
      [gatewayOs],
    )).rows[0].result;
    assert.equal(gatewayDocument.receipt.received, 100);
    assert.equal(gatewayDocument.receipt.payments.length, 1);
    assert.equal(
      (await db.query(
        "SELECT get_financial_payment_receipt($1) result",
        [mirror],
      )).rows[0].result.payments[0].reference,
      gatewayCharge,
    );
    await db.query("RESET ROLE");
    await db.query("UPDATE tenant_charges SET status='REFUNDED' WHERE id=$1", [
      gatewayCharge,
    ]);
    await actor(db, x.admin);
    await expectCode(
      db,
      () => db.query("SELECT get_financial_payment_receipt($1)", [mirror]),
      "ORC01",
    );
    assert.equal(
      (await db.query("SELECT get_os_commercial_document($1,true) result", [
        gatewayOs,
      ])).rows[0].result.receipt,
      null,
    );
    console.log(
      "PASS cobrança e espelho contam uma vez; estorno bloqueia recibo mesmo com espelho desatualizado",
    );
    await db.query("RESET ROLE");
    const cardOs = randomUUID(),
      cardCharge = randomUUID(),
      cardRoot = randomUUID();
    const cardFirst = randomUUID(), cardLast = randomUUID();
    await db.query(
      "INSERT INTO service_orders(id,company_id,customer_id,status,total_value,show_values_to_customer) VALUES($1,$2,$3,'concluida',3300,true)",
      [cardOs, x.company, x.customer],
    );
    await db.query(
      "INSERT INTO tenant_charges(id,company_id,customer_id,source_type,source_id,value,status,billing_type,asaas_installment_id) VALUES($1,$2,$3,'service_order',$4,3300,'PENDING','CREDIT_CARD',$5)",
      [cardCharge, x.company, x.customer, cardOs, "qa-" + cardCharge],
    );
    await db.query(
      "INSERT INTO financial_transactions(id,company_id,customer_id,service_order_id,tenant_charge_id,transaction_type,amount,description,transaction_date,is_paid) VALUES($1,$2,$3,$4,$5,'entrada',3300,'Cartão QA',current_date,false)",
      [cardRoot, x.company, x.customer, cardOs, cardCharge],
    );
    await db.query(
      "INSERT INTO financial_transactions(id,company_id,parent_transaction_id,tenant_charge_id,asaas_payment_id,transaction_type,amount,description,category,transaction_date,paid_date,is_paid) VALUES($1,$2,$3,$4,$5,'entrada',1100,'Parcela QA','Recebimento parcial',current_date,current_date,true)",
      [cardFirst, x.company, cardRoot, cardCharge, "qa-" + cardFirst],
    );
    await actor(db, x.admin);
    const firstInstallment =
      (await db.query("SELECT get_financial_payment_receipt($1) result", [
        cardFirst,
      ])).rows[0].result;
    assert.equal(firstInstallment.received, 1100);
    assert.equal(firstInstallment.is_partial, true);
    assert.equal(
      (await db.query("SELECT get_os_commercial_document($1,true) result", [
        cardOs,
      ])).rows[0].result.receipt.received,
      1100,
    );
    await expectCode(
      db,
      () => db.query("SELECT get_charge_payment_receipt($1)", [cardCharge]),
      "ORC01",
    );
    await db.query("RESET ROLE");
    await db.query(
      "INSERT INTO financial_transactions(id,company_id,parent_transaction_id,tenant_charge_id,asaas_payment_id,transaction_type,amount,description,category,transaction_date,paid_date,is_paid) VALUES($1,$2,$3,$4,$5,'entrada',2200,'Parcela QA','Recebimento parcial',current_date,current_date,true)",
      [cardLast, x.company, cardRoot, cardCharge, "qa-" + cardLast],
    );
    await db.query(
      "UPDATE tenant_charges SET status='CONFIRMED',payment_date=now() WHERE id=$1",
      [cardCharge],
    );
    await actor(db, x.admin);
    const allInstallments =
      (await db.query("SELECT get_os_commercial_document($1,true) result", [
        cardOs,
      ])).rows[0].result.receipt;
    assert.equal(allInstallments.received, 3300);
    assert.equal(allInstallments.payments.length, 2);
    const cardReceipt =
      (await db.query("SELECT get_charge_payment_receipt($1) result", [
        cardCharge,
      ])).rows[0].result;
    assert.equal(cardReceipt.received, 3300);
    assert.equal(cardReceipt.payments.length, 2);
    await db.query("RESET ROLE");
    await db.query("UPDATE tenant_charges SET status='REFUNDED' WHERE id=$1", [
      cardCharge,
    ]);
    await actor(db, x.admin);
    await expectCode(
      db,
      () => db.query("SELECT get_financial_payment_receipt($1)", [cardFirst]),
      "ORC01",
    );
    console.log(
      "PASS parcelas de cartão têm recibo individual antes da quitação, sem duplicar a cobrança-mãe",
    );
    await actor(db, null, "service_role");
    await db.query("RESET ROLE");
    await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'admin')", [
      x.tech,
    ]);
    await db.query("UPDATE profiles SET is_active=false WHERE user_id=$1", [
      x.admin,
    ]);
    await actor(db, x.admin);
    await expectCode(
      db,
      () => db.query("SELECT get_financial_payment_receipt($1)", [child]),
      "42501",
    );
    await actor(db, null, "service_role");
    await db.query("RESET ROLE");
    await db.query("UPDATE profiles SET is_active=true WHERE user_id=$1", [
      x.admin,
    ]);
    await db.query(
      "UPDATE service_orders SET show_values_to_customer=false WHERE id=$1",
      [x.os],
    );
    await actor(db, x.admin);
    const hidden =
      (await db.query("SELECT get_financial_payment_receipt($1) result", [
        child,
      ])).rows[0].result;
    assert.equal(hidden.source_total, null);
    assert.equal(hidden.items[0].unit_price, undefined);
    assert.equal(hidden.items[0].description, "Manutenção QA");
    console.log(
      "PASS perfil inativo barrado e recibo respeita ocultação dos valores comerciais",
    );
    await db.query("RESET ROLE");
    await db.query(
      "UPDATE financial_transactions SET customer_id=NULL WHERE id=$1 OR parent_transaction_id=$1",
      [root],
    );
    await actor(db, x.admin);
    const legacyReceipt =
      (await db.query("SELECT get_financial_payment_receipt($1) result", [
        child,
      ])).rows[0].result;
    assert.equal(legacyReceipt.customer.name, "Cliente fictício");
    assert.equal(legacyReceipt.items[0].description, "Manutenção QA");
    await db.query("RESET ROLE");
    console.log(
      "PASS lançamento legado sem cliente recupera identidade e itens pela OS do mesmo tenant",
    );
    await db.query(
      "UPDATE customer_portals SET is_active=true,is_public=true,password_enabled=false,permissions='{\"charges\":true}' WHERE customer_id=$1",
      [x.customer],
    );
    const portal = (await db.query(
      "SELECT id,token FROM customer_portals WHERE customer_id=$1",
      [x.customer],
    )).rows[0];
    await actor(db, null, "anon");
    const list =
      (await db.query("SELECT get_customer_portal_payments($1,NULL) result", [
        portal.token,
      ])).rows[0].result;
    assert.equal(list.filter((p) => p.id === child).length, 1);
    assert.equal(list.filter((p) => p.kind === "charge").length, 0);
    await db.query(
      "SELECT get_customer_portal_payment_receipt($1,NULL,'transaction',$2)",
      [portal.token, child],
    );
    await expectCode(
      db,
      () =>
        db.query(
          "SELECT get_customer_portal_payment_receipt($1,NULL,'transaction',$2)",
          [portal.token, randomUUID()],
        ),
      "42501",
    );
    console.log(
      "PASS portal real anon, cliente correto e recibo por pagamento",
    );
    await db.query("RESET ROLE");
    await db.query(
      "UPDATE customer_portals SET password_enabled=true,public_sections='{\"service_orders\":true}' WHERE id=$1",
      [portal.id],
    );
    await actor(db, null, "anon");
    await expectCode(
      db,
      () =>
        db.query("SELECT get_customer_portal_payments($1,NULL)", [
          portal.token,
        ]),
      "42501",
    );
    await db.query("RESET ROLE");
    await db.query(
      "INSERT INTO customer_portal_sessions(portal_id,token_hash,expires_at) VALUES($1,encode(extensions.digest('sessao-qa','sha256'),'hex'),now()+interval '1 hour')",
      [portal.id],
    );
    await actor(db, null, "anon");
    await db.query(
      "SELECT get_customer_portal_payment_receipt($1,'sessao-qa','transaction',$2)",
      [portal.token, child],
    );
    await db.query("RESET ROLE");
    await db.query(
      "UPDATE customer_portal_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 second' WHERE portal_id=$1",
      [portal.id],
    );
    await actor(db, null, "anon");
    await expectCode(
      db,
      () =>
        db.query(
          "SELECT get_customer_portal_payment_receipt($1,'sessao-qa','transaction',$2)",
          [portal.token, child],
        ),
      "42501",
    );
    console.log("PASS senha real: sem sessão, sessão válida e sessão expirada");
    await db.query("RESET ROLE");
    await db.query(
      "UPDATE customer_portals SET password_enabled=false,permissions='{\"charges\":false}' WHERE id=$1",
      [portal.id],
    );
    await actor(db, null, "anon");
    await expectCode(
      db,
      () =>
        db.query("SELECT get_customer_portal_payments($1,NULL)", [
          portal.token,
        ]),
      "42501",
    );
    await db.query("RESET ROLE");
    await db.query(
      "UPDATE companies SET subscription_status='cancelled' WHERE id=$1",
      [x.company],
    );
    assert.equal(
      (await db.query("SELECT get_os_commercial_document($1,true) result", [
        x.os,
      ])).rows[0].result,
      null,
    );
    await db.query(
      "UPDATE companies SET subscription_status='active' WHERE id=$1",
      [x.company],
    );
    console.log(
      "PASS seção oculta e assinatura cancelada bloqueiam documentos",
    );
    await actor(db, x.admin);
    await db.query(
      "INSERT INTO quotes(id,company_id,customer_id,status,total_value,total_price) VALUES($1,$2,$3,'aprovado',3300,3300)",
      [x.quote, x.company, x.customer],
    );
    await db.query(
      "INSERT INTO quote_items(quote_id,item_type,description,quantity,unit_price,total_price,position,service_type_id) VALUES($1,'servico','Serviço comercial',1,3300,3300,0,$2)",
      [x.quote, x.service],
    );
    const converted = (await db.query(
      "SELECT (generate_service_order_from_quote_prepared($1,'[]',true)).id id",
      [x.quote],
    )).rows[0].id;
    assert.equal(
      (await db.query(
        "SELECT count(*) FROM service_order_equipment WHERE service_order_id=$1",
        [converted],
      )).rows[0].count,
      "0",
    );
    const convertedAgain = (await db.query(
      "SELECT (generate_service_order_from_quote_prepared($1,'[]',false)).id id",
      [x.quote],
    )).rows[0].id;
    assert.equal(convertedAgain, converted);
    assert.equal(
      Number(
        (await db.query("SELECT bdi FROM service_orders WHERE id=$1", [
          converted,
        ])).rows[0].bdi,
      ) >= 0.01,
      true,
    );
    console.log(
      "PASS conversão e replay sem aplicar checklist automaticamente",
    );
    const rows = [{
      amount: 1100,
      category: "Receita QA",
      transaction_date: "2026-12-26",
    }, {
      amount: 2200,
      category: "Receita QA",
      transaction_date: "2027-01-26",
    }];
    const approved = (await db.query(
      "SELECT approve_quote_financial_atomic($1,$2,'a_receber',$3) result",
      [x.quote, randomUUID(), JSON.stringify(rows)],
    )).rows[0].result;
    assert.equal(approved.count, 2);
    assert.equal(
      (await db.query(
        "SELECT count(*) FROM financial_transactions WHERE service_order_id=$1 AND parent_transaction_id IS NULL",
        [converted],
      )).rows[0].count,
      "2",
    );
    await expectCode(
      db,
      () =>
        db.query(
          "SELECT bill_os_receive_payment($1,$2,NULL,3300,0,NULL,NULL,NULL,NULL,NULL,'Receita QA')",
          [converted, randomUUID()],
        ),
      "OSC01",
    );
    console.log(
      "PASS orçamento parcelado reaproveita dívidas na OS e barra novo faturamento",
    );
    await db.query("ROLLBACK");
  } catch (e) {
    await db.query("ROLLBACK");
    console.error("FAIL", e.message, e.code, e.where || "");
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

async function testConcurrency() {
  const admin = new pg.Client(options);
  await admin.connect();
  await admin.query("BEGIN");
  const x = await fixture(admin);
  await admin.query("COMMIT");
  async function connection() {
    const c = new pg.Client(options);
    await c.connect();
    await actor(c, x.admin);
    return c;
  }
  const a = await connection(), b = await connection();
  async function transaction(c, fn) {
    await c.query("BEGIN");
    try {
      const r = await fn();
      await c.query("COMMIT");
      return { ok: true, result: r.rows?.[0] };
    } catch (e) {
      await c.query("ROLLBACK");
      return { ok: false, code: e.code, message: e.message };
    }
  }
  async function race(label, fa, fb, expected) {
    const rs = await Promise.all([transaction(a, fa), transaction(b, fb)]);
    assert.deepEqual(
      rs.filter((r) => r.ok).length,
      expected,
      label + " " + JSON.stringify(rs),
    );
    console.log(
      "PASS",
      label,
      JSON.stringify(rs.map((r) => ({ ok: r.ok, code: r.code }))),
    );
    return rs;
  }
  try {
    await race(
      "duas tentativas de faturar a mesma OS",
      () =>
        a.query(
          "SELECT bill_os_receive_payment($1,$2,NULL,3300,0,NULL,NULL,NULL,NULL,NULL,'Receita QA') result",
          [x.os, randomUUID()],
        ),
      () =>
        b.query(
          "SELECT bill_os_receive_payment($1,$2,NULL,3300,0,NULL,NULL,NULL,NULL,NULL,'Receita QA') result",
          [x.os, randomUUID()],
        ),
      1,
    );
    const root = (await admin.query(
      "SELECT id FROM financial_transactions WHERE service_order_id=$1 AND parent_transaction_id IS NULL",
      [x.os],
    )).rows[0].id;
    await race(
      "dois parciais com o mesmo saldo-base",
      () =>
        a.query(
          "SELECT bill_os_receive_payment($1,$2,$3,3300,2600,0,$4,'pix','2026-11-26',NULL,'Receita QA') result",
          [x.os, randomUUID(), root, x.account],
        ),
      () =>
        b.query(
          "SELECT bill_os_receive_payment($1,$2,$3,3300,2600,0,$4,'pix','2026-11-26',NULL,'Receita QA') result",
          [x.os, randomUUID(), root, x.account],
        ),
      1,
    );
    const request = randomUUID();
    const args = [x.os, request, root, x.account];
    const rs = await race(
      "mesmo pedido de saldo em duas conexões",
      () =>
        a.query(
          "SELECT bill_os_receive_payment($1,$2,$3,3300,700,2600,$4,'pix','2026-11-26',NULL,'Receita QA') result",
          args,
        ),
      () =>
        b.query(
          "SELECT bill_os_receive_payment($1,$2,$3,3300,700,2600,$4,'pix','2026-11-26',NULL,'Receita QA') result",
          args,
        ),
      2,
    );
    assert.deepEqual(rs[0].result, rs[1].result);
    assert.equal(
      Number(
        (await admin.query(
          "SELECT sum(amount) total FROM financial_transactions WHERE parent_transaction_id=$1 AND transaction_type='entrada'",
          [root],
        )).rows[0].total,
      ),
      3300,
    );
    await actor(admin, x.admin);
    await admin.query(
      "INSERT INTO quotes(id,company_id,customer_id,status,total_value,total_price) VALUES($1,$2,$3,'aprovado',3300,3300)",
      [x.quote, x.company, x.customer],
    );
    await admin.query(
      "INSERT INTO quote_items(quote_id,item_type,description,quantity,unit_price,total_price,position) VALUES($1,'servico','Serviço QA',1,3300,3300,0)",
      [x.quote],
    );
    const conversions = await race(
      "converter orçamento simultaneamente",
      () =>
        a.query(
          "SELECT (generate_service_order_from_quote_prepared($1,'[]',false)).id id",
          [x.quote],
        ),
      () =>
        b.query(
          "SELECT (generate_service_order_from_quote_prepared($1,'[]',false)).id id",
          [x.quote],
        ),
      2,
    );
    assert.deepEqual(conversions[0].result, conversions[1].result);
    const os = conversions[0].result.id;
    const rows = JSON.stringify([{
      amount: 3300,
      category: "Receita QA",
      transaction_date: "2026-11-26",
    }]);
    await race(
      "aprovar financeiro do orçamento contra faturar OS",
      () =>
        a.query(
          "SELECT approve_quote_financial_atomic($1,$2,'a_receber',$3) result",
          [x.quote, randomUUID(), rows],
        ),
      () =>
        b.query(
          "SELECT bill_os_receive_payment($1,$2,NULL,3300,0,NULL,NULL,NULL,NULL,NULL,'Receita QA') result",
          [os, randomUUID()],
        ),
      1,
    );

    const fieldOs = randomUUID();
    await admin.query(
      "INSERT INTO service_orders(id,company_id,customer_id,technician_id,status,total_value) VALUES($1,$2,$3,$4,'em_andamento',3300)",
      [fieldOs, x.company, x.customer, x.tech],
    );
    const revision = (await admin.query(
      "SELECT commercial_revision FROM service_orders WHERE id=$1",
      [fieldOs],
    )).rows[0].commercial_revision;
    const item = {
      item_type: "servico",
      description: "Serviço QA",
      quantity: 1,
      unit_price: 3300,
      service_type_id: x.service,
      pricing_mode: "registered",
    };
    await race(
      "duas edições em campo com a mesma revisão",
      () =>
        a.query("SELECT save_os_field_budget($1,$2,$3,$4,false) result", [
          fieldOs,
          revision,
          randomUUID(),
          JSON.stringify([item]),
        ]),
      () =>
        b.query("SELECT save_os_field_budget($1,$2,$3,$4,false) result", [
          fieldOs,
          revision,
          randomUUID(),
          JSON.stringify([{ ...item, quantity: 2 }]),
        ]),
      1,
    );
    await actor(a, x.tech);
    const field =
      (await a.query("SELECT get_os_field_budget($1) result", [fieldOs]))
        .rows[0].result;
    const deniedPrice = await transaction(a, () =>
      a.query(
        "SELECT save_os_field_budget($1,$2,$3,$4,false)",
        [
          fieldOs,
          field.revision,
          randomUUID(),
          JSON.stringify([{ ...field.items[0], unit_price: 1 }]),
        ],
      ));
    assert.equal(deniedPrice.code, "42501");
    const changedQuantity = await transaction(a, () =>
      a.query(
        "SELECT save_os_field_budget($1,$2,$3,$4,false) result",
        [
          fieldOs,
          field.revision,
          randomUUID(),
          JSON.stringify([{ ...field.items[0], quantity: 3 }]),
        ],
      ));
    assert.equal(changedQuantity.ok, true);
    assert.equal(changedQuantity.result.result.total, 9900);
    const directPrice = await transaction(
      a,
      () =>
        a.query("UPDATE service_orders SET total_value=1 WHERE id=$1", [
          fieldOs,
        ]),
    );
    assert.equal(directPrice.code, "42501");
    const directItem = await transaction(
      a,
      () =>
        a.query(
          "UPDATE service_order_budget_items SET unit_price=1 WHERE service_order_id=$1",
          [fieldOs],
        ),
    );
    assert.equal(directItem.code, "42501");
    await admin.query(
      "UPDATE user_permissions SET permissions='[\"fn:os_edit_prices\"]' WHERE user_id=$1",
      [x.tech],
    );
    const pricedField = changedQuantity.result.result;
    const allowedPrice = await transaction(a, () =>
      a.query(
        "SELECT save_os_field_budget($1,$2,$3,$4,false) result",
        [
          fieldOs,
          pricedField.revision,
          randomUUID(),
          JSON.stringify([{ ...pricedField.items[0], unit_price: 1 }]),
        ],
      ));
    assert.equal(allowedPrice.ok, true);
    assert.equal(allowedPrice.result.result.total, 3);
    console.log(
      "PASS técnico altera quantidade; preço exige permissão e não pode ser contornado por escrita direta",
    );
    await actor(a, x.admin);
    const os2 = randomUUID();
    await admin.query(
      "INSERT INTO service_orders(id,company_id,customer_id,status,total_value) VALUES($1,$2,$3,'concluida',3300)",
      [os2, x.company, x.customer],
    );
    await actor(a, null, "service_role");
    await actor(b, null, "service_role");
    const reserved = await race(
      "reservar emissão de cobrança simultaneamente",
      () =>
        a.query(
          "SELECT reserve_commercial_charge($1,'service_order',$2,$3) reserved",
          [x.company, os2, randomUUID()],
        ),
      () =>
        b.query(
          "SELECT reserve_commercial_charge($1,'service_order',$2,$3) reserved",
          [x.company, os2, randomUUID()],
        ),
      2,
    );
    assert.equal(reserved.filter((r) => r.result.reserved).length, 1);
    await actor(a, x.admin);
    const blocked = await transaction(
      a,
      () =>
        a.query(
          "SELECT bill_os_receive_payment($1,$2,NULL,3300,0,NULL,NULL,NULL,NULL,NULL,'Receita QA') result",
          [os2, randomUUID()],
        ),
    );
    assert.equal(blocked.code, "OSC02");
    console.log("PASS reserva de cobrança bloqueia faturamento manual");
  } catch (e) {
    console.error("FAIL", e.message, e.code, e.where || "");
    process.exitCode = 1;
  } finally {
    await admin.query("RESET ROLE");
    await admin.query(
      "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)",
    );
    await admin.query("DELETE FROM auth.users WHERE id=ANY($1)", [[
      x.admin,
      x.tech,
      x.otherUser,
    ]]);
    for (
      const table of [
        "financial_transactions",
        "quotes",
        "service_orders",
        "equipment",
        "form_templates",
        "service_types",
        "customers",
      ]
    ) {
      await admin.query(
        `DELETE FROM public.${table} WHERE company_id=ANY($1)`,
        [[x.company, x.otherCompany]],
      );
    }
    await admin.query("DELETE FROM companies WHERE id=ANY($1)", [[
      x.company,
      x.otherCompany,
    ]]);
    await admin.query("DELETE FROM subscription_plans WHERE code=$1", [x.plan]);
    await Promise.all([a.end(), b.end(), admin.end()]);
  }
}

await testFlow();
if (!process.exitCode) await testConcurrency();
