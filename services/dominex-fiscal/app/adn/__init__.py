"""Distribuição de NFS-e pelo ADN — Ambiente de Dados Nacional.

⚠️ ISTO NÃO É A SEFAZ, E NÃO É O SEFIN NACIONAL. São três governos diferentes
   dentro deste mesmo serviço, e confundi-los é o erro mais caro possível aqui:

     app/sefin/  → SEFIN Nacional. EMITE NFS-e (SOAP-ish, XML assinado). É o que
                   paga a conta. Nada neste pacote pode tocá-lo.
     app/sefaz/  → SEFAZ / Ambiente Nacional da NF-e. RECEBE NF-e destinada
                   (SOAP 1.2, cursor por NSU, rejeição 656 com 1h de bloqueio).
     app/adn/    → ESTE pacote. ADN. RECEBE NFS-e (REST/JSON, cursor por NSU,
                   sem manifestação do destinatário e sem 656).

O pacote é IRMÃO de `app/sefaz/`, não filho: o transporte é REST/JSON com mTLS,
o envelope é `LoteDistribuicaoNSUResponse` e o documento é o leiaute nacional da
NFS-e (`http://www.sped.fazenda.gov.br/nfse`), que não tem nada a ver com o
leiaute da NF-e. Só a DISCIPLINA é compartilhada — orçamento de tempo, resposta
parcial com cursor avançado, teto de descompressão, erro tipado em PT-BR.
"""
