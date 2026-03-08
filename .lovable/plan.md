

## Plano: Refinar visualmente os 3 templates de proposta

### Melhorias por template

**ClassicTemplate** — Corporativo formal refinado
- Adicionar campo CNPJ/CPF do cliente quando disponivel
- Adicionar numero do item (#) na tabela
- Subtotal de cada secao (servicos / materiais) ao final da tabela
- Separador visual mais elegante entre header e corpo
- Assinatura/aceite area no rodape (linha pontilhada para assinatura)
- Forma de pagamento se houver nos termos
- Melhorar espcamento e hierarquia tipografica

**ModernTemplate** — Tech/startup vibrante
- Adicionar CNPJ da empresa e do cliente
- Adicionar badge de status (ex: "Enviado", "Aprovado") no header
- Numeracao nos cards de itens
- Subtotal por secao dentro de um mini-card
- Area de termos com icone decorativo
- Rodape com dados completos da empresa
- Melhorar o bloco de total com label "VALOR TOTAL" mais proeminente

**MinimalTemplate** — Editorial clean
- Adicionar dados do cliente (email, telefone) abaixo do nome
- Adicionar dados da empresa (CNPJ, endereco) de forma discreta
- Separar servicos de materiais com label sutil
- Subtotal por grupo
- Linha horizontal fina antes do total
- Espaçar melhor validade e data de emissao
- Assinatura area minimalista no final

### Melhorias comuns a todos
- Formatar valores monetarios com separador de milhares brasileiro (1.300,00 em vez de 1300.00)
- Mostrar unidade "un" ou "h" quando aplicavel
- Garantir que endereço completo da empresa aparece em todos

### Arquivos editados
- `src/components/quotes/templates/ClassicTemplate.tsx`
- `src/components/quotes/templates/ModernTemplate.tsx`
- `src/components/quotes/templates/MinimalTemplate.tsx`

Sem alteracoes de banco.

