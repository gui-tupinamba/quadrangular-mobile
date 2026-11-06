# Consumo mobile — solicitação de exclusão de conta

Este documento registra a integração do aplicativo móvel com o contrato recebido em [`account-deletion-mobile.md`](../../account-deletion-mobile.md). O contrato recebido permanece sem alterações.

## Arquivos envolvidos

- `app/(app)/(tabs)/profile.tsx`: opção do perfil, confirmação, apresentação do resultado e links públicos.
- `src/api.ts`: chamada autenticada pelo cliente HTTP compartilhado, tratamento de sessão e tipo da resposta.

## Requisição

- **Método:** `POST`
- **Endpoint:** `/api/profile/account-deletion-request`
- **URL padrão:** `https://api.guitupinamba.dev/api/profile/account-deletion-request` (`API_URL` pode ser configurada por ambiente).
- **Headers:** `Authorization: Bearer <access_token>` (access token mantido em memória), `Content-Type: application/json` e `Accept: application/json`.
- **Corpo exato:** `{ "confirm": true }`.

O endpoint é chamado por `requestAccountDeletion()` em `src/api.ts`. O app não envia identificador, nome, e-mail, senha ou refresh token nessa requisição.

## Resposta e erros

O app considera sucesso somente HTTP `202 Accepted` e lê `message` e `reference`. A confirmação informa que o pedido foi recebido para análise manual, mostra a referência para atendimento e esclarece que a conta ainda não foi excluída. A referência não é persistida.

Os erros `400` e `422` orientam a tentar novamente; `401` percorre a renovação de sessão existente e, se a autenticação continuar inválida, limpa a sessão local e encaminha o usuário à autenticação; `409` orienta procurar atendimento sem repetição automática; `503` informa indisponibilidade e permite nova tentativa manual. Falha de rede/timeout apresenta mensagem neutra porque o app não consegue confirmar se o servidor recebeu o POST. Não há repetição automática da chamada. Um bloqueio em memória impede envios simultâneos pelo botão.

## Sessão e dados locais

Enquanto recebe o `401`, o cliente HTTP tenta renovar a sessão pelo fluxo mobile normal e repete a chamada uma vez. Se continuar não autorizado, a sessão local é limpa pelo mecanismo existente, que remove o refresh token do SecureStore, apaga o access token em memória e publica o estado desautenticado.

Após `202`, a sessão continua ativa, conforme o contrato. O app não chama `signOut()`, não remove credenciais, não revoga push token e não tenta concluir a exclusão. A solicitação será processada administrativamente; a revogação de sessões ocorre na conclusão administrativa descrita pelo contrato.

## Interface e links

A confirmação destaca a validação manual, a não exclusão imediata, a permanência da sessão até a conclusão, a retenção de publicações/eventos/agendas com autoria anonimizada, a exclusão de comentários e a necessidade de guardar a referência. Os links de política de privacidade e da página pública de exclusão abrem com `Linking.openURL`.

## Verificações e pendências

- `npm test -- --verbose`: 17 testes passaram. Os testes de tela usam mocks; os testes de API simulam respostas HTTP e SecureStore local. Cobrem a requisição exata e `202`, rejeição de status diferente, renovação e erro de autenticação, `409`, falhas de rede, bloqueio de envios repetidos, cancelamento, links, apresentação de sucesso e mensagens para `400`, `401`, `409`, `422` e `503`.
- `npm run typecheck`: executado com sucesso.
- `npx expo export --platform android --output-dir dist/android`: bundle Android gerado.
- `npx expo export --platform ios --output-dir dist/ios`: bundle iOS gerado.
- Não há dispositivo Android conectado (`adb devices` não listou dispositivos), e este ambiente Windows não tem simulador iOS. Assim, não houve inspeção visual ou execução interativa em dispositivo.
- Foram feitas tentativas de POST real sem credenciais para confirmar a barreira de autenticação, sem risco de criar pedido para membro. O DNS resolveu, mas a conexão HTTPS expirou antes de estabelecer conexão; não foi recebido status HTTP.
- O teste autenticado de integração ainda depende de rede de saída funcional e de uma conta/ambiente de homologação. O contrato recebido continua sendo a única referência técnica usada; não houve resposta real do backend.
- Lint não está configurado em `package.json`.
