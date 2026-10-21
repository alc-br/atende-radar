/*
 * Versão HTML (com o visual do AtendeRadar) de todo e-mail do sistema, montada a partir do texto.
 * Os modelos continuam escrevendo só texto (é o que fica no EmailOutbox e vai junto como versão texto); aqui:
 *  - parágrafos e quebras de linha viram HTML;
 *  - linha que termina num link do sistema vira botão (o texto antes do ":" fica como frase);
 *  - link de descadastro vira link discreto;
 *  - "Regra: …", "Gravidade: …" ficam com o rótulo em negrito; "• …" vira lista;
 *  - a assinatura "— AtendeRadar" sai (o rodapé tem a marca e os dados da empresa).
 * Layout em tabela, CSS inline e largura máxima de 600 px (Gmail, Outlook e celular).
 */

const BRAND = '#0e6b43'
const BRAND_DARK = '#0a5534'
const TEXT = '#1f2937'
const MUTED = '#6b7280'
const BG = '#f3f6f4'

const LEGAL = 'AL CHIPAK TREINAMENTOS E SERVIÇOS · CNPJ 22.629.446/0001-12'
const ADDRESS = 'Rua José Boganiko Sobrinho, 528 · Piraquara/PR · CEP 83306-296'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const URL_AT_END = /^(.*?)\s*(https?:\/\/\S+)$/
const isUnsubscribe = (url: string) => /\/descadastrar\b|unsubscribe/i.test(url)

/** Texto do botão conforme o destino do link. */
export function buttonLabel(url: string): string {
  if (/verify-email|confirm-email|confirmar-email/i.test(url)) return 'Confirmar e-mail'
  if (/reset-password|redefinir/i.test(url)) return 'Criar nova senha'
  if (/convite|invite/i.test(url)) return 'Aceitar convite'
  if (/#alerts\b/.test(url)) return 'Ver alertas'
  if (/#reports\b/.test(url)) return 'Ver relatórios'
  if (/#connections\b|#whatsapp\b/.test(url)) return 'Ver conexões'
  if (/#support\b|suporte/i.test(url)) return 'Abrir o chamado'
  if (/#admin\b/.test(url)) return 'Abrir no Admin'
  if (/#plans\b|#checkout\b/.test(url)) return 'Ver planos'
  if (/\/privacidade\b/.test(url)) return 'Ler a política'
  return 'Abrir no AtendeRadar'
}

const button = (url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px"><tr><td style="border-radius:8px;background:${BRAND}">` +
  `<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:12px 22px;font:600 15px/1.2 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;border-radius:8px;background:${BRAND}">${esc(buttonLabel(url))}</a>` +
  `</td></tr></table>` +
  `<p style="margin:0 0 18px;font:12px/1.5 Arial,Helvetica,sans-serif;color:${MUTED};word-break:break-all">Se o botão não abrir, copie o endereço: <a href="${esc(url)}" style="color:${BRAND_DARK}">${esc(url)}</a></p>`

const P = (html: string, extra = '') => `<p style="margin:0 0 14px;font:15px/1.6 Arial,Helvetica,sans-serif;color:${TEXT}${extra}">${html}</p>`

/** Uma linha de texto (sem link no fim) com o rótulo "Algo:" em negrito quando for um campo curto. */
function inline(line: string): string {
  const m = /^([^:•]{2,24}):\s+(.+)$/.exec(line)
  if (m && !/https?:/.test(m[1])) return `<strong>${esc(m[1])}:</strong> ${linkify(m[2])}`
  return linkify(line)
}

/** Links soltos no meio do texto. */
const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" style="color:${BRAND_DARK}">${u}</a>`)

function block(lines: string[]): string {
  const out: string[] = []
  let buf: string[] = []
  let list: string[] = []
  const flush = () => {
    if (buf.length) out.push(P(buf.join('<br>')))
    buf = []
  }
  const flushList = () => {
    if (list.length) out.push(`<ul style="margin:0 0 14px;padding-left:20px;font:15px/1.6 Arial,Helvetica,sans-serif;color:${TEXT}">${list.map((x) => `<li style="margin:0 0 4px">${x}</li>`).join('')}</ul>`)
    list = []
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (/^[•\-*]\s+/.test(line)) {
      flush()
      list.push(inline(line.replace(/^[•\-*]\s+/, '')))
      continue
    }
    flushList()
    const m = URL_AT_END.exec(line)
    if (m && isUnsubscribe(m[2])) {
      flush()
      out.push(`<p style="margin:0 0 10px;font:12px/1.5 Arial,Helvetica,sans-serif;color:${MUTED}">${esc(m[1].replace(/[:\s]+$/, ''))} <a href="${esc(m[2])}" style="color:${MUTED};text-decoration:underline">Descadastrar</a></p>`)
    } else if (m) {
      if (m[1]) buf.push(esc(m[1]))
      flush()
      out.push(button(m[2]))
    } else {
      buf.push(inline(line))
    }
  }
  flush()
  flushList()
  return out.join('')
}

/** Versão HTML de um e-mail do sistema (o texto é a fonte; ver o comentário do arquivo). */
export function mailHtml(subject: string, text: string): string {
  const body = text
    .replace(/\r\n/g, '\n')
    .replace(/\n*[—–-]\s*AtendeRadar\s*$/, '')
    .trim()
  const blocks = body.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim()))
  const content = blocks.filter((b) => b.length).map(block).join('')
  const preheader = esc(body.split('\n').find((l) => l.trim() && !/^\[/.test(l))?.trim().slice(0, 140) ?? '')

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e9e5">
<tr><td style="background:${BRAND};padding:18px 28px"><span style="font:700 20px/1 Arial,Helvetica,sans-serif;color:#ffffff;letter-spacing:.2px">Atende<span style="color:#9be8c2">Radar</span></span></td></tr>
<tr><td style="padding:28px 28px 12px">${content}</td></tr>
<tr><td style="padding:18px 28px 24px;border-top:1px solid #edf1ee;font:12px/1.6 Arial,Helvetica,sans-serif;color:${MUTED}">
E-mail automático do AtendeRadar. Dúvidas: <a href="mailto:contato@atenderadar.com.br" style="color:${MUTED}">contato@atenderadar.com.br</a><br>${esc(LEGAL)}<br>${esc(ADDRESS)}
</td></tr>
</table></td></tr></table></body></html>`
}
