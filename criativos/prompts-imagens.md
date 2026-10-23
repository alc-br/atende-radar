# Prompts das imagens geradas por IA

Cenas com pessoas das peças C1 e C3 do teste 1 (`criativos/teste-1/`). A IA gera só a foto. Título, linha de apoio, logo e o
alerta sobreposto entram depois, na composição (a mesma de `teste-1`), com a tela real do produto.

Situação em 23/10/2026: **ainda não gerado**. Falta o login do dono no ChatGPT e a permissão para baixar as imagens.

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

Gerar em 1:1 (1080×1080), 4:5 (1080×1350) e 9:16 (1080×1920). No 9:16, deixar o terço de cima e o de baixo mais limpos,
porque o título e o rodapé entram ali.

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

Mesmos formatos. Deixar espaço livre de um lado (à direita no 1:1 e no 4:5, embaixo no 9:16) para o alerta sobreposto.

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
3. Baixar em PNG e compor com o título e o alerta real, como as outras peças de `teste-1`.
