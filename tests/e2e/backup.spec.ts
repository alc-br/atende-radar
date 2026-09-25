import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

// B10 · backup do banco: a cópia é consistente, restaurável e a retenção funciona.
function runBackup(dir: string, keep: number) {
  return execFileSync('bun', ['scripts/backup-db.ts'], {
    env: { ...process.env, DATABASE_URL: 'file:./test.db', BACKUP_DIR: dir, BACKUP_KEEP: String(keep) },
    encoding: 'utf-8',
    shell: process.platform === 'win32', // bun é um .cmd no Windows
  })
}

test.describe('B10 · backup do banco', () => {
  test('a cópia abre como banco de verdade e contém os dados', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ar-backup-'))
    try {
      runBackup(dir, 5)
      const files = readdirSync(dir)
      expect(files).toHaveLength(1)
      const restored = new PrismaClient({ datasources: { db: { url: `file:${join(dir, files[0]).replace(/\\/g, '/')}` } } })
      const orgs = await restored.organization.count()
      const members = await restored.organizationMember.count()
      await restored.$disconnect()
      expect(orgs).toBeGreaterThanOrEqual(2) // Org A (seed) + Org B (teste)
      expect(members).toBeGreaterThan(10)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('retenção: mantém só os N backups mais recentes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ar-backup-'))
    try {
      for (let i = 0; i < 4; i++) runBackup(dir, 2)
      expect(readdirSync(dir).filter((f) => f.endsWith('.db'))).toHaveLength(2)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('as sessões do WhatsApp também entram no backup (e só se existirem)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ar-backup-'))
    const wa = mkdtempSync(join(tmpdir(), 'ar-wa-'))
    try {
      mkdirSync(join(wa, 'conn1'))
      writeFileSync(join(wa, 'conn1', 'creds.json'), '{"fake":"credencial"}')
      execFileSync('bun', ['scripts/backup-db.ts'], {
        env: { ...process.env, DATABASE_URL: 'file:./test.db', BACKUP_DIR: dir, WA_SESSIONS_DIR: wa },
        encoding: 'utf-8',
        shell: process.platform === 'win32',
      })
      const copies = readdirSync(dir).filter((f) => f.startsWith('wa-sessions-'))
      expect(copies).toHaveLength(1)
      expect(readFileSync(join(dir, copies[0], 'conn1', 'creds.json'), 'utf-8')).toContain('credencial')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(wa, { recursive: true, force: true })
    }
  })

  test('sem banco ainda (primeiro deploy) não é erro', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ar-backup-'))
    try {
      const out = execFileSync('bun', ['scripts/backup-db.ts'], {
        env: { ...process.env, DATABASE_URL: 'file:./nao-existe.db', BACKUP_DIR: dir },
        encoding: 'utf-8',
    shell: process.platform === 'win32', // bun é um .cmd no Windows
      })
      expect(out).toContain('nada a copiar')
      expect(readdirSync(dir)).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
