import { describe, expect, it } from 'vitest';
import { chooseSocialBackground } from './osSocialImage';

describe('chooseSocialBackground', () => {
  it('escolhe fundo claro para logo escuro', () => {
    expect(chooseSocialBackground(new Uint8ClampedArray([12, 18, 16, 255]))).toBe('#f4f8f6');
  });

  it('escolhe fundo escuro para logo claro', () => {
    expect(chooseSocialBackground(new Uint8ClampedArray([245, 248, 247, 255]))).toBe('#0d1714');
  });

  it('ignora pixels transparentes', () => {
    expect(chooseSocialBackground(new Uint8ClampedArray([
      255, 255, 255, 0,
      20, 20, 20, 255,
    ]))).toBe('#f4f8f6');
  });
});
