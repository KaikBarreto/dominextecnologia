import {act,fireEvent,render,screen} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({allowed:true,scope:'A',read:vi.fn(),exportEntries:vi.fn()}));
vi.mock('@/contexts/AppLocaleContext',()=>({useAppLocaleContext:()=>({locale:'pt-br',currency:'BRL'})}));
vi.mock('@/hooks/useFinancePdvReconciliation',()=>({
 useFinancePdvReconciliationAccess:()=>({allowed:m.allowed,scopeKey:m.scope}),
 useFinancePdvReconciliation:(args:unknown)=>{m.read(args);return {allowed:m.allowed,data:{commercial:{revenue:65,cmv:30,expense:0,result:35,cashFlow:0},acquisitions:{amount:422,fullyPaidAmount:22,count:2},entries:[],totalCount:0,hasMore:false},isLoading:false,isFetching:false,isError:false,exportEntries:m.exportEntries};},
 useFinancePdvReconciliationEntry:()=>({data:undefined,isLoading:false,isError:false}),
}));
import {FinancePdvReconciliation} from './FinancePdvReconciliation';
beforeEach(()=>{m.allowed=true;m.scope='A';m.read.mockClear();m.exportEntries.mockReset();m.exportEntries.mockResolvedValue([]);});
describe('conferência opcional na DRE',()=>{
 it('não adiciona controles para perfil sem PDV/total/cross-cash permitido',()=>{
  m.allowed=false;render(<FinancePdvReconciliation regime="competencia" asOf="2026-11-15"/>);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();expect(screen.queryByText(/65,00/)).not.toBeInTheDocument();
 });
 it('começa recolhida e identifica resultado parcial sem mudar DRE da empresa',()=>{
  render(<FinancePdvReconciliation regime="competencia" asOf="2026-11-15"/>);
  expect(screen.queryByText('Resultado parcial do PDV')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Conferir vendas e compras do PDV'}));
  expect(screen.getByText('Resultado parcial do PDV')).toBeVisible();expect(screen.getByText(/resultado consolidado da empresa ainda não foi conciliado/)).toBeVisible();
  expect(screen.getByText(/outras receitas e despesas/)).toBeVisible();
 });
 it('respeita início configurado e corte civil de caixa, sem horário ou fuso no filtro',()=>{
  render(<FinancePdvReconciliation regime="caixa" asOf="2026-11-15" startDate="2026-11-10" range={{from:new Date(2026,10,1),to:new Date(2026,10,20)}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Conferir vendas e compras do PDV'}));
  expect(m.read).toHaveBeenLastCalledWith(expect.objectContaining({from:'2026-11-10',to:'2026-11-15',projection:'dre_cash',enabled:true}));
 });
 it('fecha e mascara o contexto anterior ao mudar identidade, mesmo com cache preenchido',()=>{
  const {rerender}=render(<FinancePdvReconciliation regime="competencia" asOf="2026-11-15"/>);
  fireEvent.click(screen.getByRole('button',{name:'Conferir vendas e compras do PDV'}));expect(screen.getByText('Resultado parcial do PDV')).toBeVisible();
  m.scope='B';rerender(<FinancePdvReconciliation regime="competencia" asOf="2026-11-15"/>);
  expect(screen.queryByText('Resultado parcial do PDV')).not.toBeInTheDocument();
 });
 it('não baixa arquivo depois que o contexto muda durante a exportação',async()=>{
  let resolve:(value:[])=>void=()=>{};m.exportEntries.mockImplementation(()=>new Promise<[]>(r=>{resolve=r;}));
  const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const {rerender}=render(<FinancePdvReconciliation regime="competencia" asOf="2026-11-15"/>);
  fireEvent.click(screen.getByRole('button',{name:'Conferir vendas e compras do PDV'}));fireEvent.click(screen.getByRole('button',{name:'Exportar conferência'}));
  m.scope='B';rerender(<FinancePdvReconciliation regime="competencia" asOf="2026-11-15"/>);await act(async()=>{resolve([]);});
  expect(click).not.toHaveBeenCalled();click.mockRestore();
 });
});
