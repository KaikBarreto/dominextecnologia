-- Corrige referencias regulatorias do guia de PMOC e links comerciais quebrados.
--
-- Contexto regulatorio (vigente em 2026-11-12):
-- - a RDC Anvisa 886/2024 revogou a RE 9/2003;
-- - a Anvisa passou a apontar a ABNT NBR 17037:2023 como referencia tecnica
--   para qualidade do ar interior;
-- - o marco de 5 TR / 60.000 BTU/h da Portaria GM/MS 3.523/1998 trata da
--   exigencia de responsavel tecnico habilitado, nao de uma dispensa geral do
--   PMOC previsto na Lei 13.589/2018.

UPDATE public.blog_posts
SET
  content = replace(
    content,
    '<blockquote>
<p>A Lei nº 13.589/2018 determina, em síntese, que todos os edifícios de uso público e coletivo que possuam ambientes de ar interior climatizado artificialmente devem dispor de um Plano de Manutenção, Operação e Controle (PMOC) dos respectivos sistemas, executado por responsável técnico habilitado. (Paráfrase do texto legal; consulte a íntegra publicada no Diário Oficial da União.) <a href="http://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13589.htm" target="_blank" rel="noopener" style="font-size:.8rem;color:#00C597;text-decoration:none;white-space:nowrap">Ver fonte ↗</a></p>
</blockquote>',
    '<blockquote>
<p>A Lei nº 13.589/2018 determina, em síntese, que edifícios de uso público e coletivo com ambientes climatizados artificialmente devem manter um PMOC dos respectivos sistemas. A habilitação profissional e a responsabilidade técnica devem observar a Portaria GM/MS nº 3.523/1998, as regras dos conselhos profissionais e as exigências locais aplicáveis. (Paráfrase; consulte a íntegra publicada no Diário Oficial da União.) <a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13589.htm" target="_blank" rel="noopener" style="font-size:.8rem;color:#00C597;text-decoration:none;white-space:nowrap">Ver fonte ↗</a></p>
</blockquote>'
  ),
  updated_at = now()
WHERE locale = 'pt-br'
  AND slug = 'como-funciona-o-pmoc';

UPDATE public.blog_posts
SET
  content = replace(
    content,
    '<p>Anterior à lei, a <strong>Portaria do Ministério da Saúde nº 3.523/1998</strong> foi a primeira norma a exigir o PMOC para sistemas de climatização com capacidade acima de determinado porte, estabelecendo medidas básicas de limpeza, manutenção e controle da qualidade do ar para prevenir riscos à saúde dos ocupantes. <a href="https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/prt3523_28_08_1998.html" target="_blank" rel="noopener" style="font-size:.8rem;color:#00C597;text-decoration:none;white-space:nowrap">Ver fonte ↗</a></p>',
    '<p>Anterior à lei, a <strong>Portaria do Ministério da Saúde nº 3.523/1998</strong> estabeleceu medidas básicas de limpeza, manutenção e controle da qualidade do ar para prevenir riscos à saúde dos ocupantes. Para sistemas acima de 5 TR (15.000 kcal/h ou 60.000 BTU/h), o art. 6º exige responsável técnico habilitado, PMOC disponível no imóvel e registro contínuo da execução. <a href="https://bvsms.saude.gov.br/bvs/saudelegis/gm/1998/prt3523_28_08_1998.html" target="_blank" rel="noopener" style="font-size:.8rem;color:#00C597;text-decoration:none;white-space:nowrap">Ver fonte ↗</a></p>

<p><strong>Atenção à diferença:</strong> 60.000 BTU/h é o marco expresso pela Portaria para a exigência de responsável técnico habilitado. Não deve ser usado como uma dispensa geral do PMOC, porque a Lei nº 13.589/2018 alcança os edifícios de uso público e coletivo com ambientes climatizados artificialmente. Regras profissionais, sanitárias e locais também precisam ser verificadas no caso concreto.</p>'
  ),
  updated_at = now()
WHERE locale = 'pt-br'
  AND slug = 'como-funciona-o-pmoc';

UPDATE public.blog_posts
SET
  content = replace(
    content,
    '<h3>Resolução ANVISA RE nº 9/2003</h3>

<p>A <strong>Resolução RE nº 9, de 16 de janeiro de 2003, da ANVISA</strong>, complementa o arcabouço definindo <strong>padrões referenciais de qualidade do ar interior</strong> em ambientes climatizados artificialmente de uso público e coletivo, como limites para contaminação microbiológica e recomendações de renovação de ar. É a referência técnica para os parâmetros que o PMOC deve monitorar. <a href="https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2003/res0009_16_01_2003.html" target="_blank" rel="noopener" style="font-size:.8rem;color:#00C597;text-decoration:none;white-space:nowrap">Ver fonte ↗</a></p>',
    '<h3>RDC ANVISA nº 886/2024 e ABNT NBR 17037:2023</h3>

<p>A <strong>Resolução RE nº 9/2003 foi revogada pela RDC ANVISA nº 886/2024</strong>. Para a avaliação da qualidade do ar interior em ambientes não residenciais climatizados artificialmente, a orientação atual da Anvisa aponta a <strong>ABNT NBR 17037:2023</strong> como referência técnica, sem afastar regulamentos específicos aplicáveis a ambientes como serviços de saúde e processos produtivos. Consulte a norma vigente e a vigilância sanitária local antes de fixar parâmetros ou frequências. <a href="https://bibliotecadigital.anvisa.gov.br/jspui/bitstream/anvisa/17752/1/Guia%20n%C2%BA%2073%2C%20de%2003%20de%20abril%20de%202025%20-%20vers%C3%A3o%202.pdf" target="_blank" rel="noopener" style="font-size:.8rem;color:#00C597;text-decoration:none;white-space:nowrap">Ver orientação atual da Anvisa ↗</a></p>'
  ),
  updated_at = now()
WHERE locale = 'pt-br'
  AND slug = 'como-funciona-o-pmoc';

UPDATE public.blog_posts
SET
  content = replace(
    replace(
      replace(
        replace(
          replace(
            content,
            '<tr><td>Análise da qualidade do ar interior (QAI)</td><td>Semestral / Anual</td><td>Verificar conformidade com a RE nº 9/2003</td></tr>',
            '<tr><td>Avaliação da qualidade do ar interior (QAI)</td><td>Conforme plano, risco e norma aplicável</td><td>Avaliar a QAI segundo a ABNT NBR 17037:2023 e regras específicas do ambiente</td></tr>'
          ),
          'em referência à RE nº 9/2003',
          'quando prevista pelo plano, segundo a ABNT NBR 17037:2023 e as regras específicas aplicáveis'
        ),
        'atua como referência normativa nacional (é dela a RE nº 9/2003, que define os padrões de qualidade do ar interior)',
        'coordena a referência sanitária nacional e orienta a aplicação da RDC nº 886/2024 e das normas técnicas vigentes sobre qualidade do ar interior'
      ),
      'com a ANVISA como referência normativa nacional (RE nº 9/2003)',
      'com a ANVISA como referência sanitária nacional e a ABNT NBR 17037:2023 como referência técnica atual para QAI'
    ),
    '<h3>O PMOC é realmente obrigatório?</h3>
<p>Sim. Para edifícios de uso público e coletivo com ambientes climatizados artificialmente, o PMOC é obrigatório por força da Lei nº 13.589/2018 e das normas complementares do Ministério da Saúde e da ANVISA.</p>',
    '<h3>O PMOC é realmente obrigatório?</h3>
<p>Sim. A Lei nº 13.589/2018 alcança edifícios de uso público e coletivo com ambientes climatizados artificialmente. Ambientes de uso restrito, como processos produtivos, laboratoriais e hospitalares, também devem observar seus regulamentos específicos.</p>

<h3>Abaixo de 60.000 BTU/h não precisa de PMOC?</h3>
<p>Não use esse limite como dispensa geral. A Lei nº 13.589/2018 trata da existência do PMOC em edifícios de uso público e coletivo climatizados. O marco acima de 5 TR (60.000 BTU/h) aparece no art. 6º da Portaria GM/MS nº 3.523/1998 para exigir responsável técnico habilitado. Verifique também as regras do conselho profissional, da vigilância sanitária e da localidade.</p>'
  ),
  updated_at = now()
WHERE locale = 'pt-br'
  AND slug = 'como-funciona-o-pmoc';

UPDATE public.blog_posts
SET
  content = replace(
    content,
    '<li><strong>Resolução RE nº 9, de 16 de janeiro de 2003</strong> (ANVISA), padrões referenciais de qualidade do ar interior em ambientes climatizados artificialmente de uso público e coletivo. <a href="https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2003/res0009_16_01_2003.html" target="_blank" rel="noopener">bvsms.saude.gov.br ↗</a></li>
  <li><strong>ANVISA</strong>, Agência Nacional de Vigilância Sanitária (referência normativa nacional sobre qualidade do ar interior). <a href="https://www.gov.br/anvisa/pt-br" target="_blank" rel="noopener">gov.br/anvisa ↗</a></li>',
    '<li><strong>RDC ANVISA nº 886, de 10 de julho de 2024</strong>, revoga a RE nº 9/2003 no processo de revisão e consolidação de atos normativos da Agência.</li>
  <li><strong>Guia Anvisa nº 73/2025, versão 2</strong>, orienta sobre o controle da qualidade do ar em ambientes climatizados e registra a ABNT NBR 17037:2023 como referência técnica atual. <a href="https://bibliotecadigital.anvisa.gov.br/jspui/bitstream/anvisa/17752/1/Guia%20n%C2%BA%2073%2C%20de%2003%20de%20abril%20de%202025%20-%20vers%C3%A3o%202.pdf" target="_blank" rel="noopener">bibliotecadigital.anvisa.gov.br ↗</a></li>'
  ),
  meta_description = 'Entenda como funciona o PMOC, quem é obrigado, o que muda acima de 60.000 BTU/h, a base legal vigente, responsabilidades e como organizar a execução.',
  excerpt = 'Entenda como funciona o PMOC, quem é obrigado, o que muda acima de 60.000 BTU/h, a base legal vigente, responsabilidades e como organizar a execução.',
  updated_at = now()
WHERE locale = 'pt-br'
  AND slug = 'como-funciona-o-pmoc';

UPDATE public.blog_posts
SET
  content = replace(
    replace(
      content,
      'Comece o teste grátis de 14 dias, sem cartão',
      'Comece o teste grátis de 7 dias, sem cartão'
    ),
    '<p style="color:#9ca3af;font-size:.85rem">Conteúdo produzido pela equipe Dominex. O software Dominex é desenvolvido pela Auctus Tecnologia.</p>',
    '<p style="color:#9ca3af;font-size:.85rem">Conteúdo produzido pela equipe Dominex. Revisado em 12 de novembro de 2026 com base nas fontes oficiais citadas; requisitos profissionais e locais devem ser confirmados no caso concreto.</p>'
  ),
  updated_at = now()
WHERE locale = 'pt-br'
  AND slug = 'como-funciona-o-pmoc';

-- As CTAs antigas apontavam para /planos, rota que nao existe. Direcionamos
-- para a home publica localizada, onde os CTAs de contato estao ativos, e
-- removemos rotulos que prometiam uma pagina de planos inexistente.
UPDATE public.blog_posts
SET
  content = replace(
    replace(
      replace(
        replace(
          replace(
            replace(
              content,
              'href="/planos"', 'href="/"'
            ),
            'href="/en/planos"', 'href="/en"'
          ),
          'href="/es/planos"', 'href="/es"'
        ),
        '>Conhecer os planos<', '>Conhecer a Dominex<'
      ),
      '>Explore plans<', '>Explore Dominex<'
    ),
    '>View plans<', '>Explore Dominex<'
  ),
  updated_at = now()
WHERE content LIKE '%/planos%';

UPDATE public.blog_posts
SET
  content = replace(
    replace(
      replace(
        replace(
          content,
          '>Conocer los planes<', '>Conocer Dominex<'
        ),
        '>Ver planes<', '>Conocer Dominex<'
      ),
      '>Ver planos<', '>Conhecer a Dominex<'
    ),
    'href="/orcamentos-e-contratos"', 'href="/sistema-de-orcamentos"'
  ),
  updated_at = now()
WHERE (
    content LIKE '%Conocer los planes%'
    OR content LIKE '%Ver planes%'
    OR content LIKE '%Ver planos%'
    OR content LIKE '%/orcamentos-e-contratos%'
  );

UPDATE public.blog_posts
SET
  content = replace(
    replace(
      replace(
        replace(
          replace(
            content,
            'href="/en/orcamentos-e-contratos"', 'href="/en/quote-management-software"'
          ),
          'href="/es/orcamentos-e-contratos"', 'href="/es/software-de-presupuestos"'
        ),
        'href="/emissao-de-nfse"', 'href="/emissao-de-nota-fiscal"'
      ),
      'href="/en/emissao-de-nfse"', 'href="/en/service-invoice-software"'
    ),
    'href="/es/emissao-de-nfse"', 'href="/es/software-facturacion-servicios"'
  ),
  updated_at = now()
WHERE (
    content LIKE '%/orcamentos-e-contratos%'
    OR content LIKE '%/emissao-de-nfse%'
  );

-- Falha a migration inteira se o artigo-base nao existir, algum trecho antigo
-- sobreviver ou algum link quebrado continuar armazenado. Isso evita marcar a
-- migration como aplicada depois de um replace silenciosamente ineficaz.
DO $$
DECLARE
  pmoc_content text;
BEGIN
  SELECT content
    INTO pmoc_content
    FROM public.blog_posts
   WHERE locale = 'pt-br'
     AND slug = 'como-funciona-o-pmoc';

  IF pmoc_content IS NULL THEN
    RAISE EXCEPTION 'Artigo como-funciona-o-pmoc nao encontrado para revisao regulatoria';
  END IF;

  IF pmoc_content LIKE '%<h3>Resolução ANVISA RE nº 9/2003</h3>%'
     OR pmoc_content LIKE '%Verificar conformidade com a RE nº 9/2003%'
     OR pmoc_content NOT LIKE '%RDC ANVISA nº 886/2024%'
     OR pmoc_content NOT LIKE '%ABNT NBR 17037:2023%'
     OR pmoc_content NOT LIKE '%Abaixo de 60.000 BTU/h não precisa de PMOC?%'
  THEN
    RAISE EXCEPTION 'Revisao regulatoria do artigo de PMOC ficou incompleta';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.blog_posts
     WHERE content LIKE '%href="/planos"%'
        OR content LIKE '%href="/en/planos"%'
        OR content LIKE '%href="/es/planos"%'
        OR content LIKE '%href="/orcamentos-e-contratos"%'
        OR content LIKE '%href="/en/orcamentos-e-contratos"%'
        OR content LIKE '%href="/es/orcamentos-e-contratos"%'
        OR content LIKE '%href="/emissao-de-nfse"%'
        OR content LIKE '%href="/en/emissao-de-nfse"%'
        OR content LIKE '%href="/es/emissao-de-nfse"%'
  ) THEN
    RAISE EXCEPTION 'Links comerciais antigos permaneceram em blog_posts';
  END IF;
END
$$;
