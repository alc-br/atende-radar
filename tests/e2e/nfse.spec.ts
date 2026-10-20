import { test, expect } from '@playwright/test'
import { loginAs, signupOrg, uid } from './helpers'
import { testDb } from './db'
import { gatewayClient } from './gw'

// NFS-e (src/lib/nfse): fatura paga → nota emitida; reembolso → nota cancelada; falhas ficam na fila com nova tentativa
// e o operador acompanha em Admin › Notas fiscais. Nos testes o Sistema Nacional é o falso (NFSE_FAKE=1): mesmo XML,
// mesma assinatura (conferida), sem rede. O envio real foi provado na produção restrita (docs/operacao/nfse.md).

test.describe.configure({ mode: 'serial' })

async function orgComTomador(nome = 'Cliente Teste Ltda') {
  const { email } = await signupOrg()
  const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
  await testDb.billingCustomer.create({
    data: {
      organizationId: m.organizationId, name: nome, email: 'financeiro@cliente.test', documentType: 'CNPJ', document: '00000000000191',
      zipCode: '80010000', street: 'Rua XV de Novembro', number: '100', neighborhood: 'Centro', city: 'Curitiba', state: 'PR',
    },
  })
  return m.organizationId
}

async function faturaPaga(orgId: string, extra: { amountCents?: number; paidAt?: Date } = {}) {
  return testDb.billingInvoice.create({
    data: {
      organizationId: orgId, providerInvoiceId: `in_nfse_${uid()}${uid()}`, providerSubscriptionId: `sub_nfse_${orgId}`, providerChargeId: `ch_${uid()}`,
      planName: 'Pro', billingCycle: 'monthly', amountCents: extra.amountCents ?? 9700, status: 'paid', paidAt: extra.paidAt ?? new Date(Date.now() - 60_000),
      periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86400_000),
    },
  })
}

/** Roda a fila (como o agendador) até a nota da fatura chegar à situação esperada. */
async function ate(invoiceId: string, status: string) {
  const gw = await gatewayClient()
  await expect.poll(async () => {
    await gw.post('/api/gateway/tick', { data: {} })
    const doc = await testDb.nfseDocument.findUnique({ where: { billingInvoiceId: invoiceId } })
    return doc?.status
  }, { timeout: 30_000, intervals: [300, 500, 1000] }).toBe(status)
  await gw.dispose()
  return (await testDb.nfseDocument.findUniqueOrThrow({ where: { billingInvoiceId: invoiceId } }))
}
const vencer = (id: string) => testDb.nfseDocument.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } })

test('fatura paga vira NFS-e emitida, uma só; renovação gera outra com o número seguinte; reembolso cancela', async () => {
  const org = await orgComTomador()
  const inv = await faturaPaga(org)
  const doc = await ate(inv.id, 'issued')
  expect(doc.chave).toMatch(/^\d{50}$/)
  expect(doc.numero).toMatch(/^\d+$/)
  expect(doc.ambiente).toBe('restrita')
  expect(doc.amountCents).toBe(9700)
  expect(doc.dpsId).toBe(`DPS4119509222629446000112${String(doc.serie).padStart(5, '0')}${String(doc.nDps).padStart(15, '0')}`)
  expect(doc.dpsXml).toContain('<tpAmb>2</tpAmb>')
  expect(doc.dpsXml).toContain('<toma><CNPJ>00000000000191</CNPJ><xNome>Cliente Teste Ltda</xNome><end><endNac><cMun>4106902</cMun><CEP>80010000</CEP></endNac>')
  expect(doc.dpsXml).toContain('<vServ>97.00</vServ>')
  expect(doc.dpsXml).toContain('plano Pro, assinatura mensal')
  expect(doc.dpsXml).toMatch(/<\/infDPS><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/)
  expect(doc.nfseXml).toContain(`<infNFSe Id="NFS${doc.chave}">`)
  expect(JSON.parse(doc.tomadorJson!)).toMatchObject({ tipo: 'CNPJ', documento: '00000000000191', nome: 'Cliente Teste Ltda' })

  // nova passada da fila não duplica
  const gw = await gatewayClient()
  await gw.post('/api/gateway/tick', { data: {} })
  expect(await testDb.nfseDocument.count({ where: { billingInvoiceId: inv.id } })).toBe(1)

  // renovação: outra nota, número de DPS maior
  const inv2 = await faturaPaga(org)
  const doc2 = await ate(inv2.id, 'issued')
  expect(doc2.nDps!).toBeGreaterThan(doc.nDps!)
  expect(doc2.chave).not.toBe(doc.chave)

  // reembolso da contratação: a nota é cancelada (evento 101101, motivo "serviço não prestado")
  await testDb.billingInvoice.update({ where: { id: inv.id }, data: { status: 'refunded' } })
  const cancelada = await ate(inv.id, 'canceled')
  expect(cancelada.eventoXml).toContain('<tpEvento>101101</tpEvento>')
  expect(cancelada.cancelMotivo).toBe('naoPrestado')
  expect(cancelada.canceledAt).toBeTruthy()
  // a outra nota segue emitida
  expect((await testDb.nfseDocument.findUniqueOrThrow({ where: { id: doc2.id } })).status).toBe('issued')
  await gw.dispose()
})

test('fatura paga antes de NFSE_DESDE e fatura não paga não geram nota', async () => {
  const org = await orgComTomador()
  const antiga = await faturaPaga(org, { paidAt: new Date('2019-12-31T12:00:00Z') })
  const pendente = await testDb.billingInvoice.create({ data: { organizationId: org, providerInvoiceId: `in_nfse_${uid()}${uid()}`, providerSubscriptionId: 'sub_x', amountCents: 9700, status: 'pending' } })
  const atual = await faturaPaga(org)
  await ate(atual.id, 'issued')
  expect(await testDb.nfseDocument.count({ where: { billingInvoiceId: { in: [antiga.id, pendente.id] } } })).toBe(0)
})

test('rejeição do governo fica como falha com o motivo; corrigido o dado, a nova tentativa emite', async () => {
  const org = await orgComTomador('Empresa NFSE-REJEITAR Ltda')
  const inv = await faturaPaga(org)
  const falhou = await ate(inv.id, 'failed')
  expect(falhou.lastError).toContain('E0000')
  expect(falhou.attempts).toBe(1)
  expect(falhou.nextAttemptAt.getTime()).toBeGreaterThan(Date.now()) // espera antes de tentar de novo
  const nDps = falhou.nDps

  // operador pede nova tentativa (zera as tentativas) depois de corrigir o cadastro
  await testDb.billingCustomer.update({ where: { organizationId: org }, data: { name: 'Empresa Corrigida Ltda' } })
  const op = await loginAs('platform@test.local')
  expect((await op.post(`/api/admin/nfse/${falhou.id}`, { data: { action: 'retry' } })).status()).toBe(200)
  const ok = await ate(inv.id, 'issued')
  expect(ok.nDps).toBe(nDps) // mesmo número reservado: DPS rejeitada não ocupa o número
  expect(ok.dpsXml).toContain('<xNome>Empresa Corrigida Ltda</xNome>')
  // retry em nota emitida não vale
  expect((await op.post(`/api/admin/nfse/${ok.id}`, { data: { action: 'retry' } })).status()).toBe(409)
  await op.dispose()
})

test('queda de rede depois do envio: a nova tentativa acha a nota pela DPS e não emite em dobro', async () => {
  const org = await orgComTomador('Empresa NFSE-QUEDA Ltda')
  const inv = await faturaPaga(org)
  const falhou = await ate(inv.id, 'failed')
  expect(falhou.lastError).toContain('Sem resposta do Sistema Nacional')
  await vencer(falhou.id)
  const ok = await ate(inv.id, 'issued')
  expect(ok.dpsId).toBe(falhou.dpsId)
  expect(ok.chave).toMatch(/^\d{50}$/)
  expect(ok.nfseXml).toContain(ok.chave!)
})

test('sem dados de quem paga: falha explicada; reembolsada antes de emitir, a nota é dispensada', async () => {
  const { email } = await signupOrg()
  const m = await testDb.organizationMember.findFirstOrThrow({ where: { email } })
  const inv = await faturaPaga(m.organizationId)
  const falhou = await ate(inv.id, 'failed')
  expect(falhou.lastError).toContain('Sem os dados de quem paga')
  await testDb.billingInvoice.update({ where: { id: inv.id }, data: { status: 'refunded' } })
  const dispensada = await ate(inv.id, 'skipped')
  expect(dispensada.chave).toBeNull()
})

test('cancelamento recusado fica como falha; operador cancela manualmente com motivo e baixa os XML', async () => {
  const org = await orgComTomador('Empresa NFSE-CANCEL-FALHA Ltda')
  const inv = await faturaPaga(org)
  const doc = await ate(inv.id, 'issued')
  const op = await loginAs('platform@test.local')

  // painel: configuração, contagem e a nota na lista (sem XML no JSON)
  const list = await (await op.get('/api/admin/nfse')).json()
  expect(list.config).toMatchObject({ enabled: true, ambiente: 'restrita', fake: true, cnpj: '22629446000112', municipio: '4119509' })
  expect(list.config.certificado.cnpj).toBe('22629446000112')
  const item = list.docs.find((d: { id: string }) => d.id === doc.id)
  expect(item).toMatchObject({ status: 'issued', chave: doc.chave, tomador: { nome: 'Empresa NFSE-CANCEL-FALHA Ltda', tipo: 'CNPJ' }, files: { dps: true, nfse: true, evento: false } })
  expect(JSON.stringify(item)).not.toContain('<Signature')
  expect(list.counts.issued).toBeGreaterThan(0)

  // XML para download
  const xml = await op.get(`/api/admin/nfse/${doc.id}/xml?tipo=nfse`)
  expect(xml.status()).toBe(200)
  expect(xml.headers()['content-type']).toContain('application/xml')
  expect(xml.headers()['content-disposition']).toContain(`${doc.chave}.xml`)
  expect(await xml.text()).toContain(doc.chave!)
  expect((await op.get(`/api/admin/nfse/${doc.id}/xml?tipo=evento`)).status()).toBe(404)

  // cancelamento manual: motivo validado
  expect((await op.post(`/api/admin/nfse/${doc.id}`, { data: { action: 'cancel', motivo: 'erro', texto: 'curto' } })).status()).toBe(400)
  expect((await op.post(`/api/admin/nfse/${doc.id}`, { data: { action: 'cancel', motivo: 'inventado', texto: 'Motivo comprido o bastante' } })).status()).toBe(400)
  expect((await op.post(`/api/admin/nfse/${doc.id}`, { data: { action: 'cancel', motivo: 'erro', texto: 'Nota emitida com valor errado' } })).status()).toBe(200)
  const recusado = await ate(inv.id, 'cancel_failed')
  expect(recusado.lastError).toContain('E0000')
  expect(recusado.cancelMotivo).toBe('erro')
  expect((await op.post(`/api/admin/nfse/${doc.id}`, { data: { action: 'retry' } })).status()).toBe(200)
  expect((await testDb.nfseDocument.findUniqueOrThrow({ where: { id: doc.id } })).attempts).toBe(0)
  // nota que não está emitida não pode ser cancelada de novo pelo painel
  expect((await op.post(`/api/admin/nfse/${doc.id}`, { data: { action: 'cancel', motivo: 'erro', texto: 'Nota emitida com valor errado' } })).status()).toBe(409)

  // fila agora pelo painel
  const run = await op.post('/api/admin/nfse', { data: { action: 'run' } })
  expect(run.status()).toBe(200)
  expect((await op.post('/api/admin/nfse', { data: { action: 'outra' } })).status()).toBe(400)
  await op.dispose()
})

test('admin de empresa cliente não vê nem mexe nas notas', async () => {
  const c = await loginAs('admin.a@test.local')
  expect((await c.get('/api/admin/nfse')).status()).toBe(403)
  expect((await c.post('/api/admin/nfse', { data: { action: 'run' } })).status()).toBe(403)
  await c.dispose()
})
