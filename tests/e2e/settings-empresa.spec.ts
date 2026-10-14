import { test, expect } from '@playwright/test'
import { loginAs, signupOrg } from './helpers'

// Configurações › Empresa: o "Nome empresarial" da tela é gravado (antes o campo aparecia e era descartado ao salvar).
test.describe('Configurações › Dados da empresa', () => {
  test('nome empresarial é salvo; vazio é recusado e não apaga o anterior', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)

    const ok = await admin.patch('/api/settings', { data: { name: '  Clínica Exemplo Ltda  ', displayName: 'Clínica Exemplo' } })
    expect(ok.status()).toBe(200)
    let org = (await (await admin.get('/api/settings')).json()).organization
    expect(org.name).toBe('Clínica Exemplo Ltda')
    expect(org.displayName).toBe('Clínica Exemplo')

    for (const name of ['', '   ', 'x', 123]) {
      const bad = await admin.patch('/api/settings', { data: { name } })
      expect(bad.status(), `nome ${JSON.stringify(name)}`).toBe(400)
    }
    org = (await (await admin.get('/api/settings')).json()).organization
    expect(org.name).toBe('Clínica Exemplo Ltda')
    await admin.dispose()
  })
})
