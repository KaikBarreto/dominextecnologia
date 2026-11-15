import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  `${process.cwd()}/src/components/inventory/InventoryFormDialog.tsx`,
  'utf8',
);

describe('InventoryFormDialog — divulgação progressiva', () => {
  it('falha fechado enquanto o módulo PDV não foi confirmado', () => {
    expect(source).toContain("isInventoryModuleConfirmed(modulesLoading, hasModule('pdv'))");
    expect(source).toContain('{pdvEnabled && (');
    expect(source).toContain('aria-label={t.fields.isSellable}');
  });

  it('abre nos dados básicos e separa as tarefas em abas curtas', () => {
    expect(source).toContain("useState<InventoryFormTab>('basic')");
    expect(source).toContain("setActiveTab('basic')");
    expect(source).toContain("basic: 'Dados básicos'");
    expect(source).toContain("stock: 'Estoque e preços'");
    expect(source).toContain("codes: 'Códigos e etiquetas'");
    expect(source).toContain('<span className="sm:hidden">{ui.basicShort}</span>');
    expect(source).toContain('sm:!max-w-[1040px]');
  });

  it('mantém códigos disponíveis com ou sem PDV, fora do caminho inicial', () => {
    expect(source).toContain("const codesExpanded = activeTab === 'codes'");
    expect(source).toContain("primaryOptionalHint: 'Opcional para leitor, câmera, inventário ou impressão de etiquetas.'");
    expect(source).toContain('isEditing && item ? <InventoryIdentifierManager inventoryId={item.id} embedded />');
    expect(source).toContain('<InventoryIdentifierManager inventoryId={item.id} embedded />');
    expect(source).toContain("saveForCodes: 'Salve o material para gerar o código interno");
  });

  it('não deixa o leitor oculto capturar códigos ao fundo', () => {
    expect(source).toContain('enabled: open && codesExpanded && !groupFormOpen');
  });

  it('deixa vender no caixa apenas na aba de estoque, sem misturar com códigos', () => {
    const sellable = source.indexOf('aria-label={t.fields.isSellable}');
    const stockTab = source.indexOf('<TabsContent value="stock"');
    const codesTab = source.indexOf('<TabsContent value="codes"');
    expect(sellable).toBeGreaterThan(-1);
    expect(sellable).toBeGreaterThan(stockTab);
    expect(sellable).toBeLessThan(codesTab);
  });

  it('leva a pessoa à aba correta quando um campo oculto impede salvar', () => {
    expect(source).toContain("setActiveTab('basic')");
    expect(source).toContain('nameInputRef.current?.reportValidity()');
    expect(source).toContain("setActiveTab('pmoc')");
    expect(source).toContain('target.current?.focus()');
  });

  it('só cria a aba PMOC quando o módulo ou o legado pedem', () => {
    expect(source).toContain('showPmocSection && <TabsTrigger value="pmoc" variant="underline">PMOC</TabsTrigger>');
    expect(source).toContain('{showPmocSection && (');
  });
});
