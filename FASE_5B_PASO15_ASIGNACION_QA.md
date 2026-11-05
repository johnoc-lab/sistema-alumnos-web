# Fase 5B — Paso 15: registro de asignación institucional QA

Fecha de elaboración: **4 de noviembre de 2026**, America/Lima. Proyecto SistemaAlumnos-Web; rama comprobada feature/supabase-auth. Destino previsto: sistema-alumnos-dev, Ref rnxgrunnrdlgjsbsrjev.

**Resultado:** declaración del usuario registrada en evidencia local ignorada por Git, consistente con el manifiesto v2. Se completaron **17 comprobaciones locales**, incluidas cinco pruebas negativas. **El manifiesto permanece idéntico byte a byte, con approval_state=pending y payload_sha256=NULL.** No se convirtió la declaración en aprobación institucional o autorización de escritura.

Solo se creó este informe y un registro privado de evidencia. No se accedió a Cloud, ejecutó SQL/migraciones, cambió Auth/MFA/RLS o activó el hook. No se leyó .env.local ni secretos; no se modificaron Next.js, Vercel o Apps Script; no hubo commit, push o deploy. No se creó ninguna funcionalidad o módulo.

## 1. Evidencia preparada y custodia

Archivo local: **exports/qa-evidence/paso15-self-declaration-v1.json**.

Su exclusión de Git se comprobó antes de escribirlo. Se creó sin sobrescribir un registro previo. Contiene únicamente identificadores QA, vínculos al manifiesto y declaraciones/estados necesarios; no contiene nombres personales, DNI, contraseñas, claves, sesiones, JWT, tokens o firmas.

El registro tiene el identificador documental paso15-self-declaration-v1. Es una referencia de **evidencia**, no una referencia de aprobación, identificador de operador o firma. Su ubicación debe custodiarse por el encargado autorizado de TI y el revisor institucional; no exponerla mediante Next.js o una API, ni incluirla en Git con inclusión forzada. Gitignore no proporciona cifrado, control de acceso o respaldo: mantener el original y, si procede, una copia privada controlada fuera del repositorio.

Fecha real de registro local: **2026-11-04T17:24:09.746Z**. Es el momento de documentación, **no la fecha de creación de las cuentas, de sus logins o de una verificación institucional**. Esas fechas no se proporcionaron y permanecen nulas.

Fuentes revisadas: informes de los Pasos 14, 9 y 13; approval.pending.json, provision.sql y postcheck.sql de supabase/qa/v2. Los resultados históricos no se reescribieron.

## 2. Identidades y declaración recibida

| Intención académica | Identificador                            | Auth UUID                            |
| ------------------- | ---------------------------------------- | ------------------------------------ |
| student             | u-000001@cuentas.sistema-alumnos.invalid | 55d355b9-21d7-46af-8d6d-650a528743eb |
| admin               | u-000002@cuentas.sistema-alumnos.invalid | 6cabd8d2-55d0-401c-b4f6-a20040215134 |

El usuario declaró expresamente que:

- Creó ambas cuentas y él mismo utilizará las dos como un único probador del ensayo.
- Son identidades sintéticas; no representan alumnos reales ni tienen buzones.
- Probó manualmente ambos logins con éxito y llegó a Mis organizaciones, sin acceso académico.

La designación del usuario como probador de ambos roles se registra dentro del alcance del ensayo. No demuestra facultad para aprobar institucionalmente el expediente, ejecutar migraciones o conceder membresías. No se inventó el nombre del probador ni una credencial institucional que lo identifique.

Los roles de la tabla son **intenciones pendientes de aprovisionamiento**, no permisos asignados por este registro. La declaración de creación y uso de credenciales tampoco verifica propiedad de buzón. El registro marca mailbox.status=not_applicable, ownership_verified=false y fecha de verificación de buzón nula.

La llegada a Mis organizaciones sin acceso es evidencia funcional **comunicada**, no una consulta de base de datos: no se infiere de ella un conteo actualizado de perfiles/membresías ni se afirma observación independiente de Supabase.

## 3. Separación de evidencia y autoridad

| Nivel                                                                   | Estado registrado                                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Declaración del usuario                                                 | Recibida y documentada: creador/probador único, cuentas sintéticas y dos logins satisfactorios comunicados |
| Observación de Codex                                                    | Lectura de la declaración y de archivos locales; comprobación de consistencia e integridad local           |
| Identidad/credenciales/navegador/Supabase observados independientemente | No verificados en este paso                                                                                |
| Aprobación institucional de la asignación                               | Pendiente de revisión y responsable acreditado; sin referencia, fecha o firma inventadas                   |
| Autorización de la nueva migración institucional                        | No concedida por esta declaración                                                                          |
| Autorización DML del lote académico v2                                  | No concedida                                                                                               |
| Titularidad de buzón                                                    | No aplicable; no verificada                                                                                |

Las autorizaciones históricas de otras fases no se amplían mediante este registro. La ausencia de autorización se refiere a la nueva migración institucional y operación v2, no niega que las cinco migraciones originales ya se aplicaron bajo otro alcance.

El responsable institucional podría coincidir con el probador únicamente si su facultad se acredita y se registra expresamente. No se presupone esa capacidad por ser el creador de cuentas, controlar la sesión de esta conversación o conocer las contraseñas. No se usa el nombre del equipo/usuario de Windows como identificación.

## 4. Manifiesto: datos disponibles y pendientes

Se preserva supabase/qa/v2/approval.pending.json completo. No se ejecutó el preparador ni el adaptador para registrar esta evidencia.

| Campo o dato                        | Información disponible y tratamiento                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth UUID, login_identifier y role  | Confirmados en la declaración y coincidentes con v2; ya están cumplimentados y no se cambian                                                        |
| mailbox_status                      | not_applicable para ambas; ya es coherente y se conserva                                                                                            |
| Evidencia de creador/probador único | Se puede registrar y se registró en el archivo separado como declaración del usuario                                                                |
| Evidencia de login                  | reported_success_by_user; fuente, destino comunicado y falta de observación independiente registrados; sin fecha de login inventada                 |
| assignment_evidence_ref             | Existe una evidencia local concreta que puede proponerse como referencia. Permanece NULL: todavía no se ha aceptado como verificación institucional |
| assignment_by_ref                   | NULL: falta responsable con facultad acreditada y su referencia; no reemplazarlo por “usuario” o “Codex”                                            |
| assignment_verified_at              | NULL: falta fecha real de aceptación/verificación institucional. No usar el reloj de registro, un login o email_confirmed_at                        |
| operator_ref                        | NULL: falta identificar/autorización del operador futuro de escritura                                                                               |
| approval_ref                        | NULL: falta la aprobación concreta y su referencia                                                                                                  |
| approval_state                      | pending, sin cambios                                                                                                                                |
| payload_sha256                      | NULL, sin calcular una huella final de aprobación                                                                                                   |
| evidence.assignment del manifiesto  | pending, sin cambios; la recepción de declaración se conserva en el registro separado                                                               |
| Método de confirmación técnica Auth | Sigue requiriendo registro del operador; el éxito del login no documenta por sí solo cómo se confirmó                                               |

**Ningún campo pendiente de verificación o autorización se completó.** La tarea sí añade evidencia útil: ahora la declaración personal está identificada y vinculada a las dos cuentas, sin elevar su nivel de autoridad.

Se conservaron los doce UUID estables del payload, incluida operación **2387aa0e-d1c6-4604-ad26-1ddbe0b28b5b** y organización propuesta **211f6de1-5f3f-45ac-bbb1-d8363d715d01**. No se generaron UUID de recursos nuevos.

## 5. Propuesta de vinculación futura, sin modificar v2

El registro incluye manifest_path, project_ref, operation_id, organization_id y los dos triples Auth UUID/identificador/rol. Esto permite asociarlo al lote correcto, sin depender del orden admin/student en el JSON.

Candidato de referencia documental: **qa-evidence:paso15-self-declaration-v1**. Identifica un registro existente, no una aprobación. En una revisión futura, un índice privado del operador podría resolver esa referencia al archivo custodiado. No se escribió esa cadena en assignment_evidence_ref.

Antes de completar una copia aprobada:

1. El responsable competente revisa la declaración y acepta —o solicita completar— la asignación a ese único probador. Registra una referencia y una fecha reales; no se requiere afirmar control de buzón.
2. Se conserva la declaración original. La aceptación institucional se documenta en un registro separado con su alcance: ambos UUID y roles intencionados. No se reescribe retrospectivamente la autodeclaración como si hubiera sido una comprobación independiente.
3. Se decide qué referencia identifica el expediente aceptado. Puede ser un expediente conjunto con detalle de ambas identidades; no hace falta inventar dos responsables o dos personas. La referencia usada por cada persona debe resolver inequívocamente su adjudicación.
4. Solo entonces se completan assignment_by_ref, assignment_verified_at y assignment_evidence_ref en una **copia privada** del manifiesto, preservando todos los UUID del pendiente.
5. La autorización posterior de DDL y del DML exacto se documenta aparte. Una aceptación de asignación no permite cambiar approval_state a approved por iniciativa del preparador.
6. Al cerrar la aprobación efectiva se fijará el expediente/copia y su integridad, y se calculará la huella canónica conforme al contrato del Paso 14. No se calculó aquí ese hash final ni una firma.

La referencia de evidencia queda dentro del payload que se aprobará; no basta que un texto externo modificable acompañe un hash de otra cosa. Preservar el original, versionar anexos de revisión y fijar su integridad al aprobar evita atribuir evidencia distinta al mismo expediente.

Una suma de integridad de archivo no es una firma ni una autorización. Las comparaciones locales de bytes/huellas efectuadas para comprobar que el manifiesto no cambió no rellenan payload_sha256.

## 6. Comprobaciones locales realizadas

Se ejecutaron comprobaciones puntuales de JSON y texto con Node, sin SQL, SDK remoto, navegador, cuentas de prueba nuevas o módulos persistentes.

| Comprobación                                               | Resultado                                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Versión, scope y Ref del manifiesto                        | v2, cloud_qa_institutional y rnxgrunnrdlgjsbsrjev coincidentes                                                                 |
| Evidencia/cuentas/manifiesto por UUID, identificador y rol | Coinciden exactamente, sin inferir roles del dominio                                                                           |
| Dos cuentas distintas y un probador declarado              | Coherente; nombre personal pendiente                                                                                           |
| Buzón no aplicable/no verificado                           | Coherente en evidencia y manifiesto                                                                                            |
| Logins reportados frente a observación independiente       | Fuente de usuario, fechas no inventadas, observación independiente falsa                                                       |
| Estado pendiente y referencias de autorización             | Conservados                                                                                                                    |
| Hash final de aprobación                                   | Continúa NULL                                                                                                                  |
| Campos de asignación institucional                         | Los seis valores de ambas personas continúan NULL                                                                              |
| Doce UUID distintos y estables                             | Sin cambios                                                                                                                    |
| Adaptador                                                  | Contiene los dos UUID actuales y exige aprobación/evidencia; no se ejecutó                                                     |
| Postcheck                                                  | Referencia responsable/evidencia y declara is_authentication_test=false; no se ejecutó                                         |
| Cinco casos negativos en copias en memoria                 | Detectados: UUID antiguo, rol equivocado, identificador distinto, DML falsamente concedido y observación independiente fingida |
| Persistencia y lectura del JSON privado                    | Válido, consistente y en ubicación ignorada                                                                                    |

Total: **17 comprobaciones locales satisfactorias**: once positivas de contrato/contenido, cinco negativas y lectura posterior del registro. Se comprobó adicionalmente igualdad byte a byte del manifiesto y la conservación de los archivos anteriores.

Estos resultados no son 17 pruebas de Supabase: no demuestran existencia/estado actual de las cuentas, permisos positivos, MFA, bloqueo de correo o ejecución PostgreSQL 17. Las pruebas del Paso 14 y del hook del Paso 13 son antecedentes; no se repitieron aquí y el hook no fue activado.

## 7. Riesgos y próximos pasos mínimos

- **Confundir autodeclaración con aprobación:** mantener fuentes y autoridad separadas; la persona puede ser probador de dos roles sin ser firmante o ejecutor autorizado.
- **Fecha o responsable ficticios:** conservar nulos hasta disponer del dato real y de la facultad correspondiente.
- **Referencia mutable o pérdida del archivo ignorado:** custodiar original y anexos fuera del alcance de la aplicación; fijar su integridad al cerrar una aprobación real. Git no respalda este registro.
- **Asumir estado remoto por la pantalla comunicada:** realizar únicamente las futuras comprobaciones autorizadas del preflight, no dar por actualizado Cloud en esta fase.
- **Permisos por registrar roles:** no existen nuevos perfiles, membresías o permisos creados por este registro; los roles siguen siendo intención del lote.
- **Creer aprobado el resto del proyecto:** permanecen las revisiones de PostgreSQL 17/canal de ejecución y las autorizaciones del Paso 14. La garantía del proveedor sobre correo del Paso 13 sigue independiente, sin activar hooks, recuperación o MFA por este expediente.

Siguiente paso mínimo: que un responsable con facultad acreditada acepte/documente la asignación declarada y se identifique el operador futuro, sin exigir un buzón inexistente. Después se podrá revisar una copia cumplimentada y las autorizaciones separadas de migración/lote. No se necesita crear un panel, nuevos roles o infraestructura para registrar este ensayo.

**Cierre:** declaración registrada y coherencia local comprobada; aprobación institucional y DDL/DML v2 pendientes. El manifiesto original, su integridad, sus UUID y su estado pendiente permanecen intactos. No se ejecutó ninguna operación remota.
