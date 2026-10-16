RADAR DE CLIENTES — V20.4.3

BASE PRESERVADA
Esta versão parte da V18.0.0 e preserva o painel de prospecção, designer, projetos salvos, prévia pública, revisão automática, estado no Supabase e fluxo comercial.

NOVA INTEGRAÇÃO: CLOUDFLARE PAGES
- A rota /api/publish/cloudflare deixou de ser um placeholder 501 e tenta publicar sites estáticos no Cloudflare Pages via Wrangler.
- O HTML autônomo do site é salvo junto ao registro público e publicado em /site/ID/ no projeto Pages compartilhado.
- A cada publicação, o pacote inclui todos os sites que já tenham HTML salvo no banco; assim, os sites publicados anteriormente não são removidos quando um novo site é publicado.
- O token Cloudflare fica exclusivamente nas variáveis de ambiente do servidor, nunca no navegador ou no repositório.
- Projeto Pages padrão: radar-clientes-sites. Pode ser alterado pela variável CLOUDFLARE_PAGES_PROJECT (somente letras minúsculas, números e hífens após normalização).

VARIÁVEIS NO RENDER
Obrigatórias para publicação Cloudflare:
- CLOUDFLARE_API_TOKEN — token com Account / Cloudflare Pages / Edit.
- CLOUDFLARE_ACCOUNT_ID — Account ID, não Zone ID.
Opcionais:
- CLOUDFLARE_PAGES_PROJECT — nome do projeto Pages (padrão radar-clientes-sites).
Manter também SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, além de NODE_ENV=production.

COMO SUBIR AO GITHUB/RENDER
1. Faça backup do repositório atual antes de substituir arquivos.
2. Extraia o ZIP e envie o CONTEÚDO da pasta radar-de-clientes-v20.4.3 para a raiz do repositório GitHub conectado ao Render. Não envie a pasta pai como uma segunda pasta dentro do repositório.
3. Inclua server.js, app.js, index.html, style.css, package.json, render.yaml, logo.png, supabase-setup.sql e README.txt.
4. Faça commit e push para a branch que o Render usa (geralmente main). O Render executará npm install e npm start.
5. Não remova nem substitua variáveis secretas já existentes no Render. Confirme CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID na seção Environment.
6. Após o deploy, abra /api/health e confira version=V20.4.3, persistentStorage=true e integrations.hosting=cloudflare.
7. Publique um site de teste. O primeiro deploy cria o projeto Pages se ainda não existir. A URL deverá ser https://radar-clientes-sites.pages.dev/site/ID/ (ou o nome configurado).

IMPORTANTE SOBRE GITHUB
O conector GitHub desta sessão não mostrou nenhum repositório acessível para fazer push direto. Por isso, este ZIP está preparado para você enviar ao repositório existente; não afirmo que o código já foi enviado ao GitHub ou publicado no Render.

LIMITES E SEGURANÇA
- O deploy foi implementado, mas precisa ser testado com as credenciais reais da conta Cloudflare; a criação/publicação não foi executada a partir deste ambiente.
- Para evitar um bundle excessivo, o servidor limita o HTML de cada site a 4 MB e o conjunto a 20 MB por publicação.
- O servidor publica os sites já registrados com HTML. Sites antigos da V18 precisam ser salvos/publicados novamente para gerar esse HTML.
- A rota de publicação está exposta no backend existente sem login de administrador; antes de vender/publicar comercialmente, adicione autenticação de administrador ou um segredo de publicação. Não compartilhe a URL do painel publicamente.
- Cloudflare Pages hospeda o HTML estático; o painel e os dados do Radar continuam no Render/Supabase.
- Pagamentos automáticos e conexão automática de domínio personalizado ainda não estão implementados nesta versão.


V20.4.3 — AJUSTES DE EDITOR E VALIDAÇÃO
- Versão sincronizada no selo, título, API /api/health, status público e log do servidor.
- Formato de imagem aplicado também às imagens dos cards de produtos/cardápio.
- Tipografia herdada de forma consistente nos componentes do site.
- Envio de imagem atualiza o editor e mostra orientação para salvar.

TESTES ANTES DE CONSIDERAR PRONTO
1. Confirmar /api/health retorna version=V20.4.3.
2. Criar projeto de teste, mudar fonte, tamanho de título/texto e formato das imagens.
3. Enviar imagem própria, salvar, reabrir e confirmar persistência.
4. Criar cardápio completo e testar adicionar/remover itens, quantidades, total e link WhatsApp.
5. Testar no celular e computador.
6. Publicar na Cloudflare com credenciais reais e abrir a URL pública.

Atenção: estes ajustes não comprovam por si só a publicação real na Cloudflare. O fluxo de pedidos usa WhatsApp e não processa pagamentos. A rota de publicação ainda precisa de autenticação administrativa antes de uso comercial.


V20.4.3 — base inicial de reservas/pedidos e caixa de entrada administrativa
- Estado persistente agora inclui reservations e orders (Supabase JSON state).
- Rotas públicas de entrada: POST /api/intake/reservations e POST /api/intake/orders.
- Rotas privadas: GET /api/admin/inbox?siteId=ID, PATCH /api/admin/reservations/ID, PATCH /api/admin/orders/ID.
- Para habilitar endpoints privados, configure ADMIN_PANEL_SECRET nas variáveis de ambiente do Render. Envie-o apenas no cabeçalho Authorization: Bearer; nunca coloque o segredo no HTML público ou no link compartilhado.
- As rotas de intake só aceitam siteId já registrado no armazenamento de sites publicados. As reservas ficam pendentes; não há confirmação automática nem bloqueio real de agenda nesta versão.
- IMPORTANTE: esta é uma base de backend, ainda não um painel visual completo. Os formulários públicos atuais ainda precisam ser ligados a estas rotas; a caixa de entrada visual, autenticação individual por estabelecimento e notificações automáticas são etapas posteriores.
- Teste de sintaxe realizado; publicação real no Render/Cloudflare não foi verificada nesta etapa.


V20.4.3 — PAINEL VISUAL DE RESERVAS E PEDIDOS

Novidades desta etapa:
- Nova página /admin.html para o administrador consultar reservas e pedidos por ID do estabelecimento.
- Ações para atualizar o estado de reservas (pendente, confirmada, recusada, cancelada) e pedidos (recebido, aceito, em preparação, pronto, concluído, cancelado).
- Exibição de contato, data, horário, observações, itens e total do pedido.
- Atalho para abrir WhatsApp com mensagem inicial preparada.
- Proteção adicional no servidor: uma alteração só é aceita quando o siteId enviado corresponde ao registro alterado.

CONFIGURAÇÃO E LIMITAÇÕES IMPORTANTES
1. Configure ADMIN_PANEL_SECRET nas variáveis de ambiente do Render. Nunca coloque esse segredo no código ou em um site público.
2. Acesse /admin.html, informe o ID exato do site e o segredo. O ID deve corresponder a um site existente em publishedSites no armazenamento do Radar.
3. Esta tela é uma etapa inicial de administração e usa um segredo compartilhado, não contas individuais. Antes de uso comercial, implementar autenticação por cliente, recuperação de acesso, limites por função e proteção adicional contra tentativas de acesso.
4. A caixa de entrada mostra registros que já tenham sido recebidos pelas rotas /api/intake/reservations e /api/intake/orders. Os formulários dos sites públicos ainda precisam ser conectados e testados para garantir que gerem esses registros.
5. O atalho de WhatsApp apenas abre uma conversa; não envia mensagens automaticamente. Confirme manualmente a disponibilidade antes de confirmar reservas.
6. Não foi confirmado deploy no Render nem teste ponta a ponta em produção. Depois de publicar, confira /api/health e teste com dados fictícios antes de usar dados de clientes.


V20.4.3 — correção visual do agendamento/reservas
- Removido o formulário de agendamento inline que poluía a página.
- Adicionado botão dedicado no cabeçalho do site público, abrindo uma tela própria de formulário.
- Formulário responsivo com nome, contato, e-mail opcional, data, horário, serviço/profissional ou quantidade de pessoas, aniversário opcional, observações e consentimento.
- A solicitação é enviada para o endpoint do Radar no Render e fica pendente; a interface deixa explícito que ainda não está confirmada.
- A função aparece apenas nos projetos com módulo de agendamento/reservas ativado.
- Importante: esta versão ainda precisa ser publicada e testada com um site público real. Confirme que o domínio de produção do Radar permanece radar-de-clientes-v16.onrender.com antes de usar; o endereço do endpoint está configurado no código gerado.


V20.4.3 — CORREÇÃO DO AGENDAMENTO PÚBLICO
- Botão de agendamento/reserva exibido em sites públicos quando o módulo está ativado, inclusive em sites do nível essencial.
- O botão abre uma página dedicada via ?agendamento=1, com formulário em tela própria e link para voltar ao site.
- A rota pública do Radar renderiza essa página separadamente e envia solicitações para /api/intake/reservations.
- Testes realizados: sintaxe JavaScript. Não foi possível confirmar o deploy em produção nem o fluxo real com Supabase/Cloudflare.


V20.4.3 — CORREÇÃO REAL DA EXIBIÇÃO DO BOTÃO DE AGENDAMENTO
- Exibe botão de reserva em restaurantes, pizzarias e lanchonetes; agendamento em barbearias, salões, pet shops, academias, clínicas, hotéis e oficinas, mesmo se o módulo não estiver explicitamente gravado no projeto antigo.
- O botão aparece na navegação pública e, quando não existe navegação, em uma faixa dedicada; adiciona uma chamada visual após o hero quando aplicável.
- O botão abre a página separada /site/ID?agendamento=1.
- Verificações feitas localmente: sintaxe JavaScript e servidor. Ainda é necessário publicar no Render e testar a URL real do cliente.
