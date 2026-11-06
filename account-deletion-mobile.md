# Contrato mobile — solicitação de exclusão de conta

Este documento descreve como um cliente Android/iOS pode solicitar a exclusão da
conta autenticada. A API e o fluxo Web estão implementados; o código do cliente
mobile não está neste repositório. O endpoint usa HTTPS e a mesma API central.

Contrato detalhado do processamento administrativo, anonimização e retenção:
[account-deletion.md](account-deletion.md). Autenticação mobile:
[authentication.md](authentication.md#mobile).

## Endpoint

```http
POST https://api.guitupinamba.dev/api/profile/account-deletion-request
Authorization: Bearer <access_token>
Content-Type: application/json
Accept: application/json
```

Corpo exato:

```json
{ "confirm": true }
```

Não envie `user_id`, nome, e-mail, senha ou refresh token. O backend identifica a
conta pela sessão associada ao access token e valida que usuário e sessão ainda
estão ativos. Requisições nativas devem usar HTTPS; não usar cookie de sessão.

## Resposta aceita

HTTP `202 Accepted`, `Cache-Control: no-store, private`:

```json
{
  "message": "Recebemos sua solicitação. A equipe fará a análise antes de concluir a exclusão.",
  "reference": "0123456789abcdef0123456789abcdef"
}
```

`202` significa que o pedido foi registrado para análise. **Não significa que a
conta já foi excluída.** A exclusão não é automática. Mostre a confirmação e a
referência ao usuário, sem afirmar que recebeu uma notificação por e-mail ou push:
o sistema não envia aviso automático sobre aprovação, rejeição ou conclusão.

## Ciclo de vida e comportamento do app

O pedido começa em `PENDING`. Um pedido autenticado aberto nos estados `PENDING`,
`UNDER_REVIEW` ou `APPROVED` impede outro pedido para a mesma conta. O cliente
pode apresentar confirmação antes do POST, explicando que:

- a equipe analisará o pedido e poderá validar a identidade;
- a conta só será excluída quando a equipe concluir a análise;
- até a conclusão administrativa, a sessão atual continua ativa;
- após a conclusão, sessões e tokens são revogados e a conta é anonimizada;
- o usuário deve guardar a referência para atendimento.

O contrato atual **não oferece consulta de status pelo próprio solicitante**.
Não faça polling da rota administrativa nem exponha ao membro endpoints
`/admin/...`. O status é acompanhado pela equipe autorizada no painel Web. Em caso
de dúvida, o app pode direcionar a pessoa ao canal de atendimento publicado na
[política de privacidade](https://guitupinamba.dev/privacidade), junto com a
referência.

## Erros esperados

Os erros usam o envelope `{ "error": { "code": "...", "message": "..." } }`.

| HTTP | Código | Ação sugerida no app |
| --- | --- | --- |
| `400` | `BAD_REQUEST` | Verificar JSON e `Content-Type`; permitir tentar novamente após corrigir. |
| `401` | `UNAUTHORIZED` | Renovar a sessão pelo fluxo mobile normal; se falhar, pedir novo login. |
| `409` | `CONFLICT` | Já há solicitação aberta ou a conta não pode ser processada nesse estado; orientar contato com suporte e não repetir em loop. |
| `422` | `UNPROCESSABLE_ENTITY` | Garantir que `confirm` seja booleano `true`. |
| `503` | `SERVICE_UNAVAILABLE` | Informar indisponibilidade e permitir nova tentativa manual. |

Para timeout ou falha de rede após o envio, o cliente não consegue saber se o
servidor recebeu o POST. Não repetir automaticamente em loop; uma repetição poderá
responder `409` se o primeiro pedido tiver sido gravado. Apresente uma mensagem
neutra e ofereça contato com suporte.

## Tipos TypeScript sugeridos

```ts
export type AccountDeletionAccepted = {
  message: string;
  reference: string; // 32 caracteres hexadecimais
};

export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};
```

Envie o access token em memória conforme o fluxo de autenticação mobile. Não
persista a referência junto a dados sensíveis; se for guardá-la para suporte,
explique isso ao usuário e use armazenamento apropriado. A referência não é um
token para consultar o pedido nem uma prova de identidade.

## Fora do contrato mobile

O endpoint público `POST /api/account-deletion-requests` existe para quem não
consegue autenticar; ele exige nome, e-mail e confirmação, aplica limites de
tentativas e pode responder `202` sem gravar um pedido quando o honeypot é
acionado. Para o usuário logado dentro do app, prefira a rota autenticada acima.

O fluxo administrativo (`GET /api/admin/account-deletion-requests` e ações de
revisão) é exclusivo de ADMIN/PASTOR ativos e deve permanecer apenas no painel
administrativo. Não coloque segredos nem tokens administrativos no app membro.
