# DomiLink e EcoTray: reaproveitamento e revisão

O EcoTray do EcoSistema é a referência de drivers de balanças e impressão. O
DomiLink conserva o contrato local próprio: pareamento, origem permitida,
sessão, limites, fila e idempotência. Mudanças de um produto não substituem
automaticamente código do outro.

## Verificar mudanças

Com o repositório EcoSistemaSaaS disponível nesta máquina:

```sh
python3 scripts/domilink/check_ecotray.py
```

Para outro caminho, informe **a pasta ecotray**:

```sh
python3 scripts/domilink/check_ecotray.py --source /caminho/EcoSistemaSaaS/ecotray
```

Também aceita `ECOTRAY_SOURCE` e saída `--json`. O comando só lê código de uma
lista conhecida; não acessa `.env`, configuração real dos equipamentos, dados
de clientes ou credenciais. Novos arquivos de protocolos também são detectados.

Saídas: **0**, sem mudanças nos drivers; **1**, revisão pendente; **2**, não foi
possível comparar. Mudança em outra parte do EcoSistema não obriga nova cópia dos
drivers. A ausência do repositório nunca significa que a comparação passou.

## Quando um dos projetos mudar

1. Rode a comparação antes de alterar drivers do DomiLink e depois de atualizar
   o checkout local do EcoSistema. Ela identifica mudanças no EcoTray e nas
   adaptações do DomiLink separadamente.
2. Revise o diff da origem e o destino relacionado em
   `domilink-ecotray-sync.json`. Reaproveite correções pertinentes nos dois
   sentidos; registre as diferenças intencionais de plataforma e segurança.
3. Execute testes de protocolos, impressão, leitura, fila e API. Testes com
   dispositivos virtuais não homologam um modelo de equipamento físico.
4. Só depois da revisão e dos testes atualize a referência:

```sh
python3 scripts/domilink/check_ecotray.py --accept --reviewed "Resumo da adaptação e testes executados"
```

O registro contém revisão Git quando disponível e SHA-256 dos arquivos reais do
checkout, inclusive mudanças locais. Um avanço do commit sozinho não esconde
alterações de arquivos nem força reimportação de código sem mudanças.

Esse é um verificador executável local: ele **não monitora outro repositório em
segundo plano** e não publica correções sozinho. Para revisão futura por agentes,
a regra de rodar a comparação acompanha o domínio no `AGENTS.md`.

## Limites das adaptações

- Drivers e parsers podem ser compartilhados; pareamento e transporte HTTP do
  DomiLink permanecem próprios.
- Leitor USB/HID funciona como teclado no campo de busca, sem exigir DomiLink.
  Leitor serial tem leitura própria; câmera e QR Code usam o navegador.
- A descoberta de portas/filas é passiva e não deve enviar comandos a todas as
  portas nem selecionar automaticamente equipamento de outra operação.
- Não há licença declarada no código EcoTray consultado; a reutilização foi
  autorizada pelo responsável pelos dois projetos. Dependências externas seguem
  suas próprias licenças, especialmente o backend PDF opcional de Windows.
- Qualquer correção sugerida ao EcoSistema deve preservar suas mudanças locais e
  passar pelos testes daquele repositório. O verificador não o modifica.
