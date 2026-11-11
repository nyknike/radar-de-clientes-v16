RADAR V21.9.0 — FUNDAÇÃO DO RADAR AI WEBSITE BUILDER

Novidades:
- Nova área Criador de Sites com IA no painel principal.
- Geração de projetos completos por descrição, usando OpenRouter no servidor.
- Formulário para nome, categoria, estilo visual e dados de contato opcionais.
- Resposta da IA validada como dados estruturados; não executa HTML/JavaScript gerado.
- Projetos gerados entram no fluxo de plataformas existente e abrem no Radar Studio.
- Imagens de banco existentes são aplicadas inicialmente; o editor mantém a geração de imagens Cloudflare Workers AI.
- Projetos continuam sendo salvos pelo mecanismo atual no Supabase.
- Nenhuma chave nova exigida; usa OPENROUTER_API_KEY já configurada.

Segurança e limites:
- Rota de geração protegida pela sessão administrativa existente.
- Limite local de 3 gerações por minuto por IP.
- Nome, descrição e contatos são limitados e sanitizados.
- A IA não deve inventar preços, contatos, avaliações ou fatos do negócio.
- A chave OpenRouter permanece exclusivamente no servidor.

Preservação:
- Mantidas as rotas e integrações existentes de Supabase, OpenRouter, Cloudflare e Mercado Pago.
- Não houve acesso ou alteração no Render, Supabase remoto ou Cloudflare remoto.

Validação feita no pacote:
- Verificação de sintaxe JavaScript.
- Testes automatizados existentes.
- Integridade do ZIP.

Limitação:
- A chamada real ao OpenRouter, geração de imagens Workers AI, sincronização real com Supabase e publicação Cloudflare precisam ser testadas após deploy no ambiente do usuário.
