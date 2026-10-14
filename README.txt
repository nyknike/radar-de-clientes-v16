RADAR DE CLIENTES — V20.2.0

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
2. Extraia o ZIP e envie o CONTEÚDO da pasta radar-de-clientes-v20.2.0 para a raiz do repositório GitHub conectado ao Render. Não envie a pasta pai como uma segunda pasta dentro do repositório.
3. Inclua server.js, app.js, index.html, style.css, package.json, render.yaml, logo.png, supabase-setup.sql e README.txt.
4. Faça commit e push para a branch que o Render usa (geralmente main). O Render executará npm install e npm start.
5. Não remova nem substitua variáveis secretas já existentes no Render. Confirme CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID na seção Environment.
6. Após o deploy, abra /api/health e confira version=V20.2.0, persistentStorage=true e integrations.hosting=cloudflare.
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


V20.2.0 — AJUSTES DE EDITOR E VALIDAÇÃO
- Versão sincronizada no selo, título, API /api/health, status público e log do servidor.
- Formato de imagem aplicado também às imagens dos cards de produtos/cardápio.
- Tipografia herdada de forma consistente nos componentes do site.
- Envio de imagem atualiza o editor e mostra orientação para salvar.

TESTES ANTES DE CONSIDERAR PRONTO
1. Confirmar /api/health retorna version=V20.2.0.
2. Criar projeto de teste, mudar fonte, tamanho de título/texto e formato das imagens.
3. Enviar imagem própria, salvar, reabrir e confirmar persistência.
4. Criar cardápio completo e testar adicionar/remover itens, quantidades, total e link WhatsApp.
5. Testar no celular e computador.
6. Publicar na Cloudflare com credenciais reais e abrir a URL pública.

Atenção: estes ajustes não comprovam por si só a publicação real na Cloudflare. O fluxo de pedidos usa WhatsApp e não processa pagamentos. A rota de publicação ainda precisa de autenticação administrativa antes de uso comercial.
