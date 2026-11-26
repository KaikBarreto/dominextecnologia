/**
 * Regressão de faturamento legado menor que a OS, em PostgreSQL local migrado.
 * Usa os metadados, triggers e permissões reais; fixtures sempre fictícias.
 * O helper importado bloqueia host remoto. Não chama Asaas nem grava produção.
 *
 * DOMINEX_QA_DATABASE_URL=postgresql://postgres@127.0.0.1:55437/postgres \
 * deno run --no-lock --node-modules-dir=none --allow-read --allow-env \
 *   --allow-net=127.0.0.1:55437 scripts/qa/os-billing-complement-postgres.mjs
 */
// deno-lint-ignore no-import-prefix -- Runner isolado sem dependência na aplicação.
import pg from "npm:pg@8.16.3";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  actor,
  expectCode,
  fixture,
  options,
} from "./os-commercial-postgres.mjs";
const sql =
  "SELECT complement_os_manual_billing($1,$2,3300,2600,'2026-12-26','Receita QA') result";
async function legacy(db, x) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO financial_transactions(id,company_id,service_order_id,customer_id,account_id,transaction_type,amount,description,category,transaction_date,paid_date,is_paid,payment_method,origin) VALUES($1,$2,$3,$4,$5,'entrada',2600,'Recebimento anterior QA','Receita QA','2026-11-26','2026-11-26',true,'pix','geral')",
    [id, x.company, x.os, x.customer, x.account],
  );
  return id;
}
async function flow() {
  const db = new pg.Client(options);
  await db.connect();
  try {
    await db.query("BEGIN");
    const x = await fixture(db);
    await db.query(
      "UPDATE service_orders SET status='em_andamento' WHERE id=$1",
      [x.os],
    );
    const old = await legacy(db, x);
    const original = (await db.query(
      "SELECT to_jsonb(f) value FROM financial_transactions f WHERE id=$1",
      [old],
    )).rows[0].value;
    await actor(db, x.admin);
    assert.equal(
      (await db.query("SELECT get_os_manual_receivables($1) value", [x.os]))
        .rows[0].value[0].can_complement,
      true,
    );
    const internal =
      (await db.query("SELECT get_os_commercial_document($1,false) value", [
        x.os,
      ])).rows[0].value;
    assert.equal(internal.receipt.received, 2600);
    assert.equal(internal.receipt.remaining, 700);
    console.log(
      "PASS conta quitada de 2600 não quita OS de 3300; recibo interno antes da conclusão",
    );
    await db.query("SAVEPOINT unbilled");
    await expectCode(
      db,
      () =>
        db.query(
          "INSERT INTO financial_transactions(company_id,service_order_id,customer_id,transaction_type,amount,description,category,transaction_date,origin) VALUES($1,$2,$3,'entrada',50,'Duplicada QA','Receita QA',current_date,'geral')",
          [x.company, x.os, x.customer],
        ),
      "OSC02",
    );
    const request = randomUUID();
    const r = (await db.query(sql, [x.os, request])).rows[0].result;
    assert.equal(r.amount, 700);
    assert.deepEqual((await db.query(sql, [x.os, request])).rows[0].result, r);
    await expectCode(db, () => db.query(sql, [x.os, randomUUID()]), "OSC01");
    const before = (await db.query(
      "SELECT to_jsonb(f) value FROM financial_transactions f WHERE id=$1",
      [old],
    )).rows[0].value;
    assert.deepEqual(before, original);
    const roots = (await db.query(
      "SELECT sum(amount)::float8 billed,sum(CASE WHEN is_paid THEN amount ELSE amount_received END)::float8 received,count(*) count FROM financial_transactions WHERE service_order_id=$1 AND parent_transaction_id IS NULL AND cancelled_at IS NULL",
      [x.os],
    )).rows[0];
    assert.equal(roots.billed, 3300);
    assert.equal(roots.received, 2600);
    assert.equal(roots.count, "2");
    assert.equal(
      (await db.query(
        "SELECT sum((p->>'amount')::numeric)::float8 amount FROM jsonb_array_elements(get_os_commercial_document($1,false)#>'{receipt,payments}') p",
        [x.os],
      )).rows[0].amount,
      2600,
    );
    assert.equal(
      (await db.query("SELECT get_financial_payment_receipt($1) value", [old]))
        .rows[0].value.received,
      2600,
    );
    console.log(
      "PASS complemento exato, replay e CAS sem alterar ou duplicar pagamento/recibo anterior",
    );
    await expectCode(
      db,
      () =>
        db.query(
          "INSERT INTO financial_transactions(company_id,service_order_id,customer_id,transaction_type,amount,description,transaction_date,origin) VALUES($1,$2,$3,'entrada',700,'Duplicada QA',current_date,'geral')",
          [x.company, x.os, x.customer],
        ),
      "OSC02",
    );
    await db.query(
      "SELECT bill_os_receive_payment($1,$2,$3,3300,200,0,$4,'pix','2026-11-26',NULL,'Receita QA')",
      [x.os, randomUUID(), r.transaction_id, x.account],
    );
    await db.query(
      "SELECT bill_os_receive_payment($1,$2,$3,3300,500,200,$4,'pix','2026-11-26',NULL,'Receita QA')",
      [x.os, randomUUID(), r.transaction_id, x.account],
    );
    const paid =
      (await db.query("SELECT get_os_commercial_document($1,false) value", [
        x.os,
      ])).rows[0].value.receipt;
    assert.equal(paid.received, 3300);
    assert.equal(paid.remaining, 0);
    assert.equal(paid.payments.length, 3);
    assert.deepEqual(
      (await db.query(
        "SELECT to_jsonb(f) value FROM financial_transactions f WHERE id=$1",
        [old],
      )).rows[0].value,
      original,
    );
    console.log(
      "PASS receber diferença em 200 + 500, total recebido 3300 e saldo zero",
    );
    await db.query("ROLLBACK TO SAVEPOINT unbilled");
    await actor(db, x.otherUser);
    await expectCode(db, () => db.query(sql, [x.os, randomUUID()]), "42501");
    await actor(db, x.tech);
    await expectCode(
      db,
      () => db.query("SELECT get_os_commercial_document($1,false)", [x.os]),
      "42501",
    );
    await expectCode(db, () => db.query(sql, [x.os, randomUUID()]), "42501");
    await actor(db, null, "anon");
    await expectCode(db, () => db.query(sql, [x.os, randomUUID()]), "42501");
    assert.equal(
      (await db.query("SELECT get_os_commercial_document($1,true) value", [
        x.os,
      ])).rows[0].value,
      null,
    );
    assert.equal(
      (await db.query("SELECT get_os_commercial_document($1,NULL) value", [
        x.os,
      ])).rows[0].value,
      null,
    );
    await expectCode(
      db,
      () => db.query("SELECT get_os_commercial_document($1,false)", [x.os]),
      "42501",
    );
    console.log(
      "PASS isolamento de empresa, técnico sem financeiro, visitante e parâmetro público nulo",
    );
    await actor(db, x.admin);
    await db.query("RESET ROLE");
    await db.query("UPDATE service_orders SET status='concluida' WHERE id=$1", [
      x.os,
    ]);
    await actor(db, x.admin);
    assert.equal(
      (await db.query("SELECT get_os_commercial_document($1,true) value", [
        x.os,
      ])).rows[0].value.receipt.received,
      2600,
    );
    assert.equal(
      (await db.query(sql, [x.os, randomUUID()])).rows[0].result.amount,
      700,
    );
    console.log(
      "PASS complementar depois da conclusão; finalizar a OS não altera o faturamento sozinho",
    );
    await db.query("ROLLBACK TO SAVEPOINT unbilled");
    for (
      const scenario of [
        "parcelas",
        "cobranca",
        "reserva",
        "cancelada",
        "estornado",
      ]
    ) {
      await db.query("RESET ROLE");
      await db.query("SAVEPOINT blocked");
      if (scenario === "parcelas") {
        await db.query(
          "UPDATE financial_transactions SET installment_group_id=$1,installment_number=1,installment_total=2 WHERE id=$2",
          [randomUUID(), old],
        );
      }
      if (scenario === "cobranca") {
        await db.query(
          "INSERT INTO tenant_charges(company_id,customer_id,source_type,source_id,value,status,billing_type) VALUES($1,$2,'service_order',$3,3300,'PENDING','PIX')",
          [x.company, x.customer, x.os],
        );
      }
      if (scenario === "reserva") {
        await db.query(
          "INSERT INTO os_charge_reservations(origin_id,company_id,request_id,source_type,source_id) VALUES($1,$2,$3,'service_order',$1)",
          [x.os, x.company, randomUUID()],
        );
      }
      if (scenario === "cancelada") {
        await db.query(
          "UPDATE service_orders SET status='cancelada' WHERE id=$1",
          [x.os],
        );
      }
      if (scenario === "estornado") {
        await db.query(
          "UPDATE financial_transactions SET cancelled_at=now() WHERE id=$1",
          [old],
        );
      }
      await actor(db, x.admin);
      if (scenario !== "cancelada") {
        assert.equal(
          (await db.query("SELECT get_os_manual_receivables($1) value", [x.os]))
            .rows[0].value.every((f) => !f.can_complement),
          true,
        );
      }
      await expectCode(
        db,
        () => db.query(sql, [x.os, randomUUID()]),
        scenario === "estornado" ? "OSC01" : "OSC04",
      );
      await db.query("ROLLBACK TO SAVEPOINT blocked");
      console.log("PASS complemento bloqueado em " + scenario);
    }
    await actor(db, x.admin);
    await expectCode(
      db,
      () =>
        db.query(
          "INSERT INTO financial_transactions(company_id,service_order_id,customer_id,transaction_type,amount,description,transaction_date,origin) VALUES($1,$2,$3,'entrada',700,'Primeira duplicada QA',current_date,'geral'),($1,$2,$3,'entrada',700,'Segunda duplicada QA',current_date,'geral')",
          [x.company, x.os, x.customer],
        ),
      "OSC02",
    );
    assert.equal(
      (await db.query(
        "SELECT count(*) count FROM financial_transactions WHERE service_order_id=$1 AND parent_transaction_id IS NULL AND cancelled_at IS NULL",
        [
          x.os,
        ],
      )).rows[0].count,
      "1",
    );
    console.log("PASS insert em lote não passa dois complementos de 700");
    assert.equal(
      (await db.query(
        "SELECT has_function_privilege('anon','complement_os_manual_billing(uuid,uuid,numeric,numeric,date,text)','execute') allowed",
      )).rows[0].allowed,
      false,
    );
    assert.equal(
      (await db.query(
        "SELECT has_function_privilege('authenticated','_os_manual_complement_allowed(uuid)','execute') allowed",
      )).rows[0].allowed,
      false,
    );
    await db.query("ROLLBACK");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}
async function concurrency() {
  const owner = new pg.Client(options);
  await owner.connect();
  await owner.query("BEGIN");
  const x = await fixture(owner);
  await legacy(owner, x);
  await owner.query("COMMIT");
  const a = new pg.Client(options), b = new pg.Client(options);
  await Promise.all([a.connect(), b.connect()]);
  await actor(a, x.admin);
  await actor(b, x.admin);
  try {
    const results = await Promise.allSettled([
      a.query(sql, [x.os, randomUUID()]),
      b.query(sql, [x.os, randomUUID()]),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.find((r) => r.status === "rejected").reason.code,
      "OSC01",
    );
    assert.equal(
      (await owner.query(
        "SELECT sum(amount)::float8 amount,count(*) count FROM financial_transactions WHERE service_order_id=$1 AND parent_transaction_id IS NULL AND cancelled_at IS NULL",
        [x.os],
      )).rows[0].amount,
      3300,
    );
    console.log("PASS dois operadores concorrentes criam um único complemento");
    await owner.query(
      "DELETE FROM financial_transactions WHERE service_order_id=$1 AND NOT is_paid",
      [x.os],
    );
    const request = randomUUID();
    const replay = await Promise.all([
      a.query(sql, [x.os, request]),
      b.query(sql, [x.os, request]),
    ]);
    assert.deepEqual(replay[0].rows[0], replay[1].rows[0]);
    assert.equal(
      (await owner.query(
        "SELECT count(*) count FROM financial_transactions WHERE service_order_id=$1 AND parent_transaction_id IS NULL AND cancelled_at IS NULL",
        [
          x.os,
        ],
      )).rows[0].count,
      "2",
    );
    console.log("PASS mesmo pedido concorrente retorna o mesmo complemento");
  } finally {
    await Promise.all([a.end(), b.end()]);
    await owner.query(
      "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false)",
    );
    await owner.query("DELETE FROM auth.users WHERE id=ANY($1)", [[
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
      await owner.query(
        `DELETE FROM public.${table} WHERE company_id=ANY($1)`,
        [[x.company, x.otherCompany]],
      );
    }
    await owner.query("DELETE FROM companies WHERE id=ANY($1)", [[
      x.company,
      x.otherCompany,
    ]]);
    await owner.query("DELETE FROM subscription_plans WHERE code=$1", [x.plan]);
    await owner.end();
  }
}
try {
  await flow();
  await concurrency();
} catch (e) {
  console.error("FAIL", e.message, e.code, e.where || "");
  process.exitCode = 1;
}
