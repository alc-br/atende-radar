# ADR-003 — Autenticação, tenant e permissões do CRM

- Estado: aceita (30/10/2026)
- Decide: orquestrador, com revisão do agente 07 (segurança)
- Vale para: alternativa A e B (ADR-001). Com o Open Mercato, ele nunca vê o login do usuário (seção "Provedor").

## Contexto

O AtendeRadar já resolve sessão, empresa e papel no servidor: `guard(permission)` (`src/lib/api-auth.ts`) confere a
sessão do NextAuth, o membro ativo, a `sessionVersion`, o papel lido do banco e a trava de assinatura (402). O escopo de
leitura existe (`isOwnScopeOnly`, `supervisorTeam`), mas várias rotas de escrita só filtram por `organizationId`
(`00-inventario.md` R3). `canOpenView` libera tela que não está no mapa (R2). O hash de telefone depende do segredo
certo em produção (R15).

## Decisão

1. **O tenant vem do login, no servidor, sempre.** Toda rota `/api/crm/*` começa por `crmGuard(permission)`
   (`src/lib/crm/http.ts`), que chama `guard()` e usa `auth.orgId`. Nenhum corpo, query ou cabeçalho escolhe empresa.
   Os schemas são `.strict()`: `organizationId`, `createdBy` e campos de sistema enviados pelo navegador dão 400.
2. **ID do caminho é procurado já dentro do tenant e do escopo.** `findFirst({ where: { id, ...dealWhere(auth, scope) } })`,
   nunca `findUnique({ id })` seguido de checagem. Fora do escopo responde 404, igual a inexistente (não revela que o
   registro existe).
3. **Escopo também na escrita** (corrige R3 dentro do CRM). `ownerScope(auth)`:
   - atendente: só o que tem ele como responsável; não troca responsável; ao criar, o responsável é ele;
   - supervisor com equipe: responsáveis da equipe e o que está sem responsável; só atribui para a equipe;
   - admin, gestor e supervisor sem equipe: a empresa toda;
   - analista e visualizador: só os agregados de `/api/crm/overview`;
   - `member`: nada de CRM.
4. **Permissões novas no catálogo existente** (`src/lib/permissions.ts`), tabela em `04-api-crm.md` › Permissões. Cada
   tela do CRM entra no `VIEW_PERMISSION` (R2). O menu "Comercial" só aparece com `me.crm.enabled` e a permissão.
5. **Flag por empresa resolvida no servidor** (`CrmFeatureState`). Desligada: 404 `crm_disabled` em toda rota, como
   rota inexistente. Só o operador da plataforma (`PLATFORM_ADMIN_EMAILS`) liga `crm.enabled`, pela rota de admin. O
   admin e o gestor da empresa ligam as sub-flags. `CRM_DISABLED=1` desliga tudo.
6. **Concorrência otimista.** Negócio, pessoa, empresa, funil e atividade têm `version`; escrita com versão velha dá 409
   com a versão atual.
7. **Limites.** 120 mutações por membro por minuto; 10 operações pesadas (importação, exportação, mescla). Em memória,
   como o resto do app (R11).
8. **Auditoria.** Toda mutação do CRM grava `AuditLog` por `audit()`, com ações novas no `AuditAction`, sem telefone
   completo, e-mail completo ou texto livre do cliente.
9. **Dado pessoal.** Telefone da pessoa comercial cifrado com a mesma chave do contato observacional (`encryptPhone`),
   hash por empresa (`phoneHash`) e só os 4 últimos dígitos em claro. Exportação com telefone completo exige marcação e
   confirmação, só para admin, auditada. Exclusão e exportação da empresa incluem todas as tabelas `Crm*` (R7).
10. **CSRF.** Cookie de sessão `SameSite=Lax` (`session-cookie.ts`), como no resto do app, mais uma barreira só do CRM:
    toda mutação lê o corpo por `parseBody`, que exige `Content-Type: application/json` (415 sem ele). Formulário de
    outro site não manda esse tipo sem preflight de CORS. Rota sem campos recebe `{}`. O `readJson` do app não confere o
    tipo, então as rotas antigas não ganham essa barreira. O teste de segurança da F7 confere.

## Provedor (só se o ADR-001 escolher A)

O navegador nunca fala com o Open Mercato. O BFF chama o serviço privado com uma credencial de serviço por tenant,
guardada no servidor, e o mapeamento `CrmTenantLink` (empresa → tenant externo). Um tenant externo por empresa; nenhuma
consulta sem o tenant mapeado. 401/403 do provedor vira alerta de credencial, nunca troca de tenant.

## Consequências

- O escopo das rotas do CRM é mais estrito que o de algumas rotas antigas (R3). As antigas não mudam neste trabalho.
- Toda tela nova precisa da entrada no `VIEW_PERMISSION`; o teste `rbac.spec.ts` e o teste de unidade das descrições de
  papel pegam a falta.
- As rotas novas entram sozinhas em `api-auth.spec.ts` e `rbac.spec.ts` (descoberta automática de rotas).

## Testes que provam

Matriz T03 a T06 da F7: IDOR por ID de outra empresa e de outro responsável; troca de `organizationId` no corpo;
atendente tentando trocar responsável; supervisor atribuindo fora da equipe; flag desligada; papel sem permissão;
versão velha; limite de taxa; CSRF sem `Content-Type` JSON.
