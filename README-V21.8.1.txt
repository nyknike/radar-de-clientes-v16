RADAR V21.8.1 — CORREÇÃO DO BOTÃO DE PRÉVIA PÚBLICA

Esta versão mantém a base da V21.8.0 e corrige a visibilidade/acessibilidade do botão de prévia pública no editor.

O que mudou:
- Botão “Prévia pública” fica permanentemente visível na barra inferior do editor.
- O botão abre a aba final e aciona a geração/verificação da prévia pública.
- Botão da etapa final recebe destaque visual e área de toque maior.
- Botão de prévia da lista de projetos recebe maior área de toque e destaque.
- Ajustada a busca do projeto por ID para evitar falha por diferença entre número/texto.
- Cache CSS/JS atualizado para V21.8.1.

Importante:
- Esta atualização é limitada à interface e ao acionamento da prévia.
- Não corrige a indisponibilidade do Supabase nem garante a recuperação do projeto no armazenamento público.
- Não remove nem substitui integrações existentes.

Instalação:
1. Faça backup do projeto atual.
2. Substitua os arquivos pelo conteúdo deste pacote no repositório.
3. Preserve todas as variáveis de ambiente do Render.
4. Faça o deploy pelo fluxo habitual.
5. Depois do deploy, confirme V21.8.1 no cabeçalho e teste o botão no editor.
