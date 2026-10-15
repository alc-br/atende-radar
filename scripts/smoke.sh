#!/usr/bin/env bash
# Teste de fumaça contra o site no ar (somente leitura: não cria conta, não escreve nada).
#   scripts/smoke.sh https://app.atenderadar.com.br https://atenderadar.com.br
# O 2º endereço (site) é opcional: sem ele, só o app é verificado (ex.: domínio único).
set -u
BASE="${1:-https://app.atenderadar.com.br}"
SITE="${2:-}"
FAIL=0
check() { # descrição, esperado, obtido
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FALHOU $1 (esperado $2, obtido $3)"; FAIL=1; fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
dest() { curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$@"; }
has() { # descrição, texto esperado, conteúdo
  case "$3" in *"$2"*) echo "ok   $1";; *) echo "FALHOU $1 (não encontrou: $2)"; FAIL=1;; esac
}

check "página inicial abre" 200 "$(code "$BASE/")"
check "login abre" 200 "$(code -L "$BASE/login")"
check "planos públicos" 200 "$(code "$BASE/api/public/plans")"
check "API fechada sem login (dashboard)" 401 "$(code "$BASE/api/dashboard")"
check "API fechada sem login (membros)" 401 "$(code "$BASE/api/members")"
check "escrita fechada sem login" 401 "$(code -X PATCH -H 'content-type: application/json' -d '{}' "$BASE/api/settings")"
check "entrada do gateway protegida" 401 "$(code -X POST -H 'content-type: application/json' -d '{}' "$BASE/api/gateway/events")"
check "cadastro recusa senha fraca" 400 "$(code -X POST -H 'content-type: application/json' -d '{"name":"Fumaca","email":"fumaca@exemplo.test","password":"curta","organizationName":"Fumaca","acceptTerms":true}' "$BASE/api/auth/signup")"

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

# ---- site (página de vendas, artigos, páginas legais) ----
if [ -n "$SITE" ]; then
  SITE_HOST="${SITE#https://}"
  HOME_HTML="$(curl -s "$SITE/")"
  check "site: página inicial abre" 200 "$(code "$SITE/")"
  has "site: texto da página de vendas vem no HTML (SEO)" "Quantas vendas sua empresa perde" "$HOME_HTML"
  # preço do Essencial vindo do catálogo (o Admin muda o preço; o site tem de mostrar o mesmo valor)
  ESSENCIAL_PRICE="$(printf '%s' "$PLANS" | grep -oE '"code":"essencial"[^}]*"monthlyPrice":[0-9]+' | grep -oE '[0-9]+$')"
  has "site: preços reais no HTML (Essencial R\$ ${ESSENCIAL_PRICE:-?})" "<strong>${ESSENCIAL_PRICE:-sem-preco}</strong>" "$HOME_HTML"
  has "site: endereço canônico" "<link rel=\"canonical\" href=\"$SITE\"" "$HOME_HTML"
  has "site: dados estruturados" "application/ld+json" "$HOME_HTML"
  has "site: rodapé leva aos artigos" 'href="/conteudos"' "$HOME_HTML"
  check "site: artigos" 200 "$(code "$SITE/conteudos")"
  check "site: um artigo" 200 "$(code "$SITE/conteudos/vendas-perdidas-whatsapp")"
  check "site: artigo inexistente" 404 "$(code "$SITE/conteudos/nao-existe")"
  check "site: privacidade" 200 "$(code "$SITE/privacidade")"
  check "site: termos" 200 "$(code "$SITE/termos")"
  has "site: sitemap" "<loc>$SITE/conteudos</loc>" "$(curl -s "$SITE/sitemap.xml")"
  has "site: robots aponta o sitemap" "Sitemap: $SITE/sitemap.xml" "$(curl -s "$SITE/robots.txt")"
  check "site: www vai para o domínio principal" "308 $SITE/" "$(dest "https://www.$SITE_HOST/")"
  check "site: /inicio não duplica a página" "308 $SITE/" "$(dest "$SITE/inicio")"
  check "site: login vai para o app" "308 $BASE/login" "$(dest "$SITE/login")"
  check "app: artigos vão para o site" "308 $SITE/conteudos" "$(dest "$BASE/conteudos")"
  case "$(curl -sI "$BASE/" | tr -d '')" in *[Xx]-[Rr]obots-[Tt]ag:*noindex*) echo "ok   app fora do Google";; *) echo "FALHOU app fora do Google"; FAIL=1;; esac
  case "$(curl -sI "$SITE/" | tr -d '')" in *[Xx]-[Rr]obots-[Tt]ag:*noindex*) echo "FALHOU site marcado como noindex"; FAIL=1;; *) echo "ok   site indexável";; esac
fi

if [ "$FAIL" -ne 0 ]; then echo "FUMAÇA: FALHOU"; exit 1; fi
echo "FUMAÇA: tudo certo"
