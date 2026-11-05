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
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificación MFA</title><style>body{font:17px system-ui;background:#0c1724;color:#f0f5fa;margin:0;padding:32px}main{max-width:560px;margin:32px auto}p{line-height:1.6}a{color:#8de4f3}button,input{font:inherit;padding:12px;margin:10px 0}button{cursor:pointer}img{display:block;background:white;max-width:100%;width:280px;height:auto;padding:16px;margin:20px 0}input{display:block;max-width:220px}label{display:block}nav{margin-top:28px}</style></head><body><main id="main-content">' +
    body +
    '<nav><a href="/auth/mfa">Volver a seguridad</a> · <a href="/seleccionar-organizacion">Mis organizaciones</a></nav></main></body></html>'
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
