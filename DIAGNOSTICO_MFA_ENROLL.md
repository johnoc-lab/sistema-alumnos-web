# Diagnóstico del error al iniciar MFA TOTP

Fecha: **5 de noviembre de 2026**, America/Lima. Rama: `feature/supabase-auth`.

**Estado: causa concreta todavía no identificada. No se modificó código funcional ni se aplicó una corrección especulativa.**

## Evidencia disponible

El usuario comunicó un intento único aproximadamente a las 10:17 Lima, después de cancelar el factor anterior. El formulario abrió /auth/mfa/enroll y devolvió el mensaje genérico de fallo MFA. El código HTTP y el estado posterior de la lista de factores no fueron confirmados: la respuesta recibida conserva esos campos como texto pendiente. No se revisaron eventos Auth Cloud desde Codex.

Se inspeccionó el registro local .next/dev/logs/next-development.log mediante un lector que solo emite categorías permitidas, sin reproducir sus líneas. El archivo consultado no aporta una traza que identifique la operación de este fallo. El handler tampoco registra la etapa interna ni el error del proveedor: su catch devuelve 503 sin información de diagnóstico.

## Comprobaciones del código

- El formulario usa POST /auth/mfa/enroll. La ruta exporta POST y delega en mfaPost; no inicia enrollment desde un GET.
- Origin y Fetch Metadata se validan antes de inicializar el cliente. El rechazo CSRF devuelve 403 y otro texto; una sesión inválida devuelve 401 y otro texto. Esto describe el código actual, no demuestra los encabezados recibidos en el intento real.
- El cliente SSR escribible obtiene las cookies por solicitud. Se comprueban identidad, perfil activo y membresía administrativa de una organización activa. No se exige aal2 antes del primer enrollment; el Panel y sus operaciones sí lo siguen exigiendo.
- Se vuelve a consultar el listado propio antes de crear un factor; un TOTP ya existente provoca redirección, no otro enrollment.
- La lectura inválida del formulario puede devolver el mensaje genérico con 400. La configuración no disponible, contexto no disponible, errores de listado/enroll, respuesta SDK inesperada, rechazo del QR o una excepción pueden terminar en el mismo mensaje con 503.

Por tanto, el JSON comunicado no permite atribuir el fallo a una rama concreta, ni afirmar que fue un problema de QR, sesión, configuración o Supabase.

## Pruebas locales realizadas

1. POST vacío con el adaptador instalado de Next.js y la implementación original de readFields, sobre un servidor loopback sin Auth: dos variantes aceptadas, HTTP 200, cuerpo presente y cero campos. No se reprodujo un fallo de lectura del formulario vacío; no hay justificación para alterar el formulario o CSRF por esa hipótesis.
2. Suites locales de MFA, integración MFA, proxy, sesión y seguridad: **154/154 pruebas aprobadas**, con Supabase simulado.
3. **npm run lint: aprobado.**
4. **npm run typecheck: aprobado.**

La evidencia auxiliar está en exports/mfa-enroll-diagnosis, ignorado por Git. Las pruebas simuladas no acreditan la respuesta que recibió el SDK durante el intento real.

## Factor pendiente y recuperación

Si el proveedor crea el factor y posteriormente falla la entrega/procesamiento del resultado —incluida la validación local del QR— puede quedar un TOTP unverified aunque el navegador muestre error. No debe deducirse que un error implica ausencia de factor.

La recuperación explícita ya implementada sigue disponible: consultar /auth/mfa y, si aparece un factor propio pendiente, cancelarlo mediante su botón antes de comenzar otro registro. El servidor reconsulta propiedad/estado, rechaza verified o ajenos y limpia el challenge. Ese recorrido está cubierto por pruebas locales; Codex no lo ejecutó con una cuenta real. No se añadió limpieza automática ni se intentó recuperar la semilla de un factor existente.

## Información indispensable pendiente

Sin repetir el enrollment:

1. Código HTTP real de la solicitud POST /auth/mfa/enroll ya efectuada, tomado de la terminal o de la pestaña Network. Solo el número; no headers ni contenido sensible.
2. Estado actual al abrir /auth/mfa: Configurar TOTP o Configuración pendiente. No pulsar de nuevo Configurar TOTP para obtener este dato.
3. Evento de Supabase Auth correspondiente al intervalo 10:16–10:18 Lima: método/ruta de /factors, estado HTTP y código de error, si existe. Compartir únicamente esos campos, nunca el cuerpo de un enrollment, QR, secreto, cookies o tokens.

Si el evento Auth confirma éxito, todavía será necesario distinguir el resultado recibido por el SDK de la validación local del QR. El código actual no conserva esa información. En ese caso se requeriría una instrumentación local de etapas y códigos estrictamente sanitizados antes de otro ensayo controlado; no se implementó anticipadamente ni se solicitó repetir un enrollment a ciegas.

## Alcance conservado

Sin operaciones Supabase Cloud, creación/eliminación de factores, modificación de usuarios, SQL, cambios académicos, RLS, .env.local, contraseñas o sesiones reales. No se debilitó CSRF ni aal2. No hubo commit, push o deploy.

Se entrega el diagnóstico incompleto de forma explícita y los datos concretos necesarios para continuar; no se declara una causa ni una corrección que no estén demostradas.