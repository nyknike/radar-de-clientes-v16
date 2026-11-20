RADAR DE CLIENTES — V21.13.0
CARDÁPIO AVANÇADO E PEDIDOS

BASE
Esta versão evolui a V21.12.0 e preserva as correções técnicas aproveitáveis do pacote preliminar V21.13.0. Não substitua variáveis de ambiente, tabelas ou credenciais existentes.

O QUE MUDOU
1. O cliente adiciona itens ao carrinho e envia os dados para o servidor Radar. O endpoint de pedidos aceita páginas hospedadas em outro domínio por CORS público restrito à rota de intake.
2. O servidor confere se o estabelecimento e os produtos existem no cardápio publicado.
3. Preços são calculados a partir do cadastro do estabelecimento no servidor, nunca do preço enviado pelo navegador.
4. Produtos inativos, sem preço confirmado ou com estoque insuficiente são recusados.
5. Se o controle de estoque estiver ativado, o saldo é reduzido conforme a quantidade registrada no pedido.
6. O pedido e a baixa de estoque são gravados juntos no armazenamento persistente.
7. Depois da gravação, o cliente recebe um código e pode continuar a conversa no WhatsApp.
8. O painel administrativo exibe o código, itens, total, modalidade de recebimento e endereço.
9. A geração de sites mantém a confirmação explícita de salvamento e a proteção administrativa do teste de IA.

COMO ATUALIZAR
- Faça backup do repositório e confirme que os dados persistentes estão íntegros.
- Atualize os arquivos do projeto com o conteúdo desta versão, mantendo as variáveis de ambiente já configuradas no Render.
- Não apague nem recrie o registro persistente radar_state no Supabase.
- Não publique sem antes revisar a versão e autorizar o deploy.

TESTE APÓS DEPLOY AUTORIZADO
- Verifique /api/health e confirme persistentStorage=true.
- Crie/abra um site de restaurante ou pizzaria com WhatsApp cadastrado.
- Cadastre um produto com preço e estoque controlado; publique/salve o projeto.
- Faça um pedido com quantidade disponível e confirme código, total e registro na caixa de pedidos.
- Confira que o estoque foi reduzido no projeto.
- Tente pedir mais unidades do que o estoque disponível e confirme que o servidor recusa.
- Desative um produto e confirme que o servidor recusa novos pedidos dele.
- Confira a modalidade entrega/retirada, endereço, contato e observações no painel.
- Atualize o estado do pedido no painel e confira a persistência após recarregar.
- Teste os fluxos anteriores: editor, imagens, prévia pública, reservas, integrações e publicação.

SEGURANÇA E LIMITES
- Preços e disponibilidade são validados no servidor.
- O registro do pedido não significa pagamento confirmado nem pedido aceito/preparado.
- O bloqueio de concorrência de estoque é local à instância do processo. Em ambiente com múltiplas instâncias, a próxima evolução deve mover validação/baixa para uma transação atômica no Supabase.
- Nenhuma integração externa foi desconectada ou reconfigurada.
- Esta entrega não foi implantada no Render. Testes locais não comprovam o funcionamento de produção.
