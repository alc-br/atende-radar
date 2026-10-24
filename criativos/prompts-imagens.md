# Prompts das imagens geradas por IA

Cenas com pessoas das peças C1 e C3 do teste 1 (`criativos/teste-1/`). A IA gera só a foto. Título, linha de apoio, logo e o
alerta sobreposto entram depois, na composição (a mesma de `teste-1`), com a tela real do produto.

Situação em 24/10/2026: **gerado** no ChatGPT (conta do dono) e composto em `criativos/teste-1/AR_C1_*` e `AR_C3_*`.

- C1: uma foto em 1:1 (usada no 1080×1080) e uma em 9:16 (usada no 1080×1350 e no 1080×1920). O alerta real entra
  na tela do celular, em perspectiva.
- C3: só a foto em 9:16, usada nos três formatos. A primeira, em 1:1, foi descartada porque a traseira do celular
  tinha um logo parecido com o da Apple. Por isso o pedido do 9:16 diz "traseira lisa, sem logotipo". O alerta real
  (só a parte de cima: título, cliente, atendente, valor e confiança) entra ao lado do rosto, sobre a parede.
- Rodapé das duas peças: "Imagem ilustrativa. Alerta: tela real do Atende Radar, dados fictícios."
- Marca escrita "Atende Radar", separado, nos textos das peças (decisão do dono, 24/10/2026). O logo continua o mesmo.

## Regras que valem para todos os prompts

- Pessoas brasileiras, com aparência comum e real. Nada de celebridade nem de rosto conhecido.
- Clínica: recepção e atendimento. Nada de antes e depois, corpo, procedimento, jaleco com paciente ou promessa de saúde.
- A tela do celular fica apagada ou desfocada. O alerta real entra por cima, na composição.
- Não pode aparecer:
  - texto ou letreiro legível;
  - logo do WhatsApp ou balão verde;
  - marca de terceiros (celular, roupa, computador);
  - mãos ou dedos deformados.

## C1: "Paciente pediu horário e ninguém respondeu?"

Gerar em 1:1 (1080×1080) e 9:16 (o 4:5 usa um corte do 9:16). No 9:16, deixar o terço de cima e o de baixo mais
limpos, porque o título e o rodapé entram ali.

```
Foto realista, estilo fotografia de banco de imagem, de uma mão segurando um celular em primeiro plano, com a tela apagada
voltada para a câmera, levemente inclinada. Ao fundo, bem desfocado (bokeh forte), o balcão da recepção de uma clínica
brasileira moderna: madeira clara, plantas, cadeiras de espera, luz natural entrando pela janela. Uma recepcionista
brasileira aparece ao fundo, desfocada, atendendo outra pessoa no balcão. Tons claros, com verde suave e branco.
Profundidade de campo rasa, foco no celular. Mão com cinco dedos, anatomia natural.
Formato [1:1 | 4:5 | 9:16].
Não incluir: nenhum texto, letreiro ou número legível; logo do WhatsApp ou qualquer balão verde; marcas de celular, roupa ou
equipamento; jaleco com paciente; procedimento médico ou odontológico; mãos ou dedos deformados.
```

## C3: "Sua recepção atende. O Atende Radar avisa o que ficou para trás."

Gerar em 9:16 e usar nos três formatos. No pedido, acrescentar: "a traseira do celular deve ser totalmente lisa, sem
nenhum logotipo, símbolo ou marca" e "sem monitor ou computador no balcão". Deixar espaço livre de um lado (à direita no 1:1 e no 4:5, embaixo no 9:16) para o alerta sobreposto.

```
Foto realista de uma recepcionista brasileira, cerca de 30 anos, uniforme social simples sem logotipo, sentada atrás do
balcão de recepção de uma clínica moderna, olhando o celular na mão com expressão de atenção tranquila. Ambiente claro,
madeira clara e branco, uma planta, luz natural suave de janela lateral. Enquadramento da cintura para cima, câmera na
altura dos olhos, fundo levemente desfocado. A tela do celular não aparece para a câmera. Mãos naturais, cinco dedos.
Formato [1:1 | 4:5 | 9:16], com área livre [à direita | embaixo] para inserir um elemento gráfico depois.
Não incluir: nenhum texto, letreiro ou número legível; logo do WhatsApp ou qualquer balão verde; marcas de terceiros;
paciente, jaleco, procedimento ou equipamento médico em uso; mãos ou dedos deformados.
```

## Como refazer

1. Abrir https://chatgpt.com, colar o prompt e trocar `[...]` pelo formato.
2. Conferir na imagem: mãos, texto escondido em placas ou telas, marca em roupa ou celular. Se aparecer algum, gerar de novo.
3. Ampliar e conferir a traseira do celular: logo de fabricante aparece com frequência.
4. Baixar em PNG e compor com o título e o alerta real, como as outras peças de `teste-1`. Se a foto mudar, os cantos
   da tela do celular (C1) e a posição do alerta (C3) precisam ser medidos de novo.
