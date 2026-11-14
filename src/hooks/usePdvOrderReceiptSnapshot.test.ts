import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectPdvOrderReceiptSnapshot } from './usePdvOrderReceiptSnapshot';

const payload={
  company:{name:'Loja',logo_url:'https://example.invalid/logo.png',time_zone:'America/Sao_Paulo',document:'CNPJ 00.000.000/0001-00',address:'Rua Exemplo, 10',phone:'(00) 0000-0000',white_label_enabled:true},
  order:{number:42,issued_at:'2026-11-07T14:30:00-03:00',operator_name:'Maria',terminal_name:'Caixa 1',customer_name:'Cliente',customer_document:'nao-projetar'},
  items:[{description:'Material',unit:'un',quantity:2,unit_price:50,discount:0,total:100,unit_cost:999}],
  totals:{subtotal:100,discount:0,total:100,cost:999},
  payments:[{method:'fiado',amount:100,due_date:'2026-12-07',credit_limit:999}],
  fulfillment:{mode:'retirada',status:'Concluída'},note:null,
};

describe('projectPdvOrderReceiptSnapshot',()=>{
  it('consulta somente a RPC com custódia e separa o cache autorizado',()=>{
    const source=readFileSync('src/hooks/usePdvOrderReceiptSnapshot.ts','utf8');
    expect(source).toContain("rpc('pdv_get_order_receipt_snapshot_v3'");
    expect(source).toContain('...scope.key');
    expect(source).not.toContain("rpc('pdv_get_order_receipt_snapshot_v2'");
    expect(source).not.toContain('staleTime:Infinity');
  });
  it('reprojeta identidade permitida e remove custo, limite e documento do cliente',()=>{
    const projected=projectPdvOrderReceiptSnapshot(payload);
    expect(projected.payments[0]).toEqual({method:'fiado',amount:100,dueDate:'2026-12-07'});
    expect(projected.company).toMatchObject({document:'CNPJ 00.000.000/0001-00',address:'Rua Exemplo, 10',phone:'(00) 0000-0000',whiteLabelEnabled:true});
    expect(JSON.stringify(projected)).not.toMatch(/unit_cost|credit_limit|customer_document/);
  });
  it('trata snapshot antigo sem flag como marca Dominex',()=>{
    const projected=projectPdvOrderReceiptSnapshot({...payload,company:{...payload.company,white_label_enabled:undefined}});
    expect(projected.company.whiteLabelEnabled).toBe(false);
  });
  it('recusa pagamentos que nao fecham os centavos',()=>{
    expect(()=>projectPdvOrderReceiptSnapshot({...payload,payments:[{method:'pix',amount:99.99}]})).toThrow(/não fecham/);
  });
  it('recusa linha cujo preço, desconto e total não fecham os centavos',()=>{
    expect(()=>projectPdvOrderReceiptSnapshot({...payload,items:[{...payload.items[0],total:99.99}]})).toThrow(/itens/);
  });
});
