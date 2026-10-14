import { test, expect } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { createUser, loginAs, STRONG, uid } from './helpers'
import { newChat, setupCompany } from './gw'
import { mailsTo, testDb } from './db'

// P3 · exportação real dos relatórios (XLSX, PDF executivo, JSON), cota de exportações, permissões,
// reenvio por e-mail com o PDF em anexo, "tentar novamente" e agendamento no fuso da empresa.

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const period = () => ({ periodStart: new Date(Date.now() - 7 * 86400000).toISOString(), periodEnd: new Date().toISOString() })

async function companyWithRun(type = 'daily') {
  const c = await setupCompany()
  await c.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 90, pushName: 'Cliente Export Um' })
  await c.send(newChat(), 'Quero agendar uma consulta', { minutes: 40, pushName: 'Cliente Export Dois' })
  await c.tick({ onlyThisCompany: true })
  const r = await c.admin.post('/api/reports/generate', { data: { reportTypeId: type, ...period() } })
  expect(r.status()).toBe(201)
  const runId = (await r.json()).reportRun.id as string
  const orgId = (await (await c.admin.get('/api/me')).json()).organizationId as string
  return { c, runId, orgId }
}

const exportsUsed = async (orgId: string) => testDb.auditLog.count({ where: { organizationId: orgId, action: 'report.exported' } })

test.describe('P3 · download do relatório em XLSX, PDF e JSON', () => {
  test('XLSX e PDF: content-type, assinatura do arquivo e anexo com o nome do relatório', async () => {
    const { c, runId } = await companyWithRun()

    const xlsx = await c.admin.get(`/api/reports/runs/${runId}/download?format=xlsx`)
    expect(xlsx.status()).toBe(200)
    expect(xlsx.headers()['content-type']).toBe(XLSX_TYPE)
    expect(xlsx.headers()['content-disposition']).toMatch(/attachment; filename="atenderadar-daily-\d{4}-\d{2}-\d{2}\.xlsx"/)
    const xbuf = Buffer.from(await xlsx.body())
    expect(xbuf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true) // PK\x03\x04
    // uma aba por seção, com o top 5 a recuperar
    const files = unzipSync(new Uint8Array(xbuf))
    const workbook = strFromU8(files['xl/workbook.xml'])
    expect(workbook).toContain('name="Resumo"')
    expect(workbook).toContain('name="Top 5 conversas a recuperar"')
    expect(strFromU8(files['xl/sharedStrings.xml'])).toContain('Cliente Export')

    const pdf = await c.admin.get(`/api/reports/runs/${runId}/download?format=pdf`)
    expect(pdf.status()).toBe(200)
    expect(pdf.headers()['content-type']).toBe('application/pdf')
    expect(pdf.headers()['content-disposition']).toMatch(/attachment; filename="atenderadar-daily-.*\.pdf"/)
    const pbuf = Buffer.from(await pdf.body())
    expect(pbuf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(pbuf.subarray(-8).toString('latin1')).toContain('%%EOF')

    const json = await c.admin.get(`/api/reports/runs/${runId}/download?format=json`)
    expect(json.status()).toBe(200)
    expect(json.headers()['content-type']).toContain('application/json')
    const body = await json.json()
    expect(body).toMatchObject({ type: 'daily', title: 'Relatório Diário' })
    expect(body.sections.some((s: { key?: string }) => s.key === 'top_recover')).toBe(true)
    expect(typeof body.highlights.valueAtRisk).toBe('number')
    await c.dispose()
  })

  test('cada download (XLSX, PDF, JSON) conta na cota; HTML não; ao esgotar, 402', async () => {
    const { c, runId, orgId } = await companyWithRun()
    const before = await exportsUsed(orgId)
    expect(before).toBe(0) // empresa nova, plano Essencial (5 por mês)
    for (const fmt of ['xlsx', 'pdf', 'json']) {
      expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=${fmt}`)).status(), fmt).toBe(200)
    }
    expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=html`)).status()).toBe(200)
    expect(await exportsUsed(orgId)).toBe(before + 3)
    const usage = (await (await c.admin.get('/api/subscription')).json()).usage
    expect(usage.exports.current).toBe(before + 3)

    // Essencial = 5 por mês: mais duas passam, a seguinte é recusada sem gerar arquivo
    expect((await c.admin.get('/api/reports/export?format=xlsx')).status()).toBe(200)
    expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=pdf`)).status()).toBe(200)
    for (const fmt of ['xlsx', 'pdf']) {
      const r = await c.admin.get(`/api/reports/runs/${runId}/download?format=${fmt}`)
      expect(r.status(), fmt).toBe(402)
      expect((await r.json()).code).toBe('quota_exceeded')
    }
    expect(await exportsUsed(orgId)).toBe(5)
    await c.dispose()
  })

  test('papel sem permissão de relatórios recebe 403; viewer baixa mas não reenvia nem tenta de novo', async () => {
    const { c, runId } = await companyWithRun()
    const memberEmail = `membro.${uid()}@cliente.test`
    const viewerEmail = `leitor.${uid()}@cliente.test`
    await createUser(c.admin, { email: memberEmail, role: 'member' })
    await createUser(c.admin, { email: viewerEmail, role: 'viewer' })

    const member = await loginAs(memberEmail, STRONG)
    for (const fmt of ['xlsx', 'pdf', 'json']) {
      expect((await member.get(`/api/reports/runs/${runId}/download?format=${fmt}`)).status(), fmt).toBe(403)
    }
    expect((await member.get('/api/reports/export?format=xlsx')).status()).toBe(403)
    expect((await member.post(`/api/reports/runs/${runId}/send`)).status()).toBe(403)
    expect((await member.post(`/api/reports/runs/${runId}/retry`)).status()).toBe(403)

    const viewer = await loginAs(viewerEmail, STRONG)
    expect((await viewer.get(`/api/reports/runs/${runId}/download?format=xlsx`)).status()).toBe(200)
    expect((await viewer.post(`/api/reports/runs/${runId}/send`)).status()).toBe(403)
    expect((await viewer.post(`/api/reports/runs/${runId}/retry`)).status()).toBe(403)

    // outra empresa não enxerga a execução
    const other = await setupCompany()
    expect((await other.admin.get(`/api/reports/runs/${runId}/download?format=pdf`)).status()).toBe(404)
    expect((await other.admin.post(`/api/reports/runs/${runId}/send`)).status()).toBe(404)
    await Promise.all([member.dispose(), viewer.dispose(), other.dispose(), c.dispose()])
  })

  test('formato inválido: 400 com a lista dos aceitos', async () => {
    const { c, runId } = await companyWithRun()
    const r = await c.admin.get(`/api/reports/runs/${runId}/download?format=docx`)
    expect(r.status()).toBe(400)
    expect((await r.json()).error).toContain('xlsx, pdf')
    await c.dispose()
  })
})

test.describe('P3 · indicadores em XLSX', () => {
  test('exporta a planilha dos indicadores diários (conta na cota)', async () => {
    const { c, orgId } = await companyWithRun()
    const before = await exportsUsed(orgId)
    const r = await c.admin.get('/api/reports/export?format=xlsx')
    expect(r.status()).toBe(200)
    expect(r.headers()['content-type']).toBe(XLSX_TYPE)
    const buf = Buffer.from(await r.body())
    expect(buf.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'latin1'))).toBe(true)
    expect(strFromU8(unzipSync(new Uint8Array(buf))['xl/workbook.xml'])).toContain('name="Indicadores diários"')
    expect(await exportsUsed(orgId)).toBe(before + 1)
    await c.dispose()
  })
})

test.describe('P3 · reenvio e "tentar novamente"', () => {
  test('reenviar manda o relatório com o PDF em anexo aos destinatários e não conta na cota', async () => {
    const { c, runId, orgId } = await companyWithRun()
    const dest = c.email // a execução gerada na hora leva os destinatários do relatório (o dono, por padrão)
    const before = await exportsUsed(orgId)

    const r = await c.admin.post(`/api/reports/runs/${runId}/send`)
    expect(r.status(), await r.text()).toBe(200)
    expect(await r.json()).toMatchObject({ success: true, emails: 1 })

    const mails = (await mailsTo(dest)).filter((m) => m.subject.startsWith('Relatório Diário · '))
    expect(mails).toHaveLength(1)
    expect(mails[0].body).toContain('O PDF executivo de cada relatório está em anexo.')
    const anexos = JSON.parse(mails[0].attachments || '[]') as Array<{ filename: string; size: number }>
    expect(anexos).toHaveLength(1)
    expect(anexos[0].filename).toMatch(/^atenderadar-daily-.*\.pdf$/)

    const run = await testDb.reportRun.findUniqueOrThrow({ where: { id: runId } })
    expect(run.emailStatus).toBe('queued') // sem provedor de e-mail no teste: fica na fila
    expect(JSON.parse(run.recipientEmails)).toEqual([dest])
    expect(await exportsUsed(orgId)).toBe(before)
    const hist = (await (await c.admin.get('/api/reports')).json()).history as Array<{ id: string; emailStatus: string | null }>
    expect(hist.find((h) => h.id === runId)?.emailStatus).toBe('queued')
    await c.dispose()
  })

  test('reenviar sem destinatários: 400', async () => {
    const { c, runId, orgId } = await companyWithRun('weekly')
    await testDb.reportRun.update({ where: { id: runId }, data: { recipientEmails: '[]' } })
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId, reportType: 'weekly' }, data: { recipients: '[]' } })
    expect((await c.admin.post(`/api/reports/runs/${runId}/send`)).status()).toBe(400)
    await c.dispose()
  })

  test('tentar novamente gera de novo a execução que falhou; execução concluída devolve 409', async () => {
    const { c, runId } = await companyWithRun()
    await testDb.reportRun.update({ where: { id: runId }, data: { status: 'failed', contentJson: null, error: 'Falha na geração: teste' } })
    // execução que falhou não tem o que baixar nem reenviar
    expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=pdf`)).status()).not.toBe(200)
    expect((await c.admin.post(`/api/reports/runs/${runId}/send`)).status()).toBe(409)

    const r = await c.admin.post(`/api/reports/runs/${runId}/retry`)
    expect(r.status(), await r.text()).toBe(200)
    expect(await r.json()).toMatchObject({ success: true, status: 'completed' })
    const run = await testDb.reportRun.findUniqueOrThrow({ where: { id: runId } })
    expect(run.status).toBe('completed')
    expect(run.error).toBeNull()
    expect((await c.admin.get(`/api/reports/runs/${runId}/download?format=pdf`)).status()).toBe(200)

    expect((await c.admin.post(`/api/reports/runs/${runId}/retry`)).status()).toBe(409)
    await c.dispose()
  })

  test('tentar novamente de um agendado que falhou também envia o e-mail', async () => {
    const { c, runId } = await companyWithRun()
    const dest = `agenda.${uid()}@cliente.test`
    await testDb.reportRun.update({ where: { id: runId }, data: { status: 'failed', contentJson: null, source: 'schedule', recipientEmails: JSON.stringify([dest]) } })
    const r = await c.admin.post(`/api/reports/runs/${runId}/retry`)
    expect(r.status(), await r.text()).toBe(200)
    expect(await r.json()).toMatchObject({ status: 'completed', emailStatus: 'queued' })
    expect((await mailsTo(dest)).length).toBe(1)
    await c.dispose()
  })
})

test.describe('P3 · agendamento no fuso da empresa', () => {
  // Terça-feira, 8/1/2030. Manaus é UTC-4: 18:00 lá = 22:00 UTC (em Brasília seriam 21:00 UTC).
  test('o horário agendado vale no fuso configurado da empresa', async () => {
    const { c, orgId } = await companyWithRun()
    const dest = `fuso.${uid()}@cliente.test`
    expect((await c.admin.patch('/api/reports/daily', { data: { schedule: '18:00', recipients: [dest] } })).status()).toBe(200)
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId }, data: { sendEmpty: true } })
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId, reportType: { not: 'daily' } }, data: { schedule: null } })
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId, reportType: 'daily' }, data: { daysOfWeek: '[]' } })
    await testDb.organization.update({ where: { id: orgId }, data: { timezone: 'America/Manaus' } })
    expect((await (await c.admin.get('/api/reports')).json()).timezone).toBe('America/Manaus')

    const tick = async (iso: string) => (await c.gw.post('/api/gateway/tick', { data: { organizationId: orgId, reportsAt: iso } })).json()
    expect(await tick('2030-01-08T21:00:00Z')).toMatchObject({ generated: 0, emails: 0 }) // 17:00 em Manaus
    expect(await tick('2030-01-08T22:00:00Z')).toMatchObject({ generated: 1, emails: 1, failed: 0 }) // 18:00 em Manaus

    const run = await testDb.reportRun.findFirstOrThrow({ where: { organizationId: orgId, source: 'schedule' }, orderBy: { createdAt: 'desc' } })
    expect(run).toMatchObject({ status: 'completed', emailStatus: 'queued' })
    const mail = (await mailsTo(dest))[0]
    expect(JSON.parse(mail.attachments || '[]')[0].filename).toMatch(/\.pdf$/)
    await c.dispose()
  })
})
