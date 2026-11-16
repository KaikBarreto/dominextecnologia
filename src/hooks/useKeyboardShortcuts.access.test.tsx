import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const {navigate,allowedScreens,licensedScreens}=vi.hoisted(()=>({navigate:vi.fn(),allowedScreens:new Set<string>(),licensedScreens:new Set<string>()}));
vi.mock('react-router-dom',()=>({useNavigate:()=>navigate}));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({hasScreenAccess:(screen:string)=>allowedScreens.has(screen)})}));
vi.mock('@/hooks/useCompanyModules',()=>({useCompanyModules:()=>({hasScreen:(screen:string)=>licensedScreens.has(screen)})}));
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
beforeEach(()=>{allowedScreens.clear();licensedScreens.clear();navigate.mockClear();localStorage.clear();});
describe('atalhos respeitam o núcleo e permissões',()=>{
 it('omite navegação de serviços sem licença, mesmo com permissão antiga salva',()=>{
  allowedScreens.add('screen:service_orders');allowedScreens.add('screen:inventory');licensedScreens.add('screen:inventory');
  const {result}=renderHook(()=>useKeyboardShortcuts(false));
  expect(result.current.shortcuts.map(s=>s.id)).toEqual(['goto_inventory','goto_profile']);
 });
 it('não executa atalho oculto e continua permitindo navegação autorizada',()=>{
  allowedScreens.add('screen:inventory');licensedScreens.add('screen:inventory');
  renderHook(()=>useKeyboardShortcuts());
  act(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'o',shiftKey:true,bubbles:true})));
  expect(navigate).not.toHaveBeenCalled();
  act(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'i',shiftKey:true,bubbles:true})));
  expect(navigate).toHaveBeenCalledWith('/estoque');
 });
});
