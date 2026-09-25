import { test, expect } from '@playwright/test'
import { anonymous } from './helpers'

// Cabeçalhos de segurança em páginas e APIs.
test.describe('Cabeçalhos de segurança', () => {
  for (const path of ['/', '/login', '/api/public/plans', '/reset-password']) {
    test(`${path} traz os cabeçalhos de proteção`, async () => {
      const anon = await anonymous()
      const h = (await anon.get(path)).headers()
      expect(h['x-frame-options']).toBe('DENY')
      expect(h['x-content-type-options']).toBe('nosniff')
      expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(h['permissions-policy']).toContain('camera=()')
      expect(h['strict-transport-security']).toContain('max-age=')
      await anon.dispose()
    })
  }
  test('o servidor não anuncia a tecnologia (x-powered-by)', async () => {
    const anon = await anonymous()
    expect((await anon.get('/')).headers()['x-powered-by']).toBeUndefined()
    await anon.dispose()
  })
})
