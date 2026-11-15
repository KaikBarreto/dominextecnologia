# Integração das referências auditadas do catálogo

Revisão: 15/11/2026. Responsável pela curadoria: equipe técnica Dominex.

O manifesto `src/data/equipmentCatalogAssets.json` contém somente referências públicas: identidade do modelo/marca, fonte, prova de abrangência, tipo, páginas, revisão e SHA-256. Não contém credenciais ou dados de clientes. `src/data/equipmentCatalogAssets.ts` complementa a leitura no hook canônico `useEquipmentCatalog`, sem mutações feitas por componentes.

## Primeira etapa desta entrega

Foram preparados 60 arquivos associados: 18 fotos, 40 novas associações documentais e duas correções LG comprovadas. Os arquivos foram hospedados no bucket público `equipment-catalog`, em caminhos imutáveis com prefixo `verified`, ID e hash. A aplicação local usa essas referências; nenhum registro existente do catálogo de produção foi alterado. A publicação do app permanece separada.

Arquivos existentes têm precedência. Uma correção só substitui na leitura a URL antiga explícita do manifesto; uma associação posterior diferente é preservada. Antes de preparar/aplicar as duas correções, o importador verifica também o hash real do documento antigo. Fotos de família mantêm identificação na lista, ampliação e download. Documentos distinguem manual do usuário, instalação, aplicação, catálogo, datasheet e ficha elétrica.

## Reproduzir e operar

O importador requer Python 3; extração de imagem PDF e reunião de páginas originais requerem PyMuPDF. Recebe `VITE_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` exclusivamente pelo ambiente do processo, usando o arquivo local de secrets aprovado. Nunca imprimir valores, passar a chave na linha de comando ou criar arquivos com segredo expandido.

```sh
python3 scripts/import-equipment-catalog-assets.py --models-manifest src/data/daikinCatalog.json
python3 scripts/import-equipment-catalog-assets.py --stage-only --models-manifest src/data/daikinCatalog.json
python3 scripts/test-equipment-catalog-assets.py
```

- Sem flag: compara identidades com os registros globais e produz dry-run.
- `--stage-only`: valida todos os arquivos antes das escritas e hospeda os ausentes, sem alterar registros. Foi o modo usado nesta entrega.
- `--apply`: atualização persistente opcional, somente em janela de publicação autorizada. Filtra ID, marca, código e campo nulo; as duas correções exigem URL/hash anteriores e usam comparação da URL na gravação. Reexecuções preservam o que já foi importado ou editado por outra sessão.
- `--cache`: arquivos locais públicos identificados por SHA-256, por padrão `.context/catalog-assets`. Falta de cache baixa a fonte e exige os mesmos bytes. Fontes alteradas exigem nova revisão, nunca atualização automática.

O importador só permite os campos `image_url`/`manual_url` de `equipment_models` e o tipo documental associado. Não consulta nem altera equipamentos de clientes ou tabelas multi-tenant. Upload não usa overwrite; conflito aceita somente o mesmo conteúdo. Uma falha durante `--apply` pode deixar importação parcial: revisar o estado e executar novo dry-run antes de continuar.

As páginas JPG originais CHUNGHOP são reunidas deterministicamente em PDF, com hashes de cada página preservados no manifesto. Isso não é um PDF fornecido pelo fabricante; a interface informa essa origem. A foto Copeland extraída de catálogo conserva os bytes da imagem incorporada, com página e xref documentados.

## Fontes e limites

- [Inventário, códigos e cobertura](catalogo-equipamentos-lacunas.md)
- [Documentos por modelo e pendências](catalogo-documentos-fontes.md)
- [Perfis SH/SC e métodos de carga](sh-sc-fontes.md)
- [Tabelas completas de saturação](refrigerantes-fontes.md)

KT-9018E: [manual original QUNDA](https://qunda.com/en/downloads/html/download/KT-9018E(C).pdf). K-1028E: [página original CHUNGHOP](https://en.chunghop.com/productDetail?id=236). O Q-988E não foi associado por conflito entre o fabricante no nome cadastrado e o documento encontrado. Nenhum manual foi escolhido apenas pela marca ou por código semelhante.


## Expansão Daikin

A [etapa Daikin](daikin-catalogo-integracao.md) acrescenta 3.584 vínculos em 129 arquivos únicos compartilhados, além dos 60 vínculos da primeira etapa. O manifesto completo inclui modelos ainda não persistidos; por isso, a preparação agora exige `--models-manifest src/data/daikinCatalog.json`, como nos comandos acima. O modo `--apply` continua recusando modelos ausentes da base, e nenhum registro foi criado em produção nesta entrega. A nova versão os materializa na leitura por curadoria documentada.
