RADAR DE CLIENTES — V16.0.0

Esta versão preserva a interface existente (Radar, Designer, ADM, Meus Sites, pipeline comercial e prévia) e corrige a infraestrutura dos links públicos. O backend Express precisa ser publicado como Web Service Node, não como Static Site.

O QUE MUDA NA V16.0.0
- Configuração de Render Blueprint como Web Service Node, com npm install / npm start e health check em /api/health.
- O backend registra e resolve os sites em /api/public-sites/:id e /api/site/:id, e entrega a mesma página pública /site/:id que o Radar usa para abrir/enviar a demonstração.
- Supabase é verificado de verdade; não basta apenas preencher variáveis de ambiente.
- Em produção, salvar/publicar falha com mensagem explícita se o banco não estiver configurado ou acessível. O backend não finge que arquivo local efêmero é persistência durável.
- A chave SUPABASE_SERVICE_ROLE_KEY fica somente no servidor.
- /data bloqueado para evitar servir acidentalmente arquivos locais de estado.

CONFIGURAÇÃO OBRIGATÓRIA — SUPABASE
1. Crie um projeto no Supabase (o plano gratuito serve para começar).
2. Abra SQL Editor e execute o arquivo supabase-setup.sql incluído neste ZIP.
3. Em Project Settings / API, copie a Project URL e a chave service_role/secret. Não compartilhe a chave e não a coloque no app.js.
4. No serviço Web do Render, crie as variáveis:
   - NODE_ENV = production
   - SUPABASE_URL = URL do projeto Supabase
   - SUPABASE_SERVICE_ROLE_KEY = chave secreta do Supabase
5. Faça deploy e abra /api/health. A resposta precisa mostrar storage.connected=true e persistentStorage=true. Se não mostrar, não envie links a clientes ainda.

CONFIGURAÇÃO NO RENDER
- Crie um serviço do tipo Web Service a partir do repositório que contém estes arquivos, ou use Blueprint com este render.yaml.
- Runtime: Node; Build Command: npm install; Start Command: npm start; Health Check Path: /api/health.
- O render.yaml usa o nome radar-de-clientes-web para evitar substituir automaticamente o serviço antigo.
- NÃO publique estes arquivos como Static Site: arquivos estáticos não executam server.js nem as rotas /api.
- Só depois de o serviço novo passar no teste de saúde, use o domínio do serviço Web como endereço principal. O serviço Static Site antigo não é alterado por este ZIP.

TESTE APÓS DEPLOY
1. Abra https://SEU-SERVICO.onrender.com/api/health. Confirme version=V16.0.0, storage.connected=true e persistentStorage=true.
2. Abra a página principal e confirme V16.0.0 no cabeçalho.
3. Crie ou abra um site, clique em “Salvar e publicar” ou “Enviar demonstração”. O Radar só deve copiar/enviar o link depois de o backend confirmar o registro.
4. Abra o link copiado em janela anônima ou outro dispositivo. Ele deve abrir o site, sem exigir localStorage ou login do painel.
5. Reinicie/republique o serviço e repita o teste. O site deve continuar disponível porque o estado está no Supabase.

IMPORTANTE SOBRE DADOS ANTIGOS
O armazenamento do navegador (localStorage) é separado por domínio. Como esta versão deve ser publicada primeiro em um novo serviço Web, os projetos guardados no domínio antigo não migram automaticamente para o novo domínio. Antes de trocar o endereço usado, abra o Radar antigo no dispositivo em que os projetos foram criados e mantenha-o acessível. Para migrar cada projeto: (1) no Radar antigo, use “Link do ADM” e copie a URL completa; (2) substitua somente o domínio antigo pelo domínio do novo Web Service, preservando toda a parte `?adm=...`; (3) abra a URL resultante no novo serviço, confira o projeto e salve/publique. Repita para cada site. O pipeline comercial não é migrado automaticamente e deverá ser refeito se precisar dele. Não apague nem remova o serviço antigo até confirmar a migração.

LIMITES CONHECIDOS
- O banco guarda o estado do Radar em uma linha JSONB, adequada para começar com uso individual/baixo volume; não é um banco multiusuário transacional para muitos editores simultâneos.
- Este ZIP prepara o código e a configuração, mas não cria a conta Supabase, não adiciona segredos ao Render e não publica por conta própria. Esses passos exigem acesso/ação na conta do proprietário.
- Pagamento, publicação Cloudflare e domínio continuam exigindo configuração própria; não são necessários para testar o link público.
