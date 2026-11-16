import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BusinessCoreSelect } from './BusinessCoreSelect';
describe('escolha do núcleo',()=>{
 it('explica os dois usos e exige escolha explícita',()=>{
  const change=vi.fn();render(<BusinessCoreSelect value={null} onChange={change}/>);
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect(screen.getAllByRole('radio').every(el=>el.getAttribute('aria-checked')==='false')).toBe(true);
  fireEvent.click(screen.getByRole('radio',{name:/Loja/}));expect(change).toHaveBeenCalledWith('retail');
 });
 it('preserva o perfil da empresa já criada',()=>{
  const change=vi.fn();render(<BusinessCoreSelect value="services" onChange={change} disabled/>);
  expect(screen.getByRole('radio',{name:/Serviços/})).toHaveAttribute('aria-checked','true');
  fireEvent.click(screen.getByRole('radio',{name:/Loja/}));expect(change).not.toHaveBeenCalled();
 });
});
