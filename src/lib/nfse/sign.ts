// Certificado A1 (ICP-Brasil) e assinatura XMLDSig da DPS e do pedido de evento.
// Padrão do Sistema Nacional: assinatura envelopada sobre o elemento com Id, C14N 1.0 inclusiva, RSA-SHA1 e digest SHA1,
// <Signature> logo depois do elemento assinado e KeyInfo só com o certificado.
import { readFileSync } from 'node:fs'
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'

export interface Certificado {
  keyPem: string
  certPem: string
  certB64: string // DER em base64, sem cabeçalho, para o KeyInfo
  cnpj: string | null
  titular: string
  validoDe: Date
  validoAte: Date
}

/** Lê o .p12/.pfx com o node-forge, que aceita tanto o formato antigo (RC2/3DES) quanto o novo (AES). */
export function loadCertificate(pfx: Buffer, senha: string): Certificado {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary'))), false, senha)
  const keyBag =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]
  if (!keyBag?.key) throw new Error('certificado sem chave privada')
  const key = keyBag.key as forge.pki.rsa.PrivateKey
  // o arquivo pode trazer a cadeia junto: o certificado do titular é o que tem a mesma chave pública
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map((b) => b.cert!).filter(Boolean)
  const cert = certs.find((c) => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey
    return pub.n?.equals(key.n) && pub.e?.equals(key.e)
  })
  if (!cert) throw new Error('certificado do titular não encontrado no arquivo')
  const cn = String(cert.subject.getField('CN')?.value || '')
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(cert),
    certB64: forge.util.encode64(der),
    cnpj: /:(\d{14})\b/.exec(cn)?.[1] ?? null,
    titular: cn.split(':')[0] || cn,
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter,
  }
}

export function loadCertificateFile(file: string, senha: string): Certificado {
  return loadCertificate(readFileSync(file), senha)
}

const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'

/** Assina o elemento `tag` (que tem atributo Id) e devolve o XML com a <Signature> logo depois dele. */
export function signXml(xml: string, tag: 'infDPS' | 'infPedReg', cert: Certificado): string {
  const xpath = `//*[local-name(.)='${tag}']`
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: C14N,
    getKeyInfoContent: () => `<X509Data><X509Certificate>${cert.certB64}</X509Certificate></X509Data>`,
  })
  sig.addReference({
    xpath,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', C14N],
  })
  sig.computeSignature(xml, { location: { reference: xpath, action: 'after' } })
  return sig.getSignedXml()
}

/** Confere a assinatura de um XML assinado (usado nos testes e antes de enviar). */
export function verifyXml(signedXml: string, certPem: string): boolean {
  const m = /<Signature[\s\S]*<\/Signature>/.exec(signedXml)
  if (!m) return false
  const v = new SignedXml({ publicCert: certPem })
  v.loadSignature(m[0])
  return v.checkSignature(signedXml)
}
