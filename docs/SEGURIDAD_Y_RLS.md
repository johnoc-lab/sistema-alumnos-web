# Fronteras de seguridad preparadas

Esta fase no implementa Auth ni RLS y no afirma que exista un sistema productivo protegido.

- Las rutas reales /o/... y /seleccionar-organizacion usan readSession(), que devuelve unconfigured sin leer cookies o parámetros como credenciales. No hay un bypass de demo.
- /demo es público y solo renderiza fixtures dedicados. Cambiar su slug o área es navegación de diseño, nunca asignación de rol. No contiene cuentas, tokens ni datos importados.
- Los clientes Supabase lanzan IntegrationUnavailableError antes de inicializar el SDK, incluso si se completan variables de entorno. No hay interruptor para activarlos por accidente.
- Los contratos de identidad/membresía requieren verificación futura en servidor. authorizeOrganization es una regla de dominio probada; por sí sola no es un proveedor Auth ni reemplaza RLS.
- Los repositorios sin conexión devuelven unavailable; nunca devuelven los fixtures como alternativa de una consulta real.
- No existen endpoints de mutación ni Server Actions activas. Formularios de acceso están deshabilitados y los de ejemplo son de solo lectura; búsquedas/filtros solo afectan presentación local.

## Implementación posterior

Seguir el MODELO_BASE_DATOS aprobado como especificación: organizaciones, perfiles, membresías y matrículas separadas; FKs compuestas por tenant/curso; RLS/grants explícitos; estado vigente consultado en DB; rol y MFA de Admin verificados en cada operación. Nunca confiar en el dominio del correo, user_metadata, un rol enviado por cliente o el slug de la URL.

Añadir adaptadores SSR oficiales, validar identidad en servidor, resolver membresía y solo entonces construir AuthorizedContext. El cliente de negocio debe llevar JWT del usuario. Una service key elude RLS y no se usará como cliente genérico. No hay necesidad de ella en esta fase.

Antes de conectar datos reales: implementar migraciones en entorno local/de prueba y pruebas de acceso anónimo, alumno A/B, otro tenant, Admin ajeno/sin MFA, suspensión, Storage y RPC. La evidencia de autorización no puede basarse solamente en layouts ni filtros de UI. Los tests actuales no son pruebas contra PostgreSQL.

## Cabeceras y dependencias

CSP restringe fuentes y conexiones a este origen. No se cargan scripts, imágenes o fuentes desde CDN. frame-ancestors none, nosniff, Referrer-Policy no-referrer y permisos de dispositivos denegados. Next requiere bootstrap inline; la CSP inicial permite unsafe-inline y en desarrollo unsafe-eval. Es una base local, no una política nonce final. Revisar CSP y caché antes de producción.

Los wrappers de Next desactivan su telemetría; los comandos se enlazan a 127.0.0.1. La instalación utiliza paquetes públicos de npm, sin conectar Supabase, Vercel ni GitHub. No se implementa login unificado, migración de usuarios ni envío de correos.
