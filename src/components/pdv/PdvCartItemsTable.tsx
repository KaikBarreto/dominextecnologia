import { ShoppingCart, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignedImg } from '@/components/ui/SignedImg';
import { PdvProductName } from '@/components/pdv/PdvProductName';
import { PdvQuantityStepper } from '@/components/pdv/PdvQuantityStepper';
import { PdvScrollFadeContainer } from '@/components/pdv/PdvScrollFadeContainer';
import type { CartState } from '@/lib/pdv/cart';
import { cn } from '@/lib/utils';

export interface PdvCartItemsTexts {
  title: string;
  itemsCount: string;
  empty: string;
  emptyHint: string;
  removeLine: string;
  clearCart: string;
  noPhoto: string;
  columnProduct: string;
  columnQuantity: string;
  quantityEditLabel: string;
  discountLabel: string;
  discountPlaceholder: string;
  columnUnitPrice: string;
  columnLineTotal: string;
}

interface PdvCartItemsTableProps {
  cart: CartState;
  formatCurrency: (value: number) => string;
  onIncrement: (inventoryId: string, delta: number) => void;
  onSetQuantity: (inventoryId: string, quantity: number) => void;
  onSetLineDiscount: (inventoryId: string, discountAmount: number) => void;
  onRemove: (inventoryId: string) => void;
  onRequestClearCart: () => void;
  /** Enter na edição de quantidade devolve o foco pra busca (balcão é fila). */
  onConfirmQuantityEdit?: () => void;
  texts: PdvCartItemsTexts;
  className?: string;
}

/**
 * Itens do carrinho no desktop/tablet — mora na COLUNA DOS PRODUTOS, logo
 * abaixo da grade (pedido do CEO 2026-10-18: "o carrinho não tá claro ali na
 * direita, melhor ele ficar na área dos produtos, com os itens incluídos
 * abaixo"). Tabela em vez de cards: mais densa, mais legível no desktop que
 * tem largura de sobra (a versão card continua no drawer do mobile, ver
 * `PdvCartLineRow`/`PdvCartPanel`, que não mudou).
 */
export function PdvCartItemsTable({
  cart,
  formatCurrency,
  onIncrement,
  onSetQuantity,
  onSetLineDiscount,
  onRemove,
  onRequestClearCart,
  onConfirmQuantityEdit,
  texts,
  className,
}: PdvCartItemsTableProps) {
  const itemCount = cart.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-border bg-background',
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{texts.title}</span>
          {itemCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {texts.itemsCount.replace('{count}', String(itemCount))}
            </span>
          )}
        </div>
        {cart.lines.length > 0 && (
          <Button
            type="button"
            variant="destructive-ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRequestClearCart}
            aria-label={texts.clearCart}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {cart.lines.length === 0 ? (
        // Vazio aqui NÃO é `EmptyState` padrão (mesmo `size="compact"` ainda
        // mede ~148px de ícone+título+descrição, medido 2026-10-18): esta
        // tabela mora colada embaixo da grade de produtos e disputa altura
        // com ela no mesmo orçamento fixo. Um vazio alto aqui rouba a janela
        // de rolagem da grade até sumir o preço (regressão medida do
        // Finalizar Venda). Linha única, ícone pequeno — o `EmptyState` cheio
        // continua valendo no drawer do mobile (`PdvCartPanel`), que não
        // disputa espaço com nada.
        <div className="flex flex-1 min-h-0 items-center justify-center gap-2 px-4 py-4 text-center text-xs text-muted-foreground sm:text-sm">
          <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {texts.empty} · {texts.emptyHint}
          </span>
        </div>
      ) : (
        // Fade + chevron (não "ver mais" clicável — ver `PdvScrollFadeContainer`)
        // quando passa de 5 linhas, no molde da EcoSistema (pedido do CEO
        // 2026-10-19). `recomputeDeps=[cart.lines.length]` recalcula as
        // bordas quando item entra/sai do carrinho.
        <PdvScrollFadeContainer className="min-h-0 flex-1" recomputeDeps={[cart.lines.length]}>
          <table className="w-full text-sm">
            {/* `bg-muted` SÓLIDO (token de superfície, não `bg-muted/40`
                translúcido) + `z-10`: era a causa do bug "cabeçalho sticky
                sobrepõe a 1ª linha ao rolar" (queixa do CEO 2026-10-18,
                print com "Produto" e "Conexão flare 1/4"" no mesmo pixel).
                Com fundo translúcido a linha de baixo vaza por cima do
                texto do cabeçalho durante o scroll. `bg-muted` resolve nos
                dois temas (claro e escuro) porque é var HSL sólida
                (`src/index.css`), não cor fixa. */}
            <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{texts.columnProduct}</th>
                <th className="px-2 py-2 text-center font-medium">{texts.columnQuantity}</th>
                <th className="px-2 py-2 text-right font-medium">{texts.columnUnitPrice}</th>
                <th className="px-2 py-2 text-right font-medium">{texts.columnLineTotal}</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cart.lines.map((line) => {
                const lineGross = line.quantity * line.unitPrice;
                const lineDiscount = Math.min(Math.max(line.discountAmount ?? 0, 0), lineGross);
                const lineTotal = lineGross - lineDiscount;
                return (
                  <tr key={line.inventoryId}>
                    <td className="px-4 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <SignedImg
                          src={line.imageUrl}
                          alt={line.name}
                          fallbackLabel={texts.noPhoto}
                          className="h-8 w-8 shrink-0 rounded-md object-cover"
                        />
                        {/* `PdvProductName` MEDE a largura real da coluna e só
                            corta quando o nome não cabe em 2 linhas — nome
                            médio aparece INTEIRO, quebrando em 2 linhas e
                            deixando a linha do carrinho mais alta (pedido do
                            CEO 2026-10-19: "no nome do produto no carrinho tem
                            espaço pra mostrar / e se precisar quebra linha
                            aumentando altura do item no carrinho").

                            Era `truncateMiddle(line.name, 18, 12)`: orçamento
                            FIXO de 30 caracteres, o mesmo erro que o CEO já
                            tinha apontado no card da grade. "Braçadeira de
                            nylon 20cm (pacote 100un)" tem 39 caracteres e saía
                            "Braçadeira de nylo...acote 100un)" com a coluna
                            Produto vazia por mais de 500px à direita. Corte
                            tem que vir de LARGURA MEDIDA, nunca de contagem de
                            caractere.

                            SEM `min-h` de propósito (ao contrário do card da
                            grade): aqui não existe grade serrilhada pra
                            evitar, então nome curto continua ocupando 1 linha
                            só e apenas o nome longo cresce.

                            A altura da tabela do carrinho é FIXA (ver
                            `CART_HEIGHT_CLASS` em `Pdv.tsx`), com rolagem
                            interna e fade — linha mais alta só faz caber menos
                            linha na janela, nunca estoura o layout. */}
                        <PdvProductName
                          name={line.name}
                          className="min-w-0 font-medium text-foreground"
                        />
                      </div>
                      <label className="mt-1 flex max-w-48 items-center gap-1.5 pl-10 text-[11px] text-muted-foreground">
                        <span className="shrink-0">{texts.discountLabel}</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={lineGross}
                          step="0.01"
                          value={lineDiscount || ''}
                          placeholder={texts.discountPlaceholder}
                          onChange={(event) =>
                            onSetLineDiscount(line.inventoryId, Number(event.target.value))
                          }
                          className="h-6 min-w-0 flex-1 border-0 border-b border-input bg-transparent px-1 text-right text-xs tabular-nums outline-none focus:border-primary focus:ring-0"
                        />
                      </label>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center">
                        <PdvQuantityStepper
                          size="sm"
                          quantity={line.quantity}
                          availableQuantity={line.availableQuantity}
                          onIncrement={(delta) => onIncrement(line.inventoryId, delta)}
                          onSetQuantity={(quantity) => onSetQuantity(line.inventoryId, quantity)}
                          onConfirmEdit={onConfirmQuantityEdit}
                          decrementAriaLabel="-"
                          incrementAriaLabel="+"
                          editAriaLabel={texts.quantityEditLabel}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(line.unitPrice)}
                    </td>
                    <td className="px-2 py-2 text-right font-bold tabular-nums">
                      {lineDiscount > 0 && (
                        <span className="block text-[10px] font-normal text-muted-foreground line-through">
                          {formatCurrency(lineGross)}
                        </span>
                      )}
                      {formatCurrency(lineTotal)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Button
                        type="button"
                        variant="destructive-ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onRemove(line.inventoryId)}
                        aria-label={texts.removeLine}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PdvScrollFadeContainer>
      )}
    </div>
  );
}
