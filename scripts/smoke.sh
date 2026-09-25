#!/usr/bin/env bash
# Teste de fumaça contra o site no ar (somente leitura: não cria conta, não escreve nada).
#   scripts/smoke.sh https://atende-radar.dev.alc.srv.br
set -u
BASE="${1:-https://atende-radar.dev.alc.srv.br}"
FAIL=0
check() { # descrição, esperado, obtido
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FALHOU $1 (esperado $2, obtido $3)"; FAIL=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

check "página inicial abre" 200 "$(code "$BASE/")"
check "login abre" 200 "$(code "$BASE/login")"
check "planos públicos" 200 "$(code "$BASE/api/public/plans")"
check "API fechada sem login (dashboard)" 401 "$(code "$BASE/api/dashboard")"
check "API fechada sem login (membros)" 401 "$(code "$BASE/api/members")"
check "escrita fechada sem login" 401 "$(code -X PATCH -H 'content-type: application/json' -d '{}' "$BASE/api/settings")"
check "entrada do gateway protegida" 401 "$(code -X POST -H 'content-type: application/json' -d '{}' "$BASE/api/gateway/events")"
check "cadastro recusa senha fraca" 400 "$(code -X POST -H 'content-type: application/json' -d '{"name":"Fumaca","email":"fumaca@exemplo.test","password":"curta","organizationName":"Fumaca"}' "$BASE/api/auth/signup")"

PLANS="$(curl -s "$BASE/api/public/plans")"
case "$PLANS" in *'"essencial"'*'"gestao"'*'"performance"'*) echo "ok   3 planos no catálogo";; *) echo "FALHOU catálogo de planos"; FAIL=1;; esac

HDRS="$(curl -sI "$BASE/" | tr -d '\r')"
case "$HDRS" in *[Xx]-[Ff]rame-[Oo]ptions:*DENY*) echo "ok   X-Frame-Options";; *) echo "FALHOU X-Frame-Options"; FAIL=1;; esac
case "$HDRS" in *[Ss]trict-[Tt]ransport-[Ss]ecurity:*) echo "ok   HSTS";; *) echo "FALHOU HSTS"; FAIL=1;; esac

# login de demonstração (senha pública): lê, mas não escreve
JAR="$(mktemp)"
CSRF="$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed 's/.*"csrfToken":"\([^"]*\)".*/\1/')"
curl -s -b "$JAR" -c "$JAR" -o /dev/null -X POST -d "csrfToken=$CSRF&email=demo@atenderadar.com&password=demo123&json=true" "$BASE/api/auth/callback/credentials"
check "demo lê o painel" 200 "$(code -b "$JAR" "$BASE/api/dashboard")"
check "demo NÃO escreve" 403 "$(code -b "$JAR" -X PATCH -H 'content-type: application/json' -d '{}' "$BASE/api/settings")"
rm -f "$JAR"

if [ "$FAIL" -ne 0 ]; then echo "FUMAÇA: FALHOU"; exit 1; fi
echo "FUMAÇA: tudo certo"
