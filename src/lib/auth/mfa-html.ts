// HTML sin scripts. Todas las interpolaciones, incluido el data URI, se escapan.
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function document(body: string) {
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificación MFA</title><style>*{box-sizing:border-box}body{font:14px Arial,Helvetica,sans-serif;background:#f4f7f8;color:#192e3c;margin:0;line-height:1.6}header{background:#112f40;border-bottom:3px solid #278878;color:#fff;padding:15px 24px;display:flex;align-items:center;gap:12px}header strong{font-size:18px}header span{display:block;font-size:10px;letter-spacing:1.4px;color:#d5e7e9}main{width:calc(100% - 32px);max-width:540px;margin:24px auto;padding:26px 28px;background:#fff;border:1px solid #d8e2e6;border-radius:14px;box-shadow:0 8px 28px #12334709}h1{font-size:27px;letter-spacing:-.6px;line-height:1.25;margin:0 0 14px}p{color:#526674;margin:12px 0}a{color:#09685f;text-underline-offset:3px}button,input{font:inherit;min-height:44px;border-radius:7px}button{cursor:pointer;display:block;width:100%;border:1px solid #09685f;background:#09685f;color:#fff;padding:11px 14px;font-weight:600;margin:16px 0 8px}button:hover{background:#07564e}img{display:block;background:#fff;border:1px solid #d8e2e6;border-radius:10px;width:236px;height:auto;max-width:100%;padding:12px;margin:16px auto}label{display:grid;gap:8px;font-weight:600;margin-top:22px}input:not([type=hidden]){width:100%;max-width:260px;padding:12px;border:1px solid #7b9098;background:#fff;font-size:24px;letter-spacing:.3em;color:#192e3c}nav{display:flex;flex-wrap:wrap;gap:12px;border-top:1px solid #d8e2e6;margin-top:22px;padding-top:18px;font-size:12px}nav a{padding:8px 0}:focus-visible{outline:3px solid #137c91;outline-offset:3px}.skip{position:absolute;top:-80px;left:16px;padding:10px;background:#fff}.skip:focus{top:8px} @media(max-width:440px){main{padding:22px 18px;margin:18px auto}h1{font-size:24px}header{padding:14px 18px}nav{flex-direction:column;gap:4px}}</style></head><body><a class="skip" href="#main-content">Saltar al contenido</a><header><div><strong>Sistema Alumnos</strong><span>SEGURIDAD DE LA CUENTA</span></div></header><main id="main-content">' +
    body +
    '<nav><a href="/auth/mfa">Volver a seguridad</a><a href="/seleccionar-organizacion">Mis organizaciones</a></nav></main></body></html>'
  );
}
export function enrollmentHtml(qr: string, factorId: string) {
  return document(
    '<h1>Configura tu autenticador</h1><p>Escanea este QR con tu aplicación autenticadora personal. Contiene tu configuración privada; mantenlo fuera de capturas compartidas.</p><img alt="QR privado para configurar TOTP" src="' +
      escapeHtml(qr) +
      '"><p>Cuando lo hayas guardado, continúa para introducir el código. Este QR se muestra solo en este paso.</p><form action="/auth/mfa/challenge" method="post"><input type="hidden" name="factor_id" value="' +
      escapeHtml(factorId) +
      '"><button type="submit">Ya guardé el QR · verificar código</button></form>',
  );
}
export function challengeHtml(factorId: string, challengeId: string) {
  return document(
    '<h1>Verifica tu código</h1><p>Introduce el código actual de seis dígitos de tu autenticador.</p><form action="/auth/mfa/verify" method="post"><input type="hidden" name="factor_id" value="' +
      escapeHtml(factorId) +
      '"><input type="hidden" name="challenge_id" value="' +
      escapeHtml(challengeId) +
      '"><label>Código de verificación<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button type="submit">Verificar</button></form>',
  );
}
