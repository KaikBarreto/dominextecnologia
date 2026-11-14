import { describe, expect, it } from 'vitest';
import { projectPdvReceiptSettings } from './usePdvReceiptSettings';

describe('projectPdvReceiptSettings', () => {
  it('mantém somente a allowlist esperada', () => {
    expect(projectPdvReceiptSettings({ default_format:'58mm',auto_print:true,copies:2,company_id:'segredo',token:'segredo' })).toEqual({ defaultFormat:'58mm',autoPrint:true,copies:2 });
  });
  it('usa defaults seguros para resposta inválida', () => {
    expect(projectPdvReceiptSettings({ default_format:'fiscal',auto_print:'sim',copies:99 })).toEqual({ defaultFormat:'80mm',autoPrint:false,copies:1 });
  });
});
