RADAR DE CLIENTES — V21.5.2
Pacote: correção de compatibilidade do módulo de integrações
Repositório/serviço de destino: radar-de-clientes-v16
URL de produção conhecida: https://radar-de-clientes-v16.onrender.com

OBJETIVO DESTA VERSÃO
Ampliar a edição visual do Radar Studio e corrigir a aplicação das mudanças geradas pela IA. A rota /api/ai/site-edit agora aceita propriedades reais de estilo global: backgroundColor (fundo da página), textColor, surfaceColor, headingSize, bodySize, density, dark, btn e imageShape, além dos campos anteriores. A interface envia esses campos ao servidor e aplica os resultados na prévia. As mudanças compatíveis também são sincronizadas com a proposta de design selecionada para evitar que o estilo volte ao anterior ao normalizar/salvar o projeto.

A aba Design mantém a personalização direta existente no estilo de um editor visual: cores, fonte, tamanhos dos títulos/textos, formato de imagens, composição/hero, densidade, botões e tema. A IA não publica automaticamente. Esta versão não contém chaves reais.

IMPORTANTE
A resposta da IA ainda depende do modelo configurado no Render. A mudança desta versão corrige o contrato entre o editor e o endpoint, mas deve ser validada no ambiente publicado. O modelo não foi trocado nesta versão.

SISTEMAS E VARIÁVEIS
1. Supabase — armazenamento persistente
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   Necessário em produção. Execute supabase-setup.sql no SQL Editor do projeto Supabase antes de usar os recursos que dependem das tabelas.

2. OpenRouter — IA
   OPENROUTER_API_KEY
   OPENROUTER_MODEL (opcional; padrão openrouter/free; pode ser alterado no Render conforme os modelos disponíveis na sua conta)
   Há endpoint de teste. A chave estar configurada não significa que todas as ações do editor já utilizam IA automaticamente.

3. Cloudflare Pages — publicação de sites
   CLOUDFLARE_API_TOKEN
   CLOUDFLARE_ACCOUNT_ID
   CLOUDFLARE_PAGES_PROJECT (opcional; padrão radar-clientes-sites)
   Token e Account ID são dados diferentes. O teste verifica autenticação da conta; a publicação real exige um teste de publicação separado.

4. Mercado Pago — checkout
   MP_ACCESS_TOKEN
   PUBLIC_BASE_URL (opcional, recomendado: https://radar-de-clientes-v16.onrender.com)
   O código cria preferências de checkout. O webhook atual apenas recebe/registra eventos; ainda falta validar assinatura e atualizar pagamentos de forma confiável. Não usar como fluxo de pagamento automático em produção.

5. Administração
   ADMIN_PANEL_SECRET
   Segredo exclusivo usado para proteger o endpoint de testes e endpoints administrativos. Gere um valor forte e não reutilize tokens de outras APIs.

CONFIGURAÇÃO NO RENDER
1. Abra https://dashboard.render.com/ e selecione o serviço existente radar-de-clientes-v16.
2. Abra Environment.
3. Compare as variáveis cadastradas com o arquivo .env.example e adicione somente as que estiverem faltando. Não apague nem substitua valores atuais que já funcionam.
4. Configure as chaves secretas diretamente no Render; nunca no frontend, no ZIP, no GitHub ou no chat.
5. Salve as alterações e aguarde o deploy.
6. O render.yaml serve como referência/Blueprint; não crie um serviço duplicado nem troque o serviço existente sem verificar o destino.

ARQUIVO .env.example
É apenas um modelo organizado por sistema. Não cole nele valores reais. O arquivo .gitignore exclui arquivos .env e mantém apenas .env.example versionável.

ENDPOINTS DE VERIFICAÇÃO
- GET /api/health — versão e estado geral de armazenamento/integrations.
- GET /api/integrations/status — informa apenas se cada variável está configurada; nunca devolve os segredos.
- POST /api/integrations/test — testa conexões reais, exige Authorization: Bearer <ADMIN_PANEL_SECRET>.
  JSON de exemplo: {"providers":["supabase","cloudflare"]}
  Valores permitidos: supabase, openrouter, cloudflare, mercadopago.
  Envie apenas os provedores que deseja testar. O teste OpenRouter faz uma chamada curta e pode consumir limite/crédito conforme sua conta.

TESTES LOCAIS EXECUTADOS NESTE PACOTE
- node --check server.js
- node --check app.js
- node --check admin.js
- node --check config/integrations.js
- node --test (2 testes unitários passaram)
- integridade do ZIP conferida.
Esses testes verificam sintaxe, estado seguro das configurações e validação de provedor desconhecido. Não substituem testes com credenciais reais no Render.

LIMITAÇÕES IMPORTANTES AINDA ABERTAS
- Não foi possível verificar credenciais privadas nem executar publicação real a partir deste ambiente. Os testes reais precisam ser executados após deploy.
- A rota /api/publish/cloudflare existente precisa de revisão de autorização antes de uso comercial. Não exponha o painel publicamente.
- Mercado Pago: webhook sem validação completa de assinatura nem atualização confiável de estado do pagamento.
- OpenRouter: teste de conexão e edição assistida do site no Radar Studio via aba “IA Studio” (V21.3.0). A edição gera sugestões e não publica automaticamente; valide resultados no editor.
- Conexão automática de domínio personalizado não está implementada.
- Os formulários públicos de reserva/pedido e o armazenamento dependem da configuração/migração Supabase correspondente; valide com dados fictícios antes de usar dados reais.

ATUALIZAÇÃO DO GITHUB
1. Faça backup do estado atual do repositório.
2. Extraia o ZIP e envie o conteúdo dos arquivos para a raiz de https://github.com/nyknike/radar-de-clientes-v16 (não envie uma pasta pai dentro do repositório).
3. Faça commit na branch que o Render já utiliza.
4. Aguarde o deploy e confirme que /api/health mostra V21.5.2.
5. Não afirme que produção está validada até testar Supabase, OpenRouter, Cloudflare e Mercado Pago conforme o uso pretendido.


V21.3.0 — ALTERAÇÕES
- Adicionada aba IA Studio ao editor de sites.
- Novo endpoint POST /api/ai/site-edit; chave mantida exclusivamente no servidor.
- Resposta da IA validada por lista permitida de campos; sem HTML/JavaScript arbitrário.
- Limite de solicitações por IP, timeout e mensagens de erro sem expor a chave.
- A IA propõe alterações; o usuário revisa e salva/publica manualmente.
- Preservadas as integrações existentes e as demais funções do projeto.


V21.3.0 — CORREÇÃO
- server.js tenta carregar config/integrations.js e, se o arquivo não existir, usa integrations.js na raiz.
- Incluído integrations.js na raiz como compatibilidade para uploads feitos sem a pasta config/.
- Mantida também a cópia config/integrations.js.
- Não foram incluídas chaves secretas.


V21.3.0 — CORREÇÃO DE IDENTIFICAÇÃO
- Corrigido o número da versão mostrado na interface principal, no cache dos arquivos estáticos e nos endpoints de saúde/status.
- Mantidas as funcionalidades da IA Studio e a correção de compatibilidade do módulo config/integrations.js.


V21.3.0 — CORREÇÕES DE FLUXO
- IA Studio tenta modelo configurado e fallback openrouter/free, interpreta JSON cercado por markdown e mostra erros mais específicos.
- Profissional recebe carrinho para negócios de alimentação, com quantidade, itens e envio pelo WhatsApp.
- Regerar versão troca o conjunto de imagens por imagens do banco relevante ao tipo de negócio. Não gera imagens novas por IA; usa o banco de imagens disponível no projeto.
- Reservas ativadas como módulo padrão para lanchonetes, sem confirmar disponibilidade automaticamente.


HISTÓRICO V21.4.0 (base desta versão)
- Corrigido o envio de propriedades de estilo global à rota de IA.
- Prompt distingue cor principal, fundo da página e fundo de cartões.
- IA pode propor tamanho de títulos/textos, tema, densidade e formatos.
- Interface aplica e sincroniza os campos de design editados com a proposta selecionada.
- Mensagem de estado informa quantas propriedades foram recebidas para aplicação.
- Integrações existentes preservadas; nenhuma chave secreta incluída.


VERSÃO 21.5.1 — EDITOR MANUAL
- Nova aba Editor manual com ajuste direto de textos, alinhamento, tamanhos e deslocamento do título/descrição.
- Controles de enquadramento da imagem principal, upload múltiplo para galeria e reordenação de imagens/seções.
- Chat IA preservado como assistente opcional; integrações Supabase, OpenRouter, Cloudflare Pages e Mercado Pago mantidas.
- Esta versão é um pacote de código: não foi implantada automaticamente no Render.


VERSÃO 21.5.1 — EDIÇÃO DIRETA NA PRÉVIA
- Tocar/clicar no título e na descrição permite editar o texto diretamente no site de prévia.
- Arrastar o título ou a descrição ajusta sua posição.
- Barra contextual permite trocar a imagem principal ou adicionar imagem à galeria.
- Mantidas as integrações e o fluxo existente de salvar/publicar.
- Não publicado automaticamente no Render.


VERSÃO 21.5.2 — RADAR STUDIO / CONTROLES DIRETOS
- Adiciona controles contextuais de cor, tamanho e alinhamento para o título/descrição selecionados na prévia.
- Mantém as alterações no objeto do projeto para salvar no rascunho e gerar o site a partir dos dados editados.
- Mantém as integrações existentes; nenhuma chave nova é exigida para esses controles locais.
- Troca de imagem continua usando upload local. Geração de imagem por IA ainda depende de uma integração/modelo de imagem compatível e não é declarada como concluída nesta versão.
- Não implanta automaticamente no Render.


V21.6.0 — SEGURANÇA DO PAINEL E DADOS
- Configure ADMIN_PANEL_SECRET no Render (Environment) com um segredo forte e exclusivo.
- O painel solicita esse segredo ao acessar dados/ações administrativas; ele fica apenas em sessionStorage da aba/sessão atual, não no link nem em localStorage.
- Não compartilhe ADMIN_PANEL_SECRET com clientes. Clientes recebem apenas o link público do site.
- Rotas de estado, gravação de sites, edição/geração por IA, publicação Cloudflare e conexão de domínio exigem autenticação administrativa.
- GET /api/demo/:id também exige autenticação; respostas públicas de site/evento foram reduzidas para não devolver telefones ou outros dados comerciais da venda.
- O painel continua usando um segredo administrativo único. Isso não equivale a contas separadas por cliente/projeto; não entregue acesso ao painel a clientes.
- A aprovação pública da demonstração ainda é um aceite informal via link; não use como assinatura contratual nem confirmação de pagamento.
