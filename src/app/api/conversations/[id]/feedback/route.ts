import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { guard, badRequest } from '@/lib/api-auth'
import { readJson } from '@/lib/json-body'

// Correções que o motor respeita na reanálise (B6)
const FEEDBACK_TYPES = ['intent', 'urgency', 'sentiment', 'stage', 'agent']

interface FeedbackBody {
  type: string
  previousValue?: string | null
  correctedValue: string
  justification: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guard('conversations.manage')
    if (!g.ok) return g.res
    const { id } = await params
    const j = await readJson<FeedbackBody>(request)
    if (!j.ok) return j.res
    const body = j.body
    const { type: rawType, previousValue, correctedValue, justification } = body

    // B6: valor anterior é opcional (corrigir uma intenção ou atendente que estava vazio é o caso mais comum)
    if (typeof rawType !== 'string' || !rawType || typeof correctedValue !== 'string' || !correctedValue) {
      return NextResponse.json(
        { error: 'type and correctedValue are required' },
        { status: 400 }
      )
    }
    if (previousValue != null && typeof previousValue !== 'string') return badRequest('previousValue inválido')

    const conversation = await db.conversation.findFirst({ where: { id, organizationId: g.auth.orgId } })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // "classification:<id>" (correção feita na classificação) vale como correção do tipo dela (intenção, sentimento…)
    let type = rawType
    let classificationId: string | null = null
    if (rawType.startsWith('classification:')) {
      classificationId = rawType.slice('classification:'.length)
      const c = await db.conversationClassification.findFirst({ where: { id: classificationId, conversationId: id }, select: { classificationType: true } })
      if (!c) return badRequest('classificação inválida')
      type = c.classificationType
    }
    if (!FEEDBACK_TYPES.includes(type)) return badRequest('tipo de correção inválido')

    if (type === 'agent' && !(await db.agent.findFirst({ where: { id: correctedValue, organizationId: g.auth.orgId }, select: { id: true } }))) {
      return badRequest('agente inválido')
    }

    // Create the feedback record
    const feedback = await db.classificationFeedback.create({
      data: {
        organizationId: conversation.organizationId,
        targetId: id,
        targetType: type,
        previousValue: previousValue ?? '',
        correctedValue,
        justification: justification || '',
      },
    })

    // Apply the correction to the conversation based on type
    const updateData: Record<string, unknown> = { updatedAt: new Date() }

    switch (type) {
      case 'intent':
        updateData.primaryIntent = correctedValue
        break
      case 'urgency':
        updateData.urgency = correctedValue
        break
      case 'sentiment':
        updateData.sentiment = correctedValue
        break
      case 'stage':
        updateData.inferredStage = correctedValue
        break
      case 'agent':
        updateData.agentId = correctedValue
        updateData.agentAttribution = 'manual' // P5: correção manual não é desfeita pelas identidades
        updateData.suggestedAgentId = null
        break
    }
    // A classificação do tipo corrigido fica marcada como corrigida (o motor não a reescreve na reanálise)
    if (type !== 'agent') {
      await db.conversationClassification.updateMany({
        where: classificationId ? { id: classificationId, conversationId: id } : { conversationId: id, classificationType: type },
        data: { label: correctedValue, reviewedStatus: 'corrected' },
      })
    }

    await db.conversation.update({
      where: { id },
      data: { ...updateData, needsAnalysisAt: new Date() },
    })

    return NextResponse.json({ success: true, feedback })
  } catch (error) {
    console.error('Conversation feedback error:', error)
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    )
  }
}
