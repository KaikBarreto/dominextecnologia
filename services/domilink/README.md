# DomiLink

DomiLink é a ponte **local** da Dominex entre o PDV web e impressoras, balanças e
leitores. Esta primeira entrega prioriza um contrato seguro e drivers genéricos. Ela
não contém emissão fiscal, NFC-e, SAT, certificado ou qualquer reaproveitamento de
protocolo fiscal em `localhost`.

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

```bash
cd services/domilink
python3 -m venv .venv
. .venv/bin/activate              # Windows: .venv\Scripts\activate
python -m pip install -e '.[dev]'
cp config.example.toml config.toml
domilink --config config.toml
```

O terminal mostra o código de pareamento. Para gerar outro, reinicie o processo. O
exemplo traz somente hardware virtual e permite validar todo o fluxo sem periféricos.

Extras opcionais:

```bash
python -m pip install -e '.[serial]'
python -m pip install -e '.[escpos]'
python -m pip install -e '.[all]'
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
| PDF no Windows | associação de impressão do sistema | Implementado como baseline; validar aplicativo/driver |
| Térmica ESC/POS 58/80 | rede 9100, USB e serial via `python-escpos` | Opcional; depende de perfil e teste físico |
| Balança serial | linhas ASCII configuráveis, peso em `kg`/`g`, comando de leitura/tara | Opcional; protocolo deve ser homologado |
| Leitor USB/HID | dispositivo atua como teclado no campo focado do PDV | Sem driver DomiLink; comportamento recomendado |
| Leitor serial | uma leitura por linha via `pyserial` | Opcional; depende da configuração física |
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

Os testes não abrem porta, não acessam hardware e não imprimem documentos. Para uma
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
  descoberta automática e atualização/empacotamento ficam para uma etapa posterior.
