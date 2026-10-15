# Voz do "Tour pelo sistema" (Azure Speech)

O botão **Ouvir** do tour toca uma narração gravada no servidor. Cada passo tem um texto próprio para ser ouvido
(`narration`, em `src/lib/system-tour/narration.ts`), escrito como fala e diferente do texto da tela. O áudio é gerado
pela [Azure Speech](https://learn.microsoft.com/azure/ai-services/speech-service/) (voz neural `pt-BR-FranciscaNeural`)
no plano gratuito **F0**: cerca de 500 mil caracteres por mês sem custo. O tour inteiro tem ~80 textos e ~22 mil
caracteres, e cada texto é gerado **uma vez** (não a cada play). Só o texto do manual vai para a Azure, nunca dados de
clientes ou da empresa.

## Como funciona
- `GET /api/tours/system/audio?chapter=<id>&step=<índice>` (precisa de login; o mesmo padrão das outras rotas do tour).
  O texto sai **só** do conteúdo do tour no servidor. O cliente nunca manda texto, e um capítulo ou passo que o papel
  não vê responde 404.
- Se o arquivo já está no cache, sai direto do disco, **sem chamar a Azure** (nem precisa da chave: um áudio já gerado
  continua sendo servido com a Azure fora do ar ou sem chave configurada). Se não está, o servidor chama a Azure (REST, SSML pt-BR, MP3 mono
  24 kHz a 48 kbit/s, ~6 KB por segundo de fala), grava no cache e devolve o áudio. Limite de 20 s por geração.
- **Chave do cache** = sha256(provedor + voz + formato + versão + texto). Mudar o texto de um passo ou trocar a voz gera
  um arquivo novo; o resto do cache continua valendo. A chave também é o `ETag`, e o navegador guarda o áudio por um
  ano (`Cache-Control: private, max-age=31536000, immutable`). Suporta `Range` (206) e `If-None-Match` (304).
- O cache (`TOUR_AUDIO_DIR`) é **um só para todos os usuários** e fica fora de `current/`, então sobrevive aos deploys.
- A gravação é atômica (arquivo temporário e depois `rename`). Pedidos simultâneos do mesmo passo esperam uma geração
  só, e no máximo 2 gerações rodam ao mesmo tempo.
- Áudio que ainda não existe, sem `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION` ou com a Azure recusando (401, 403, 429 ou 5xx): a rota responde 503 e o
  `/api/tours/system` informa `audio: false` quando não há chave. Nesses casos, e em qualquer erro, o navegador lê o
  mesmo texto com a própria voz (Web Speech API).
- A chave nunca vai para log, mensagem de erro ou resposta.

## No navegador
- **Ouvir**, **Pausar/Continuar** e **Parar** no painel do passo.
- **Leitura automática** (rodapé, entre Voltar e Próximo): **começa ligada** ao abrir um capítulo (o clique que abriu o
  capítulo libera o som no navegador). Lê o passo, espera ~0,6 s depois do fim do áudio e avança, até o fim do capítulo
  (não pula para outro). Vira **Pausar leitura** enquanto está ligada. Desliga com Voltar, Próximo, Parar, setas ou ao
  fechar. Se o áudio do servidor e a voz do navegador falharem, desliga (sem loop). Não fica salva entre visitas.
- **Tela junto com a voz**: na leitura automática, a tela do passo (troca de tela, gaveta do celular, destaque) só
  aparece quando a voz começa de fato a falar (no máximo 4 s de espera; sem voz, na hora). Enquanto um passo fala, o
  áudio do passo seguinte já é baixado (`fetch` para o cache do navegador), então a próxima fala começa sem atraso.
- **Cursor simulado** (`src/components/system-tour/auto-actions.ts`; `aria-hidden`, sem foco, sem receber cliques,
  z-index 55: acima do painel e dos formulários). O que faz vem de `autoAction` no passo (`src/lib/system-tour/content.ts`):
  - `click` (menu, tela, botão que só abre formulário) e `select` (aba/filtro): quando a voz chega no "Clique…"/"Toque…"
    da narração (`actionCue` em `engine.ts`; sem pedido na fala, ao fim dela), o cursor desliza até o item e mostra
    "Clique aqui para continuar". O tour **nunca clica sozinho**: espera a pessoa clicar e então segue lendo.
  - `demo` (padrão quando não definido, e sempre nos passos de cadastro): ao fim da fala, NUNCA executa. Aponta o campo
    (digita "Exemplo" e apaga) e o botão de concluir. Passo de cadastro (`task`): mostra "Agora é com você: preencha e
    salve. O tour continua quando você terminar." e ESPERA; o aviso da tela de que o cadastro deu certo (`signal`)
    avança e a leitura segue. Pular com Próximo deixa o passo "demonstrado": o capítulo terminado assim não conta como
    concluído. Clique demonstrado (`click` sem `autoAction`): mostra "Na leitura automática só mostramos onde fica.
    Faça você mesmo quando quiser." e segue.
  - Item não aparece: o passo vira explicação e segue no fim da fala. Pausar tira o cursor. Com
    `prefers-reduced-motion`, sem deslize: o cursor aparece parado no item.
- **Velocidade**: 0,8× a 2× (`playbackRate` com `preservesPitch`; na voz do navegador, `rate`). Fica salva por pessoa
  no navegador (`localStorage`, chave `ar.systemTour.tts`) e vale para todos os passos.

## Variáveis (`/opt/atende-radar/shared/app.env`)
| Variável | Produção | Para quê |
|---|---|---|
| `AZURE_SPEECH_KEY` | secret do GitHub | Chave do recurso Speech (F0) |
| `AZURE_SPEECH_REGION` | secret do GitHub | Região do recurso (ex.: `brazilsouth`, `eastus`) |
| `AZURE_SPEECH_VOICE` | (vazio = `pt-BR-FranciscaNeural`) | Outra voz neural pt-BR, se quiser |
| `TOUR_AUDIO_DIR` | `/opt/atende-radar/shared/tour-audio` | Cache dos áudios |

O deploy (`.github/workflows/deploy.yml`, passo "Variáveis do app") grava `AZURE_SPEECH_KEY` e `AZURE_SPEECH_REGION`
a partir dos *secrets* do GitHub com o mesmo nome (valor nunca impresso; secret vazio não apaga o que já está no
servidor), cria `TOUR_AUDIO_DIR` se faltar e a pasta do cache. Depois do health check, o passo "Voz do tour" roda
`scripts/tour-audio-warm.ts` com as variáveis do `app.env`; se falhar, o deploy **não** falha (só um aviso no log).

### Criar ou trocar a chave
1. No portal da Azure: recurso **Speech** (Serviços de IA), plano **Free F0**. Em "Chaves e ponto de extremidade",
   copie a Chave 1 e a Região.
2. No GitHub: Settings → Secrets and variables → Actions → `AZURE_SPEECH_KEY` e `AZURE_SPEECH_REGION`.
3. Rode o deploy. Para trocar a chave, atualize o secret e rode o deploy de novo (o cache continua valendo: a chave da
   Azure não entra na chave do cache).

## Pré-gerar o áudio (warm)
```bash
cd /opt/atende-radar/current
( set -a; . /opt/atende-radar/shared/app.env; set +a; /usr/local/bin/bun scripts/tour-audio-warm.ts )
```
Percorre todos os capítulos e passos (de todos os papéis, sem repetir textos iguais), gera só o que falta, um por vez
com uma pausa curta, e espera e tenta de novo em 429. No fim mostra quantos foram gerados, quantos já existiam e quantos
falharam. Sem a chave, só avisa e sai com 0. Não precisa rodar à mão: o deploy roda sozinho.

## Conferir no servidor
```bash
grep -E '^(AZURE_SPEECH_REGION|AZURE_SPEECH_VOICE|TOUR_AUDIO_DIR)=' /opt/atende-radar/shared/app.env
grep -c '^AZURE_SPEECH_KEY=' /opt/atende-radar/shared/app.env   # 1 = chave presente (não imprima o valor)
ls /opt/atende-radar/shared/tour-audio | wc -l                  # ~80 arquivos .mp3 depois do warm
ls -ld /opt/atende-radar/shared/tour-audio                      # o usuário do serviço precisa poder escrever aqui
```
O consumo do mês aparece no portal da Azure, em Métricas do recurso Speech ("Characters Synthesized").

## Limpar o cache
Pode apagar a qualquer momento: os arquivos são recriados no próximo play ou no próximo deploy (cada recriação gasta
cota do F0 de novo).
```bash
rm -f /opt/atende-radar/shared/tour-audio/*
```
Arquivos de textos antigos (de narrações que mudaram) não são apagados sozinhos. Limpe de vez em quando, se quiser.

## Trocar a voz
1. Escolha uma voz neural pt-BR (lista na documentação da Azure, "Language and voice support").
2. Grave `AZURE_SPEECH_VOICE=<nome>` no `app.env` e reinicie: `sudo systemctl restart atende-radar.service`.
3. Como a voz entra na chave, os áudios novos são gerados sozinhos (rode o warm para gerar todos de uma vez). Os
   antigos podem ser apagados.

Se mudar algo que altera o som sem mudar o texto (o SSML, por exemplo), aumente `TOUR_AUDIO_VERSION` em
`src/lib/system-tour/tts.ts`.

## Testes
- Modo falso do TTS (`TOUR_AUDIO_FAKE=1`, ignorado com `NODE_ENV=production`): não acessa a rede, grava um MP3 curto de
  silêncio e conta as gerações em `TOUR_AUDIO_FAKE_LOG`. O `playwright.config.ts` liga esse modo
  (`tests/e2e/tour-audio-env.ts`).
- `tests/unit/system-tour.unit.spec.ts`: chave do cache, SSML (escape e voz) e configuração.
- `tests/e2e/tour-audio.spec.ts` (projeto `api`): 401, 404, geração única, ETag, 304, Range e pedidos simultâneos.
- `tests/e2e/system-tour.ui.spec.ts`: áudio do servidor, volta para a voz do navegador, Ler automaticamente (avança, simula
  o clique de navegação, só demonstra o cadastro sem criar nada, Pausar cancela o cursor, movimento reduzido) e velocidade (1,5× e 2× aplicadas ao `<audio>`).
