# Avance funcional principal

Fecha: **5 de noviembre de 2026**. Proyecto: SistemaAlumnos-Web. Rama: **feature/supabase-auth**.

Se implementó un avance funcional del Panel Admin y Dashboard aprovechando las tablas y RPC existentes. La solución usa formularios HTML, páginas de servidor y un módulo académico compartido. No añade dependencias, tablas, migraciones ni servicios de pago. Se conservó el diseño base.

## 1. Funcionalidades implementadas

| Módulo | Funcionamiento disponible |
|---|---|
| Talleres | Crear, listar, buscar por nombre/categoría, filtrar, consultar descripción y editar título, descripción, categoría y estado. Borrador/publicado/archivado; sin eliminación. |
| Alumnos existentes | Lista y búsqueda por nombre/contacto, filtro de estado, ficha con matrículas, edición de nombres/contacto y cambio del estado de membresía mediante las RPC existentes. No crea cuentas Auth ni cambia credenciales o perfiles globales. |
| Matrículas | Inscribir un alumno activo existente en un taller de su organización, listar por taller, cambiar estado y avance. Rechaza duplicados; no usa upsert para sustituir ni reactivar registros. Pausar/cancelar conserva la fila. |
| Materiales | Crear y editar enlaces o asociar un PDF privado **ya listo** del mismo taller. Estados de publicación. Enlaces YouTube/Vimeo/Drive/Docs/Meet/Zoom, según la lista permitida del esquema. No aloja videos. |
| PDF privado | Descarga autenticada por UUID, comprobando organización y RLS de metadatos/Storage, tipo PDF y estado ready. No genera URLs públicas. **La subida y finalización de archivos no están implementadas.** |
| Avisos | Crear, editar, publicar/archivar y mostrar fecha. Audiencia: alumnos autorizados del taller, como exige el esquema actual. No se inventó un alcance global que la tabla no admite. |
| Calendario | Agenda única por organización; registrar actividades de un taller, editar fechas/estado y actualizar participantes desde matrículas activas/completadas de alumnos activos. Usa RPC transaccionales existentes, sin sincronización externa. Hora de Lima. |
| Dashboard del alumno | Resumen y datos básicos propios, talleres accesibles y detalle por UUID, avance, materiales, avisos, agenda y perfil de lectura. Estados vacíos y mensajes de error claros. |

El calendario asigna los participantes al crear el evento. “Actualizar participantes” incorpora las matrículas vigentes posteriormente; no existe una sincronización automática oculta.

## 2. Archivos y módulos

Nuevo módulo **src/features/academic/**:

- forms.ts: validaciones y mensajes; URLs, fechas de Lima, estados, UUID y versiones.
- data.server.ts: consultas por organización, inserciones, actualizaciones por RPC y descarga privada con el cliente de la sesión.
- handlers.server.ts: POST con CSRF, sesión y rol admin aal2; errores saneados. Lectura PDF autorizada.
- academic-page.tsx: vistas y formularios compartidos de alumnos, talleres, matrículas, materiales, avisos y agenda.
- shell.tsx y academic.module.css: navegación real usando el diseño existente y ajustes de formularios.

Rutas bajo **src/app/(workspace)/o/[organizationSlug]/**:

- Conectadas: admin, admin/alumnos, admin/cursos, admin/materiales, admin/avisos, admin/calendario y las páginas existentes del dashboard.
- Nuevas: admin/matriculas; dashboard/materiales; dashboard/avisos; dashboard/cursos/[courseId].
- Nuevos handlers: POST acciones y GET archivos/[assetId].

Otros cambios: src/proxy.ts espera el control CSRF del handler antes de renovar la sesión de acciones; package.json agrega db:test:academic. Se añadieron cuatro archivos tests/academic-*.test.ts y scripts/database/test-academic.mjs, y una regresión en tests/auth-proxy.test.ts.

La demo /demo conserva sus fixtures y comportamiento de lectura. No se usa como respaldo de datos reales. Los adaptadores antiguos de unavailable-adapters permanecen por compatibilidad con sus contratos/pruebas; las nuevas páginas usan el módulo académico.

## 3. Pendientes y límites del esquema

**PDF — carga:** la migración histórica bloquea INSERT/UPDATE/DELETE de Storage para roles de aplicación. Además, file_assets solo permite alta pending; el RPC de edición existente no permite finalizarlo como ready. No basta con dibujar un botón de upload ni con crear un bucket.

Cambio preparado para revisión posterior, **sin ejecutar ni generar una migración incompleta**:

1. Confirmar/provisionar course-files como bucket privado, con solo PDF y un límite pequeño de tamaño.
2. Revisar una política nueva de carga restringida a admin aal2, organización y ruta de un asset pending propio. Mantener las demás denegaciones; no abrir Storage de forma general.
3. Definir una finalización limitada que contraste el archivo subido, tamaño y SHA-256 calculados en servidor antes de ready, conservando las reglas del modelo.
4. Implementar la subida en ese alcance autorizado y probarla localmente. La descarga/asociación ya implementada puede reutilizarse.

No se comprobó ni cambió la configuración actual de buckets en Cloud. La interfaz informa la limitación; no simula una subida exitosa. Las pruebas de descarga usan Storage simulado; las reglas existentes se probaron en SQL local.

Otros pendientes: aprovisionamiento seguro de nuevas credenciales, avisos globales sin taller, hosts externos fuera de la lista permitida, carga/importación de datos y contenidos de clases/certificados. No se añadieron tareas, cuestionarios ni recuperación administrativa.

**Migraciones nuevas en este avance: ninguna.** Las seis históricas mantienen sus huellas SHA-256. Una carga PDF desde la aplicación requerirá una evolución adicional revisada; no se aplicó ni se incluyó automáticamente en el directorio de migraciones.
## 4. Seguridad conservada

Cada acción verifica sesión, membresía de la organización, rol admin y aal2, además de Origin/CSRF. El tenant se obtiene de la sesión autorizada, no del formulario. Las consultas incluyen organization_id y mantienen RLS; las actualizaciones usan las RPC CAS con row_version. No hay operaciones DELETE.

El alumno solo consulta. Los enlaces PDF usan la sesión ordinaria y Storage privado, con respuesta no-store y descarga como attachment. No se usan claves administrativas ni rutas que omitan MFA. SUPABASE_AUTH_ENABLED=false cierra los handlers; nunca habilita una operación real.

## 5. Verificaciones realizadas

| Verificación | Resultado y alcance |
|---|---|
| npm run lint | Aprobado |
| npm run typecheck | Aprobado |
| npm test | **311/311**, 15 archivos; SDK/sesiones simulados y pruebas locales existentes |
| npm run db:test:academic | **10/10** recorridos con seis migraciones y datos sintéticos en PostgreSQL embebido 18.6 |
| npm run db:test | **83/83** regresiones SQL de RLS/integridad/Storage en el mismo tipo de entorno desechable |
| Build Next.js | Aprobado, **16.4.3 con webpack**, incluida generación de nuevas rutas |
| HTTP local | **85** comprobaciones: 23 Auth, 55 rutas/demo y 7 adicionales académicas; sin credenciales y con Auth apagado en el proceso aislado |

Los recorridos SQL comprobaron creación/publicación, matrícula duplicada, material/aviso/evento, alumno autorizado, alumno no matriculado, otra organización, admin aal1, alumno aal2, CAS y retirada de acceso al pausar sin borrar la matrícula.

El build y HTTP se realizaron en una **copia temporal sin .env.local**, vinculada a las dependencias ya instaladas. Solo ese proceso utilizó Auth=false; se comprobó el cierre de operaciones, no una autenticación alternativa. El servidor del usuario en 3000 no se detuvo ni se recompiló sobre su .next.

**No se probaron estas nuevas operaciones contra Supabase Cloud.** Los claims de las pruebas SQL son sintéticos; PostgreSQL embebido no reproduce el servidor Auth ni la subida/descarga HTTP real de Storage. No se afirma validación productiva o equivalencia integral con Cloud PostgreSQL 17.11.

## 6. Cómo probar localmente

Desde SistemaAlumnos-Web:

```powershell
npm run lint
npm run typecheck
npm test
npm run db:test:academic
npm run db:test
```

Para revisar solo el módulo de aplicación: npm test -- academic. Estas suites no necesitan contraseñas, MFA real o conexión a Cloud. El recorrido SQL crea fixtures en memoria y los descarta al cerrar.

Rutas preparadas, usando una organización con pertenencia válida:

| Prueba | Ruta bajo /o/[slug]/ |
|---|---|
| Crear/editar taller | admin/cursos |
| Ficha y edición de alumno existente | admin/alumnos |
| Inscribir y pausar/completar matrícula | admin/matriculas |
| Enlaces y PDF ready existente | admin/materiales |
| Crear/publicar aviso de taller | admin/avisos |
| Programar evento y actualizar asistentes | admin/calendario |
| Consultar contenido propio | dashboard y dashboard/cursos/[UUID] |
| Consultar avisos, materiales y agenda | dashboard/avisos, dashboard/materiales, dashboard/calendario |

La prueba interactiva mutante requiere una instancia Supabase local aislada con Auth y un administrador aal2. **No se configuró esa instancia en este trabajo.** Mientras el .env.local existente apunte a Cloud, no enviar esos formularios para ensayar escrituras sin una autorización posterior. Las suites anteriores son el medio de prueba aislado utilizado aquí.

La demo pública sigue disponible en /demo para la presentación visual; conserva su condición de solo lectura y no representa un usuario autenticado. Para compilar el proyecto normalmente puede usarse npm run build cuando no se esté utilizando su .next en un servidor de desarrollo; la compilación verificada aquí fue la copia aislada con webpack.

## 7. MFA y acceso administrativo real

El error real de enrollment TOTP permanece pendiente, sin intentar resolverlo en este avance. No se tocaron factores, usuarios ni handlers MFA. Un administrador real en aal1 continúa bloqueado; el código no ofrece una ruta alternativa. La prueba interactiva administrativa en Cloud deberá esperar a que se resuelva y verifique MFA, y a que se autoricen por separado los datos QA a escribir.

Crear credenciales no se simula desde Alumnos. La edición académica actúa sobre la membresía, sin cambiar el login institucional ni adjudicar nuevas cuentas.

## 8. Git y cierre

La rama sigue siendo feature/supabase-auth. El árbol ya contenía numerosos cambios de Auth, informes y archivos sin seguimiento antes de este trabajo; se conservaron. El avance añade el módulo académico, rutas, pruebas y el comando local, sin hacer commit, stage, push o deploy.

Para preparar un commit posterior: revisar los cambios previos de Auth junto con sus dependencias, revisar este módulo y sus rutas, ejecutar los comandos anteriores y seleccionar archivos explícitos. No usar una inclusión indiscriminada que añada evidencia privada; exports/, .env.local, dumps/ y dependencias deben permanecer fuera. Revisar también la documentación histórica de fases anteriores, que describe el estado de entonces.

**Único documento nuevo de entrega: AVANCE_FUNCIONAL_PRINCIPAL.md.** No hubo consultas o escrituras de Cloud desde las herramientas de este trabajo, cambios de .env.local, migraciones, RLS, cuentas/factores Auth, Vercel, GitHub o Apps Script. No se usaron datos reales ni servicios de pago. Se detiene aquí.