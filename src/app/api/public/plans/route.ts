import { NextResponse } from 'next/server'
import { publicPlans } from '@/lib/public-plans'

export async function GET() {
  return NextResponse.json({ plans: await publicPlans() })
}
