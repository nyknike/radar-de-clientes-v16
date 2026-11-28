RADAR V21.9.3

Esta versão parte do ZIP V21.9.2 fornecido pelo usuário e corrige o erro de inicialização no Render.

CORREÇÃO
O server.js importava lib/site-builder.js durante a inicialização, mas o normalizador importado não era utilizado. O Render encerrava o processo quando o arquivo não estava presente no caminho esperado. A importação obrigatória foi removida; a rota de criação de sites já possui sua própria validação e normalização no server.js.

COMO APLICAR
Extraia o ZIP e envie o CONTEÚDO da pasta Radar-V21.9.3 para a raiz do repositório GitHub conectado ao Render, substituindo os arquivos existentes.
Não envie uma pasta externa contendo outra pasta Radar-V21.9.3.
Não remova nem altere variáveis de ambiente ou credenciais do Render.
Após o commit, acompanhe o deploy no Render e confirme /api/health com versão V21.9.3.

IMPORTANTE
O ZIP não executa deploy automaticamente. A correção local foi validada; o funcionamento no Render só poderá ser confirmado após o deploy.
