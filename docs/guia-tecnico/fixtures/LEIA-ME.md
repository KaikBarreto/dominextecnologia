# Fixtures do Guia Técnico

## `exemplo-importacao-financeira.xlsx`

Planilha de exemplo usada pelo print **`t13-planilha-conferencia`** (spec em
`docs/guia-tecnico/prints/T13.json`), que precisa de um arquivo REAL subindo
pra tela de conferência aparecer.

30 linhas de uma empresa de refrigeração, montadas contra o cadastro da conta
DEMO (`demo@dominex.app`): PMOC recorrente, instalação parcelada, boleto a
vencer, gás, compressor, valores em formato BR, despesa escrita negativa e
alguns erros de propósito (dia 31 em mês que não tem, categoria e conta fora
do cadastro, cartão de crédito). É isso que faz o print mostrar os três selos
— Pronta, Precisa de atenção e Duplicada — numa tela só.

⚠️ **Subir este arquivo NÃO grava nada.** A tela de conferência vem da RPC de
preview, que é somente-leitura. Quem grava é o botão "Gravar N selecionada(s)",
e nenhum spec de captura clica nele (regra de ouro em `scripts/README.md`).

⚠️ **Depende do cadastro da conta demo.** Se as categorias/contas/clientes
citados sumirem de lá, o print passa a mostrar tudo como "Precisa de atenção"
e perde a graça. Regerar: ver o histórico do gerador em
`src/utils/financialImport/` (o script de QA que montou este arquivo).
