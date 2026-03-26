
# Recriar exportação PDF do relatório de serviço do zero

## Objetivo
Substituir completamente a exportação atual por uma implementação nova, estável e previsível, que:
- mantenha o visual do relatório HTML o mais fiel possível
- gere páginas A4 reais
- nunca corte conteúdo no meio
- evite páginas em branco
- funcione mesmo com muitos questionários, fotos e equipamentos

## Diagnóstico do problema atual
Hoje o PDF está instável porque a lógica tenta “fotografar” um relatório web grande e dinâmico:
- abre/fecha accordions antes da captura
- tenta capturar um DOM muito alto de uma vez
- depois reparte essa imagem gigante em páginas do PDF

Isso é frágil e explica os sintomas recentes:
- dezenas de páginas em branco
- estilos divergentes
- conteúdo cortado
- comportamento inconsistente entre tela, impressão e PDF

## Nova abordagem
Vou abandonar totalmente a exportação atual baseada em capturar o relatório inteiro de uma vez.

Em vez disso, vou criar um fluxo novo com 3 camadas:

1. **Relatório web normal**
   - continua sendo o relatório visível no link público

2. **Layout PDF dedicado**
   - uma versão específica para exportação
   - visualmente igual ao HTML atual
   - mas organizada em páginas A4 desde a origem

3. **Captura página por página**
   - cada página A4 será renderizada separadamente
   - cada página será capturada individualmente
   - o PDF será montado com 1 imagem por página
   - isso elimina o problema de páginas brancas por imagem gigante

## O que vou implementar

### 1) Remover a lógica atual de PDF
Em `OSReport.tsx` vou eliminar da exportação:
- captura do `reportRef` inteiro
- lógica de deslocamento vertical da mesma imagem
- hacks temporários para abrir accordion só para PDF
- qualquer dependência do scrollHeight do relatório completo

A impressão pode continuar separada, mas o “Baixar PDF” deixa de depender da mesma estratégia.

### 2) Criar um renderizador de páginas A4
Vou criar uma estrutura nova de exportação, algo no padrão:

```text
OSReport
 ├─ relatório web atual
 └─ PDF export renderer
     ├─ page 1
     ├─ page 2
     ├─ page 3
     └─ ...
```

Esse renderizador:
- recebe os mesmos dados do relatório
- usa os mesmos estilos, cores e blocos visuais
- monta páginas com largura e espaçamento de A4
- organiza o conteúdo antes da captura

### 3) Paginação real por blocos
Vou tratar o relatório como uma sequência de blocos:
- cabeçalho
- contrato
- cliente
- equipamentos
- descrição
- execução
- fotos
- questionários
- assinaturas
- avaliação
- rodapé

A paginação vai funcionar assim:
- medir a altura de cada bloco no layout A4
- adicionar o bloco na página atual enquanto houver espaço
- quando não couber, iniciar nova página
- nunca cortar um bloco simples no meio

### 4) Quebra inteligente para blocos longos
Alguns blocos podem ficar grandes demais para uma única página, principalmente:
- questionários
- fotos
- listas de equipamentos

Para esses casos:
- questionários serão quebrados por itens de resposta, nunca no meio de uma resposta
- fotos serão agrupadas em grades menores que possam continuar na página seguinte
- listas de equipamentos serão divididas por item
- assinaturas e cabeçalho sempre ficam inteiros

### 5) Fidelidade visual ao HTML
Para manter o visual “igual ao da página”:
- vou reaproveitar os mesmos subcomponentes/markup sempre que possível
- manter a mesma tipografia, cores, badges, bordas e espaçamentos
- aplicar apenas ajustes específicos de A4, como:
  - padding fixo de página
  - largura fixa para impressão
  - remoção de comportamento responsivo móvel no PDF

Ou seja: não será um “print improvisado” da tela inteira, mas um layout dedicado com a mesma aparência.

### 6) Accordions não controlarão mais o PDF
No PDF:
- todo o conteúdo relevante será renderizado explicitamente
- o estado aberto/fechado dos accordions da tela não definirá o conteúdo exportado
- assim o PDF sempre sai completo, independentemente da UI estar expandida ou não

Isso simplifica muito e evita bugs.

### 7) Impressão separada e confiável
Também vou revisar a impressão:
- o modo imprimir deve abrir tudo automaticamente no DOM de impressão
- preservar cores do cabeçalho white label corretamente
- garantir que accordion fechado na tela não esconda conteúdo impresso

Mas PDF e impressão terão fluxos distintos.

## Arquivos que devem entrar no trabalho
Principalmente:
- `src/components/technician/OSReport.tsx`
- `src/components/technician/ReportHeader.tsx`
- `src/index.css`

Provavelmente também vou criar novos arquivos auxiliares, por exemplo:
- um renderer de páginas PDF do relatório
- utilitário de paginação
- componentes reaproveitáveis de seções do relatório

## Estrutura técnica sugerida
```text
OSReport.tsx
 ├─ Web report (visual atual)
 ├─ handlePrint()
 └─ handleDownloadPDF()
      ├─ monta dados normalizados
      ├─ gera páginas A4 em container oculto
      ├─ captura cada página separadamente
      ├─ adiciona 1 página por canvas no jsPDF
      └─ salva arquivo final
```

## Regras que vou seguir
- não capturar o relatório inteiro em uma imagem gigante
- não depender de `scrollHeight` para paginar
- não cortar conteúdo arbitrariamente
- não usar estado visual do accordion como fonte do PDF
- preservar white label no cabeçalho e barra de status
- priorizar previsibilidade em vez de “atalhos”

## Critérios de sucesso
Vou considerar concluído quando:
- o PDF não gerar páginas em branco
- o PDF tiver o mesmo visual base do HTML
- questionários longos quebrem corretamente entre páginas
- fotos e assinaturas não sejam cortadas
- o cabeçalho escuro mantenha texto legível
- o arquivo final tenha quantidade de páginas coerente
- imprimir e baixar PDF funcionem de forma consistente

## Detalhes técnicos
- `data-pdf-section` continuará útil, mas passará a representar blocos lógicos para paginação, não áreas para recorte bruto
- vou normalizar os grupos longos antes de paginar:
  - checklist por resposta
  - fotos por linhas
  - equipamentos por item
- a captura será feita por página A4 pronta, não pelo documento inteiro
- o `jsPDF` receberá uma imagem por página já no tamanho correto
- estilos de impressão em `index.css` serão simplificados para não sobrescrever cores do cabeçalho indevidamente

## Resultado esperado para você
Depois dessa refatoração, o botão “Baixar PDF” vai gerar um documento realmente profissional e estável:
- visual fiel ao relatório público
- formato A4 correto
- sem folhas em branco
- sem conteúdo sumindo
- sem depender de gambiarra de accordion/scroll para funcionar
