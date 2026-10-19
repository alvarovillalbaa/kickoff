# Kickoff

Una aplicación en español para encontrar partidos con plazas libres, reservar una pista y organizar quién juega. Los centros deportivos registran sus pistas y publican horarios; cada reserva crea un partido al que pueden unirse usuarios con cuenta o invitados.

React y Vite sirven la interfaz. Supabase proporciona autenticación y Postgres; las políticas RLS y las funciones de base de datos controlan propietarios, reservas, aforo e invitaciones. El catálogo comienza vacío: los centros, pistas, horarios y partidos se añaden con datos reales desde la aplicación.

## Arranque local

Requiere Node.js compatible con Vite 7, por ejemplo Node.js 22.12 o superior, y un proyecto Supabase preparado según [la guía de operaciones](docs/operations.md).

```sh
npm ci
cp .env.example .env.local
```

Completa estas variables en `.env.local`:

| Variable | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave publicable del mismo proyecto. |
| `VITE_PHONE_AUTH_ENABLED` | `false` por defecto; `true` solo después de configurar y verificar el proveedor SMS. |

Las variables `VITE_` forman parte del código entregado al navegador. Usa exclusivamente la clave publicable; las claves secretas, `service_role` y credenciales SMTP/SMS pertenecen a la configuración privada de los proveedores.

```sh
npm run dev
```

Para generar y previsualizar la aplicación estática:

```sh
npm run build
npm run preview
```

`dist/` es la salida de publicación. Cambiar las variables de Vite requiere una nueva compilación. Sin URL o clave de Supabase, la interfaz muestra un estado de configuración pendiente y las operaciones de reserva quedan indisponibles.

## Preparar datos reales

1. Instala [supabase/schema.sql](supabase/schema.sql) en un proyecto nuevo y configura Supabase Auth.
2. Crea y confirma tu cuenta de correo.
3. Registra tu centro y sus pistas, con precio, formato y capacidad.
4. Publica franjas de disponibilidad para cada pista.
5. Reserva una franja y organiza un partido público o por invitación.
6. Comparte la invitación desde la cuenta organizadora. Los invitados pueden apuntarse sin crear una cuenta.

El navegador del invitado conserva un pase para gestionar su plaza. Después de verificar una cuenta de correo o teléfono, puede asociar esa plaza a su cuenta. El OTP telefónico es opcional y necesita un servicio SMS real; no hay códigos de acceso simulados.

## Publicación y operación

La guía [docs/operations.md](docs/operations.md) describe instalación del esquema, correo de confirmación, SMS, despliegue en Vercel y comprobaciones antes de abrir reservas. También contiene el registro de publicación: una compilación local no acredita que la base de datos esté instalada ni que el correo, SMS o despliegue funcionen.
