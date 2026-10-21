// Google Tag Manager e Consent Mode v2 (docs/operacao/medicao.md), no layout raiz: valem para o site e para o app.
// O padrão de consentimento vem ANTES do GTM: negado até a pessoa aceitar no aviso de cookies, ou o que ela já escolheu
// (cookie ar_consent). O GTM só carrega com um GTM_ID válido no servidor; as tags dele são configuradas pela ALC.

export function gtmId(raw = process.env.GTM_ID): string | null {
  const id = raw?.trim() ?? ''
  return /^GTM-[A-Z0-9]{4,12}$/.test(id) ? id : null
}

export const CONSENT_DEFAULT_SCRIPT =
  "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}" +
  "var c={};try{c=JSON.parse(decodeURIComponent((document.cookie.match(/(?:^|; )ar_consent=([^;]*)/)||[])[1]||'{}'))}catch(e){}" +
  "var a=c.analytics===true?'granted':'denied',d=c.ads===true?'granted':'denied';" +
  "gtag('consent','default',{analytics_storage:a,ad_storage:d,ad_user_data:d,ad_personalization:d,functionality_storage:'granted',security_storage:'granted',wait_for_update:500});" +
  "gtag('set','ads_data_redaction',d==='denied');" +
  "dataLayer.push({event:'consent_state',consent_analytics:a,consent_ads:d});" +
  // campanha da visita (utm_*, gclid, gbraid, wbraid, fbclid) no cookie próprio ar_attr, 90 dias, sem dado pessoal.
  // Aqui, antes de a página rodar: o app tira a query do endereço (?modo=cadastro) logo que abre.
  "try{var q=new URLSearchParams(location.search),v={},n=0;" +
  "['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid','fbclid'].forEach(function(k){var x=q.get(k);if(x){v[k]=x.slice(0,200);n++}});" +
  "if(n){v.landing=location.pathname.slice(0,200);v.at=new Date().toISOString();" +
  "document.cookie='ar_attr='+encodeURIComponent(JSON.stringify(v))+'; max-age='+90*86400+'; path=/'+" +
  "(/(^|\\.)atenderadar\\.com\\.br$/.test(location.hostname)?'; domain=.atenderadar.com.br':'')+'; samesite=lax'+(location.protocol==='https:'?'; secure':'')}}catch(e){}"

/** Snippet oficial do GTM, passando o nonce da CSP para o gtm.js (as tags HTML personalizadas herdam dele). */
export const gtmSnippet = (id: string) =>
  "(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});" +
  "var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;" +
  "j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;var n=d.querySelector('[nonce]');" +
  "n&&j.setAttribute('nonce',n.nonce||n.getAttribute('nonce'));f.parentNode.insertBefore(j,f);" +
  `})(window,document,'script','dataLayer',${JSON.stringify(id)});`
