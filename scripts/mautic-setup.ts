// Organiza o AtendeRadar no Mautic (idempotente: cria só o que falta; nunca apaga nem mexe no que é de outro sistema).
//  · categoria "AtendeRadar";
//  · campos ar_* (preenchidos pelo sistema em src/lib/mautic.ts);
//  · tags de origem (atenderadar, atenderadar-membro, atenderadar-destinatario);
//  · segmentos "[AtendeRadar] …" (sempre com sistema_origem = atenderadar).
// Precisa de MAUTIC_URL/MAUTIC_USUARIO/MAUTIC_SENHA no ambiente. Nunca imprime credenciais.
//   bun scripts/mautic-setup.ts
import { MAUTIC_FIELDS, MAUTIC_SEGMENTS, MAUTIC_TAGS, MAUTIC_CATEGORY } from '../src/lib/mautic-catalog'

const url = process.env.MAUTIC_URL?.replace(/\/$/, '')
const user = process.env.MAUTIC_USUARIO
const pass = process.env.MAUTIC_SENHA
if (!url || !user || !pass) {
  console.log('mautic-setup: MAUTIC_URL/USUARIO/SENHA ausentes')
  process.exit(1)
}
const H = { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'Content-Type': 'application/json', accept: 'application/json' }

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(`${url}/api/${path}`, { ...init, headers: H })
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} → ${r.status} ${JSON.stringify(body.errors ?? body).slice(0, 300)}`)
  return body
}
const values = <T>(o: unknown) => Object.values((o as Record<string, T>) || {})

async function main() {
  // categoria
  const cats = values<{ id: number; title: string }>((await api('categories?limit=500')).categories)
  let cat = cats.find((c) => c.title === MAUTIC_CATEGORY.title)
  if (!cat) cat = (await api('categories/new', { method: 'POST', body: JSON.stringify({ ...MAUTIC_CATEGORY, bundle: 'global', isPublished: true }) })).category as { id: number; title: string }
  console.log(`categoria: ${cat.title} (#${cat.id})`)

  // campos
  const fields = values<{ alias: string }>((await api('fields/contact?limit=500')).fields)
  for (const f of MAUTIC_FIELDS) {
    if (fields.some((x) => x.alias === f.alias)) { console.log(`campo ${f.alias}: já existe`); continue }
    await api('fields/contact/new', { method: 'POST', body: JSON.stringify({ ...f, object: 'lead', group: 'core', isPublished: true, isListable: true, isShortVisible: false }) })
    console.log(`campo ${f.alias}: criado`)
  }

  // tags
  const tags = values<{ tag: string }>((await api('tags?limit=1000')).tags)
  for (const t of MAUTIC_TAGS) {
    if (tags.some((x) => x.tag === t.tag)) { console.log(`tag ${t.tag}: já existe`); continue }
    await api('tags/new', { method: 'POST', body: JSON.stringify(t) })
    console.log(`tag ${t.tag}: criada`)
  }

  // segmentos (filtro de tag no Mautic usa o id da tag, não o nome)
  const tagIds = new Map(values<{ id: number; tag: string }>((await api('tags?limit=1000')).tags).map((t) => [t.tag, String(t.id)]))
  const resolve = (fl: (typeof MAUTIC_SEGMENTS)[number]['filters'][number]) =>
    fl.type !== 'tags' ? fl : { ...fl, properties: { filter: (fl.properties.filter as string[]).map((t) => { const id = tagIds.get(t); if (!id) throw new Error(`tag ${t} sem id`); return id }) } }
  const segs = values<{ id: number; alias: string }>((await api('segments?limit=500')).lists)
  for (const s of MAUTIC_SEGMENTS) {
    const body = { name: s.name, alias: s.alias, description: s.description, isPublished: true, isGlobal: true, category: cat.id, filters: s.filters.map(resolve) }
    const existing = segs.find((x) => x.alias === s.alias)
    if (existing) {
      await api(`segments/${existing.id}/edit`, { method: 'PATCH', body: JSON.stringify(body) })
      console.log(`segmento ${s.name}: atualizado (#${existing.id})`)
    } else {
      const created = (await api('segments/new', { method: 'POST', body: JSON.stringify(body) })).list as { id: number }
      console.log(`segmento ${s.name}: criado (#${created.id})`)
    }
  }
}

main().catch((e) => {
  console.error(`mautic-setup: ${e instanceof Error ? e.message : 'erro'}`)
  process.exitCode = 1
})
