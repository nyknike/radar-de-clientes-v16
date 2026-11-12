RADAR V21.9.2

CORREÇÃO DO ERRO DO RENDER
O log do Render mostrou ERR_MODULE_NOT_FOUND para /opt/render/project/src/lib/site-builder.js.
Esta versão inclui o arquivo em lib/site-builder.js na raiz correta do projeto.

IMPORTANTE AO ENVIAR AO GITHUB:
Extraia o ZIP e envie o CONTEÚDO da pasta Radar-V21.9.2 para a raiz do repositório configurado no Render. A pasta lib deve ficar diretamente ao lado de server.js:
  server.js
  lib/site-builder.js
  package.json
  config/integrations.js
  ...
Não envie uma pasta externa contendo outra pasta Radar-V21.9.2.

Não remova variáveis de ambiente nem substitua credenciais. O pacote não executa deploy automaticamente.
