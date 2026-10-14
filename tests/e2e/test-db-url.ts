import { join } from 'node:path'

// Banco descartável dos testes (prisma/test.db deste checkout), com caminho absoluto: com node_modules compartilhado
// (junção), "file:./test.db" seria resolvido junto do client gerado do outro checkout e duas execuções usariam o mesmo banco.
export const TEST_DB_URL = `file:${join(__dirname, '..', '..', 'prisma', 'test.db').replace(/\\/g, '/')}`
