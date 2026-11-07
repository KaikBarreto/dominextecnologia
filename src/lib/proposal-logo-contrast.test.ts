import { afterEach, describe, expect, it, vi } from 'vitest';
import { proposalLogoPlate } from './proposal-logo-contrast';

const image = () => {
  const img = document.createElement('img');
  Object.defineProperties(img, { naturalWidth: { value: 960 }, naturalHeight: { value: 120 } });
  return img;
};
function pixels(values: number[]) {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage, getImageData: () => ({ data: new Uint8ClampedArray(values) }),
  } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
  return drawImage;
}
afterEach(() => vi.restoreAllMocks());

describe('contraste do logo na proposta Clean', () => {
  it('usa placa escura para logo branco transparente sem modificar a imagem ou ler em tamanho integral', () => {
    const draw = pixels([255, 255, 255, 255, 0, 0, 0, 0]);
    const img = image();
    expect(proposalLogoPlate(img)).toBe('#111815');
    expect(draw).toHaveBeenCalledWith(img, 0, 0, 96, 12);
  });
  it('preserva logo escuro transparente sobre o documento já branco', () => {
    pixels([0, 0, 0, 255, 0, 0, 0, 0]);
    expect(proposalLogoPlate(image())).toBeNull();
  });
  it('preserva o fundo da imagem opaca sem acrescentar placa', () => {
    pixels([255, 255, 255, 255, 0, 0, 0, 255]);
    expect(proposalLogoPlate(image())).toBeNull();
  });
  it('deixa imagens sem CORS intactas quando o navegador bloqueia leitura dos pixels', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(), getImageData: () => { throw new DOMException('Canvas bloqueado', 'SecurityError'); },
    } as unknown as ReturnType<HTMLCanvasElement['getContext']>);
    expect(proposalLogoPlate(image())).toBeNull();
  });
  it('não depende de canvas disponível ou imagem já carregada', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(proposalLogoPlate(image())).toBeNull();
    expect(proposalLogoPlate(document.createElement('img'))).toBeNull();
  });
});
