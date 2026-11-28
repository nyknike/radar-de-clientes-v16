RADAR DE CLIENTES — V21.7.1

Deploy
1. Substitua os arquivos pelo conteúdo deste pacote no repositório conectado ao Render.
2. Preserve todas as variáveis de ambiente existentes.
3. Não altere SUPABASE_URL nem SUPABASE_SERVICE_ROLE_KEY sem diagnóstico.
4. Aguarde o deploy ficar Live.
5. Abra /api/health e confira storage.connected.
6. Teste uma prévia pública e a gravação de um rascunho.

Diagnóstico
- /api/health informa version, persistentStorage, storage.host, storage.failureCode e storage.failureHint.
- Logs do Render mostram host e código técnico da falha sem revelar credenciais.
- Não publique nem compartilhe SUPABASE_SERVICE_ROLE_KEY.

Importante
- Não execute novamente supabase-setup.sql apenas por causa de "fetch failed".
- Não exclua nem recrie radar_state.
- Se o health continuar com connected=false, use failureCode e failureHint para identificar DNS, rede, timeout, TLS ou URL inválida.
