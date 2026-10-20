import { test, expect } from '@playwright/test'
import forge from 'node-forge'
import { buildCancel, buildDps, brDateTime, cleanText, dpsId, type DpsInput } from '../../src/lib/nfse/xml'
import { loadCertificate, signXml, verifyXml } from '../../src/lib/nfse/sign'
import { certificate, nfseConfig } from '../../src/lib/nfse/config'
import { gz64, mensagens, ungz64 } from '../../src/lib/nfse/client'
import { cancelavel, fimPrazoCancelamento, foraDoPrazo, mesCompetencia } from '../../src/lib/nfse/prazo'

// NFS-e Padrão Nacional: XML da DPS e do cancelamento, assinatura e configuração. O envio de verdade foi provado contra
// a produção restrita do governo (docs/operacao/nfse.md); aqui fica o que não depende de rede.

const base: DpsInput = {
  ambiente: 'restrita',
  dhEmi: new Date('2026-10-20T13:00:00Z'),
  serie: 1,
  nDps: 42,
  competencia: new Date('2026-10-20T12:00:00Z'),
  verAplic: 'AtendeRadar-1.0',
  prestador: { cnpj: '22.629.446/0001-12', municipio: '4119509' },
  tomador: { tipo: 'CNPJ', documento: '00.000.000/0001-91', nome: 'Cliente & Filhos <Ltda>', email: 'a@b.com', endereco: { ibge: '4106902', cep: '80010-000', logradouro: 'Rua XV', numero: '10', bairro: 'Centro' } },
  servico: { cTribNac: '010501', descricao: 'Licença — plano “Pro”' },
  valorCents: 9700,
  pTotTribSN: '6.00',
}
const fakeCfg = () => {
  const c = nfseConfig({ NFSE_AMBIENTE: 'restrita', NFSE_FAKE: '1', NFSE_DESDE: '2026-01-01', NFSE_CNPJ: '22629446000112', NFSE_MUNICIPIO: '4119509' })
  if (!c.ok) throw new Error(c.error)
  return c.cfg
}

test('Id da DPS: DPS + município + 2 (CNPJ) + CNPJ + série(5) + número(15), 45 caracteres', () => {
  const id = dpsId('4119509', '22629446000112', 1, 42)
  expect(id).toBe('DPS4119509222629446000112' + '00001' + '000000000000042')
  expect(id).toHaveLength(45)
})

test('DPS: uma linha, sem espaços entre tags, ordem do leiaute (com finNFSe da NT 009) e textos escapados', () => {
  const { id, xml } = buildDps(base)
  expect(xml).not.toMatch(/>\s+</)
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">')).toBe(true)
  expect(xml).toContain(`<infDPS Id="${id}">`)
  const ordem = ['tpAmb', 'dhEmi', 'verAplic', 'serie', 'nDPS', 'dCompet', 'tpEmit', 'finNFSe', 'cLocEmi', 'prest', 'toma', 'serv', 'valores']
  const pos = ordem.map((t) => xml.indexOf(`<${t}>`))
  expect(pos.every((p) => p > 0)).toBe(true)
  expect([...pos].sort((a, b) => a - b)).toEqual(pos)
  expect(xml).toContain('<tpAmb>2</tpAmb><dhEmi>2026-10-20T10:00:00-03:00</dhEmi>')
  expect(xml).toContain('<serie>1</serie><nDPS>42</nDPS>') // sem zeros à esquerda nos campos
  expect(xml).toContain('<CNPJ>00000000000191</CNPJ><xNome>Cliente &amp; Filhos &lt;Ltda&gt;</xNome>')
  expect(xml).toContain('<xDescServ>Licença - plano "Pro"</xDescServ>') // travessão e aspas tipográficas trocados
  expect(xml).toContain('<vServ>97.00</vServ>')
  expect(xml).toContain('<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>')
  // prestador ME/EPP com tpEmit=1: sem nome/endereço do prestador e sem alíquota
  expect(xml).not.toMatch(/<prest>.*<xNome>.*<\/prest>/)
  expect(xml).not.toContain('pAliq')
})

test('DPS recusa dados que o governo rejeitaria', () => {
  expect(() => buildDps({ ...base, serie: 50000 })).toThrow(/série/)
  expect(() => buildDps({ ...base, valorCents: 0 })).toThrow(/valor/)
  expect(() => buildDps({ ...base, tomador: { ...base.tomador, tipo: 'CPF', documento: '123' } })).toThrow(/tomador/)
  expect(() => buildDps({ ...base, servico: { ...base.servico, cTribNac: '1.05.01' } })).toThrow(/6 dígitos/)
})

test('horário de Brasília sem milissegundos e textos limpos', () => {
  expect(brDateTime(new Date('2026-01-01T02:30:45.999Z'))).toBe('2025-12-31T23:30:45-03:00')
  expect(cleanText('  a\u0007b\n\tc  ', 10)).toBe('a b c')
})

test('assinatura: RSA-SHA1, C14N inclusiva, Reference ao Id, Signature logo depois do infDPS; adulterar quebra', () => {
  const cert = certificate(fakeCfg())
  const { id, xml } = buildDps(base)
  const signed = signXml(xml, 'infDPS', cert)
  expect(verifyXml(signed, cert.certPem)).toBe(true)
  expect(signed).toContain('</infDPS><Signature xmlns="http://www.w3.org/2000/09/xmldsig#">')
  expect(signed).toContain(`<Reference URI="#${id}">`)
  expect(signed).toContain('Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"')
  expect(signed).toContain('<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>')
  expect(signed).toContain('<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>')
  expect(signed).toMatch(/<KeyInfo><X509Data><X509Certificate>[A-Za-z0-9+/=]+<\/X509Certificate><\/X509Data><\/KeyInfo>/)
  expect(signed).toMatch(/<\/Signature><\/DPS>$/)
  expect(verifyXml(signed.replace('<vServ>97.00</vServ>', '<vServ>1.00</vServ>'), cert.certPem)).toBe(false)
})

test('cancelamento: pedRegEvento com Id PRE+chave+101101, motivo de 15 a 255 caracteres, assinado', () => {
  const chave = '4'.repeat(50)
  const c = { ambiente: 'restrita' as const, dhEvento: base.dhEmi, verAplic: 'AtendeRadar-1.0', cnpj: '22629446000112', chave, motivo: 'naoPrestado' as const, texto: 'Reembolso integral ao cliente' }
  const { id, xml } = buildCancel(c)
  expect(id).toBe(`PRE${chave}101101`)
  expect(xml).toContain('<e101101><xDesc>Cancelamento de NFS-e</xDesc><cMotivo>2</cMotivo><xMotivo>Reembolso integral ao cliente</xMotivo></e101101>')
  const cert = certificate(fakeCfg())
  const signed = signXml(xml, 'infPedReg', cert)
  expect(verifyXml(signed, cert.certPem)).toBe(true)
  expect(signed).toContain('</infPedReg><Signature')
  expect(() => buildCancel({ ...c, texto: 'curto' })).toThrow(/15/)
  expect(() => buildCancel({ ...c, chave: '123' })).toThrow(/chave/)
})

test('certificado .p12: lê chave, certificado, CNPJ e validade; senha errada falha', () => {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '02'
  cert.validity.notBefore = new Date('2026-10-16T00:00:00Z')
  cert.validity.notAfter = new Date('2027-10-16T00:00:00Z')
  const attrs = [{ name: 'commonName', value: 'EMPRESA X LTDA:12345678000195' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'senha-teste', { algorithm: '3des' })
  const buf = Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary')
  const c = loadCertificate(buf, 'senha-teste')
  expect(c.cnpj).toBe('12345678000195')
  expect(c.titular).toBe('EMPRESA X LTDA')
  expect(c.validoAte.toISOString()).toBe('2027-10-16T00:00:00.000Z')
  expect(() => loadCertificate(buf, 'errada')).toThrow()
})

test('configuração: desligada por padrão, exige NFSE_DESDE, CNPJ e certificado; modo falso só na restrita', () => {
  expect(nfseConfig({})).toMatchObject({ ok: false, off: true })
  expect(nfseConfig({ NFSE_AMBIENTE: 'restrita' })).toMatchObject({ ok: false, off: false, error: expect.stringContaining('NFSE_DESDE') })
  const min = { NFSE_AMBIENTE: 'producao', NFSE_DESDE: '2026-11-03', NFSE_CNPJ: '22629446000112', NFSE_MUNICIPIO: '4119509' }
  expect(nfseConfig(min)).toMatchObject({ ok: false, error: expect.stringContaining('NFSE_CERT_FILE') })
  expect(nfseConfig({ ...min, NFSE_FAKE: '1' })).toMatchObject({ ok: false, error: expect.stringContaining('restrita') })
  const ok = nfseConfig({ ...min, NFSE_CERT_FILE: '/x.p12', NFSE_CERT_PASSWORD: 'y' })
  expect(ok.ok && ok.cfg).toMatchObject({ ambiente: 'producao', serie: 1, cTribNac: '010501', cNbs: '115062100', pTotTribSN: '6.00' })
  expect(nfseConfig({ ...min, NFSE_CERT_FILE: '/x.p12', NFSE_CERT_PASSWORD: 'y', NFSE_CNBS: '' })).toMatchObject({ ok: true, cfg: { cNbs: null } })
  expect(nfseConfig({ ...min, NFSE_CERT_FILE: '/x.p12', NFSE_CERT_PASSWORD: 'y', NFSE_CNBS: '1.1506.21' })).toMatchObject({ ok: false, error: expect.stringContaining('NFSE_CNBS') })
})

test('API: corpo em gzip+base64 e erros com chaves em maiúsculas ou minúsculas', () => {
  expect(ungz64(gz64('<a>ç</a>'))).toBe('<a>ç</a>')
  expect(mensagens({ erros: [{ Codigo: 'E0037', Descricao: 'x', Complemento: 'y' }] }, 'erros', 'erro')).toEqual([{ codigo: 'E0037', descricao: 'x', complemento: 'y' }])
  expect(mensagens({ erro: [{ codigo: 'E1831', descricao: 'z' }] }, 'erros', 'erro')).toEqual([{ codigo: 'E1831', descricao: 'z' }])
  expect(mensagens({ erro: { codigo: 'E2404', descricao: 'w' } }, 'erros', 'erro')).toEqual([{ codigo: 'E2404', descricao: 'w' }])
})

test('prazo de cancelamento: só dentro do mês de competência, no horário de Brasília', () => {
  // paga em 31/10 às 23:30 de Brasília (01/11 02:30 UTC): competência outubro, cancela até 31/10 23:59:59 de Brasília
  const comp = new Date('2026-11-01T02:30:00Z')
  expect(mesCompetencia(comp)).toBe('outubro/2026')
  expect(fimPrazoCancelamento(comp).toISOString()).toBe('2026-11-01T03:00:00.000Z')
  expect(cancelavel(comp, new Date('2026-11-01T02:59:59Z'))).toBe(true)
  expect(cancelavel(comp, new Date('2026-11-01T03:00:00Z'))).toBe(false)
  // paga em 01/11 00:10 de Brasília: competência novembro, cancela o mês todo
  const nov = new Date('2026-11-01T03:10:00Z')
  expect(mesCompetencia(nov)).toBe('novembro/2026')
  expect(cancelavel(nov, new Date('2026-11-30T23:00:00Z'))).toBe(true)
  expect(cancelavel(nov, new Date('2026-12-01T03:00:00Z'))).toBe(false)
  // virada de ano
  expect(fimPrazoCancelamento(new Date('2026-12-15T12:00:00Z')).toISOString()).toBe('2027-01-01T03:00:00.000Z')
  expect(foraDoPrazo(comp)).toContain('competência de outubro/2026')
})
