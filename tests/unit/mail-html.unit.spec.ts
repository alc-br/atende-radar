import { test, expect } from '@playwright/test'
import { buttonLabel, mailHtml } from '../../src/lib/mail-html'

const ALERT = `Um novo alerta foi aberto na Empresa X.

Regra: Promessa vencida
Gravidade: crítica

Veja os detalhes no painel: https://app.atenderadar.com.br/#alerts

Não quer mais receber alertas por e-mail? https://app.atenderadar.com.br/descadastrar?token=abc

— AtendeRadar`

test('e-mail HTML: link do sistema vira botão, descadastro vira link discreto, rótulos em negrito, sem assinatura duplicada', () => {
  const html = mailHtml('Alerta: Promessa vencida', ALERT)
  expect(html).toContain('<strong>Regra:</strong> Promessa vencida')
  expect(html).toMatch(/<a href="https:\/\/app\.atenderadar\.com\.br\/#alerts"[^>]*>Ver alertas<\/a>/)
  expect(html).toMatch(/<a href="https:\/\/app\.atenderadar\.com\.br\/descadastrar\?token=abc"[^>]*>Descadastrar<\/a>/)
  expect(html).not.toContain('— AtendeRadar')
  expect(html).toContain('CNPJ 22.629.446/0001-12')
  expect(html).toContain('contato@atenderadar.com.br')
})

test('e-mail HTML: texto do cliente é escapado (nada de HTML injetado) e lista com "•" vira <ul>', () => {
  const html = mailHtml('<b>assunto</b>', 'Olá, <script>alert(1)</script> & cia\n\n• 2 conversas\n• R$ 10 em risco')
  expect(html).not.toContain('<script>')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; cia')
  expect(html).toContain('<title>&lt;b&gt;assunto&lt;/b&gt;</title>')
  expect(html).toMatch(/<ul[^>]*><li[^>]*>2 conversas<\/li><li[^>]*>R\$ 10 em risco<\/li><\/ul>/)
})

test('texto do botão pelo destino do link', () => {
  expect(buttonLabel('https://x/verify-email?token=1')).toBe('Confirmar e-mail')
  expect(buttonLabel('https://x/confirm-email?token=1')).toBe('Confirmar e-mail')
  expect(buttonLabel('https://x/reset-password?token=1')).toBe('Criar nova senha')
  expect(buttonLabel('https://x/accept-invite?token=1')).toBe('Aceitar convite')
  expect(buttonLabel('https://x/#reports')).toBe('Ver relatórios')
  expect(buttonLabel('https://x/qualquer')).toBe('Abrir no AtendeRadar')
})
