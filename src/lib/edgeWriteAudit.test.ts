import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { blankCommentsAndStrings, findUncheckedWrites } from './edgeWriteAudit';

const edgeSource = (name: string) =>
  readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), 'utf8');

describe('detector — controle NEGATIVO (tem que achar o bug)', () => {
  it('acusa o `await supabase…update()` sem checagem, com tabela e linha', () => {
    const ruim = `
      // Isto é o padrão que criou o incidente.
      await supabase
        .from("subscription_payments")
        .update({ status: "CONFIRMED", paid_at: agora })
        .eq("id", id);
    `;
    const achados = findUncheckedWrites(ruim);
    expect(achados).toHaveLength(1);
    expect(achados[0].table).toBe('subscription_payments');
    expect(achados[0].method).toBe('update');
    expect(achados[0].line).toBe(4);
  });

  it('acusa insert, upsert e delete também, não só update', () => {
    const ruim = `
      await supabase.from("company_payments").insert({ amount });
      await supabase.from("subscription_payments").upsert({ id });
      await supabase.from("company_modules").delete().eq("company_id", c);
    `;
    expect(findUncheckedWrites(ruim).map((a) => a.method)).toEqual(['insert', 'upsert', 'delete']);
  });

  it('não se deixa enganar por um `if (error)` de OUTRA instrução na mesma linha', () => {
    const ruim = `
      const { error: outro } = await supabase.from("a").select("id");
      await supabase.from("company_payments").insert({ amount });
    `;
    const achados = findUncheckedWrites(ruim);
    expect(achados).toHaveLength(1);
    expect(achados[0].table).toBe('company_payments');
  });
});

describe('detector — controle POSITIVO (não pode acusar quem está certo)', () => {
  it('aceita a escrita que passa pelo helper', () => {
    const bom = `
      await applyWrite(
        "marcação do pagamento como CONFIRMED",
        supabase.from("subscription_payments").update({ status: "CONFIRMED" }).eq("id", id),
      );
      await tryWrite("receita", supabase.from("admin_financial_transactions").insert(row), opts);
      const saved = await tryWriteReturning<{ id: string }>(
        "registro local",
        supabase.from("subscription_payments").insert(row).select().single(),
        opts,
      );
    `;
    expect(findUncheckedWrites(bom)).toEqual([]);
  });

  it('aceita a desestruturação manual do erro', () => {
    const bom = `
      const { error: updErr } = await supabase.from("companies").update(u).eq("id", id);
      if (updErr) throw new Error("falhou");
    `;
    expect(findUncheckedWrites(bom)).toEqual([]);
  });

  it('ignora leitura pura (select não é escrita)', () => {
    const leitura = `const { data } = await supabase.from("companies").select("id").eq("id", c);`;
    expect(findUncheckedWrites(leitura)).toEqual([]);
  });

  it('ignora escrita citada em comentário ou em string (senão o detector vira ruído)', () => {
    const falsoPositivo = `
      // await supabase.from("companies").update({ x: 1 });
      /* await supabase.from("companies").insert({ y: 2 }); */
      const doc = "await supabase.from('companies').delete()";
    `;
    expect(findUncheckedWrites(falsoPositivo)).toEqual([]);
  });

  it('não confunde "//" dentro de URL com início de comentário', () => {
    // Todas as edges importam de "https://esm.sh/…" na primeira linha. Se o
    // blanking tratasse isso como comentário, cegaria o arquivo inteiro e o
    // detector devolveria [] SEMPRE — passando por engano.
    const comUrl = `
      import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
      await supabase.from("company_payments").insert({ amount });
    `;
    expect(findUncheckedWrites(comUrl)).toHaveLength(1);
  });

  it('blankCommentsAndStrings preserva o comprimento (as linhas apontadas continuam certas)', () => {
    const src = `const a = "texto"; // nota\nconst b = 1;`;
    expect(blankCommentsAndStrings(src)).toHaveLength(src.length);
    expect(blankCommentsAndStrings(src).split('\n')).toHaveLength(2);
  });
});

describe('edges de dinheiro — nenhuma escrita sem portão', () => {
  // Estas duas funções gravam ESTADO DE DINHEIRO: confirmar pagamento, lançar
  // receita, agendar o valor da próxima cobrança. Uma escrita sem checagem aqui
  // não quebra nada na hora — ela mente depois. O teste é a única defesa
  // automática contra o padrão voltar no próximo `await supabase…`.
  it.each([
    'confirm-sale-payment',
    'change-subscription-plan',
    'create-asaas-payment',
    'cancel-pending-asaas-payments',
    // O webhook que credita TODO pagamento de tenant da Auctus: renovação,
    // receita, comissão de vendedor, desativação por inadimplência. Era o
    // arquivo com mais ocorrências do padrão (11).
    'asaas-webhook',
  ])(
    '%s não tem escrita de banco sem checagem de erro',
    (name) => {
      const achados = findUncheckedWrites(edgeSource(name));
      expect(
        achados,
        `escritas sem checagem em ${name}:\n` +
          achados.map((a) => `  linha ${a.line}: ${a.table}.${a.method}() — ${a.snippet}`).join('\n'),
      ).toEqual([]);
    },
  );

  it('o controle negativo também vale para os arquivos reais (o detector não está cego)', () => {
    // Injeta uma escrita crua no fonte REAL da edge e confirma que o detector a
    // pega. Sem isso, um bug no blanking faria o teste acima passar vazio.
    const contaminado =
      edgeSource('confirm-sale-payment') +
      '\nawait supabase.from("company_payments").insert({ amount: 1 });\n';
    const achados = findUncheckedWrites(contaminado);
    expect(achados).toHaveLength(1);
    expect(achados[0].table).toBe('company_payments');
  });
});

describe('confirm-sale-payment — a fronteira fatal x não-fatal', () => {
  const src = edgeSource('confirm-sale-payment');

  it('marcar o pagamento como CONFIRMED é FATAL e acontece ANTES do mutex de LTV', () => {
    // Antes do mutex, o erro é barato: nada foi reivindicado e o asaas-webhook
    // (fonte da verdade da renovação) reprocessa tudo. Depois do mutex, um 500
    // não repararia nada. A ordem é a decisão inteira.
    const confirmed = src.indexOf('marcação do pagamento como CONFIRMED');
    const mutex = src.indexOf('credit_ltv_once_for_payment', confirmed);
    expect(confirmed).toBeGreaterThan(-1);
    expect(mutex).toBeGreaterThan(confirmed);
    expect(src.slice(confirmed - 200, confirmed)).toContain('applyWrite');
  });

  it('a renovação da empresa (companies) é FATAL', () => {
    const i = src.indexOf('renovação da empresa (companies)');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i - 200, i)).toContain('applyWrite');
  });

  it('histórico e receita são não-fatais e levam linha de recuperação', () => {
    for (const label of [
      'histórico de pagamento da empresa (company_payments)',
      'receita da assinatura (admin_financial_transactions)',
    ]) {
      const i = src.indexOf(label);
      expect(i, `label ausente: ${label}`).toBeGreaterThan(-1);
      expect(src.slice(i - 200, i)).toContain('tryWrite');
      expect(src.slice(i, i + 1400)).toContain('recovery:');
    }
  });

  it('a resposta de sucesso carrega os avisos (sucesso com pendência não é sucesso limpo)', () => {
    expect(src).toContain('...warnings.toBody()');
  });

  it('não sobrou o ramo morto do insert de receita sem payment_id', () => {
    // O `else` sem payment_id era inalcançável (só vira winner quem tem payment_id)
    // e por isso ninguém notou que ele não checava o erro. Um insert só, checado.
    const ocorrencias = src.split('reference_type: "subscription_payment"').length - 1;
    expect(ocorrencias).toBe(1);
  });
});

describe('change-subscription-plan — valor antes de histórico', () => {
  const src = edgeSource('change-subscription-plan');

  it('o downgrade grava os pending_* (FATAL) ANTES de registrar o histórico', () => {
    // O furo original: o histórico registrava "downgrade agendado" mesmo quando os
    // `pending_*` não eram gravados. O webhook de renovação não achava nada e o
    // cliente seguia pagando o valor antigo, com o histórico dizendo o contrário.
    const pending = src.indexOf('agendamento do downgrade (companies.pending_*)');
    const historico = src.indexOf('histórico da assinatura (downgrade agendado)');
    expect(pending).toBeGreaterThan(-1);
    expect(historico).toBeGreaterThan(pending);
    expect(src.slice(pending - 200, pending)).toContain('applyWrite');
    expect(src.slice(historico - 200, historico)).toContain('tryWrite');
  });

  it('o upgrade grava companies (FATAL) ANTES de chamar o Asaas', () => {
    // Gateway depois do banco aqui é proposital: o estado local é a fonte da
    // verdade do gate de acesso, e a falha no Asaas vira `asaas_warning`. O que
    // não pode é o inverso: chamar o Asaas e gravar errado em silêncio.
    const update = src.indexOf('atualização da assinatura (companies)');
    const put = src.indexOf('asaas.put(');
    expect(update).toBeGreaterThan(-1);
    expect(put).toBeGreaterThan(update);
    expect(src.slice(update - 200, update)).toContain('applyWrite');
  });

  it('o DELETE de company_modules também é checado', () => {
    const i = src.indexOf('limpeza dos módulos atuais (company_modules)');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i - 200, i)).toContain('applyWrite');
  });
});

describe('create-asaas-payment — a fronteira é a criação da cobrança no gateway', () => {
  const src = edgeSource('create-asaas-payment');

  it('gravar o asaas_customer_id é FATAL e acontece ANTES de qualquer cobrança criada', () => {
    // Se essa gravação falha calada, a PRÓXIMA cobrança não acha o customer e cria
    // OUTRO na Asaas com o mesmo CPF/CNPJ. Como nada foi cobrado ainda, o erro é
    // barato e a retentativa é segura — por isso é fatal.
    const vinculo = src.indexOf('vínculo do cliente na Asaas (companies.asaas_customer_id)');
    expect(vinculo).toBeGreaterThan(-1);
    expect(src.slice(vinculo - 200, vinculo)).toContain('applyWrite');

    // Toda chamada de CRIAÇÃO no gateway (asaas.post) que não seja o próprio
    // /customers tem que vir depois do vínculo gravado.
    const posts = [...src.matchAll(/asaas\.post\(`\/([a-z/]+)`/g)];
    expect(posts.length).toBeGreaterThan(2);
    for (const post of posts) {
      if (post[1] === 'customers') continue;
      expect(post.index, `asaas.post(/${post[1]}) roda antes do vínculo`).toBeGreaterThan(vinculo);
    }
  });

  it('o registro local da cobrança é NÃO-FATAL nas quatro formas de pagamento', () => {
    // Depois da cobrança criada, um erro devolvido ao front faz o cliente tentar de
    // novo e gerar uma SEGUNDA cobrança. Cobrar duas vezes é pior que reconciliar.
    const labels = src.match(/registro local da cobrança[^"]*/g) ?? [];
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      const i = src.indexOf(label);
      expect(src.slice(i - 200, i), label).toContain('tryWriteReturning');
      expect(src.slice(i, i + 2200), label).toContain('recovery:');
    }
  });

  it('as respostas com local_payment_id carregam os avisos', () => {
    const respostas = src.match(/local_payment_id: savedPayment\?\.id,\s*\n\s*\.\.\.warnings\.toBody\(\),/g) ?? [];
    expect(respostas).toHaveLength(4);
  });
});

describe('cancel-pending-asaas-payments — mentira conservadora não aborta o laço', () => {
  const src = edgeSource('cancel-pending-asaas-payments');

  it('o reflexo local é NÃO-FATAL e roda DEPOIS do delete na Asaas', () => {
    const del = src.indexOf('asaas.delete(');
    const reflexo = src.indexOf('reflexo local do cancelamento');
    expect(del).toBeGreaterThan(-1);
    expect(reflexo).toBeGreaterThan(del);
    expect(src.slice(reflexo - 200, reflexo)).toContain('tryWrite');
    // Sem `throw` no reflexo: as cobranças seguintes do laço continuam sendo apagadas.
    expect(src.slice(reflexo, reflexo + 600)).not.toContain('throw');
  });
});
