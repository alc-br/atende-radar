// Cenário de teste multi-organização. Roda SÓ contra o banco descartável (prisma/test.db), depois do seed padrão.
//   Org A = organização do seed (org_seed_1, OdontoVida) com um usuário para cada um dos 7 papéis
//   Org B = "Clínica B", com dados próprios, para provar que uma não enxerga a outra
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/passwords'

const db = new PrismaClient()

const ROLES = ['admin', 'gestor', 'supervisor', 'analista', 'member', 'atendente', 'viewer'] as const

async function main() {
  if (!(process.env.DATABASE_URL || '').includes('test.db')) {
    throw new Error('seed-test-orgs só pode rodar contra prisma/test.db')
  }

  // ---------- Org A: um usuário por papel ----------
  for (const role of ROLES) {
    await db.organizationMember.create({
      data: {
        id: `member_a_${role}`, organizationId: 'org_seed_1', userId: `${role}.a@test.local`,
        name: `${role} A`, email: `${role}.a@test.local`, role, status: 'active',
      },
    })
  }
  // Operador da plataforma (definido por PLATFORM_ADMIN_EMAILS no ambiente de teste)
  await db.organizationMember.create({
    data: { id: 'member_platform', organizationId: 'org_seed_1', userId: 'platform@test.local', name: 'Operador', email: 'platform@test.local', role: 'gestor', status: 'active' },
  })

  // Atendente A tem agente próprio + uma conversa própria (as demais conversas do seed são de outros agentes)
  const agentAtt = await db.agent.create({
    data: { id: 'agent_a_att', organizationId: 'org_seed_1', name: 'Atendente A', email: 'atendente.a@test.local', role: 'atendente', team: 'Recepção' },
  })
  const contactA = await db.contact.create({ data: { id: 'contact_a_own', organizationId: 'org_seed_1', displayName: 'Cliente do Atendente A', phoneLast4: '0001' } })
  await db.conversation.create({
    data: { id: 'conv_a_own', organizationId: 'org_seed_1', contactId: contactA.id, agentId: agentAtt.id, operationalStatus: 'waiting_company' },
  })
  await db.alert.create({ data: { id: 'alert_a_own', organizationId: 'org_seed_1', conversationId: 'conv_a_own', title: 'Alerta do atendente A', status: 'new' } })
  await db.recoveryItem.create({ data: { id: 'rec_a_own', organizationId: 'org_seed_1', conversationId: 'conv_a_own', agentId: agentAtt.id, customerName: 'Cliente do Atendente A' } })

  // ---------- Org B ----------
  await db.organization.create({
    data: { id: 'org_b', name: 'Clinica B', displayName: 'Clínica B', segment: 'clinica_odontologica' },
  })
  const plan = await db.plan.findFirst()
  if (plan) await db.subscription.create({ data: { id: 'sub_b', organizationId: 'org_b', planId: plan.id } })

  for (const role of ['admin', 'gestor', 'atendente'] as const) {
    await db.organizationMember.create({
      // Org B é um cliente "real": tem senha própria (só a org de demonstração aceita a senha pública demo123)
      data: { id: `member_b_${role}`, organizationId: 'org_b', userId: `${role}.b@test.local`, name: `${role} B`, email: `${role}.b@test.local`, role, status: 'active', passwordHash: hashPassword('demo123') },
    })
  }
  // membro da Org B sem senha (ex.: cadastro legado): não pode entrar com a senha pública de demonstração
  await db.organizationMember.create({
    data: { id: 'member_b_nohash', organizationId: 'org_b', userId: 'semsenha.b@test.local', name: 'Sem senha B', email: 'semsenha.b@test.local', role: 'gestor', status: 'active' },
  })
  await db.whatsAppConnection.create({ data: { id: 'conn_b', organizationId: 'org_b', name: 'Conexão B', phoneNumber: '+5511900000002', phoneLast4: '0002', status: 'connected' } })
  const agentB = await db.agent.create({ data: { id: 'agent_b', organizationId: 'org_b', name: 'Agente B', email: 'agente@clinicab.test', team: 'Equipe B' } })
  await db.contact.create({ data: { id: 'contact_b', organizationId: 'org_b', displayName: 'Cliente Secreto B', phoneLast4: '9999' } })
  await db.conversation.create({
    data: { id: 'conv_b', organizationId: 'org_b', connectionId: 'conn_b', contactId: 'contact_b', agentId: agentB.id, operationalStatus: 'waiting_company', potentialValue: 5000 },
  })
  await db.message.create({ data: { id: 'msg_b', conversationId: 'conv_b', direction: 'inbound', text: 'MENSAGEM CONFIDENCIAL DA CLINICA B' } })
  await db.auditFinding.create({ data: { id: 'finding_b', conversationId: 'conv_b', type: 'no_response' } })
  await db.openQuestion.create({ data: { id: 'oq_b', conversationId: 'conv_b', sourceMessage: 'pergunta B' } })
  await db.promise.create({ data: { id: 'promise_b', conversationId: 'conv_b', sourceMessage: 'promessa B', promisorAgent: 'Agente B', action: 'ligar' } })
  await db.alert.create({ data: { id: 'alert_b', organizationId: 'org_b', conversationId: 'conv_b', title: 'Alerta secreto B', status: 'new' } })
  await db.alertRule.create({ data: { id: 'rule_b', organizationId: 'org_b', name: 'Regra secreta B', type: 'no_response' } })
  await db.recoveryItem.create({ data: { id: 'rec_b', organizationId: 'org_b', conversationId: 'conv_b', agentId: agentB.id, customerName: 'Cliente Secreto B' } })
  await db.notification.create({ data: { id: 'notif_b', organizationId: 'org_b', type: 'alert', title: 'Notificação secreta B' } })
  await db.team.create({ data: { id: 'team_b', organizationId: 'org_b', name: 'Equipe B', code: 'EQB' } })
  await db.reportDefinition.create({ data: { id: 'rdef_b', organizationId: 'org_b', reportType: 'daily', name: 'Diário B' } })
  await db.reportRun.create({ data: { id: 'run_b', organizationId: 'org_b', reportType: 'daily' } })
}

main().finally(() => db.$disconnect())
