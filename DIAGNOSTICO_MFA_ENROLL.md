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
## Actualización: instrumentación temporal del enrollment

Fecha de referencia: **5 de noviembre de 2026**. Se incorpora diagnóstico, no una corrección de la causa. El usuario comunica que después del fallo reaparece un factor unverified; esto no permite identificar todavía si falló el retorno del SDK, el QR o la respuesta HTML. Codex no ejecutó un intento real.

Archivos cambiados:

- src/lib/auth/mfa-diagnostics.server.ts: trazas de servidor opt-in y códigos permitidos.
- src/lib/auth/mfa-handlers.server.ts: puntos de diagnóstico antes/después de cada etapa de enrollment.
- src/lib/auth/mfa.server.ts: callbacks de etapas del contexto/listado y motivos fijos de rechazo del QR. Se conservan las mismas reglas de validación.
- tests/mfa-diagnostics.test.ts y tests/auth-mfa.test.ts: privacidad y fallos por etapa con SDK simulado.

Los únicos campos registrados son attempt (UUID aleatorio de diagnóstico), stage, event, enroll_state y, cuando proceda, code, provider_code, provider_status y exception. No se registran identificadores de usuario/perfil/sesión/factor, solicitudes, encabezados, objetos de error, mensajes, stack, QR, semillas o credenciales. provider_code usa una lista cerrada; los valores desconocidos se reemplazan por unrecognized. Los estados del proveedor se limitan a números HTTP válidos. Una avería del logger no cambia el resultado del handler.

### Activación para el próximo ensayo manual

Detener el servidor local actual con Ctrl+C y ejecutar desde el proyecto, en PowerShell:

```powershell
$env:MFA_ENROLL_DIAGNOSTICS = 'true'
npm run dev
```

Es una variable privada del proceso. **No requiere modificar .env.local ni activar/desactivar Auth.** Solo se emiten trazas en NODE_ENV=development y para la acción enroll; production/test, GET, challenge, verify y cancel no las activan.

1. El administrador entra con su sesión normal y abre /auth/mfa.
2. Si sigue existiendo un factor pendiente, la guarda mantiene bloqueado otro enrollment. El usuario decide si cancela ese pendiente mediante la interfaz existente antes del nuevo ensayo; Codex no cancela factores ni inicia el registro.
3. Cuando se muestre Configurar TOTP, el usuario pulsa una sola vez durante el intento controlado.
4. En la terminal de Next.js, reunir solo las líneas que empiezan por **[mfa-enroll]** y comparten el mismo attempt. El event=failed indica la etapa y código. No compartir el QR, HTML de enrollment, capturas del autenticador ni logs completos de respuestas.

| stage / código | Interpretación |
|---|---|
| configuration | Configuración Auth no disponible; todavía no se llamó a enroll |
| csrf | El POST fue rechazado por el control de origen/metadatos |
| form | Lectura/validación del cuerpo rechazada |
| cookies / client | Obtención del contexto de cookies o creación del cliente SSR |
| session | Resolución de sesión y datos de acceso no disponible/válida |
| authorization | Perfil/membresía administrativa no vigente |
| claims | Verificación de claims de la sesión |
| list_factors | Error en listado/validación de factores propios; puede incluir un código público del SDK |
| existing_factor (event=stop) | Ya había TOTP; no se solicitó otro enrollment |
| challenge_state_clear | Fallo al invalidar el challenge transitorio, antes de enroll |
| auth_enroll | La llamada al SDK comenzó y no retornó normalmente |
| enroll_response | El SDK retornó un error o una respuesta incompatible |
| qr_receive | Lectura del campo QR del resultado TOTP |
| qr_validation | Rechazo por tipo/tamaño, prefijo, decodificación, estructura, markup, referencia externa o elemento no admitido; el código identifica el motivo sin mostrar contenido |
| html_render / http_response | Construcción del HTML o de la respuesta; http_response con event=ok significa que la respuesta quedó preparada en servidor, no que el navegador la haya mostrado o escaneado |

Los valores de enroll_state separan **not_called**, **calling** y **returned**. calling puede incluir un fallo después de que el proveedor haya persistido el factor. returned solo significa que la promesa del SDK resolvió; debe interpretarse junto con stage/code. Ninguno autoriza a asumir que el factor no existe ni a repetir o limpiar automáticamente.

Para apagar las trazas, detener Next.js, quitar la variable del proceso y reiniciar:

```powershell
Remove-Item Env:\MFA_ENROLL_DIAGNOSTICS -ErrorAction SilentlyContinue
npm run dev
```

### Validación de esta actualización

- **173/173** pruebas específicas MFA/sesión/proxy/diagnóstico aprobadas.
- Suite completa: **343/343**, 16 archivos.
- **Lint y typecheck aprobados.**
- Incluye descarte de códigos desconocidos y objetos sensibles, fallos del logger, errores anteriores/posteriores al SDK, validación del QR y generación HTML. Se conservaron CSRF, cookies privadas, pertenencia administrativa y aal2 del Panel.

No hubo enrollment, unenroll o verificación reales desde Codex; tampoco SQL, migraciones, cambios Cloud, .env.local, usuarios o factores. No se cambió el formato aceptado del QR ni se añadió recuperación automática. No se hizo stage, commit, push o deploy. La causa real queda pendiente de las trazas del próximo ensayo controlado.
## Corrección localizada: límite del QR (6 de noviembre de 2026)

### Evidencia y causa técnica

El usuario comunicó trazas con enroll_response y qr_receive correctos, seguidos de qr_validation / qr_invalid_type_or_size y HTTP 503. Codex no realizó un enrollment real ni accedió al QR real.

El guard inicial de privateQrDataUri agrupaba dos causas: entrada distinta de string o longitud mayor de **150 000 caracteres**, incluido el prefijo. Se ejecutaba antes de comprobar prefijo, SVG o HTML. El contrato TOTP retorna data.totp.qr_code; el backend lo define como string SVG y el SDK instalado (@supabase/auth-js, GoTrueClient.ts) antepone **data:image/svg+xml;utf-8,**. El formato ya estaba admitido. Fuentes: [contrato oficial de enroll](https://supabase.com/docs/reference/javascript/auth-mfa-enroll), [generación TOTP de Supabase Auth](https://github.com/supabase/auth/blob/master/internal/api/mfa.go).

Supabase utiliza goqrsvg/SVGo, que emite un rectángulo para **cada módulo blanco o negro**. Un SVG de este formato puede exceder el límite anterior sin ser malicioso. Se reprodujo localmente con una matriz sintética de 57×57 módulos: las variantes textual y percent-encoded fueron rechazadas antes del cambio y aceptadas después. La matriz solo reproduce estructura/densidad; no codifica un TOTP real ni demuestra escaneo en celular. [Generador goqrsvg](https://github.com/aaronarduino/goqrsvg/blob/master/goqrsvg.go).

**Conclusión verificable:** el límite local era incompatible con SVG densos del generador. Es consistente con el fallo comunicado. La traza agrupa tipo y tamaño y no aporta metadatos del QR real, por lo que no se afirma haber medido su longitud ni confirmado independientemente cuál de ambas ramas se activó en Cloud.

### Cambio y seguridad

- **src/lib/auth/mfa.server.ts:** único cambio funcional de esta corrección: ampliar el límite de entrada a **1 048 576 caracteres (1 Mi)**, antes de decodificar. No es un límite en bytes ni una garantía para cualquier tamaño posible de QR.
- **tests/auth-mfa.test.ts:** 15 casos nuevos: dos variantes de SVG denso y respuesta privada del handler, límite exacto/exceso, cinco tipos inválidos y siete contenidos peligrosos, estos últimos también percent-encoded.
- **DIAGNOSTICO_MFA_ENROLL.md:** este registro.

Se revisaron mfa-handlers.server.ts y mfa-html.ts; no requirieron cambios para esta corrección. Se conservaron el tipo string, prefijo exacto, normalización restringida SVGo, rechazo de scripts/HTML/DTD/eventos/referencias externas/estilos no admitidos, elementos permitidos y salida base64 dentro de un img con atributos escapados. No se inserta el SVG como HTML. No se amplió la aceptación a PNG, URLs remotas, objetos ni formatos arbitrarios.

CSRF, sesión, pertenencia administrativa, requisito aal2 del Panel, no-store y privacidad del QR permanecen intactos. Las pruebas nuevas activan las trazas sanitizadas en el proceso simulado y comprueban que QR, data URI y secreto sintético no aparecen en logs ni se persiste la imagen en cookies. No se registra metadato ni contenido adicional del QR.

### Resultados

- Regresión antes del cambio: **2/2 casos densos fallaban** por rechazo local.
- Después: **188/188** pruebas específicas MFA/diagnóstico/sesión/proxy; suite completa **358/358**, 16 archivos.
- **Lint y typecheck aprobados.**
- **Build Next.js 16.4.3 aprobado con --webpack**, en copia temporal aislada de src/configuración pública, sin copiar .env.local y con Auth deshabilitado solo en el proceso de build. Se compilaron las rutas MFA y /demo; no se alteró el servidor de desarrollo existente.
- No se validó visualización/escaneo real ni enrollment contra Supabase Cloud.

### Próximo ensayo manual y límites

Existe posiblemente un factor unverified del último intento del usuario. No se reintenta automáticamente ni se cancela desde Codex. Para una prueba posterior decidida por el usuario: reiniciar Next.js con el código corregido, entrar en /auth/mfa y, si hay un pendiente propio, utilizar la cancelación explícita existente antes de comenzar otro enrollment. El usuario escanea el nuevo QR en privado y verifica el código; el acceso administrativo sigue dependiendo de aal2. No compartir QR, HTML, semillas, códigos o sesiones.

Si se repite qr_invalid_type_or_size, detenerse: el dato adicional necesario sería únicamente tipo, longitud aproximada y categoría de prefijo, nunca el contenido. No atribuir automáticamente un nuevo fallo al mismo límite ni seguir ampliándolo sin evidencia.

**Sin operaciones Cloud, enrollment/unenroll/verify reales, cambios Auth/SQL/migraciones/RLS/.env.local, stage, commit, push o deploy.** Los cambios de instrumentación anteriores permanecen; esta corrección no los sustituye.
