/**
 * The page the captcha runs in: Cloudflare Turnstile, the same check the web
 * sign-up uses. It runs as soon as it loads and shows a box only when
 * Cloudflare needs a tap. The token (or a failure) goes back to the app with
 * `postMessage`. The page is served under the web app's origin so the site
 * key accepts it.
 */
export const CAPTCHA_ORIGIN = "https://app.zrzur.com";

export type CaptchaMessage =
  | { type: "token"; token: string }
  | { type: "error" }
  | { type: "expired" }
  /** Cloudflare needs a tap: the box has to be shown */
  | { type: "interactive" }
  | { type: "hidden" };

export function parseCaptchaMessage(data: string): CaptchaMessage | undefined {
  try {
    const value = JSON.parse(data) as Partial<CaptchaMessage> & { token?: unknown };
    if (value.type === "token" && typeof value.token === "string" && value.token) {
      return { type: "token", token: value.token };
    }
    if (value.type === "error" || value.type === "expired" || value.type === "interactive" || value.type === "hidden") {
      return { type: value.type };
    }
  } catch {
    // not ours
  }
  return undefined;
}

export function captchaPage(siteKey: string, language: string): string {
  // the key is the server's public site key; still, keep it to safe characters
  const key = siteKey.replace(/[^A-Za-z0-9_-]/g, "");
  const lang = language.replace(/[^a-z-]/gi, "") || "auto";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#171925;display:flex;justify-content:center;align-items:center;min-height:100%}</style>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer onload="start()" onerror="send({type:'error'})"></script>
</head><body><div id="box"></div>
<script>
function send(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m))}
var id;
function start(){
  id=turnstile.render('#box',{sitekey:'${key}',theme:'dark',language:'${lang}',appearance:'interaction-only',
    callback:function(t){send({type:'token',token:t})},
    'error-callback':function(){send({type:'error'})},
    'expired-callback':function(){send({type:'expired'})},
    'before-interactive-callback':function(){send({type:'interactive'})},
    'after-interactive-callback':function(){send({type:'hidden'})}});
}
window.resetCaptcha=function(){if(window.turnstile&&id!==undefined)turnstile.reset(id)};
</script></body></html>`;
}
