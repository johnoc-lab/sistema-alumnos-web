# Alta y activación de personal

El administrador principal con sesión `aal2` puede crear una cuenta institucional para un administrador limitado, un profesor o secretaría. La cuenta aparece en Administradores como **Pendiente de activación**. El formulario de vinculación de cuentas ya autorizadas conserva su flujo.

## Configuración y orden

1. Verificar el destino y el historial remoto de 13 versiones, incluidas las tres de Medios, antes de una futura aplicación autorizada de `20261112120000_staff_registration.sql`. La rama integrada contiene las 13 migraciones anteriores y esta nueva versión. Antes de una futura aplicación, comprobar mediante dry-run que solo quede pendiente la migración de Alta de Personal.
2. Mantener deshabilitados el registro público, el acceso anónimo y los flujos de correo. Los identificadores de este flujo pertenecen a `cuentas.sistema-alumnos.invalid`. `email_confirm` es una confirmación técnica de Supabase Auth. La asignación al titular la confirma el administrador principal y queda registrada en PostgreSQL.
3. Con autorización posterior, configurar `SUPABASE_STAFF_SECRET_KEY` con una clave secreta del proyecto en el entorno privado donde se pruebe el alta. Esa clave tiene privilegios amplios. Mantenerla exclusivamente en el servidor y usar el almacén de secretos del entorno. El login y MFA habituales no la requieren.
4. Verificar `APP_ORIGIN` exacto, `SUPABASE_AUTH_ENABLED=true` y las variables Auth existentes. Habilitar `STAFF_REGISTRATION_ENABLED=true` solo en el entorno autorizado después de la migración. Por defecto el alta está apagada.

## Prueba QA posterior

1. Con el principal QA y TOTP verificado, abrir Administradores y usar **Agregar personal**. Introducir un nombre sintético, un identificador institucional disponible y un único módulo, por ejemplo Asistencia. Elegir **Profesor** y confirmar la asignación.
2. Verificar que la cuenta aparece pendiente. Entregar al probador el código por un canal privado autorizado. Abrir una ventana privada para probar con la identidad nueva. Introducir el identificador y el código en `/auth/activar-personal` y elegir una contraseña que el principal no conozca.
3. Confirmar que el código deja de servir después del canje. Iniciar sesión con la contraseña elegida. Intentar abrir el módulo con `aal1`, configurar y verificar TOTP, volver al módulo y comprobar acceso. Probar también la denegación de otro módulo, Administradores y otra organización.
4. Probar la vinculación anterior con una cuenta previamente autorizada. Revisar en QA que el cambio administrativo de contraseña no intente enviar notificaciones inesperadas y que el indicador de actualización de Auth coincida con el registrado por PostgreSQL.

## Incidencias

El código conserva una hora de vigencia y un solo canje. **Preparar nuevo código** reemplaza el anterior y sirve también cuando el alta se reservó pero se perdió la respuesta de Auth. El servidor reconoce únicamente la identidad creada para esa operación.

En Production o Preview de Vercel se toma una única IP válida del encabezado de plataforma `x-vercel-forwarded-for`. Se registra una clave HMAC derivada con `AUTH_FLOW_SECRET`. Los contadores privados en PostgreSQL permiten 30 solicitudes por IP y 6 por combinación de IP e identificador en ventanas de cinco minutos. Los rechazos no amplían la ventana ni modifican el código. Una red compartida puede alcanzar su propio límite temporal. Fuera de Vercel o si falta una IP válida, no se confía en encabezados reenviados. En ese caso se mantiene la protección del código aleatorio de 256 bits, su vencimiento y su canje único. Un intento incorrecto recibe una respuesta genérica sin escribir en la solicitud ni llamar a Auth.

La RPC de reserva está concedida exclusivamente a `service_role`. El servidor la invoca tras comprobar el interruptor, la credencial privada, CSRF y la sesión principal con `aal2`. PostgreSQL vuelve a comprobar la membresía principal activa y recibe el nivel MFA de la sesión verificada por el servidor. La reserva registra el actor y solo crea un perfil pendiente, una membresía invitada y la solicitud. El identificador es único y hay un máximo de diez reservas nuevas por organización en cinco minutos. Las RPC de vinculación institucional anterior conservan sus permisos.

Si el código ya se reclamó, **Comprobar activación** solo completa el alta si Auth confirma el marcador de esa actualización de contraseña. Ante un resultado ambiguo se conservan el perfil y la membresía pendientes. Si no se puede confirmar la operación, el principal puede **Cancelar alta pendiente** y registrar un identificador nuevo. El identificador cancelado queda reservado y su membresía archivada. La cancelación no cambia ni elimina el usuario Auth.

Las pruebas locales simulan Auth y reconstruyen PostgreSQL en una base desechable. El comportamiento de las operaciones administrativas, las notificaciones y TOTP con una cuenta recién creada queda para el ensayo QA autorizado.
