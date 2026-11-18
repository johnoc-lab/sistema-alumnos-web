import { mfaUrl } from "./security";

// HTML sin scripts. Todas las interpolaciones, incluido el data URI, se escapan.
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const hiddenDestination = (next: string) =>
  '<input type="hidden" name="next" value="' + escapeHtml(next) + '">';

const pageStyles = `
  * { box-sizing: border-box; }
  body {
    font: 14px Arial, Helvetica, sans-serif;
    background: #f7f4ee;
    color: #2c3159;
    margin: 0;
    line-height: 1.6;
  }
  header {
    background: #2c3159;
    border-bottom: 3px solid #d78133;
    color: #fff;
    padding: 15px 24px;
  }
  header strong { font-size: 18px; }
  header span {
    display: block;
    font-size: 10px;
    letter-spacing: 1.4px;
    color: #e9ebef;
  }
  main {
    width: calc(100% - 32px);
    max-width: 540px;
    margin: 24px auto;
    padding: 26px 28px;
    background: #fff;
    border: 1px solid #b9c1cc;
    border-radius: 14px;
    box-shadow: 0 8px 28px #2c31590d;
  }
  h1 { font-size: 27px; letter-spacing: -.6px; line-height: 1.25; margin: 0 0 14px; }
  p { color: #545b78; margin: 12px 0; }
  a { color: #2c3159; text-underline-offset: 3px; }
  button, input { font: inherit; min-height: 44px; border-radius: 7px; }
  button {
    cursor: pointer;
    display: block;
    width: 100%;
    border: 1px solid #2c3159;
    background: #2c3159;
    color: #fff;
    padding: 11px 14px;
    margin: 16px 0 8px;
  }
  button:hover { background: #232747; }
  img {
    display: block;
    background: #fff;
    border: 1px solid #b9c1cc;
    border-radius: 10px;
    width: 236px;
    height: auto;
    max-width: 100%;
    padding: 12px;
    margin: 16px auto;
  }
  label { display: grid; gap: 8px; font-weight: 600; margin-top: 22px; }
  input:not([type=hidden]) {
    width: 100%;
    max-width: 260px;
    padding: 12px;
    border: 1px solid #545b78;
    background: #fff;
    font-size: 24px;
    letter-spacing: .3em;
    color: #2c3159;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    border-top: 1px solid #b9c1cc;
    margin-top: 22px;
    padding-top: 10px;
    font-size: 13px;
  }
  nav a { padding: 10px 0; }
  :focus-visible { outline: 3px solid #2c3159; outline-offset: 3px; }
  .skip { position: absolute; left: 16px; padding: 10px; background: #fff; }
  .skip:not(:focus) { transform: translateY(-120%); }
  @media (max-width: 440px) {
    main { padding: 22px 18px; margin: 18px auto; }
    h1 { font-size: 24px; }
    header { padding: 14px 18px; }
  }
`;

function document(body: string, next: string) {
  return (
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificación MFA</title><style>' +
    pageStyles +
    '</style></head><body><a class="skip" href="#main-content">Saltar al contenido</a><header><div><strong>Sistema Alumnos</strong><span>SEGURIDAD DE LA CUENTA</span></div></header><main id="main-content">' +
    body +
    '<nav><a href="' +
    escapeHtml(mfaUrl(next)) +
    '">Volver a seguridad</a><a href="/seleccionar-organizacion">Mis organizaciones</a></nav></main></body></html>'
  );
}
export function enrollmentHtml(
  qr: string,
  factorId: string,
  next = "/seleccionar-organizacion",
) {
  return document(
    '<h1>Configura tu autenticador</h1><p>Escanea este QR con tu aplicación autenticadora personal. Contiene tu configuración privada; mantenlo fuera de capturas compartidas.</p><img alt="QR privado para configurar TOTP" src="' +
      escapeHtml(qr) +
      '"><p>Cuando lo hayas guardado, continúa para introducir el código. Este QR se muestra solo en este paso.</p><form action="/auth/mfa/challenge" method="post"><input type="hidden" name="factor_id" value="' +
      escapeHtml(factorId) +
      '">' +
      hiddenDestination(next) +
      '<button type="submit">Ya guardé el QR · verificar código</button></form>',
    next,
  );
}
export function challengeHtml(
  factorId: string,
  challengeId: string,
  next = "/seleccionar-organizacion",
) {
  return document(
    '<h1>Verifica tu código</h1><p>Introduce el código actual de seis dígitos de tu autenticador.</p><form action="/auth/mfa/verify" method="post"><input type="hidden" name="factor_id" value="' +
      escapeHtml(factorId) +
      '"><input type="hidden" name="challenge_id" value="' +
      escapeHtml(challengeId) +
      '">' +
      hiddenDestination(next) +
      '<label>Código de verificación<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required></label><button type="submit">Verificar</button></form>',
    next,
  );
}
