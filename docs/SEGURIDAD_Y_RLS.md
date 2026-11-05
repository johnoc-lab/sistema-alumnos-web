# Fronteras de seguridad actuales

Fase 5A implementa Auth SSR local con activación privada explícita. Ver [FASE_5A_AUTENTICACION.md](../FASE_5A_AUTENTICACION.md). Sin variables completas, las rutas reales permanecen cerradas y no contactan Auth. Cloud necesita deshabilitar signup y configurar URLs antes de activar.

Las rutas reales usan getUser/getClaims y consultas con JWT del usuario para comprobar perfil, membresía, organización y MFA. No usan getSession como autoridad, dominios de correo, user_metadata o un rol enviado por navegador. Cada módulo contiene guard de servidor; RLS sigue siendo la segunda frontera.

El proxy renueva cookies en rutas Auth/reales y preserva caché no-store. CSP usa nonce por solicitud allí. La demo está excluida del proxy y no consulta sesiones. Ninguna consulta real utiliza fixtures como alternativa.

Los repositorios académicos y CRUD permanecen unavailable. Las únicas mutaciones nuevas son operaciones Auth del propio usuario mediante POST de origen estricto. No hay registro público en la aplicación, Auth Admin ni service_role. Las recuperaciones/invitaciones no crean membresías.

Las 23 tablas Cloud, grants, 13 RPC y políticas se validaron en fase 4C. No se cambiaron migraciones o permisos en fase 5A. No hay cuentas de prueba; las nuevas pruebas Auth son simuladas y la verificación HTTP usa configuración cerrada.

Antes de conectar datos: completar configuración manual, probar usuarios autorizados, flujo MFA, revocación, callbacks, políticas RLS y sesiones reales. No modificar Vercel ni publicar esta rama sin una instrucción posterior.
