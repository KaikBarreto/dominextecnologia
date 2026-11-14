import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toReceiptCents, type PdvReceiptSnapshot } from '@/lib/pdv/receipt/model';
import { PdvReceiptSettingsError } from '@/hooks/usePdvReceiptSettings';
import { usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';

type RpcResult = { data: unknown; error: { details?: string; message?: string } | null };
type RpcCaller = (name: string,args?:Record<string,unknown>)=>Promise<RpcResult>;
const rpc=supabase.rpc.bind(supabase) as unknown as RpcCaller;

const object=(value:unknown):Record<string,unknown>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value:null;
const number=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;

export function projectPdvOrderReceiptSnapshot(payload:unknown):PdvReceiptSnapshot {
  const root=object(payload); const company=object(root?.company); const order=object(root?.order); const totals=object(root?.totals);
  if(!root||!company||!order||!totals||!Array.isArray(root.items)||!Array.isArray(root.payments)) throw new PdvReceiptSettingsError('O comprovante salvo está incompleto.','pdv_receipt_invalid_snapshot');
  const companyName=text(company.name); const orderNumber=typeof order.number==='number'||typeof order.number==='string'?order.number:null;
  const issuedAt=text(order.issued_at); const operatorName=text(order.operator_name);
  const subtotal=number(totals.subtotal); const discount=number(totals.discount); const total=number(totals.total);
  if(!companyName||orderNumber==null||!issuedAt||!operatorName||subtotal==null||discount==null||total==null) throw new PdvReceiptSettingsError('O comprovante salvo está incompleto.','pdv_receipt_invalid_snapshot');
  const items=root.items.map((raw)=>{const item=object(raw);const description=text(item?.description);const unit=text(item?.unit);const quantity=number(item?.quantity);const unitPrice=number(item?.unit_price);const itemDiscount=number(item?.discount);const itemTotal=number(item?.total);if(!description||!unit||quantity==null||quantity<=0||unitPrice==null||unitPrice<0||itemDiscount==null||itemDiscount<0||itemTotal==null||itemTotal<0||toReceiptCents(quantity*unitPrice-itemDiscount)!==toReceiptCents(itemTotal)) throw new PdvReceiptSettingsError('Os itens do comprovante estão inválidos.','pdv_receipt_invalid_snapshot');return{description,unit,quantity,unitPrice,discount:itemDiscount,total:itemTotal};});
  const payments=root.payments.map((raw)=>{const payment=object(raw);const method=text(payment?.method);const amount=number(payment?.amount);if(!method||amount==null||amount<=0) throw new PdvReceiptSettingsError('Os pagamentos do comprovante estão inválidos.','pdv_receipt_invalid_snapshot');return{method,amount,dueDate:text(payment?.due_date)};});
  if(items.length===0||subtotal<0||discount<0||total<0||toReceiptCents(subtotal-discount)!==toReceiptCents(total)||toReceiptCents(items.reduce((sum,item)=>sum+item.total,0))!==toReceiptCents(total)) throw new PdvReceiptSettingsError('Os totais do comprovante estão inválidos.','pdv_receipt_totals_mismatch');
  if(toReceiptCents(payments.reduce((sum,payment)=>sum+payment.amount,0))!==toReceiptCents(total)) throw new PdvReceiptSettingsError('Os pagamentos não fecham com o total do comprovante.','pdv_receipt_totals_mismatch');
  const fulfillment=object(root.fulfillment); const mode=fulfillment?.mode; const status=text(fulfillment?.status);
  return {
    company:{
      name:companyName,
      document:text(company.document),
      address:text(company.address),
      phone:text(company.phone),
      logoUrl:text(company.logo_url),
      timeZone:text(company.time_zone),
      whiteLabelEnabled:company.white_label_enabled === true,
    },
    order:{number:orderNumber,issuedAt,operatorName,terminalName:text(order.terminal_name),customerName:text(order.customer_name)},
    items,totals:{subtotal,discount,total},payments,
    fulfillment:fulfillment&&(mode==='retirada'||mode==='entrega')&&status?{mode,status,address:text(fulfillment.address)}:null,
    note:text(root.note),
  };
}

export async function fetchPdvOrderReceiptSnapshot(orderId:string):Promise<PdvReceiptSnapshot>{
  const {data,error}=await rpc('pdv_get_order_receipt_snapshot_v3',{p_order_id:orderId});
  if(error){const code=/(?:^|\s)code=([a-z0-9_]+)/i.exec(error.details??'')?.[1]??'pdv_receipt_unknown';const messages:Record<string,string>={pdv_receipt_not_found:'O comprovante deste pedido ainda não está disponível.',pdv_receipt_order_denied:'Você não tem permissão para consultar este comprovante.',pdv_receipt_integrity_failed:'O comprovante salvo requer revisão.'};throw new PdvReceiptSettingsError(messages[code]??'Não foi possível carregar o comprovante.',code);}
  return projectPdvOrderReceiptSnapshot(data);
}

export function usePdvOrderReceiptSnapshot(orderId:string|null,enabled=false){
  const scope=usePdvAuthorizedQueryScope();
  return useQuery({queryKey:['pdv','orders',...scope.key,orderId,'receipt-snapshot'],queryFn:()=>fetchPdvOrderReceiptSnapshot(orderId!),enabled:Boolean(orderId)&&enabled&&scope.ready,staleTime:30_000,gcTime:0});
}
