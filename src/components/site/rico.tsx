import { Fragment } from 'react'

/** **negrito** → <strong> (texto do próprio projeto). Usado nos artigos do site e na central de ajuda do painel. */
export function Rico({ x }: { x: string }) {
  return (
    <>
      {x.split(/\*\*(.+?)\*\*/g).map((parte, i) => (i % 2 ? <strong key={i}>{parte}</strong> : <Fragment key={i}>{parte}</Fragment>))}
    </>
  )
}
