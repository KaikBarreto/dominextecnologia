# Daikin residencial: modelos documentados

Revisão: 15/11/2026. Curadoria: equipe técnica Dominex. Pesquisa do catálogo brasileiro e dos manuais legados disponibilizados no portal da fabricante. Fontes originais de distribuidor são identificadas abaixo e no manifesto; não representam hospedagem oficial.

## Cobertura

O manifesto operacional `.context/daikin-residential-models.json` contém **145 códigos únicos**. Unidades internas e externas ficam separadas; não foram criadas combinações comerciais por multiplicação de capacidades.

| Linha | Códigos |
| --- | ---: |
| Advance P5 | 16 |
| Advance N5 legado | 4 |
| Exclusive | 8 |
| Hi-Wall R-32 32 mil | 2 |
| EcoSwing Smart Q | 16 |
| EcoSwing Smart Gold S | 16 |
| Full Inverter R-32 | 16 |
| Multi Split Advance | 25 |
| Multi Split Advance legado | 36 |
| Multi Split Lite Smart R-32 | 6 |

Os códigos do catálogo atual são preservados literalmente, assim como variantes antigas impressas nas capas. Por isso CTXS09PMVM, CTXS09PMVM5 e CTXS09PMVM7 não foram fundidos por suposição. O mesmo vale para CCXS PVM e PVM9. A integração pode agrupar visualmente a família, mas não deve inventar equivalência de placa.

Cada registro inclui fonte, PDF, SHA-256, páginas físicas, classe de capacidade quando expressa, ciclo, fluido e natureza da unidade. O código numérico do modelo não foi usado para inferir capacidade nas famílias cuja classe não está expressa na fonte.

## Fontes principais

- [Portal oficial Daikin Brasil](https://www.daikin.com.br/profissionais/downloads), produtos de downloads 1, 2, 3, 33, 42, 45, 5 e 39. O portal publica documentos também de linhas legadas; páginas comerciais antigas podem redirecionar à home.
- [Advance — folheto oficial](https://www.daikin.com.br/profissionais/download/force_download/5), tabelas nas páginas 5–6.
- [Exclusive — folheto oficial](https://www.daikin.com.br/profissionais/download/force_download/163), tabela na página 6.
- [Hi-Wall 32 mil R-32 — folheto oficial](https://www.daikin.com.br/profissionais/download/force_download/246), tabela na página 8.
- [EcoSwing Smart Q — folheto oficial](https://www.daikin.com.br/profissionais/download/force_download/1381), tabela na página 6.
- [EcoSwing Smart Gold S — folheto oficial](https://www.daikin.com.br/profissionais/download/force_download/1379), tabela na página 8.
- [Full Inverter — folheto oficial 2026](https://www.daikin.com.br/static/uploads/conteudos/produtos/260317025356000000.pdf), página 8: oito pares internos/externos, frio e quente/frio. A [operação 3P775937-1B](https://www.daikin.com.br/profissionais/download/force_download/1605) confirma oito unidades internas na capa raster.
- [Multi Split Advance — folheto oficial 2025](https://www.daikin.com.br/profissionais/download/force_download/1606), páginas 6–8: Hi-Wall, cassete 1 via, cassete 4 vias, dutadas e seis externas PMVM.
- [Multi Split Lite — folheto oficial 2026](https://www.daikin.com.br/profissionais/download/force_download/1608), página 8: 2MXC18RMVM/CTXC09–12RMVM e os novos 3MKC18S5VL/CTKC09–12S5VL. Não aplicar automaticamente o manual de operação 2MXC-R à linha só frio 3MKC.
- [Catálogo legado CBRV007A, Daikin, 60Hz — cópia do distribuidor Leveros](https://www.leverosintegra.com.br/download/manuais/Daikin/Catalogo-Comercial-Daikin-Multi-Split-Advance-Serie-FTK-FTX.pdf), páginas 6–7 e 12–17: nove externas MKS/MXS K/L com códigos completos e modelos internos, incluindo Emura branco/prateado.

Alguns links cujo título parece ficha de modelo entregam CAD/ZIP, e não PDF. Foram mantidos fora das associações documentais do manifesto; não basta renomear o arquivo para `.pdf`.

## Imagens

Há imagem original para os 145 registros: **132 fotos/imagens de produto ou contexto do fabricante** e **13 ilustrações técnicas explicitamente marcadas**. Todas são representativas de família; não se afirma foto de cada variante exata.

- As fotos web vieram das páginas de produto, thumbs do portal e loja oficial Daikin. As imagens de kit da loja mostram o conjunto e são identificadas como representação da família, sem afirmar a capacidade exata da foto.
- Imagens extraídas de PDF conservam os bytes do objeto incorporado; `imagePdfUrl`, `imagePdfPage` e `imagePdfXref` permitem rastreá-las.
- Emura S usa a imagem prateada da página 7 do catálogo antigo. Emura W usa a foto de contexto do painel branco na mesma página, identificada pelo fabricante. Não foi usada a imagem de uma geração atual de Emura.
- Para as nove externas MKS/MXS antigas, foi usada a ilustração técnica original da família com carenagem aberta, página 4. É marcada `imageKind: technical_illustration`.
- Para as quatro externas Exclusive RHS, somente o desenho original foi confirmado: [manual de instalação](https://www.daikin.com.br/profissionais/download/force_download/244), página 3. A imagem é renderização fiel de um recorte do desenho, sem redesenho ou conteúdo gerado. Metadados trazem página, retângulo e escala; deve ser apresentada como **desenho técnico original**, nunca como fotografia. O próprio manual informa que a aparência varia conforme o modelo.
- Selos R-32, logotipos e imagens de compressores isolados não foram associados como foto de equipamento.

## Códigos de falha

O manifesto possui 12 tabelas originais novas e sete referências existentes reaproveitáveis por código exato.

- Oito manuais de operação Multi: CCXS, CDXS/CDKS, Emura, CTXS PMVM5/7 e FTKS/FTXS KVM.
- Advance N5: [operação 3P362260-2C](https://www.daikin.com.br/profissionais/download/force_download/235), página impressa 28 / PDF29.
- Lite 2MXC-R: [operação](https://www.daikin.com.br/profissionais/download/force_download/1143), página impressa 17 / PDF18, conferida visualmente; 29 indicações, sem extensão à 3MKC.
- FFQ KVL: [SiBR121707B](https://www.daikin.com.br/profissionais/download/force_download/831), página impressa 118 / PDF17, tabela exclusiva SA/FFQ. **UA = configuração de campo**, sem herdar o significado de outras famílias. AF/CJ têm ressalva de inspeção, mesmo quando a operação continua.
- Externas PMVM: mesmo SiBR121707B, página impressa 119 / PDF18, para os cinco modelos explicitamente identificados 3MXS18/24PMVM, 4MXS28/34PMVM e 5MXS38PMVM. **UA = tensão não especificada**, diferente da tabela FFQ. U0/E5/E6 entre parênteses são exibidos somente com o sistema desligado. Não estender ao 2MXS18PMVM ou às séries antigas K/L sem fonte aplicável.

O manual CDXS e dois manuais FTKS/FTXS misturam espanhol/português em parte da tabela. Os rótulos espanhóis foram traduzidos sem acrescentar diagnóstico ou solução não publicada. Não há códigos falsos de botão, como `ON`, na extração final.

## Limites

Ainda há títulos de arquivos com classes 3MXS75/80/90/100 e 5MXS100 sem sufixo completo legível nos PDFs disponíveis. O catálogo antigo comprovou modelos K/L específicos; as demais classes não foram expandidas por presunção. Também não foram inferidas condensadoras RX a partir das internas Advance N5 FTX.

A lista é a cobertura documental encontrada, não prova de completude mundial, nem disponibilidade comercial de todos os códigos em 2026. Não inclui SkyAir, VRV ou Applied, pesquisados separadamente. Nenhuma meta numérica SH/SC ou equivalência de compressor foi criada a partir de código comercial.

## Validação

`.context/daikin-residential/validate.py` valida unicidade, tipos, existência de arquivos, SHA-256, páginas, cobertura de modelos e ausência de códigos duplicados nas tabelas. Dados e artefatos não contêm credenciais ou registros de clientes. Não houve alteração de banco, hooks, UI, commit ou push por esta pesquisa.
