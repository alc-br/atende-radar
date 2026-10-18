-- "Encerrar sozinho" das regras de alerta passou a valer no motor. As regras padrão vinham com prazos gravados
-- (preço sem retorno 120 min, promessa vencida 1440 min, conexão desconectada 60 min) que nunca tinham efeito e que
-- ninguém escolheu na tela: limpa esses valores para o alerta continuar aberto enquanto o problema existir.
-- Só dado (sem mudar o schema). Quem quiser, liga na regra em Alertas › Regras › Editar › Mais opções.
UPDATE "AlertRule" SET "autoCloseMinutes" = NULL
WHERE ("type" = 'pending_quote' AND "autoCloseMinutes" = 120)
   OR ("type" = 'promise_overdue' AND "autoCloseMinutes" = 1440)
   OR ("type" = 'connection_down' AND "autoCloseMinutes" = 60);
