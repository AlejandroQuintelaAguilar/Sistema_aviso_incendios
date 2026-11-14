# Conexión a PostgreSQL

El proyecto usa **una sola base compartida**. La aplicación no guarda datos en archivos ni en
memoria: PostgreSQL es la fuente de verdad.

## Variables de conexión

`neon init` ya creó `.env.local` en la raíz con las variables del proyecto de Neon
(`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_BRANCH`, `NEON_BRANCH_ID`).

- El archivo `.env.local` **no se sube a git** y no debe pegarse en el chat ni en el informe.
- La aplicación leerá `DATABASE_URL`.
- Para cambiar de base solo se cambia `DATABASE_URL`; el resto del proyecto no se toca.

Plantilla sin datos reales: `backend/.env.example`.

## Opción A — Neon (recomendada para el equipo)

Es la que ya está vinculada: proyecto `weathered-frost-89629267`, organización
`org-square-cloud-39684741`.

1. La cadena de conexión está en `.env.local` (ya configurada en esta laptop).
2. Cada compañero entra a https://console.neon.tech, abre el proyecto y copia **su** cadena
   desde *Connect*.
3. Cada uno crea su `.env.local` local con esa cadena. Nunca se comparte por git.
4. `sslmode=require` es obligatorio en Neon.
5. Verificar conexión con `psql` (ver más abajo).

Ventaja: las laptops pueden estar en redes distintas y no dependen de que una esté encendida.

## Opción B — PostgreSQL local compartido entre laptops

La base está en una laptop. Para que la otra la vea, **no se usa `localhost`**: se usa la IP
del equipo que la hospeda.

### B1. Misma red (aula o casa)

En la laptop que hospeda (PostgreSQL 18 en Windows):

1. Editar `C:\Program Files\PostgreSQL\18\data\postgresql.conf`:
   ```conf
   listen_addresses = '*'
   ```
2. Editar `C:\Program Files\PostgreSQL\18\data\pg_hba.conf` y agregar:
   ```conf
   host    incendios    app_incendios    192.168.1.0/24    scram-sha-256
   ```
   (usar la subred real; no abrir a `0.0.0.0/0`)
3. Reiniciar el servicio:
   ```powershell
   Restart-Service postgresql-x64-18
   ```
4. Abrir el puerto solo para la red local:
   ```powershell
   New-NetFirewallRule -DisplayName "PostgreSQL LAN" -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Allow -RemoteAddress 192.168.1.0/24
   ```
5. La otra laptop usa la IP del equipo: `postgresql://app_incendios:clave@192.168.1.50:5432/incendios`

### B2. Redes distintas — Tailscale

1. Instalar Tailscale en ambas laptops e iniciar sesión en la misma cuenta.
2. La laptop que hospeda queda con una IP `100.x.y.z`.
3. En `pg_hba.conf`, permitir la red de Tailscale:
   ```conf
   host    incendios    app_incendios    100.64.0.0/10    scram-sha-256
   ```
4. La otra laptop usa: `postgresql://app_incendios:clave@100.x.y.z:5432/incendios`

### B3. Nunca hacer esto

- Exponer el puerto 5432 a internet con la IP pública.
- Compartir el usuario `postgres` (superusuario).
- Usar la misma base para desarrollo y para la demo sin avisar al equipo.

## Usuario y base recomendados

```sql
CREATE ROLE app_incendios LOGIN PASSWORD 'clave_larga';
CREATE DATABASE incendios OWNER app_incendios;
```

Permisos mínimos sobre el esquema:

```sql
GRANT CONNECT ON DATABASE incendios TO app_incendios;
GRANT USAGE ON SCHEMA public TO app_incendios;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_incendios;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_incendios;
```

## Verificar la conexión

`psql` está en `C:\Program Files\PostgreSQL\18\bin` (agregar al PATH o usar la ruta completa).

```powershell
psql "postgresql://app_incendios:clave@HOST:5432/incendios?sslmode=require" -c "\dt"
psql "postgresql://app_incendios:clave@HOST:5432/incendios?sslmode=require" -c "SELECT now();"
```

Si responde con la fecha del servidor y lista las tablas, la conexión está bien.

## Regla para la demo de dos laptops

`DATABASE_URL` debe apuntar a **un host común**. Si dice `localhost`, cada laptop escribe en su
propia base y los datos no se comparten, aunque todo el código funcione.
