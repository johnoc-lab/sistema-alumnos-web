# Diagnóstico y corrección de «Origen no permitido» en login

Fecha: 2 de noviembre de 2026. Proyecto: SistemaAlumnos-Web. Rama: feature/supabase-auth.

**Resultado:** defecto reproducido y corregido localmente. La política HTTP `no-referrer` hacía que el formulario POST nativo enviara literalmente `Origin: null`. La validación CSRF lo rechazaba correctamente. No se modificó el validador, el formulario, los handlers, la autorización ni ninguna variable privada.

## 1. Causa confirmada y alcance de la reproducción

El componente `src/features/auth/components/auth-form.tsx` renderiza un formulario HTML nativo, con `method="post"` y `action="/auth/login"`. No usa fetch, un Server Action ni un envío mediante JavaScript. El navegador codifica los campos como `application/x-www-form-urlencoded`.

El handler POST de `src/app/auth/login/route.ts` delega en `authPost(request, "login")`. Antes de leer el formulario o inicializar el SDK, `src/lib/auth/security.ts` exige:

- Método POST.
- APP_ORIGIN válido y coincidencia exacta del encabezado Origin.
- Sec-Fetch-Site ausente, same-origin o none; rechaza same-site y cross-site.

La cabecera global de `next.config.ts` era `Referrer-Policy: no-referrer`. En navegaciones POST de formularios nativos, esa política hace que Origin se serialice como null. No equivale a un encabezado ausente.

La regresión ejecutó Chromium instalado con un perfil temporal independiente y un servidor HTTP de pruebas en 127.0.0.1, con puerto efímero. Utilizó el componente AuthForm real, la configuración real de cabeceras y el handler authPost real, sustituyendo cookies y el cliente Supabase por simulaciones. El envío se produjo mediante requestSubmit del formulario nativo, sin construir Origin ni enviar los campos mediante fetch.

| Comprobación                         | Política anterior                 | Política corregida                    |
| ------------------------------------ | --------------------------------- | ------------------------------------- |
| Método y modo reales                 | POST, navigate                    | POST, navigate                        |
| Sec-Fetch-Site                       | same-origin                       | same-origin                           |
| Origin recibido                      | null                              | origen exacto del servidor de pruebas |
| Content-Type                         | application/x-www-form-urlencoded | application/x-www-form-urlencoded     |
| Respuesta al login simulado correcto | 403, sin llamar Auth              | 303 y GET a seleccionar-organizacion  |
| Referer                              | ausente                           | solo origen, sin ruta ni consulta     |

Antes de corregir la configuración, la nueva suite falló en siete comprobaciones que exigían la política compatible y los flujos posteriores; la reproducción del defecto anterior pasó. Después del cambio pasaron todas.

No se capturó la solicitud original del navegador del usuario ni se usó su contraseña. La causa está confirmada para el mismo formulario, cabecera HTTP y handler mediante reproducción independiente; no es una inferencia basada únicamente en un fetch manual.

El comportamiento está especificado por [WHATWG Fetch, append a request Origin header](https://fetch.spec.whatwg.org/#append-a-request-origin-header) y descrito en [MDN, efecto de Referrer-Policy sobre Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header).

## 2. Corrección y archivos de este diagnóstico

| Archivo                           | Cambio                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| next.config.ts                    | Sobrescritura final de Referrer-Policy a strict-origin para /login, /auth/:path*, /o/:path* y /seleccionar-organizacion.                               |
| tests/auth-browser-origin.test.ts | Nueva regresión de la política efectiva y cuatro casos con Chromium real: defecto anterior, login simulado correcto, credenciales rechazadas y logout. |
| tests/auth-handlers.test.ts       | Siete casos adicionales que mantienen los rechazos CSRF antes de leer el cuerpo o inicializar Auth.                                                    |
| DIAGNOSTICO_ORIGEN_LOGIN.md       | Diagnóstico, evidencia, resultados e instrucciones de repetición.                                                                                      |

La sobrescritura se coloca después de la regla global, porque Next.js aplica el último valor de una cabecera coincidente; véase [precedencia de cabeceras de Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers#header-overriding-behavior). La cabecera efectiva también se comprobó por HTTP en el servidor Next.js local.

strict-origin conserva Origin para estos POST y limita Referer al origen, sin incluir rutas ni parámetros que pudieran contener datos de recuperación o invitación. Conserva la supresión al pasar de HTTPS a HTTP. La política global no-referrer continúa aplicándose a la demo y al resto de páginas.

No se aceptan Origin ausente, null, comodines, localhost como alias de 127.0.0.1, otro puerto o un origen externo. No se agregó un fallback basado en Referer, Host o X-Forwarded-Host. La CSP form-action self permanece vigente.

## 3. Envío, redirecciones y errores

El método y action originales del formulario son adecuados; el problema estaba en la política de la página de origen.

- Credenciales aceptadas por Auth: 303 al destino permitido por safeNext, por defecto /seleccionar-organizacion. El navegador continúa con GET, sin reenviar el cuerpo POST.
- Credenciales rechazadas por Auth: 303 a /login?notice=credentials y mensaje genérico, sin reflejar detalles del proveedor.
- Origen rechazado: 403 JSON «Origen no permitido», antes de procesar credenciales; se mantiene este comportamiento de seguridad.
- Formulario con tipo o cuerpo inválido: 400 genérico según el handler; datos de email inválidos: 303 a /login?notice=invalid.
- Auth no configurado o función desactivada: se mantienen sus respuestas 503.
- GET /auth/login: 405; no inicia sesión mediante GET.

Login y logout siguen separados de recuperación e invitación. Las tres funciones desactivadas continúan cerradas. Identidad, perfil, organización, membresía y MFA conservan sus validaciones existentes.

## 4. Verificación completada

| Comando           | Resultado                                                              |
| ----------------- | ---------------------------------------------------------------------- |
| npm run test      | 134 pruebas aprobadas, 9 archivos; ninguna omitida en este equipo.     |
| npm run lint      | Correcto, sin advertencias.                                            |
| npm run typecheck | Correcto.                                                              |
| npm run build     | Correcto; compilación de producción y generación de rutas completadas. |

Se añadieron 16 comprobaciones a las 118 existentes: cinco de política de cabeceras, cuatro con Chromium y siete rechazos CSRF.

Las pruebas de navegador no requieren paquetes nuevos ni descargan navegadores. Buscan Chrome/Edge/Chromium instalado; también admiten AUTH_TEST_BROWSER con la ruta del ejecutable. Si no existe un navegador compatible, Vitest marca esos cuatro casos como omitidos: debe comprobarse esa condición en otros equipos o CI. En esta ejecución se utilizó Chrome y se ejecutaron los cuatro.

Para repetir solo la regresión:

```powershell
npx vitest run tests/auth-browser-origin.test.ts tests/auth-handlers.test.ts
```

Cada navegador usa un perfil temporal; no reutiliza cookies, sesión ni perfil personal. El fixture no registra cuerpos, contraseñas, cookies, tokens ni Authorization. Los valores de email y contraseña son ficticios y el SDK está simulado. La limpieza asíncrona contempla bloqueos transitorios de archivos en Windows.

### Comprobaciones HTTP en Next.js local

Sin cookies ni credenciales reales, en http://127.0.0.1:3000:

| Solicitud                                                        | Resultado observado                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| GET /login                                                       | 200, Referrer-Policy strict-origin.                                |
| GET /auth/recuperar                                              | 200, strict-origin; función cerrada según configuración existente. |
| GET /seleccionar-organizacion sin sesión                         | 307 a /login, strict-origin.                                       |
| GET /demo/o/incubadora/dashboard                                 | 200, no-referrer.                                                  |
| GET /auth/login                                                  | 405.                                                               |
| POST /auth/login sin Origin                                      | 403, no-store.                                                     |
| POST /auth/login con Origin null                                 | 403, no-store.                                                     |
| POST /auth/login con Origin localhost:3000                       | 403, no-store.                                                     |
| POST /auth/login con origen exacto y Sec-Fetch-Site cross-site   | 403, no-store.                                                     |
| POST /auth/login con origen exacto, same-origin y email inválido | 303 a http://127.0.0.1:3000/login?notice=invalid, no-store.        |

El último caso pasa CSRF y se detiene en validación de datos, sin intentar autenticar ninguna cuenta.

Se compararon huellas de .env.local, security.ts, módulos de identidad/autorización, cinco migraciones, páginas demo y fixtures. No cambiaron. También se verificaron los 20 archivos del proyecto Apps Script original contra su referencia previa, sin discrepancias.

No se crearon ni modificaron usuarios, organizaciones o datos Cloud. No hubo migraciones, seeds, servicios de correo, cambios en Vercel/GitHub, commit, push ni deploy. El login real contra Supabase queda para la repetición manual con la cuenta de prueba existente.

## 5. Cómo repetir la prueba de login real

1. En la terminal que ya ejecuta Next.js, detener el servidor con Ctrl+C y volver a ejecutar `npm run dev` desde SistemaAlumnos-Web. No cambiar .env.local.
2. Abrir una pestaña nueva en **http://127.0.0.1:3000/login**. Mantener ese host y puerto durante toda la prueba; localhost es un origen diferente.
3. Recargar la página. Si se comprueba con herramientas de desarrollo, la respuesta GET /login debe indicar Referrer-Policy: strict-origin. No reutilizar una página antigua cargada con no-referrer.
4. Introducir personalmente las credenciales de la cuenta de prueba existente. No copiarlas a esta conversación ni exportar HAR/cURL con datos de sesión.
5. Al enviar, POST /auth/login debe incluir Origin: http://127.0.0.1:3000 y Sec-Fetch-Site: same-origin. En un resultado ordinario de credenciales se espera 303 seguido de GET.
6. Con credenciales correctas, verificar la selección de organización o el estado de acceso pendiente. Una cuenta sin perfil y membresía válidos debe seguir sin acceso académico; no asignar roles para evitar esa comprobación. Los administradores siguen sujetos a MFA.
7. Con credenciales incorrectas, comprobar que regresa al login con el mensaje genérico. La recuperación y las invitaciones deben continuar ocultas y desactivadas.

Si persiste el 403, revisar únicamente URL, Origin, Sec-Fetch-Site y Referrer-Policy, sin compartir cookies, cuerpo del POST o Authorization. Si Origin sigue siendo null pese a la nueva cabecera, repetir en una pestaña normal de Chrome/Edge y comprobar si el visor integrado, un sandbox o una configuración de privacidad lo está alterando. Es una comprobación pendiente solo si el problema persiste; no se confirmó un segundo defecto y no se debe aceptar null para sortearlo.
