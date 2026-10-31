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

  test('P7 · fotos do perfil e logotipos (UPLOADS_DIR) também entram no backup, com a mesma retenção', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ar-backup-'))
    const up = mkdtempSync(join(tmpdir(), 'ar-uploads-'))
    try {
      mkdirSync(join(up, 'org1'))
      writeFileSync(join(up, 'org1', 'logo'), 'imagem-de-teste')
      for (let i = 0; i < 3; i++) {
        execFileSync('bun', ['scripts/backup-db.ts'], {
          env: { ...process.env, DATABASE_URL: 'file:./test.db', BACKUP_DIR: dir, BACKUP_KEEP: '2', UPLOADS_DIR: up },
          encoding: 'utf-8',
          shell: process.platform === 'win32',
        })
      }
      const copies = readdirSync(dir).filter((f) => f.startsWith('uploads-'))
      expect(copies).toHaveLength(2)
      expect(readFileSync(join(dir, copies[0], 'org1', 'logo'), 'utf-8')).toBe('imagem-de-teste')
    } finally {
      rmSync(dir, { recursive: true, force: true })
      rmSync(up, { recursive: true, force: true })
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

// F8 · CRM comercial: o backup leva as tabelas Crm* e o ensaio de restauração (deploy.yml) as confere.
// Tudo numa cópia parada do banco de teste: ninguém mais grava nela, então as contagens não correm contra outros testes.
function bunScript(script: string, env: Record<string, string>) {
  return execFileSync('bun', [script], { env: { ...process.env, ...env }, encoding: 'utf-8', shell: process.platform === 'win32' })
}

function frozenCopy(): { dir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ar-congelado-'))
  runBackup(dir, 5)
  return { dir, url: `file:${join(dir, readdirSync(dir)[0]).replace(/\\/g, '/')}` }
}

async function crmCounts(url: string): Promise<Record<string, number>> {
  const p = new PrismaClient({ datasources: { db: { url } } })
  try {
    const tables = await p.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'Crm*' ORDER BY name")
    const out: Record<string, number> = {}
    for (const t of tables) out[t.name] = Number((await p.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${t.name}"`))[0].n)
    return out
  } finally {
    await p.$disconnect()
  }
}

test.describe('F8 · backup e restauração do CRM', () => {
  test('as 16 tabelas do CRM voltam do backup com as mesmas contagens e o app lê o funil restaurado', async () => {
    const frozen = frozenCopy()
    const dir = mkdtempSync(join(tmpdir(), 'ar-backup-'))
    try {
      // dados do CRM garantidos na cópia: o teste não depende de os testes do CRM já terem rodado
      const p = new PrismaClient({ datasources: { db: { url: frozen.url } } })
      const org = await p.organization.findFirstOrThrow({ select: { id: true } })
      await p.crmTenantLink.upsert({ where: { organizationId: org.id }, create: { organizationId: org.id, status: 'active' }, update: {} })
      await p.crmFeatureState.upsert({
        where: { organizationId_flag: { organizationId: org.id, flag: 'crm.enabled' } },
        create: { organizationId: org.id, flag: 'crm.enabled', enabled: true },
        update: {},
      })
      const pipe = await p.crmPipeline.create({
        data: {
          organizationId: org.id,
          name: 'Funil do ensaio',
          stages: { create: [{ organizationId: org.id, name: 'Etapa A', position: 0 }, { organizationId: org.id, name: 'Etapa B', position: 1 }] },
        },
      })
      await p.crmCompany.create({ data: { organizationId: org.id, name: 'Empresa do ensaio', nameNorm: 'empresa do ensaio' } })
      await p.$disconnect()
      const before = await crmCounts(frozen.url)

      bunScript('scripts/backup-db.ts', { DATABASE_URL: frozen.url, BACKUP_DIR: dir })
      const out = bunScript('scripts/restore-drill.ts', { DATABASE_URL: frozen.url, BACKUP_DIR: dir })
      const line = out.split(/\r?\n/).find((l) => l.startsWith('restore-drill: crm {'))
      expect(line, out).toBeTruthy()
      const restored = JSON.parse(line!.slice('restore-drill: crm '.length)) as Record<string, number>

      expect(Object.keys(restored)).toHaveLength(16)
      expect(restored).toEqual(before)
      for (const t of ['CrmTenantLink', 'CrmFeatureState', 'CrmPipeline', 'CrmStage', 'CrmCompany']) expect(restored[t], t).toBeGreaterThan(0)

      // o backup abre com o mesmo Prisma do app e o funil volta com as etapas na ordem
      const backupFile = readdirSync(dir).find((f) => f.endsWith('.db'))!
      const bk = new PrismaClient({ datasources: { db: { url: `file:${join(dir, backupFile).replace(/\\/g, '/')}` } } })
      const back = await bk.crmPipeline.findUnique({ where: { id: pipe.id }, include: { stages: { orderBy: { position: 'asc' } } } })
      await bk.$disconnect()
      expect(back?.name).toBe('Funil do ensaio')
      expect(back?.stages.map((s) => s.name)).toEqual(['Etapa A', 'Etapa B'])
    } finally {
      rmSync(frozen.dir, { recursive: true, force: true })
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('backup de antes da migração do CRM (primeiro deploy): o ensaio passa e avisa que o CRM está ausente', async () => {
    const frozen = frozenCopy()
    const dir = mkdtempSync(join(tmpdir(), 'ar-backup-'))
    try {
      // tira as tabelas Crm* da cópia, como no banco de produção antes da migração 20261031120000_crm_base
      const url = `${frozen.url}?connection_limit=1`
      const p = new PrismaClient({ datasources: { db: { url } } })
      await p.$executeRawUnsafe('PRAGMA foreign_keys=OFF')
      const tables = await p.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'Crm*'")
      for (const t of tables) await p.$executeRawUnsafe(`DROP TABLE "${t.name}"`)
      await p.$disconnect()
      expect(Object.keys(await crmCounts(frozen.url))).toHaveLength(0)

      bunScript('scripts/backup-db.ts', { DATABASE_URL: frozen.url, BACKUP_DIR: dir })
      const out = bunScript('scripts/restore-drill.ts', { DATABASE_URL: frozen.url, BACKUP_DIR: dir })
      expect(out).toContain('restore-drill: crm ausente')
    } finally {
      rmSync(frozen.dir, { recursive: true, force: true })
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
