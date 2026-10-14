import { test, expect } from '@playwright/test'
import { maskSensitive, isValidCpf, isValidCnpj, luhnValid, MASKED_CPF } from '../../src/lib/mask-sensitive'

// B9/T17 · LGPD: CPF, cartão e CVV colados no WhatsApp nunca ficam em claro. Telefone, CEP, valores, datas e pedidos ficam.

test.describe('máscara de dados sensíveis · CPF', () => {
  test('CPF válido é mascarado com e sem pontuação', () => {
    expect(maskSensitive('meu cpf é 529.982.247-25')).toBe(`meu cpf é ${MASKED_CPF}`)
    expect(maskSensitive('cpf 52998224725')).toBe(`cpf ${MASKED_CPF}`)
    expect(maskSensitive('CPF: 111.444.777-35, obrigado')).toBe(`CPF: ${MASKED_CPF}, obrigado`)
    expect(maskSensitive('123.456.789-09')).toBe(MASKED_CPF)
    expect(maskSensitive('cpf 529 982 247 25')).toBe(`cpf ${MASKED_CPF}`)
    expect(maskSensitive('529982247-25')).toBe(MASKED_CPF)
  })

  test('nenhum dígito do CPF sobra no texto', () => {
    const out = maskSensitive('Segue meu CPF 529.982.247-25 pra nota')
    expect(out).not.toMatch(/\d/)
  })

  test('mais de um CPF na mesma mensagem', () => {
    expect(maskSensitive('o meu 529.982.247-25 e o da minha mãe 111.444.777-35')).toBe(`o meu ${MASKED_CPF} e o da minha mãe ${MASKED_CPF}`)
  })

  test('CPF com dígito verificador errado NÃO é mascarado', () => {
    expect(maskSensitive('123.456.789-00')).toBe('123.456.789-00')
    expect(maskSensitive('52998224726')).toBe('52998224726')
  })

  test('sequência repetida (111.111.111-11) não é CPF', () => {
    expect(maskSensitive('111.111.111-11')).toBe('111.111.111-11')
    expect(isValidCpf('00000000000')).toBe(false)
  })

  test('validação dos dígitos', () => {
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('11144477735')).toBe(true)
    expect(isValidCpf('12345678900')).toBe(false)
    expect(isValidCpf('1234567890')).toBe(false)
  })
})

test.describe('máscara de dados sensíveis · cartão', () => {
  test('cartão válido (Luhn) fica só com os 4 últimos', () => {
    expect(maskSensitive('cartão 4111 1111 1111 1111')).toBe('cartão •••• 1111')
    expect(maskSensitive('5555-5555-5555-4444')).toBe('•••• 4444')
    expect(maskSensitive('4111111111111111')).toBe('•••• 1111')
    expect(maskSensitive('amex 3782 822463 10005')).toBe('amex •••• 0005')
    expect(maskSensitive('378282246310005')).toBe('•••• 0005')
    expect(maskSensitive('elo 6362 9700 0045 7013')).toBe('elo •••• 7013')
  })

  test('cartão + validade + CVV na mesma mensagem', () => {
    expect(maskSensitive('pode passar no 4111 1111 1111 1111 validade 12/28 cvv 123')).toBe('pode passar no •••• 1111 validade 12/28 cvv •••')
  })

  test('cartão inválido no Luhn NÃO é mascarado', () => {
    expect(maskSensitive('4111 1111 1111 1112')).toBe('4111 1111 1111 1112')
    expect(maskSensitive('1234 5678 9012 3456')).toBe('1234 5678 9012 3456')
  })

  test('número seguido de outro grupo de dígitos: mascara só o cartão', () => {
    expect(maskSensitive('4111 1111 1111 1111 2026')).toBe('•••• 1111 2026')
  })

  test('Luhn', () => {
    expect(luhnValid('4111111111111111')).toBe(true)
    expect(luhnValid('4111111111111112')).toBe(false)
  })
})

test.describe('máscara de dados sensíveis · CVV', () => {
  test('só quando vem rotulado', () => {
    expect(maskSensitive('CVV: 1234')).toBe('CVV: ••••')
    expect(maskSensitive('cvv 123')).toBe('cvv •••')
    expect(maskSensitive('o CVV é 456')).toBe('o CVV é •••')
    expect(maskSensitive('código de segurança 789')).toBe('código de segurança •••')
    expect(maskSensitive('codigo de seguranca: 321')).toBe('codigo de seguranca: •••')
    expect(maskSensitive('cvv do cartão 654')).toBe('cvv do cartão •••')
  })

  test('números de 3 dígitos sem rótulo ficam', () => {
    expect(maskSensitive('o código é 123')).toBe('o código é 123')
    expect(maskSensitive('sala 302, bloco 4')).toBe('sala 302, bloco 4')
  })
})

test.describe('máscara de dados sensíveis · o que NÃO pode ser mexido', () => {
  const intactos = [
    'me liga no (11) 99999-8888',
    '11 99999-8888',
    '+55 11 99999-8888',
    '11999998888',
    '5511999998888',
    'CEP 01310-100',
    'CEP 01310100',
    'R$ 1.234,56',
    'fica R$ 123.456.789,09 no total',
    'R$ 150',
    'pode ser dia 13/10/2026 às 14:30?',
    'pedido 123456789',
    'pedido nº 12345678901',
    'protocolo 2026101300123',
    'CNPJ 11.222.333/0001-81',
    'cnpj 11222333000181',
    'boleto 23793.38128 60000.000003 00000.000400 1 84340000010000',
    'Quero agendar uma consulta amanhã às 9h',
    '',
  ]
  for (const t of intactos) {
    test(`fica igual: "${t}"`, () => {
      expect(maskSensitive(t)).toBe(t)
    })
  }

  test('nulo e vazio passam direto', () => {
    expect(maskSensitive(null)).toBeNull()
    expect(maskSensitive(undefined)).toBeUndefined()
  })

  test('CNPJ é dado da empresa: reconhecido e mantido', () => {
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11222333000182')).toBe(false)
  })

  test('mascarar duas vezes não muda nada (idempotente)', () => {
    const once = maskSensitive('cpf 529.982.247-25 cartão 4111 1111 1111 1111 cvv 123')
    expect(maskSensitive(once)).toBe(once)
  })
})
