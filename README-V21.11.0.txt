RADAR DE CLIENTES — V21.11.0
CRIADOR DE SITES COM IA INTEGRADO À PROSPECÇÃO

Esta versão parte da V21.10.0 e acrescenta a criação contextual de sites a partir de uma empresa selecionada nos resultados do Radar.

INSTALAÇÃO
Extraia o ZIP e envie o conteúdo da pasta Radar-V21.11.0 para a raiz do repositório GitHub conectado ao Render. Faça commit/push e acompanhe o deploy no Render. Não altere variáveis de ambiente.

FLUXO
1. Pesquise empresas no Radar.
2. No cartão da empresa desejada, clique em “Criar site com IA”.
3. Confira os dados preenchidos automaticamente.
4. Escolha uma das três propostas ou escreva seu próprio prompt.
5. Edite o texto livremente e clique em “Gerar meu site”.
6. Revise o resultado no editor antes de publicar.

DADOS
Somente dados disponíveis no resultado são preenchidos. Campos não encontrados permanecem vazios. Revise telefone, WhatsApp, Instagram e endereço antes de publicar.

TESTES RECOMENDADOS APÓS O DEPLOY
- Pesquisar uma pizzaria, uma barbearia e uma loja; verificar se cada cartão tem as três ações.
- Clicar em “Criar site com IA” e conferir o preenchimento dos dados.
- Confirmar que as três propostas mudam conforme a categoria.
- Selecionar cada proposta e verificar que o prompt completo aparece no campo editável.
- Apagar ou modificar o prompt e gerar um site para validar a liberdade de edição.
- Tentar abrir o criador sem selecionar empresa: o fluxo deve orientar a pesquisar/selecionar primeiro.
- Confirmar que “Confirmar e conversar” e “Criar projeto” continuam funcionando.
- Confirmar salvamento do projeto, abertura no editor e prévia.
- Verificar reservas, estoque, WhatsApp, OpenRouter, Supabase, Cloudflare e Mercado Pago sem alterar configurações.

IMPORTANTE
A geração usa a chave OpenRouter já configurada no servidor. Não coloque chaves no navegador. Esta versão não altera credenciais, banco, rotas de reserva ou integrações de pagamento.
