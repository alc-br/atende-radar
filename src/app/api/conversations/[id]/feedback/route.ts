import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface FeedbackBody {
  type: string
  previousValue: string
  correctedValue: string
  justification: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json()) as FeedbackBody
    const { type, previousValue, correctedValue, justification } = body

    if (!type || !previousValue || !correctedValue) {
      return NextResponse.json(
        { error: 'type, previousValue, and correctedValue are required' },
        { status: 400 }
      )
    }

    const conversation = await db.conversation.findUnique({ where: { id } })
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Create the feedback record
    const feedback = await db.classificationFeedback.create({
      data: {
        organizationId: conversation.organizationId,
        targetId: id,
        targetType: type,
        previousValue,
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
      default:
        // For classification types, mark the classification as reviewed
        if (correctedValue && type.startsWith('classification:')) {
          const classId = type.replace('classification:', '')
          await db.conversationClassification.update({
            where: { id: classId },
            data: {
              label: correctedValue,
              reviewedStatus: 'corrected',
            },
          }).catch(() => {
            // Classification might not exist
          })
        }
    }

    await db.conversation.update({
      where: { id },
      data: updateData,
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
