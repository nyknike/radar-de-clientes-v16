RADAR DE CLIENTES — V19.0.0

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
2. Extraia o ZIP e envie o CONTEÚDO da pasta radar-de-clientes-v19.0.0 para a raiz do repositório GitHub conectado ao Render. Não envie a pasta pai como uma segunda pasta dentro do repositório.
3. Inclua server.js, app.js, index.html, style.css, package.json, render.yaml, logo.png, supabase-setup.sql e README.txt.
4. Faça commit e push para a branch que o Render usa (geralmente main). O Render executará npm install e npm start.
5. Não remova nem substitua variáveis secretas já existentes no Render. Confirme CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID na seção Environment.
6. Após o deploy, abra /api/health e confira version=V19.0.0, persistentStorage=true e integrations.hosting=cloudflare.
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
