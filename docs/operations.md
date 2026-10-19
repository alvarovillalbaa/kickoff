# Operación de Kickoff

## Arquitectura y límites

La aplicación es una SPA de React compilada con Vite. El navegador usa la URL y clave publicable de Supabase; Supabase Auth administra las identidades y sesiones. Postgres es la fuente de verdad de centros, pistas, disponibilidad, partidos y participantes.

Las políticas RLS y las funciones RPC deben aplicarse antes de habilitar reservas. La validación de la interfaz ayuda al usuario, pero la autorización, el aforo y la exclusión de reservas concurrentes se resuelven en la base de datos. No desactives RLS ni añadas una clave privilegiada al navegador para corregir errores de acceso.

El proyecto empieza sin centros, pistas, usuarios o partidos precargados. Las ilustraciones de la interfaz no representan inventario disponible. Los importes se guardan en céntimos y se muestran en euros; registrar una reserva no acredita un cobro.

## Instalar Supabase por primera vez

1. Selecciona explícitamente la organización y región del proyecto. Revisa cualquier coste antes de crear recursos facturables.
2. Crea un proyecto dedicado o utiliza uno nuevo destinado a Kickoff. No reutilices la base de datos de otra aplicación.
3. Lee `supabase/schema.sql` y ejecútalo completo en el editor SQL del proyecto con autorización administrativa. Es una instalación inicial, no un script para ejecutar repetidamente sobre una instalación existente. No contiene semillas de datos.
4. Comprueba que las tablas, restricciones, políticas y RPC se han creado y revisa los avisos de seguridad de Supabase. Corregir un error de permisos requiere revisar la política o el contrato correspondiente.
5. Obtén la URL del proyecto y su clave publicable. Configura `.env.local` para desarrollo y las mismas variables en el entorno Vercel correspondiente.

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

Al apuntarse sin cuenta, el invitado recibe un token aleatorio. El servidor guarda su hash SHA-256; el token original se devuelve al crear la plaza. El navegador lo conserva en `localStorage`, bajo `kickoff:guest-passes`, junto a `participant_id`, `match_id` y `display_name`. Ese pase permite dar de baja la propia plaza o asociarla a una cuenta verificada mediante `claim_guest`.

El pase identifica la plaza de ese invitado, no concede permisos de organizador. Borrar los datos del navegador o cambiar de dispositivo pierde el pase local; no prometas recuperación automática. No exportes los pases ni los registres en logs. La cancelación del partido corresponde al organizador y se valida en el servidor.

## Alta de centros y disponibilidad

Registra los datos del centro desde una cuenta confirmada. Cada pista pertenece a un centro y tiene formato, capacidad y precio propios. Publica las franjas que el centro puede ofrecer realmente y comprueba el horario antes de guardarlas.

Una reserva convierte una franja disponible en un partido. Las plazas libres dependen del aforo y participantes actuales; el catálogo vacío es un estado válido. No añadas inventario ficticio para presentar disponibilidad. Para comprobaciones de operación, utiliza registros reales autorizados para ese propósito y acuerda su conservación o retirada.

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

Configura `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_PHONE_AUTH_ENABLED` por separado para producción y previsualización. Usa un proyecto de datos separado para previsualizaciones cuando vayas a modificar registros. Desplegar sin las variables de Supabase publica la interfaz con la operativa pendiente de configuración.

Vercel puede proteger nuevos proyectos por defecto. La protección estándar mantiene públicos los dominios de producción y protege las URL de previsualización y despliegue; verifica el dominio público sin una sesión Vercel. El ajuste `publicSource` controla la exposición del código y logs, no el acceso público a la aplicación. [Protección de despliegues de Vercel](https://vercel.com/docs/deployment-protection).

Después de publicar, registra el commit desplegado, proyecto, entorno y URL; confirma el estado `READY` y abre la URL pública. Una URL de previsualización o una compilación correcta no prueba una publicación de producción.

## Comprobaciones de apertura

Estas comprobaciones son una guía operativa, no resultados ya ejecutados:

- Catálogo vacío sin errores y formulario de alta de centro usable en móvil y escritorio.
- Registro, confirmación y acceso con una dirección real; SMTP entrega fuera del equipo si el registro va a ser público.
- Propietario puede gestionar sus centros y pistas; otra cuenta no puede cambiarlos.
- Dos solicitudes concurrentes no pueden reservar la misma franja ni superar el aforo del partido.
- Un partido público con plazas se encuentra; un partido privado requiere su invitación.
- Un invitado puede apuntarse sin cuenta, salir con su pase y asociar su plaza tras verificar una cuenta.
- Solo el organizador obtiene la invitación y cancela el partido.
- Si se anuncia OTP telefónico, envío y verificación real funcionan con el proveedor configurado.
- La URL de producción responde públicamente y utiliza el commit y entorno previstos.

Antes de cada publicación, ejecuta `git diff --check` y `npm run build`. Revisa `npm audit` y los avisos del mantenedor al actualizar dependencias; una auditoría limpia no sustituye la comprobación de autorización ni los recorridos anteriores. No publiques un servidor de desarrollo como servicio de producción.

## Registro de publicación

Completa esta tabla solo con evidencia del entorno. Los valores pendientes no acreditan configuración ni publicación.

| Elemento | Valor verificado |
| --- | --- |
| Repositorio GitHub | `<REPO_URL_PENDING>` |
| Equipo y proyecto Vercel | `<VERCEL_PROJECT_PENDING>` |
| URL de producción | `<PRODUCTION_URL_PENDING>` |
| Commit de producción | `<PRODUCTION_COMMIT_PENDING>` |
| Proyecto Supabase | `<SUPABASE_PROJECT_PENDING>` |
| Instalación de esquema | Pendiente de registrar ejecución y resultado. |
| Correo SMTP | Pendiente de configurar y verificar entrega. |
| OTP SMS | Desactivado por defecto; pendiente de proveedor y verificación. |
