# Guia de UI (curto)

Como fazer uma tela nova ou mexer numa existente sem quebrar o padrão. Vale o que está no código. Este guia aponta
onde cada coisa mora.

## Onde fica o CSS

`src/app/globals.css` importa, nesta ordem, Tailwind, tw-animate, `painel.css`, `conta.css`, `site.css`, `blog.css`,
`painel-ajustes.css` e `system-tour.css`. Cada área tem um escopo:

| Escopo | Onde | Arquivo |
|---|---|---|
| `.ar` | painel (telas logadas) | `src/styles/painel.css` |
| `.ar.conta` | login, cadastro, convite, recuperar senha (sempre claro) | `src/styles/conta.css` |
| `.lp` | site / página de vendas | `src/styles/site.css` |
| `.blog` | `/conteudos` e artigos | `src/styles/blog.css` |

**`painel.css` e `conta.css` são gerados: não edite à mão.** Correções do painel vão em `src/styles/painel-ajustes.css`,
que vem depois na cascata e onde ficam os ajustes de contraste e de fonte. O tour usa os tokens do painel
(`system-tour.css`). Tailwind e shadcn/ui são usados nos componentes de `src/components/ui`; o visual de marca vem das
classes abaixo.

## Tokens

**Fontes** (carregadas pelo `next/font`):
- Inter (`--font-inter`) no texto do painel, via `--fonte`.
- Plus Jakarta Sans (`--font-jakarta`) nos títulos do painel, via `--fonte-titulo`, e em todo o site e o blog.

**Cores do painel.** Use sempre a variável, nunca o hex.

| Token | Claro | Uso |
|---|---|---|
| `--fundo` / `--superficie` | `#f5f7f6` / `#fff` | fundo da página / cartões |
| `--borda` | `#e6ebe8` | bordas e divisórias |
| `--texto` / `--texto-2` | `#0f1a24` / `#3b4652` | texto principal / secundário |
| `--suave` / `--muito-suave` | `#5f6a76` / `#66717d`\* | rótulos, legendas, placeholder |
| `--verde-50` … `--verde-950` | `#eefbf4` … `#04170e`; marca em `--verde-700` `#0e6b43` | marca, botões primários, estados positivos |
| `--vermelho` / `--laranja` / `--ambar` / `--azul` | `#c92029` / `#ad4e0d` / `#906300` / `#235fe1`\* | crítico / alto / médio / informação |

\* Valores do `painel-ajustes.css`, escurecidos para o contraste AA. O `painel.css` gerado tem tons mais claros, que
ficam valendo apenas onde o ajuste não chega.

- **Modo escuro:** classe `.dark` (next-themes) em `painel.css`. Exemplos: `--fundo` `#0b1110` e `--texto` `#e9efec`.
  Toda cor nova precisa do par escuro.
- **Ponte com o shadcn:** `--primary` `#0e6b43`, `--ring` `#2fcf86` e `--radius` `.625rem`.

**Forma e medidas:**
- **Raios:** `--raio` 14px (cartões) e `--raio-sm` 9px (campos, botões pequenos).
- **Sombras:** `--sombra` e `--sombra-flutuante` (menus, diálogos).
- **Layout:** `--lateral` 248px (menu) e `--topo` 64px (cabeçalho).
- **Espaçamento:** **não há tokens**. Os espaços usados são 6, 8, 10 e 12 px nos componentes e 16 a 28 px entre blocos.
  Copie o espaçamento de um componente vizinho em vez de inventar um novo.

**Tipografia:**
- **Texto base:** 14px.
- **Título da página (`h1` em `.cab-pagina`):** 30px, peso 800, Jakarta.
- **Título de cartão (`.cartao__cab h2`):** 17px, peso 700.
- Não crie tamanhos novos.

**Quebras de tela:**
- **1024px:** o menu lateral vira gaveta.
- **720px e 480px:** os cartões e as grades empilham.
- **`prefers-reduced-motion`:** é respeitado; não acrescente animação que o ignore.

## Componentes (classes reais)

**Página:**
- `.cab-pagina`: título, descrição e ações da tela.
- `.kpis` com `.kpi`: números do topo.
- `.grade`, `.grade-2`, `.grade-3`, `.grade-4`: colunas.

**Cartões:**
- `.cartao`, com `.cartao__cab` (h2 e ações) e `.cartao__corpo`.

**Botões:**
- `.btn`, com 38px de altura.
- Variantes: `--primario` (verde, um por tela ou diálogo), `--contorno-verde`, `--perigo` (ações destrutivas),
  `--link`, `--sm` e `--lg`.
- O `Button` do shadcn foi reestilizado: a variante padrão já usa o gradiente verde.

**Formulários:**
- `.campo` (rótulo + controle) com `.entrada` (input), `.selecao` (select) e `.interruptor` (liga/desliga).
- Todo campo tem `<label>`. Quando o rótulo não pode aparecer, use `.sr-only`.

**Tabelas:**
- `.tabela-wrap` (`role="region"`, `tabIndex={0}`, `aria-label`) envolvendo `.tabela`, e `.paginacao` embaixo.
- No celular as listas principais trocam a tabela por cartões.

**Status:**
- `.tag--{cor}`: situação.
- `.nota--alta`, `--media`, `--baixa`, `--critica`: notas e severidade.
- `.aviso`: faixa de aviso dentro da tela.

**Outros:**
- Diálogos: o `Dialog` do shadcn (`src/components/ui/dialog.tsx`). A classe `.modal` do CSS gerado não é usada pelas telas.
- Carregamento: o `Skeleton` do shadcn.

**Avisos rápidos:**
- O `<Toaster richColors position="top-right" />` do Sonner.
- A classe `.toast` do CSS **não é usada**.

## Textos

- **Tom:** português do Brasil, tratando por "você", frases curtas e sem jargão técnico.
- **Botões e títulos de cartão:** com maiúscula só na primeira palavra, por exemplo "Nova conexão" e "Salvar
  assinatura".
- **Inconsistência conhecida, a corrigir:** alguns `h1` estão com cada palavra em maiúscula, como "Visão Geral" e
  "Planos e Faturamento".
- **Nomes dos planos:** Essencial, **Growth** e Performance.
  - No código e no banco o Growth é `gestao`. Para o cliente, é sempre "Growth", nunca "Gestão".
  - O catálogo fica em `src/lib/plan-catalog.ts`.
- **Termos do produto:** o glossário fica em `src/content/ajuda.ts` (artigo `glossario`). Use os mesmos nomes
  (conexão, alerta, recuperação, regra).
- **Caminhos:** escreva com "›", por exemplo "Configurações › Privacidade".
- **Erros de ação** (salvar, excluir, conectar): use `src/lib/mutation.ts`, nunca um `fetch` solto.
  - `mutate(url, init, { errorMessage, onSettled })`, ou `runMutation(() => fetchMutation(...), { errorMessage })`.
  - Em caso de erro, eles mostram `toast.error` com a mensagem do servidor (campo `error` da resposta). Na falta dela,
    usam a `errorMessage` ou o padrão "Não foi possível concluir a ação. Tente de novo." (`MUTATION_ERROR_MESSAGE`).
  - A mensagem de erro diz o que aconteceu e o que fazer. Exemplo: "Pagamento recusado: … Nenhum valor foi cobrado".
  - Uso real: `alerts-view.tsx`, `mutate('/api/alerts/${id}/acknowledge', …)`.
- **Sucesso:** `toast.success` curto, no passado, por exemplo "Alertas por e-mail ligados.".

## Estados de uma tela: carregando, vazia e com erro

Siga o padrão de `src/components/dashboard/dashboard-view.tsx`:

- **Carregando:**
  - mostre `Skeleton` no formato do conteúdo (KPIs, linhas da tabela);
  - não use spinner de tela cheia e não deixe a tela em branco;
  - não há `loading.tsx`: o carregamento é por tela, no cliente.
- **Erro ao carregar:**
  - mostre `<div className="cartao vazio" role="alert">` com uma frase do que falhou e o botão "Tentar novamente", que
    chama o `refetch`;
  - **inconsistência conhecida:** quase todas as telas usam "Tentar novamente", mas a tela de erro geral
    (`ErrorScreen`, `error.tsx`) e o `MUTATION_ERROR_MESSAGE` dizem "Tentar de novo". Numa tela nova, use "Tentar
    novamente", até alguém unificar.
- **Vazio:**
  - mostre `.vazio` com um `<strong>` dizendo o que falta e uma frase dizendo como preencher, de preferência com o
    botão da ação, por exemplo "Nova conexão";
  - a conta nova não pode parecer quebrada: o `design.ui.spec.ts` varre todas as telas com uma conta vazia.
- **Erros de rota:**
  - `src/app/error.tsx`: "Algo deu errado", com `ErrorScreen` de `src/components/layout/error-screen.tsx`;
  - `src/app/not-found.tsx`: "Página não encontrada".

## Acessibilidade (mínimo AA)

- **Contraste:**
  - texto normal precisa de pelo menos 4,5:1 e texto grande ou ícones de 3:1, nos dois temas;
  - as cores "suaves" e de status do `painel-ajustes.css` já foram ajustadas para isso;
  - não use `--muito-suave` em texto pequeno sobre `--fundo` sem medir;
  - cor nunca é a única pista: a severidade tem texto ("Crítico", "Alta"), não só cor.
- **Foco:**
  - no painel, `.ar :focus-visible` desenha um contorno de 2px em `--verde-500` com 2px de afastamento; no site e no
    blog, 3px em `--verde-400`;
  - **não remova o `outline`** sem pôr outro indicador visível no lugar.
- **Teclado:**
  - tudo o que é clicável é `<button>` ou `<a>`, nunca uma `div` com `onClick`;
  - tabelas com rolagem própria levam `tabIndex={0}` para rolar pelo teclado;
  - diálogos prendem o foco e fecham com Esc (o shadcn já faz isso).
- **Nomes:**
  - botão só com ícone leva `aria-label`;
  - ícone decorativo leva `aria-hidden="true"`;
  - seções com título usam `aria-labelledby`.
- **Idioma:** `html lang="pt-BR"`.
- **Falta:** não há link "pular para o conteúdo".
- **Testes que barram regressão** (rode antes de abrir PR de UI):
  - `tests/e2e/a11y.ui.spec.ts`: axe com WCAG 2.0/2.1 A e AA em 11 telas, claro e escuro. Falha com problema sério ou
    crítico.
  - `tests/e2e/design.ui.spec.ts`: em cada tela verifica que nada passa da largura, que os cartões não se sobrepõem, que
    não há erro de console nem de API, o reflow em 320px, as larguras de 1440 e 1920px e o uso só com teclado.
  - Para gerar as capturas das telas largas, rode com `DESIGN_CAPTURAS=1`. Elas ficam em
    `test-results/screens-largas`.
