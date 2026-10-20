# Operación de Kickoff

## Arquitectura y límites

La aplicación es una SPA de React compilada con Vite. El navegador usa la URL y clave publicable de Supabase; Supabase Auth administra las identidades y sesiones. Postgres es la fuente de verdad de centros, pistas, disponibilidad, partidos y participantes.

`src/config.public.ts` contiene la URL y clave publicable del proyecto de producción. Las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` sustituyen esos valores al compilar. Configura ambas con un proyecto de desarrollo separado antes de realizar cambios locales; dejarlas vacías conecta con producción. Este archivo contiene únicamente configuración destinada al navegador, nunca una clave secreta o `service_role`.

Las políticas RLS y las funciones RPC deben aplicarse antes de habilitar reservas. La validación de la interfaz ayuda al usuario, pero la autorización, el aforo y la exclusión de reservas concurrentes se resuelven en la base de datos. No desactives RLS ni añadas una clave privilegiada al navegador para corregir errores de acceso.

El proyecto empieza sin centros, pistas, usuarios o partidos precargados. Las ilustraciones de la interfaz no representan inventario disponible. Los importes se guardan en céntimos y se muestran en euros; registrar una reserva no acredita un cobro.

## Instalar Supabase por primera vez

1. Selecciona explícitamente la organización y región del proyecto. Revisa cualquier coste antes de crear recursos facturables.
2. Crea un proyecto dedicado o utiliza uno nuevo destinado a Kickoff. No reutilices la base de datos de otra aplicación.
3. Lee `supabase/schema.sql` y ejecútalo completo en el editor SQL del proyecto con autorización administrativa. Es una instalación inicial, no un script para ejecutar repetidamente sobre una instalación existente. No contiene semillas de datos.
4. Comprueba que las tablas, restricciones, políticas y RPC se han creado y revisa los avisos de seguridad de Supabase. Corregir un error de permisos requiere revisar la política o el contrato correspondiente.
5. Obtén la URL del proyecto y su clave publicable. Configura las dos variables de conexión en `.env.local` para un proyecto de desarrollo separado. En producción, usa las variables del entorno Vercel cuando estén disponibles o actualiza la configuración pública revisada y vuelve a compilar.

Las RPC de catálogo y detalle son `browse` y `get_match`. Las operaciones de partido son `book_match`, `join_match`, `leave_match` y `cancel_match`; `my_matches` consulta la actividad del usuario. Las invitaciones se obtienen mediante `get_invite_code`, y los pases de invitado se gestionan con `join_guest`, `leave_guest` y `claim_guest`.

Mantén cualquier evolución posterior del esquema bajo revisión y registra qué cambio se aplicó a cada entorno. La presencia del archivo SQL en GitHub no prueba su ejecución en Supabase.

## Correo y cuentas

Activa el proveedor de correo y contraseña en Supabase Auth. Mantén la confirmación de correo y configura:

- **Site URL**: la URL pública de producción, una vez verificada.
- **Redirect URLs**: el origen local de desarrollo y los destinos de retorno que utiliza la aplicación. Añade únicamente los dominios de producción o previsualización autorizados.
- **SMTP propio**: remitente, host, puerto y credenciales del proveedor, introducidos en Supabase; verifica también la autenticación del dominio remitente.

El servicio SMTP incluido por Supabase está destinado a desarrollo. Sin SMTP propio, rechaza destinatarios que no sean miembros del equipo del proyecto, tiene límites de envío reducidos y no ofrece garantía de entrega. No abras el registro público basándote únicamente en una confirmación enviada a una dirección del equipo. [Documentación de SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Verifica el alta, entrega de confirmación y acceso posterior con una dirección real autorizada para la comprobación. La existencia de un usuario en el panel no demuestra que se haya entregado el mensaje. Conserva las credenciales del proveedor fuera del repositorio, logs y variables `VITE_`.

## Teléfono y OTP opcional

`VITE_PHONE_AUTH_ENABLED=false` mantiene oculto el acceso por teléfono mientras se prepara el proveedor. Para activarlo:

1. Habilita el proveedor Phone en Supabase Auth.
2. Configura un proveedor SMS compatible, como Twilio, Twilio Verify, Vonage o MessageBird, con sus credenciales privadas y remitente autorizado.
3. Revisa cobertura por país, restricciones de cuentas de prueba, límites de envío y coste por mensaje con el proveedor elegido.
4. Comprueba recepción y verificación de un OTP real en un teléfono autorizado. Comprueba también el rechazo de un código incorrecto o caducado.
5. Cambia la variable a `true` y vuelve a compilar y desplegar el frontend.

La aplicación solicita el OTP a Supabase y verifica el código recibido antes de crear una sesión. Activar la variable solo cambia la interfaz; no configura el servicio SMS. Supabase Auth conserva la identidad telefónica. [Documentación de acceso por teléfono](https://supabase.com/docs/guides/auth/phone-login).

## Invitaciones y pases de invitado

Solo el organizador obtiene el código de invitación del partido. El código es una capacidad de acceso: quien recibe el enlace puede utilizarlo para acceder al partido según su visibilidad. Compártelo únicamente con las personas invitadas y evita incluirlo en analítica, incidencias públicas o capturas de logs.

Antes de llamar a `join_guest`, el navegador genera el UUID de participante y un token aleatorio y los guarda en `localStorage`, bajo `kickoff:guest-passes`. El pase incluye `participant_id`, `guest_token`, `match_id` y `display_name`; puede incluir `invite_code` y el indicador `confirmed`. Si no puede guardar el pase, no solicita la plaza. Los reintentos reutilizan los mismos valores y la RPC devuelve la misma plaza, evitando duplicados si se pierde la respuesta.

El servidor guarda únicamente el hash SHA-256 del token. `get_match` puede validar el pase para que el invitado vuelva a su partido privado sin necesitar de nuevo la invitación. El pase también permite dar de baja la propia plaza o asociarla a una cuenta verificada mediante `claim_guest`. Una plaza pendiente de confirmación local no acredita por sí sola que se haya creado en el servidor.

El pase identifica la plaza de ese invitado, no concede permisos de organizador. Borrar los datos del navegador o cambiar de dispositivo pierde el pase local; no prometas recuperación automática. No exportes los pases ni los registres en logs. El organizador o el propietario del centro pueden cancelar la reserva; la autorización se valida en el servidor. El centro consulta sus reservas privadas mediante un resumen, sin obtener acceso a la alineación ni a la invitación.

## Alta de centros y disponibilidad

Registra los datos del centro desde una cuenta confirmada. Cada pista pertenece a un centro y tiene formato, capacidad y precio propios. Publica las franjas que el centro puede ofrecer realmente y comprueba el horario antes de guardarlas.

Una reserva convierte una franja disponible en un partido. Las plazas libres dependen del aforo y participantes actuales; el catálogo vacío es un estado válido. No añadas inventario ficticio para presentar disponibilidad. Para comprobaciones de operación, utiliza registros reales autorizados para ese propósito y acuerda su conservación o retirada.

Las reservas en curso o futuras impiden eliminar su pista o disponibilidad. Los partidos terminados conservan su historial mediante instantáneas y no bloquean la retirada posterior de la pista o del centro.

## GitHub y Vercel

Publica únicamente el código y archivos de configuración sin secretos. `.env.local`, otras variables locales, `.vercel/`, `node_modules/` y `dist/` están excluidos del repositorio. Comprueba el contenido que se va a publicar antes de enviar cambios.

Vincula el repositorio a un proyecto Vercel dentro del equipo elegido. Ajustes de compilación:

| Ajuste | Valor |
| --- | --- |
| Framework | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Root directory | raíz del repositorio |

Configura `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_PHONE_AUTH_ENABLED` por separado para producción y previsualización cuando el equipo permita administrar variables. La API de Vercel devolvió HTTP 403 al intentar configurarlas durante la instalación; por eso el código incluye la conexión pública de producción en `src/config.public.ts`. Esta alternativa requiere publicar una nueva compilación y no introduce credenciales privilegiadas.

Las previsualizaciones sin variables de conexión propias también utilizan ese proyecto de producción. Configura ambas variables con un proyecto separado antes de utilizarlas para modificar registros. El acceso telefónico sigue desactivado salvo que `VITE_PHONE_AUTH_ENABLED=true` se establezca expresamente.

Vercel puede proteger nuevos proyectos por defecto. La protección estándar mantiene públicos los dominios de producción y protege las URL de previsualización y despliegue; verifica el dominio público sin una sesión Vercel. El ajuste `publicSource` controla la exposición del código y logs, no el acceso público a la aplicación. [Protección de despliegues de Vercel](https://vercel.com/docs/deployment-protection).

Después de publicar, registra el commit desplegado, proyecto, entorno y URL; confirma el estado `READY` y abre la URL pública. Una URL de previsualización o una compilación correcta no prueba una publicación de producción.

## Comprobaciones de apertura

Estas comprobaciones son una guía operativa, no resultados ya ejecutados:

- Catálogo vacío sin errores y formulario de alta de centro usable en móvil y escritorio.
- Registro, confirmación y acceso con una dirección real; SMTP entrega fuera del equipo si el registro va a ser público.
- Propietario puede gestionar sus centros y pistas; otra cuenta no puede cambiarlos.
- Dos solicitudes concurrentes no pueden reservar la misma franja ni superar el aforo del partido.
- Un partido público con plazas se encuentra; el acceso inicial de un invitado a un partido privado requiere su invitación.
- Un invitado puede apuntarse sin cuenta, volver con el pase guardado, salir y asociar su plaza tras verificar una cuenta. Reintentar una solicitud con el mismo pase no duplica la plaza.
- Solo el organizador obtiene la invitación; el organizador o el propietario del centro pueden cancelar la reserva. El centro ve un resumen de su reserva privada sin acceder a la alineación.
- Si se anuncia OTP telefónico, envío y verificación real funcionan con el proveedor configurado.
- La URL de producción responde públicamente y utiliza el commit y entorno previstos.

Antes de cada publicación, ejecuta `git diff --check` y `npm run build`. Revisa `npm audit` y los avisos del mantenedor al actualizar dependencias; una auditoría limpia no sustituye la comprobación de autorización ni los recorridos anteriores. No publiques un servidor de desarrollo como servicio de producción.

## Registro de publicación

Instantánea de publicación del 20 de octubre de 2026. La respuesta HTTP acredita que la interfaz está publicada; la operativa de autenticación y reservas requiere comprobación independiente. Los elementos pendientes no acreditan configuración ni funcionamiento.

| Elemento | Valor verificado |
| --- | --- |
| Repositorio GitHub | [alvarovillalbaa/kickoff](https://github.com/alvarovillalbaa/kickoff), público; ID `1426175803`; rama `main`. |
| Equipo y proyecto Vercel | Clous Team / `kickoff-football`; ID `prj_Of9uoX3b8Hb7iGa1gRpLjAimyAPi`. |
| URL de producción | [kickoff-football-seven.vercel.app](https://kickoff-football-seven.vercel.app); despliegue `READY`; petición HEAD sin autenticación devuelve HTTP 200. |
| Versión funcional verificada | `13dc6d9743989f50e6a22c0a58335fa3b9dfb689`, publicada en `main`; despliegue de producción `dpl_9nviJ9J1Tv2LPihi77ai7wRCxErj` en estado `READY`. Incluye las correcciones de foco y pases de invitado descritas en [la revisión de interfaz](qa/2026-10-20.md). Los cambios posteriores de documentación pueden producir nuevos commits y despliegues. |
| Proyecto Supabase | Kickoff / `lucbdtdsofnybynjpdbp`; organización Clous; región `eu-central-1`; creación autorizada con coste cotizado de 0 USD/mes. |
| Instalación de esquema | `supabase/schema.sql` ejecutado correctamente mediante `execute_sql`; transacción completada. SHA-256 del esquema instalado: `83c6a716f3c6f69173d41c3e8673b7552b6d118ec24c191b5b3946e986345da1`. |
| Catálogo de datos | `public.browse()` consultado por REST anónimo con la clave publicable real; `centers`, `fields`, `slots` y `matches` devuelven `[]`. |
| Permisos de datos | RLS habilitado en las 6 tablas; ningún permiso de tabla privada para `anon`, `authenticated` o `PUBLIC`. Avisos de seguridad: 3 informativos por RLS sin políticas en tablas privadas accesibles solo por RPC. |
| Configuración pública | Conexión pública incluida en el bundle publicado; utiliza únicamente URL y clave publicable. En la versión `e7abb55`, el JavaScript servido coincidió byte a byte con el build local: SHA-256 `aa903054376c4b2a2828fd4ffee37676ce83ee1c92edb46d2495516441400fdb`. Ese hash corresponde a aquella versión, no a las correcciones posteriores. |
| Supabase Auth | Correo habilitado y altas permitidas; confirmación de correo obligatoria; proveedor telefónico desactivado. Configuración de Site URL y Redirect URLs pendiente de verificar en el panel. |
| Correo SMTP | El propietario indicó que lo configurará; configuración y entrega pendientes de verificar. |
| OTP SMS | Desactivado por defecto; pendiente de proveedor y verificación. |
| Prueba de usuarios y reservas | Pendiente; sin comprobación de alta, reserva, invitación ni concurrencia en el entorno publicado. |
| Verificación visual | Portada de escritorio y catálogo público de campos revisados en Chrome; viewport móvil de 375 × 667 comprobado. [Evidencia y límites](qa/2026-10-20.md). Los formularios de usuarios y reservas con datos reales siguen pendientes. |
| Compilación y checks | Compilación inicial local correcta; cambios de `13dc6d9` compilados por Vercel y publicados en estado `READY`. `git diff --check` correcto; última auditoría de dependencias sin vulnerabilidades conocidas. La repetición local del build quedó detenida por Storage Guard. |

El propietario ha indicado que configurará SMTP y las URL de autenticación en Supabase. Esa intención no acredita que ya estén configurados ni que se haya entregado un correo real. Mantener pendiente la aceptación de los recorridos de usuario hasta comprobarlos.
