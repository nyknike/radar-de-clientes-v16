RADAR DE CLIENTES — V21.8.0

Baseado na V21.7.1.

Principais mudanças:
- Persistência centralizada de dados auxiliares do navegador via clientData no estado JSONB do Supabase.
- Sincronização automática com debounce para chaves localStorage com prefixo radar.
- Restauração de dados auxiliares na inicialização e migração de chaves locais ausentes no servidor.
- Limite de 12 MB para o bloco clientData por gravação.

Deploy:
1. Faça backup/exportação do estado atual antes de substituir a versão no Render.
2. Preserve todas as variáveis de ambiente já configuradas.
3. Não execute comandos que apaguem ou recriem a tabela radar_state.
4. Faça deploy e confira /api/health: version deve retornar V21.8.0 e persistentStorage deve refletir a conexão real.
5. Teste criar/alterar um cliente, salvar um projeto, atualizar a página e abrir o Radar em outro navegador.
6. Teste a prévia /site/{id} no domínio Render e a URL publicada no Cloudflare Pages.

Esta versão não foi validada contra credenciais de produção. Execute os testes de aceitação após o deploy antes de migrar o uso diário.
