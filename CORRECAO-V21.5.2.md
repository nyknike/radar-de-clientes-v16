# Correção V21.5.2 — Radar Studio

## Objetivo
Corrigir o comportamento da edição direta na prévia sem alterar chaves ou integrações existentes.

## Referências visuais que devem orientar a evolução
- Hamburgueria: hero grande com fotografia de produto, tipografia de alto contraste, paleta preto/amarelo ou preto/laranja, cards de produtos e rodapé organizado.
- Barbearia: visual preto/dourado, hierarquia editorial, hero forte e agendamento em destaque.
- Editor: priorizar a prévia e as ferramentas contextuais; evitar exigir que o usuário navegue por um painel extenso para ajustes simples.

## Correção aplicada
- O primeiro toque seleciona o título ou a descrição; o arrasto começa somente após o elemento estar selecionado, evitando que um toque comum seja interpretado como movimento.
- Reduzido o limiar de movimento acidental para exigir um arrasto mais claro.
- Mantidos os controles existentes de cor, tamanho, alinhamento, substituição de imagem, salvamento de rascunho e publicação.

## Limitações conhecidas
- A edição direta mapeia o título e a descrição do hero aos campos persistidos do projeto; ainda não é um editor universal de qualquer bloco.
- Trocar imagem permite selecionar um arquivo local. Geração de imagem nova por IA requer um endpoint/modelo de geração de imagens realmente compatível; não deve ser simulada por um botão.
- O ZIP não foi publicado no Render. Testes de sintaxe e os testes automatizados existentes passaram; ainda é necessário validar a interação visual em navegador e celular.
