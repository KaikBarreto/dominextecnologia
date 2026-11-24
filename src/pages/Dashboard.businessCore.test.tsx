import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const {stats,gps,allowed}=vi.hoisted(()=>({stats:vi.fn(),gps:vi.fn(),allowed:new Set<string>()}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({hasScreenAccess:(screen:string)=>allowed.has(screen)})}));
vi.mock('@/hooks/useCompanyModules',()=>({useCompanyModules:()=>({businessCore:'retail',isLoading:false,hasModule:(module:string)=>module==='pdv'||module==='basic',hasScreen:()=>true})}));
vi.mock('@/hooks/useDashboardStats',()=>({useDashboardStats:stats}));
vi.mock('@/hooks/useLiveTechnicianLocations',()=>({useLiveTechnicianLocations:gps}));
vi.mock('@/components/notices/SystemNoticeBanners',()=>({SystemNoticeBanners:()=>null}));
vi.mock('@/components/layout/PageHeader',()=>({PageHeader:({title,actions}:{title:string;actions?:React.ReactNode})=><header><h1>{title}</h1>{actions}</header>}));
import Dashboard from './Dashboard';
beforeEach(()=>{allowed.clear();stats.mockClear();gps.mockClear();});
describe('início do núcleo Loja',()=>{
 it('não consulta OS, rastreamento ou financeiro e mostra somente atalhos autorizados',()=>{
  allowed.add('screen:pdv_orders');
  render(<MemoryRouter><Dashboard/></MemoryRouter>);
  expect(screen.getByRole('heading',{name:'Visão geral da loja'})).toBeInTheDocument();
  expect(screen.getByRole('link',{name:/Pedidos/})).toHaveAttribute('href','/pdv/pedidos');
  expect(screen.queryByRole('link',{name:/Financeiro/})).not.toBeInTheDocument();
  expect(screen.queryByRole('link',{name:/Caixa/})).not.toBeInTheDocument();
  expect(stats).not.toHaveBeenCalled();expect(gps).not.toHaveBeenCalled();
 });
 it('mostra orientação quando o responsável ainda não liberou telas',()=>{
  render(<MemoryRouter><Dashboard/></MemoryRouter>);
  expect(screen.getByText(/Peça ao responsável pela empresa/)).toBeInTheDocument();
  expect(screen.queryAllByRole('link')).toHaveLength(0);expect(stats).not.toHaveBeenCalled();
 });
});
