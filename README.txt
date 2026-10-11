RADAR DE CLIENTES — V18.0.0

OBJETIVO DESTA VERSÃO
A V18 prioriza a etapa 1: estabilização do criador de sites antes da integração comercial completa.

MELHORIAS V18.0.0
- A etapa final do criador permite registrar o projeto no servidor e exibir uma prévia pública real em um quadro dentro do assistente.
- A prévia pública só é exibida depois que o servidor confirma o registro do site.
- A revisão automática apresenta verificações de conteúdo e recomendações para corrigir campos ausentes e revisar dados sugeridos.
- “Salvar cliente e começar outro” salva o site, mantém o projeto em Projetos de sites salvos e retorna o fluxo comercial ao início.
- A área de projetos salvos fica no fim da página e oferece acesso à edição, prévia, revisão, domínio/hospedagem e publicação.
- A versão preserva as funções existentes de prospecção, designer, ADM, banco Supabase, links públicos e projetos salvos.

LIMITAÇÕES IMPORTANTES
- A revisão é uma análise preliminar dos dados; não garante que todo link, formulário, imagem ou comportamento esteja correto em todos os dispositivos.
- A prévia pública depende do servidor e do armazenamento persistente estarem funcionando.
- A integração de domínio apenas registra/verifica a solicitação quando configurada; não compra domínio nem configura DNS automaticamente sem credenciais e provedor compatível.
- Pagamentos e provisionamento automático de hospedagem não fazem parte desta etapa de estabilização.
- Render/Supabase e serviços externos podem impor limites do plano gratuito. Confirme os limites antes de vender serviços com disponibilidade garantida.

DEPLOY
1. Envie o conteúdo do ZIP para o repositório GitHub conectado ao Render.
2. Preserve as variáveis de ambiente já configuradas no Render, incluindo SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
3. Aguarde o deploy e confira /api/health; persistentStorage deve indicar true.
4. Teste criar projeto, editar, salvar, abrir prévia pública, revisar e conferir se o projeto continua listado após recarregar.

Não substitua variáveis secretas por valores no navegador ou no repositório.
