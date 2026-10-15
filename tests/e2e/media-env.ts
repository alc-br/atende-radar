import { join } from 'node:path'

// P7 / B5-B9 nos testes: pasta descartável das imagens enviadas (foto e logotipo) em .tmp/ e uma chave FIXA, só de
// teste, para o telefone cifrado (32 bytes em base64). Usado pelo playwright.config.ts (ambiente do servidor) e pelos
// testes que conferem o disco e o valor cifrado no banco. Produção: chave gerada no servidor (docs/operacao/telefone-cifrado.md).
const ROOT = join(__dirname, '..', '..')
export const UPLOADS_TEST_DIR = join(ROOT, '.tmp', 'uploads-e2e')
export const PHONE_ENC_TEST_KEY = 'ZTJlLXBob25lLWVuYy1rZXktbm90LWZvci1wcm9kISE=' // "e2e-phone-enc-key-not-for-prod!!"

export const MEDIA_TEST_ENV: Record<string, string> = {
  UPLOADS_DIR: UPLOADS_TEST_DIR,
  PHONE_ENC_KEY: PHONE_ENC_TEST_KEY,
}
