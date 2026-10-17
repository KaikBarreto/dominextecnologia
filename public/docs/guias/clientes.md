# Encontrar ou criar cliente

`POST /customers/resolve` faz consulta exata e não altera cadastro.

## Ordem de resolução

1. `external_id` da integração.
2. CPF ou CNPJ normalizado.
3. Telefone em E.164.
4. E-mail normalizado.

Não há busca aproximada por nome. Nenhum resultado retorna `404`. Mais de um resultado retorna `409 ambiguous_customer` e exige revisão humana.

Se o cliente não existir, envie `customer.name` e ao menos `phone`, `document`, `email` ou `external_id` dentro de `POST /service-orders`.

## Prompt para agente de código

```text
Implemente a resolução exata de clientes Dominex. Priorize external_id
persistido pela integração; use documento, telefone E.164 ou e-mail somente
como alternativas. Nunca faça fuzzy matching por nome. Trate 404 como não
encontrado e 409 ambiguous_customer como revisão humana. Nunca atualize um
cliente existente durante a criação da OS. Mascare dados pessoais em logs e
teste duplicidade, inexistência e retry.
```
