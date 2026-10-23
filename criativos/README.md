# Criativos de anúncio

Peças para Meta Ads e Google (Display/Demand Gen/YouTube Shorts), desenhadas em HTML e fotografadas pelo
Chromium do Playwright (`gerar.mts`). **Todos os dados e conversas são inventados**, e cada peça diz isso no rodapé
("Exemplo ilustrativo, dados fictícios").

## Gerar

```bash
node --experimental-strip-types criativos/gerar.mts
```

- No Windows, rode com Node: o Bun não abre os navegadores do Playwright.
- Os vídeos precisam do `ffmpeg`, no PATH ou na variável `FFMPEG`.
- A saída vai para `criativos/saida/`, que fica fora do git. Para entregar as peças, gere de novo.
- A geração para com erro se algum texto passar da margem de segurança: no story, o topo (220 px) e a base (260 px) ficam sob a interface do Instagram/Facebook.

## Peças

| Arquivo | Formato | Uso |
|---|---|---|
| `01-vendas-perdidas-quadrado.png` / `-story.png` | 1080×1080 / 1080×1920 | Dor geral: a venda que se perde depois que o cliente chama |
| `02-clinicas-quadrado.png` / `-story.png` | idem, fundo claro | Segmento clínicas (casa com `/para/clinicas`) |
| `03-painel-quadrado.png` / `-story.png` | idem | Números de exemplo do painel (523 / 37 / 28 / 12) |
| `video-01-orcamento-sem-retorno-story.mp4` | 1080×1920, 20 s, 30 fps, H.264, sem áudio | Orçamento pedido → conversa parada → alerta → CTA |
| `video-02-tres-sinais-story.mp4` | idem | 3 sinais de venda perdida → números → CTA |

Os vídeos não têm áudio. Se o gestor quiser trilha, ela entra no gerenciador de anúncios, usando a biblioteca de sons da plataforma.

## Marca

- `logo-atenderadar.svg` é a marca para fundo claro. "Atende" em `#0d1726` e "Radar" em `#12a862`.
- `logo-atenderadar-clara.svg` é a marca para fundo escuro. "Atende" em branco e "Radar" em `#2ccb7c`.
- `icone-atenderadar.svg` é o ícone sozinho: gradiente `#2ccb7c` → `#0a7445`. Serve para a foto do perfil e o favicon.
- O texto dos logos está em curvas, então não depende de fonte instalada.

| Cor | Hex | Onde |
|---|---|---|
| Verde 900 | `#063d26` | fundo escuro |
| Verde 700 | `#0a7445` | fim do gradiente do ícone |
| Verde 600 | `#0d8f53` | botão em fundo claro |
| Verde 500 | `#12a862` | "Radar" no fundo claro |
| Verde 400 | `#2ccb7c` | botão e destaques no fundo escuro |
| Verde 100 | `#dcf6e7` | brilho do fundo claro |
| Fundo claro | `#f3faf6` | fundo das peças claras |
| Tinta | `#0d1726` | títulos |
| Texto | `#1f2a37` | corpo |
| Suave | `#5b6675` | legendas |
| Alerta | `#f5a524` / `#fff4e5` / `#9a5b00` | cartão "Atenção" |
| Risco | `#d92d20` | número em risco |

Fontes (Google Fonts, licença OFL):

- **Plus Jakarta Sans** 700/800 para títulos e botões.
- **Inter** 400–600 para o texto.

## Cuidados para aprovar nas plataformas

- Não usar o logo do WhatsApp nem o balão verde oficial. "WhatsApp" aparece só como nome no texto, e o rodapé das páginas `/para/*` diz que é marca da Meta, sem afiliação.
- As conversas imitam um chat genérico, sem a interface do WhatsApp.
- Sem promessas de resultado ("aumente X% das vendas"). Os números do painel são de exemplo e dizem isso.
- Preço e teste nas peças: "14 dias grátis" e "Sem cartão de crédito", iguais ao cadastro e aos Termos.
