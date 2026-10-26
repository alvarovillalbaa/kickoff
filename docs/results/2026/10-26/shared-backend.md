# Consolidación de Kickoff y Still

Fecha de preparación fuente: 2026-10-26. El usuario autorizó consolidar ambos servicios en el proyecto gratuito existente de Still, mantener la confirmación de correo, comprobar el cambio y pausar únicamente el backend anterior de Kickoff después de verificar la sustitución. Welyto conservará un proyecto independiente. Esta autorización no convierte los pasos pendientes en resultados ejecutados.

Estado final comprobado el 2026-10-26: el backend anterior de Kickoff está `INACTIVE`; el proyecto compartido de Still y el proyecto independiente de Welyto están `ACTIVE_HEALTHY`. Son los únicos dos proyectos activos de la cuenta. La tabla siguiente conserva el estado inicial de preparación; el cierre ejecutado figura al final.

| Ámbito | Estado al preparar este cambio |
| --- | --- |
| Backend compartido de destino | Still, `wosqlzijmyiemueoittw`, `https://wosqlzijmyiemueoittw.supabase.co`. URL y clave publicable copiadas de `still-markdown/lib/project.js`, configuración pública inspeccionada. |
| Backend anterior | Kickoff, `lucbdtdsofnybynjpdbp`. Retirada pendiente: no se ha pausado durante esta preparación fuente. |
| Configuración de Kickoff | `src/config.public.ts` apunta al destino compartido; las variables Vite pueden sustituirla y deben comprobarse al publicar. |
| Sesiones y comunicación | Cierre de sesión local; el diálogo explica cuenta y contraseña compartidas y el efecto del restablecimiento. |
| Propiedad de datos | Kickoff: `public.centers/fields/slots`, RPC propias y `private`. Still: `public.documents/mcp_tokens`, RPC propias y `still_private`. No se modifica el esquema de Still desde este cambio fuente. |
| Migración y proveedor | Aplicación SQL, Auth/redirects y retirada del proyecto anterior pendientes de registrar por quien las ejecute. No se ejecutaron desde esta preparación. |
| Publicación | Commit, despliegue y bundle del cambio pendientes de registrar. No se publicó durante esta preparación. |
| Comprobaciones | `git diff --check` sin errores; parser de TypeScript instalado valida la sintaxis de los tres archivos TS/TSX editados; 11 destinos locales de enlaces Markdown existen. El archivo nuevo tampoco presenta diagnósticos de espacios en `git diff --no-index --check`. No acredita tipos, ejecución, aislamiento, correo ni sesiones reales. Sin instalación, build local, pruebas de proveedor ni navegador en esta preparación. |

Las instrucciones operativas y los límites de reversión se mantienen en [docs/operations.md](../../../operations.md#reversión-de-la-consolidación). Antes de pausar el backend anterior, registra aquí la migración aplicada, la configuración de Auth conservada/ampliada, el commit y despliegue publicados, los resultados de ambos contratos y la comprobación final de datos y consumidores pendientes. La entrega real de correo y las pruebas con cuentas confirmadas tienen evidencia separada; crear una cuenta administrativa de prueba no demuestra entrega de confirmación.

## Ejecución del proveedor y pruebas

La migración `20261026183151_consolidate_kickoff_free_project.sql` se aplicó correctamente al proyecto compartido. El nombre local se alineó con la versión devuelta por el historial real de Supabase después de crear el archivo mediante la CLI. Antes de aplicarla, ambos proyectos tenían cero cuentas y cero registros de aplicación. Los permisos, políticas RLS, definiciones y ACL de las funciones existentes de Still coinciden exactamente antes y después.

La prueba completa [shared-backend-acceptance.sql](../../../../tests/shared-backend-acceptance.sql) pasó sus 28 grupos de aserciones con roles reales de PostgreSQL y datos sintéticos dentro de transacciones revertidas. La comprobación independiente posterior encontró cero cuentas y cero registros en las ocho tablas de aplicación. [Resultado exacto](shared-backend-acceptance.json) y [recibo del proveedor](shared-backend-provider.json). No acredita entrega de correo, validación HTTP de JWT, transporte MCP ni clientes concurrentes.

Los avisos previos de funciones privilegiadas de Still no cambiaron; los tres avisos informativos nuevos corresponden a tablas privadas de Kickoff accesibles solo por RPC. [Criterio de tablas RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [funciones ejecutables sin iniciar sesión](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [funciones ejecutables autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Still publicó su política de correo confirmado en `9a789b4413124fb03015059b31190bde9bfc6b18`, despliegue `dpl_5r9qkACtTVM2CnRr6d6gmzVyHidN` en estado `READY`. Sus endpoints públicos confirman correo obligatorio, `emailDeliveryVerified:false` y recuperación desactivada. Las 21 pruebas enfocadas del cliente de nube pasaron. En esa comprobación inicial, la configuración de callbacks seguía pendiente de acceso al formulario del panel y el backend anterior continuaba activo. Ambas fases se completaron después, como se registra a continuación.

## Publicación y callbacks verificados

Kickoff publicó `7b301cbcb7ddad2fd1e74fdf794041f1301652ca`, despliegue de producción `dpl_38Raw1fU97PdH8GaaVycbtgzPLcy` en estado `READY`. El HTML público devuelve 200 y carga `/assets/index-Be7YQPM9.js`. La inspección del bundle servido encuentra únicamente `https://wosqlzijmyiemueoittw.supabase.co`; la referencia `lucbdtdsofnybynjpdbp` está ausente. Su configuración efectiva usa directamente la URL y la clave publicable del proyecto compartido. El conector de Vercel rechazó la consulta de metadatos de entorno con 403 y no había CLI disponible; la comprobación se hizo sobre el artefacto público ejecutado.

Los callbacks dejaron de estar pendientes: el panel contenía inicialmente localhost y una lista vacía. Se configuró Still como Site URL y se guardaron cuatro entradas exactas para los dos orígenes, comprobadas después de recargar. [Recibo de Auth](auth-redirects.md). Se mantuvo la confirmación obligatoria y no se configuró SMTP ni un plan de pago. Las comprobaciones de navegador de ambos servicios y la revisión final del proyecto anterior preceden a su pausa.

## Cierre de la retirada y capacidad disponible

El operador completó las [comprobaciones públicas de Kickoff](shared-browser.md) y la verificación de una página invitada nueva de Still, incluida su recarga y limpieza. Antes de solicitar la pausa, volvió a comprobar cero cuentas Auth y cero registros en las seis tablas del backend anterior de Kickoff. Solicitó únicamente la pausa autorizada de `lucbdtdsofnybynjpdbp`; la respuesta inicial fue `PAUSING`.

Una consulta posterior independiente mediante `Supabase list_projects` confirmó `lucbdtdsofnybynjpdbp` en `INACTIVE`. La misma lectura devolvió el proyecto compartido Still, `wosqlzijmyiemueoittw`, y el proyecto independiente Welyto, `faftywddybmgamvseibe`, ambos `ACTIVE_HEALTHY` en `eu-central-1`. Son los únicos dos proyectos activos; los proyectos anteriores Professor Assistant y Clinic figuran inactivos. El [recibo estructurado del proveedor](shared-backend-provider.json) conserva este cierre junto a la preparación y las pruebas anteriores.

Este cierre acredita el cambio de destino publicado y la pausa del backend sustituido. La entrega real de confirmación y recuperación de correo, las sesiones Auth/JWT reales, el transporte MCP autenticado y los clientes concurrentes mantienen sus límites de verificación ya descritos.
