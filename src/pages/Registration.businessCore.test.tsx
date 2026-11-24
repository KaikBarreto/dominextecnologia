import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const {rpc}=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc,functions:{invoke:vi.fn()}}}));
vi.mock('@/components/ui/DarkVeil',()=>({default:()=>null}));
vi.mock('@/components/layout/SystemFooter',()=>({SystemFooter:()=>null}));
vi.mock('@/hooks/use-toast',()=>({useToast:()=>({toast:vi.fn()})}));
import Registration from './Registration';
function mount(path:string){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Registration/></MemoryRouter></QueryClientProvider>);
}
beforeEach(()=>{
 vi.stubGlobal('ResizeObserver',class { observe() {} unobserve() {} disconnect() {} });
 rpc.mockImplementation(async(name:string)=>({data:name==='get_signup_origins'?[]:null,error:null}));
});
describe('cadastro por núcleo',()=>{
 it('pergunta o perfil no acesso direto e avança sem pedir informações de OS',async()=>{
  mount('/cadastro');
  expect(screen.getByRole('radiogroup',{name:'Perfil da empresa'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio',{name:/Loja/}));
  fireEvent.click(screen.getByRole('button',{name:/Continuar/i}));
  await waitFor(()=>expect(screen.queryByRole('radiogroup',{name:'Perfil da empresa'})).not.toBeInTheDocument());
  expect(document.querySelector('input[name="company_name"]')).not.toBeNull();
 });
 it('não pergunta novamente quando o link já informa Loja',()=>{
  mount('/cadastro?nucleo=retail');
  expect(screen.queryByRole('radiogroup',{name:'Perfil da empresa'})).not.toBeInTheDocument();
  expect(document.querySelector('input[name="company_name"]')).not.toBeNull();
 });
 it('não permite preencher um cadastro de oferta inválida como se fosse cadastro comum',async()=>{
  mount('/cadastro?nucleo=retail&oferta=00000000-0000-4000-8000-000000000009');
  await screen.findByText('Este link não está mais disponível. Peça um novo link.');
  expect(document.querySelector('input[name="company_name"]')).toBeNull();
 });
});
