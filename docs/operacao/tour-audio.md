# Voz do "Tour pelo sistema" (Piper)

O botão **Ouvir** do tour toca uma narração gravada no servidor. Cada passo tem um texto próprio para ser ouvido
(`narration`, em `src/lib/system-tour/narration.ts`), escrito como fala e diferente do texto da tela. O áudio é gerado
com o [Piper](https://github.com/rhasspy/piper), um leitor de texto open source e gratuito que roda no próprio servidor.
Nada vai para serviços de fora.

## Como funciona
- `GET /api/tours/system/audio?chapter=<id>&step=<índice>` (precisa de login; o mesmo padrão das outras rotas do tour).
  O texto sai **só** do conteúdo do tour no servidor. O cliente nunca manda texto, e um capítulo ou passo que o papel
  não vê responde 404.
- Na primeira vez que alguém pede um passo, o servidor chama o Piper, grava o arquivo no cache e devolve o áudio. Depois
  disso, o mesmo passo sai direto do disco.
- **Chave do cache** = sha256(nome da voz + versão + formato + texto). Por isso, mudar o texto de um passo, trocar a voz
  ou mudar o formato gera um arquivo novo, e o resto do cache continua valendo. A chave também é o `ETag`, e o
  navegador guarda o áudio por um ano (`Cache-Control: private, max-age=31536000, immutable`).
- A gravação é atômica: o arquivo vai para um temporário e só depois é renomeado. Pedidos simultâneos do mesmo passo
  esperam uma geração só. São no máximo 2 gerações ao mesmo tempo, e cada uma tem um limite de tempo
  (`TOUR_AUDIO_TIMEOUT_MS`, padrão 60 s).
- Se o Piper não estiver configurado, a rota responde 503 e o `/api/tours/system` informa `audio: false`. Nesse caso,
  e também em qualquer erro, o navegador lê o mesmo texto com a própria voz (Web Speech API).

## Variáveis (`/opt/atende-radar/shared/app.env`)
| Variável | Produção | Para quê |
|---|---|---|
| `PIPER_BIN` | `/opt/atende-radar/shared/piper/piper/piper` | Executável do Piper |
| `PIPER_VOICE` | `/opt/atende-radar/shared/piper/voices/pt_BR-faber-medium.onnx` | Modelo da voz (o `.onnx.json` fica ao lado) |
| `TOUR_AUDIO_DIR` | `/opt/atende-radar/shared/tour-audio` | Cache dos áudios |
| `PIPER_ARGS` | (vazio) | Argumentos extras, em JSON (`["--length_scale","1.1"]`) ou separados por espaço |
| `TOUR_AUDIO_FFMPEG` | (vazio = `ffmpeg` do PATH) | `off` desliga a conversão para MP3 |
| `TOUR_AUDIO_TIMEOUT_MS` | 60000 | Tempo máximo de uma geração |

O deploy (`.github/workflows/deploy.yml`, passo "Voz do tour") instala o Piper **uma vez**, com a release
`2023.11.14-2` e a voz `pt_BR-faber-medium` (v1.0.0), conferindo o sha256 de cada arquivo. Em seguida grava as três
primeiras variáveis se ainda não existirem e cria a pasta do cache. Se o download falhar, o deploy **não** falha: só
aparece um aviso no log, e o tour segue com a voz do navegador.

## Formato e tamanho
- Se houver `ffmpeg` com `libmp3lame` no servidor, o áudio é servido como MP3 mono a 48 kbit/s (cerca de 6 KB por
  segundo de fala, uns 200 KB por passo). O deploy **não** instala o ffmpeg; para usar MP3, rode
  `sudo apt install ffmpeg`.
- Sem ffmpeg, o áudio é WAV de 22 kHz (cerca de 44 KB por segundo, ou 1 a 1,5 MB por passo). Funciona em todos os
  navegadores, mas pesa mais no celular. Se a conversão para MP3 falhar uma vez, o servidor passa a servir WAV até
  ser reiniciado.
- O tour inteiro tem cerca de 80 passos. O cache completo fica em ~15 MB com MP3 ou ~100 MB com WAV.

## Conferir no servidor
```bash
ls -l /opt/atende-radar/shared/piper/piper/piper /opt/atende-radar/shared/piper/voices/
echo 'Olá, tudo bem?' | /opt/atende-radar/shared/piper/piper/piper \
  --model /opt/atende-radar/shared/piper/voices/pt_BR-faber-medium.onnx --output_file /tmp/teste.wav && ls -l /tmp/teste.wav
grep -E '^(PIPER_|TOUR_AUDIO_)' /opt/atende-radar/shared/app.env
ls -ld /opt/atende-radar/shared/tour-audio   # o usuário do serviço precisa poder escrever aqui
```

## Limpar o cache
Pode apagar a qualquer momento: os arquivos são recriados no próximo play.
```bash
rm -f /opt/atende-radar/shared/tour-audio/*
```
Arquivos de textos antigos (de narrações que mudaram) não são apagados sozinhos. Limpe de vez em quando, se quiser.

## Trocar a voz
1. Baixe outro modelo `.onnx` e o `.onnx.json` em https://huggingface.co/rhasspy/piper-voices (pasta `pt/pt_BR`)
   para `/opt/atende-radar/shared/piper/voices/`.
2. Troque `PIPER_VOICE` no `app.env` e reinicie: `sudo systemctl restart atende-radar.service`.
3. Como o nome da voz entra na chave, os áudios novos são gerados sozinhos. Os antigos podem ser apagados.

Se mudar algo que altera o som sem mudar o texto, como os parâmetros do Piper ou do ffmpeg, aumente
`TOUR_AUDIO_VERSION` em `src/lib/system-tour/tts.ts`.

## Testes
- `tests/e2e/tour-audio.spec.ts` (projeto `api`) usa um "Piper falso" (`tests/e2e/fixtures/fake-piper.mjs`) que grava
  silêncio e conta as chamadas. O teste cobre 401, 404, geração única, ETag, 304, Range e pedidos simultâneos.
- `tests/e2e/system-tour.ui.spec.ts` cobre o áudio do servidor e a volta para a voz do navegador.
