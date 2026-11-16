# DomiLink®

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../../src/assets/domilink/domilink-logo-reverse.svg">
  <img src="../../src/assets/domilink/domilink-logo.svg" alt="DomiLink" width="230">
</picture>


DomiLink é a ponte **local** da Dominex entre o PDV web e impressoras, balanças e
leitores. O serviço preserva o contrato seguro e adapta os drivers de impressão e protocolos ASCII do EcoTray. Ela
não contém emissão fiscal, NFC-e, SAT, certificado ou qualquer reaproveitamento de
protocolo fiscal em `localhost`.

## Identidade visual

O símbolo aprovado é o **01 Encaixe**, em uma cor, sem o detalhe quadrado verde.
O nome da marca inclui ®. O kit contém versões horizontal, vertical, só símbolo e
só texto, em SVG e PNG transparente, organizado por cor em
`public/brand/domilink/`. No app, abra `/brand/domilink/` para baixar o pacote.

## Limites de segurança

- O processo faz bind fixo em `127.0.0.1`. A configuração e a própria API rejeitam
  ampliação para a rede.
- O primeiro acesso exige um código de seis dígitos, exibido no terminal local, com
  validade curta, uso único e cinco tentativas.
- O pareamento entrega um token aleatório, armazenado apenas como hash em memória,
  com validade máxima de uma hora e rotação/revogação explícitas.
- Origins são allowlist exata, sem `*`; o preflight aceita apenas os métodos e headers
  do contrato.
- Corpo e taxa de requisições são limitados. Impressão exige `Idempotency-Key` e o
  replay com conteúdo diferente é recusado.
- Logs registram evento, dispositivo, job e resultado. Tokens, códigos, documentos,
  Base64 e caminhos são removidos.
- Configuração local não deve ser versionada. O exemplo usa somente dados fictícios.

Esses controles reduzem a superfície local, mas não transformam DomiLink em serviço
de rede. Não exponha a porta por proxy, túnel, firewall, Docker publish ou bind amplo.

## Execução local de desenvolvimento

Requer Python 3.9 ou mais recente.

A instalação desta etapa é manual a partir do repositório. Não há download público,
instalador compilado, GitHub Actions ou atualização automática sendo preparado nesta entrega.

```bash
cd services/domilink
python3 -m venv .venv
. .venv/bin/activate              # Windows: .venv\Scripts\activate
python -m pip install -e '.[all]'
domilink --init --origin https://app.example.invalid --config config.toml
domilink --config config.toml --check-config
domilink --config config.toml
```

Troque a origem fictícia pela origem exata do aplicativo (protocolo e domínio,
sem caminho). `--init` cria somente impressora, balança e leitor virtuais, com
permissão 0600 onde suportada pelo sistema; recusa sobrescrever configuração existente. Para
usar hardware, adapte os perfis de `config.example.toml`, selecione a porta/fila
correta e execute novamente `--check-config`.

O diagnóstico valida o arquivo e as dependências sem iniciar servidor, abrir
portas seriais, imprimir ou enviar comandos. `requirements_ready` significa
somente pré-requisitos instalados; `hardware_tested` permanece `false`.
Um arquivo inválido interrompe o início com orientação, sem traceback nativo.

O terminal mostra o código de pareamento. Em um terminal interativo, digite
`parear` e pressione Enter para gerar outro sem reiniciar nem perder os trabalhos
em andamento. Sem terminal interativo, reinicie o processo. O exemplo traz somente
hardware virtual e permite validar o fluxo sem periféricos.

Extras opcionais:

```bash
python -m pip install -e '.[serial]'
python -m pip install -e '.[escpos]'
python -m pip install -e '.[all]'
# Windows GDI/PDF, após revisar as licenças das dependências:
python -m pip install -e '.[windows-print]'
```

Não há instalação de daemon nesta entrega. Para produção, o empacotamento futuro deve
gerar aplicativo assinado com bandeja/menu, atualização assinada, armazenamento seguro
da configuração e ação visual para renovar o pareamento. PyInstaller/Nuitka podem ser
avaliados por sistema operacional depois dos testes de drivers e assinatura de código.

## Contrato HTTP v1

Todas as rotas, exceto `/health` e `/v1/pair`, exigem `Authorization: Bearer ...`.
Clientes browser enviam uma Origin da allowlist. Clientes nativos sem Origin continuam
limitados ao loopback e ao token.

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/health` | Saúde mínima, sem enumerar hardware |
| POST | `/v1/pair` | Troca código local por sessão curta |
| POST/DELETE | `/v1/session/rotate`, `/v1/session` | Rotação e revogação |
| GET | `/v1/version`, `/v1/capabilities`, `/v1/devices` | Versão e descoberta; cada dispositivo informa formatos/ações aceitos |
| POST/GET | `/v1/print/jobs`, `/v1/print/jobs/{id}` | Enfileirar/consultar impressão |
| GET/POST | `/v1/scales/{id}/read`, `/v1/scales/{id}/tare` | Peso e tara |
| GET | `/v1/scales/{id}/stream` | Leituras SSE, 100–5000 ms |
| GET | `/v1/barcodes/{id}/read` | Leitura serial/virtual |

Para impressão, o conteúdo é Base64 e o formato é `pdf`, `text` ou `escpos`. PDF passa
pelo spooler do sistema; texto/bytes ESC/POS passam pelo driver opcional. O cliente deve
criar uma `Idempotency-Key` nova por intenção de impressão e repetir a mesma chave em
retries do mesmo documento. O `202` significa apenas “enfileirado”: o cliente consulta
`/v1/print/jobs/{id}` enquanto o estado for `queued`/`printing` e só confirma sucesso em
`completed`; `failed` traz apenas um `error_code` seguro. O formato deve vir de
`devices[].capabilities.print_formats`: `system-pdf` aceita PDF e ESC/POS aceita
`text`/`escpos`.

Leituras de balança retornam `weight_kg`, `stable` e `unit: "kg"`. O stream revalida a
sessão em cada leitura e termina com evento `session-ended` quando ela expira ou é
revogada. Operações de spooler/serial e sondagem rodam fora do event loop. Corpos sem
`Content-Length` também são interrompidos por chunks assim que ultrapassam o limite.

## Compatibilidade honesta

| Categoria | Primeira entrega | Estado |
| --- | --- | --- |
| PDF no macOS/Linux | spooler `lp`, fila padrão ou nome configurado | Implementado; validar fila/driver local |
| PDF no Windows | GDI com raster cinza 288 DPI, fila/cópias e largura EcoTray | Extra `windows-print`; validar driver e licença PyMuPDF |
| Térmica ESC/POS 58/80 | rede 9100, USB e serial via `python-escpos` | Opcional; depende de perfil e teste físico |
| Balança serial | UPX EA-32 tipos 0–3, Toledo ASCII, Filizola ASCII, generic e line legado | Perfis offline testados; sem homologação física |
| Leitor USB/HID | dispositivo atua como teclado no campo focado do PDV | Sem driver DomiLink; comportamento recomendado |
| Leitor serial | frames CR/LF/ETX, fragmentação e múltiplas leituras via `pyserial` | Opcional; depende da configuração física |
| Câmera/QR | responsabilidade do app web/PWA via câmera do dispositivo | Fora do utilitário local |
| Virtual | impressora, balança e leitor sem hardware | Completo para integração/teste |
| Fiscal/NFC-e/SAT | nenhuma função | Explicitamente fora do escopo |

"Genérico" não significa compatibilidade universal. USB pode exigir VID/PID, permissão
do SO e backend nativo; balanças frequentemente usam comandos proprietários. Modelos
só devem entrar na lista homologada depois de teste físico de leitura, tara, reconexão,
acentuação, corte, largura e falha de papel/rede.

## Perfis e dispositivos

Cada `[[devices]]` escolhe um `kind` e um `adapter`:

- `printer`: `virtual`, `system-pdf`, `escpos-network`, `escpos-usb`, `escpos-serial`;
- `scale`: `virtual`, `serial-scale`;
- `barcode`: `virtual`, `serial-barcode`.

O leitor HID não aparece no endpoint porque o sistema operacional o entrega como
teclado. No PDV, mantenha o campo de captura focado, aceite sufixo Enter/Tab configurado
no leitor e não bloqueie digitação manual. A câmera também pertence ao app e deve pedir
permissão somente quando o usuário abrir a leitura.

## Verificação

```bash
cd services/domilink
pytest
ruff check .
mypy src
```

Os testes não acessam hardware e não imprimem documentos. O teste PTY abre somente
uma porta serial virtual do SO; rede e USB usam socket/backend simulados. Para uma
homologação física futura, use uma bancada separada e registre fabricante, modelo,
firmware, conexão, driver do SO, perfil, página de código e resultados de timeout/
reconexão.

## Operação e impacto

- **Local/repositório:** todo o código desta entrega está em `services/domilink`; o
  processo roda somente quando iniciado manualmente.
- **VPS/Supabase:** sem alteração, deploy, migration, webhook ou porta.
- **Downtime:** nenhum no produto atual. Reiniciar DomiLink derruba sessões e gera novo
  pareamento; jobs em memória não sobrevivem ao reinício.
- **Backup:** não há banco local a copiar. Preserve apenas a configuração local sem
  segredos; documentos temporários do spooler são removidos após o envio.
- **Limites conhecidos:** fila e jobs ainda são em memória; streaming SSE é por processo;
  descoberta ativa e atualização/empacotamento ficam para uma etapa posterior.

## Drivers reaproveitados do EcoTray

A origem e a comparação entre repositórios estão em
[sincronização EcoTray](../../docs/integrations/domilink-ecotray.md).
[Proveniência local](ECOTRAY_PROVENANCE.md) descreve as adaptações e licenças.
Nenhum arquivo de configuração, segredo, WebSocket aberto ou funcionalidade fiscal
foi copiado. O HTTP continua restrito a loopback, Origin permitida e token pareado.

Para descobrir portas e filas sem abrir a conexão nem imprimir:

```bash
domilink --list-ports
domilink --list-printers
```

Esses comandos mostram informações locais somente no terminal do operador, sem
iniciar o servidor. `scale_candidate` é uma heurística de descrição do EcoTray,
não uma identificação garantida. A escolha de porta e baudrate é explícita no TOML;
valores frequentes: 9600, 4800, 19200, 2400 e 38400. A descoberta não envia ENQ,
não varre baudrates e não grava em dispositivos desconhecidos.

O perfil `upx` preserva STX e terminador e solicita peso com ENQ a cada 280 ms.
`auto` escolhe somente o parser e não envia comandos. `line` mantém o contrato
antigo (inteiro sem unidade significa kg). Em `generic` e em Filizola sem unidade,
inteiros significam gramas, inclusive abaixo de 1000; unidade explícita prevalece.
Os perfis adaptados confirmam `stable: true` somente quando há `ST` explícito;
sem indicador de estabilidade retornam `false`. Não há suporte a BCD Filizola.
Tara só é anunciada quando existe `tare_command` configurado conforme o manual.

O leitor serial exige CR, LF ou ETX e preserva scans recebidos em lote. Não retorna
código parcial/truncado em timeout nem aceita controle interno; GS1 com separador
ASCII de grupo requer um perfil específico futuro. Leitores USB/HID que atuam como
teclado continuam independentes do DomiLink.

No Windows, `system-pdf` usa o mesmo caminho raster/GDI do EcoTray e respeita fila,
cópias, largura imprimível e offsets do driver. Drivers `Generic / Text Only` são
recusados antes de rasterizar. São aceitas até 100 páginas, até 40 milhões de pixels
por página; o deadline é verificado entre páginas, sem interromper chamadas nativas
GDI já em curso. Em macOS/Linux, CUPS continua recebendo PDF diretamente, com
remoção do temporário também em falha/timeout. Confirmação do spooler significa
que ele aceitou o documento, não confirmação de papel impresso.

Jobs ativos nunca são descartados por retenção. Após terminar, job e chave de
idempotência ficam por pelo menos 3600 segundos; atingir `job_retention` devolve
HTTP 503 `print_queue_full`, com `Retry-After: 30`, sem criar outro trabalho.
Replay da mesma chave continua aceito com fila cheia. Após expiração da retenção
ou reinício do processo, a chave deixa de garantir deduplicação; não repetir
impressões antigas automaticamente. A janela é local ao processo.

O status do job só pode ser consultado pelo pareamento que o criou; rotação de
token preserva esse escopo. Um novo pareamento não herda jobs da sessão anterior.
USB ESC/POS usa timeout finito em milissegundos e precisa do extra `escpos`
(inclui PyUSB) mais backend nativo libusb/driver permitido pelo SO. Serial ESC/POS
limita também a escrita; o deadline é conferido entre cópias e não cancela uma
chamada nativa que já está em curso. Falhas nativas viram erros seguros sem
mensagem do driver. Sondagem verifica somente equipamentos configurados,
sem enviar conteúdo ou imprimir.

## Uso no app depois de conectar

Em Configurações → Integrações → DomiLink, o operador escolhe o destino dos
comprovantes: abrir PDF (padrão) ou uma impressora configurada que aceite PDF.
A preferência pertence ao usuário e à empresa neste computador. Orçamentos,
pedidos e retiradas enviam o mesmo PDF canônico, com formato e vias da etapa.
Térmicas usam uma fila do sistema via `system-pdf`; bytes ESC/POS continuam
disponíveis para integrações específicas e não recebem um PDF incompatível.

Falha ou resposta incerta não repete uma impressão real automaticamente: abre
o PDF e orienta conferir a fila antes de outra via. Confirmação do spooler não
comprova papel impresso. Documentos e Base64 não entram em logs.

Com leitor serial configurado, **Ler código** preenche a busca; incluir o produto
continua uma ação do operador. Leitor USB/HID mantém a captura de teclado nativa,
sem um segundo listener. No item em kg ou g, **Usar peso** lê uma balança escolhida
e só preenche quantidade positiva/estável, convertendo a unidade e respeitando
o disponível na venda. Compras não limitam a entrada ao saldo que já existia.
Trocar atendimento/caixa/empresa, abrir finalização ou fechar a tela descarta
respostas pendentes; nenhuma leitura confirma venda ou compra automaticamente.

O atalho **Equipamentos deste computador** abre o mesmo pareamento dentro do
atendimento, sem sair do carrinho. Operadores autorizados apenas ao caixa,
orçamentos, pedidos ou retirada podem configurar sua conexão local quando o
módulo estiver ativo; isso não libera configurações gerais da empresa. Mudar
usuário/empresa limpa códigos digitados e descarta respostas do contexto anterior.
