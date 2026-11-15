# PWA: origem canônica e recuperação do domínio legado

## Decisão

A única origem de instalação e geração de links do Dominex é
`https://www.dominex.app`. O endereço `https://dominex.app` existe apenas como
origem legada e deve redirecionar para `www`, exceto por `/sw.js`.

Essa exceção é obrigatória. Instalações antigas possuem um Service Worker
registrado em `dominex.app`; se a própria atualização de `/sw.js` responder com
redirect para outra origem, Safari/iOS pode bloquear a navegação com
`Response served by service worker has redirections`.

## Ordem segura de publicação

1. Publicar o Pages com `functions/sw.js/index.js` e as mudanças do frontend.
2. Na zona Cloudflare, desativar o Bulk Redirect antigo que captura todo o host.
3. Criar uma **Single Redirect** com:
   - expressão de entrada:
     `(http.host eq "dominex.app" and http.request.uri.path ne "/sw.js")`;
   - destino dinâmico:
     `concat("https://www.dominex.app", http.request.uri.path)`;
   - status `308`;
   - `Preserve query string` habilitado.
4. Manter `dominex.app` associado/proxyado ao mesmo Pages para que a exceção
   `/sw.js` alcance a Pages Function.
5. Não voltar a criar um redirect global que inclua `/sw.js`.

Single Redirect executa antes de Bulk Redirect. Por isso não basta acrescentar
uma exceção em outra regra enquanto o Bulk Redirect antigo continuar ativo: o
request de `/sw.js` ainda seria capturado depois.

## Verificação pós-deploy

Executar:

```bash
node scripts/verify-canonical-origin.mjs
```

O gate confirma:

- rota e query do domínio legado preservadas no redirect para `www`;
- `/sw.js` legado respondendo `200 application/javascript`, sem redirect;
- `/sw.js` canônico continuando a entregar o Workbox normal.

No Safari/iPhone, validar também uma instalação antiga de `dominex.app`: o
worker de resgate deve abrir brevemente “Atualizando seu acesso…”, remover
registro/cache antigos e continuar na mesma rota em `www.dominex.app`.
