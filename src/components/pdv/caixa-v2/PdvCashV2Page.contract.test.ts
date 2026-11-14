import { describe, expect, it } from 'vitest';
import pageSource from './PdvCashV2Page.tsx?raw';

describe('contrato de navegação do caixa v2', () => {
  it('usa cards roláveis para alternar entre os caixas', () => {
    expect(pageSource).toContain('Início');
    expect(pageSource).toContain('border-primary bg-primary text-primary-foreground shadow-sm');
    expect(pageSource).toContain('border-border bg-background text-muted-foreground');
    expect(pageSource).not.toContain('bg-muted/50 text-muted-foreground');
    expect(pageSource).toContain('rounded-lg border px-4 py-2');
    expect(pageSource).toContain('{cashDisplayName(terminal)}');
    expect(pageSource).toContain("return name || 'Caixa 01'");
    expect(pageSource).not.toContain("String(index + 1).padStart(2, '0')");
    expect(pageSource).toContain('PdvCashIndicators');
  });

  it('mostra resumo e movimentações numa visão única, sem subabas internas', () => {
    expect(pageSource).toContain('Resumo do caixa atual');
    expect(pageSource).toContain('Movimentações do caixa');
    expect(pageSource).not.toContain('Visão geral');
    expect(pageSource).not.toContain('Pedidos do balcão');
    expect(pageSource).not.toContain('WorkspaceTabButton');
    expect(pageSource).not.toContain('PdvCashQueuePanel');
  });

  it('mantém o histórico fechado fora das abas do caixa aberto', () => {
    expect(pageSource).toContain("localizeAppPath('/pdv/caixas', locale)");
    expect(pageSource).not.toContain('<PdvCashV2History');
  });

  it('mantém os quatro atalhos operacionais da tela anterior', () => {
    expect(pageSource).toContain('Nova venda');
    expect(pageSource).toContain('Nova compra');
    expect(pageSource).toContain('Nova despesa');
    expect(pageSource).toContain('Nova receita');
  });

  it('abre compra com abertura, caixa e estoque confirmados na rota', () => {
    expect(pageSource).toContain('buildPdvPurchaseCashPath');
    expect(pageSource).toContain('sessionId: focusedSession.id');
    expect(pageSource).toContain('terminalId: focusedTerminal.id');
    expect(pageSource).toContain('stockId: focusedTerminal.stockId');
    expect(pageSource).toContain('label="Nova compra" tone="purchase" disabled={!canAct || !purchasePath}');
    expect(pageSource).toContain("disabled ? 'sm:border sm:border-border sm:bg-background sm:text-foreground sm:shadow-none'");
    expect(pageSource).toContain("disabled ? 'border border-border bg-background text-foreground shadow-none'");
    expect(pageSource).not.toContain('disabled:opacity-40');
    expect(pageSource).toContain('if (purchasePath) navigate(purchasePath)');
  });

  it('usa linguagem de caixa e avisa quando o contexto encerra em outra tela', () => {
    expect(pageSource).toContain('Caixas abertos');
    expect(pageSource).toContain('Resumo do dinheiro');
    expect(pageSource).toContain('Saldo total em dinheiro');
    expect(pageSource).toContain('Separado nos caixas');
    expect(pageSource).toContain('Livre para abrir caixas');
    expect(pageSource).toContain('text-blue-600 dark:text-blue-400');
    expect(pageSource).toContain('text-orange-600 dark:text-orange-400');
    expect(pageSource).toContain('text-emerald-600 dark:text-emerald-400');
    expect(pageSource).toContain('text-violet-600 dark:text-violet-400');
    expect(pageSource).not.toContain('Resumo dos caixas agora');
    expect(pageSource).toContain('O caixa selecionado foi fechado ou deixou de estar disponível.');
    expect(pageSource).not.toContain('Gavetas abertas');
    expect(pageSource).not.toContain('Movimentações da gaveta');
  });

  it('compacta ações das movimentações em menu acessível no desktop e celular', () => {
    expect(pageSource).toContain('function MovementActionsMenu');
    expect(pageSource).toContain('aria-label={`Ações da movimentação ${movementName}`}');
    expect(pageSource).toContain('<DropdownMenuLabel>Ações</DropdownMenuLabel>');
    expect(pageSource).toContain("loading ? 'Gerando...' : 'Gerar comprovante'");
    expect(pageSource).toContain('md:hidden');
    expect(pageSource).toContain('hidden overflow-hidden rounded-lg border md:block');
    expect(pageSource).not.toContain('className="w-full" disabled={receiptLoadingId === entry.id}');
  });
});
