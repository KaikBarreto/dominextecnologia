"""DF-e — notas destinadas na SEFAZ (NF-e recebida) e manifestação do destinatário.

IRMÃO de `app/sefin/`, NUNCA uma alteração dele. `app/sefin/` é o caminho que
EMITE NFS-e em produção; nada aqui importa de lá nem muda o comportamento de lá.

⚠️ PROPRIEDADE DE CUSTÓDIA — a mesma do resto do serviço, e o motivo de este
   módulo ter sido reescrito em vez de copiado do `ecosistema-dfe`:

     este serviço NÃO fala com a Supabase, NÃO tem credencial de banco,
     NÃO persiste nota e NÃO sabe o que é `company_id`.

   Ele recebe o certificado cifrado no CORPO da requisição, decifra em memória,
   conversa mTLS com a SEFAZ, DEVOLVE o resultado e esquece. O cursor de NSU e a
   trava anti-656 moram na tabela `dfe_sync_state` (lado Supabase), porque
   guardar estado aqui exigiria o service_role na box — e é exatamente isso que
   o desenho impede (comprometer a VPS sozinha não pode dar acervo).

   Se um dia parecer mais simples dar banco a este serviço: não é. É a garantia
   morrendo.

O que veio do `EcoSistemaSaaS/services/ecosistema-dfe` (em produção desde
17/09/2026) e o que foi reescrito está anotado no topo de cada arquivo.
"""
