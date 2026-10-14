import { test, expect } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { PDFDocument } from 'pdf-lib'
import { toXlsx } from '../../src/lib/reports/xlsx'
import { toPdf } from '../../src/lib/reports/pdf'
import { toCsv, toJson } from '../../src/lib/reports/render'
import type { ReportContent } from '../../src/lib/reports/types'

// P3 · arquivos do relatório: a planilha guarda número como número e data como data; o PDF executivo é um PDF válido
// mesmo com acentos e emoji; o CSV não deixa conteúdo de cliente virar fórmula.

const content: ReportContent = {
  type: 'daily',
  title: 'Relatório Diário',
  orgName: 'Clínica Sorriso',
  periodStart: '2030-01-07T03:00:00.000Z',
  periodEnd: '2030-01-08T03:00:00.000Z',
  generatedAt: '2030-01-08T03:00:00.000Z',
  timezone: 'America/Sao_Paulo',
  highlights: { conversations: 12, waiting: 3, alerts: 2, opportunities: 4, valueAtRisk: 1500 },
  summary: ['12 conversa(s) no período.', 'R$ 1.500 em valor estimado em risco; 2 alerta(s) no período.'],
  sections: [
    {
      key: 'top_recover',
      heading: 'Top 5 conversas a recuperar',
      columns: ['Cliente', 'Telefone', 'Situação', 'Espera (min)', 'Intenção', 'Valor estimado (R$)'],
      formats: ['text', 'text', 'text', 'int', 'text', 'money'],
      rows: [['João Ação 😀', '(11) 9****-1234', 'Aguardando a empresa', 95, 'Orçamento', 1500.5]],
    },
    {
      heading: 'Alertas',
      columns: ['Alerta', 'Quando'],
      formats: ['text', 'date'],
      rows: [['=HYPERLINK("http://x")', '2030-01-07T15:30:00.000Z']],
    },
  ],
}

function cellXml(sheetXml: string, ref: string): string {
  const m = new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(sheetXml)
  if (!m) throw new Error(`célula ${ref} não encontrada`)
  return m[0]
}

test.describe('relatório em XLSX', () => {
  test('uma aba por seção, cabeçalho em pt-BR, número como número e data como data', async () => {
    const buf = await toXlsx(content)
    expect(buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true)
    const files = unzipSync(new Uint8Array(buf))

    const workbook = strFromU8(files['xl/workbook.xml'])
    expect(workbook).toContain('name="Resumo"')
    expect(workbook).toContain('name="Top 5 conversas a recuperar"')
    expect(workbook).toContain('name="Alertas"')

    const shared = strFromU8(files['xl/sharedStrings.xml'])
    expect(shared).toContain('Valor estimado (R$)')
    expect(shared).toContain('Clínica Sorriso')

    // aba 2 = Top 5: D2 (espera) e F2 (valor) são números, não texto
    const top = strFromU8(files['xl/worksheets/sheet2.xml'])
    const espera = cellXml(top, 'D2')
    expect(espera).not.toContain('t="s"')
    expect(espera).toContain('<v>95</v>')
    const valor = cellXml(top, 'F2')
    expect(valor).not.toContain('t="s"')
    expect(valor).toContain('<v>1500.5</v>')
    expect(cellXml(top, 'A1')).toContain('t="s"') // cabeçalho é texto

    // aba 3 = Alertas: a data vira número serial do Excel com formato de data; o "=" do cliente fica texto
    const alertas = strFromU8(files['xl/worksheets/sheet3.xml'])
    const quando = cellXml(alertas, 'B2')
    expect(quando).not.toContain('t="s"')
    // 7/1/2030 12:30 em Brasília = serial 47490,5208…
    expect(Number(/<v>([\d.]+)<\/v>/.exec(quando)?.[1])).toBeCloseTo(47490 + 12.5 / 24, 4)
    expect(cellXml(alertas, 'A2')).toContain('t="s"')
    expect(alertas).not.toContain('<f>')
    expect(strFromU8(files['xl/styles.xml'])).toContain('dd/mm/yyyy hh:mm')
  })
})

test.describe('relatório em PDF executivo', () => {
  test('gera um PDF válido de 1 a 2 páginas, com acentos e sem quebrar com emoji', async () => {
    const pdf = Buffer.from(await toPdf(content))
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(pdf.subarray(-8).toString('latin1')).toContain('%%EOF')
    const doc = await PDFDocument.load(pdf)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toContain('Relatório Diário')
  })

  test('relatório muito grande continua com no máximo 2 páginas', async () => {
    const big: ReportContent = {
      ...content,
      sections: Array.from({ length: 12 }, (_, i) => ({
        heading: `Seção ${i + 1}`,
        columns: ['Nome', 'Valor (R$)'],
        formats: ['text' as const, 'money' as const],
        rows: Array.from({ length: 40 }, (_, j) => [`Linha ${j}`, j * 10]),
      })),
    }
    expect((await PDFDocument.load(await toPdf(big))).getPageCount()).toBe(2)
  })
})

test.describe('relatório em CSV e JSON', () => {
  test('CSV neutraliza fórmula, escreve número (inclusive dinheiro) como número e data no fuso da empresa', () => {
    const csv = toCsv(content)
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain('João Ação 😀;(11) 9****-1234;Aguardando a empresa;95;Orçamento;1500,5')
    expect(csv).toContain('07/01/2030, 12:30')
  })

  test('JSON é a foto do relatório', () => {
    expect(JSON.parse(toJson(content))).toMatchObject({ type: 'daily', highlights: { valueAtRisk: 1500 } })
  })
})
