import { Fragment } from 'react'
import type { SystemTourBlock } from '@/lib/system-tour/types'

/** Texto com **negrito** (único realce usado no conteúdo do manual). */
export function Bold({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <Fragment key={i}>{p}</Fragment>))}
    </>
  )
}

export function StepBody({ blocks }: { blocks: SystemTourBlock[] }) {
  return (
    <>
      {blocks.map((b, i) =>
        typeof b === 'string' ? (
          <p key={i}>
            <Bold text={b} />
          </p>
        ) : (
          <ul key={i}>
            {b.list.map((item) => (
              <li key={item}>
                <Bold text={item} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  )
}
