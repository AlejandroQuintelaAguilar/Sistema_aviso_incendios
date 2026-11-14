# Sincronización entre PostgreSQL local y Neon

## Lo que se quiere lograr

- Cada laptop tiene PostgreSQL local.
- Neon es la base compartida del equipo.
- Un cambio hecho en una laptop debe verse en Neon.
- Y debe verse también en el PostgreSQL local de las otras laptops.
- Todo se debe poder mostrar con `psql` o pgAdmin, tanto local como en Neon.

Esto es **replicación de base de datos**, no solo "refrescar la pantalla". Hay que elegir un
patrón, porque PostgreSQL replica en **un sentido por suscripción**; la sincronización en ambos
sentidos (multi-maestro) no es automática ni segura.

## Los tres patrones posibles

| Patrón | Cómo se escribe | Se ve en local | Se ve en Neon | Complejidad |
|---|---|---|---|---|
| **A. Solo Neon** | La app escribe en Neon | No (solo si hay copia) | Sí | Baja |
| **B. Neon maestro + réplica local** | La app escribe en Neon; Neon replica a cada local | Sí (réplica de solo lectura) | Sí | Media |
| **C. Local primero y sincronizar** | La app escribe en local y algo lo empuja a Neon | Sí (escritura real) | Sí | Alta |

## Patrón A — Neon como única base (lo más simple)

Cada laptop usa Neon para trabajar y su PostgreSQL local solo para pruebas personales. No hay
sincronización; el local se llena con `pg_dump` / `pg_restore` cuando se necesita una copia.

- Cumple "usar PostgreSQL" y "compartir datos entre laptops".
- No cumple "el cambio nace en mi local y sube a Neon".
- Es el más estable para la demo.

## Patrón B — Neon maestro y cada laptop como réplica (recomendado)

Neon publica los cambios y cada PostgreSQL local se suscribe. Los cambios hechos por la app
llegan a Neon y de ahí bajan a todos los locales en segundos.

```
Laptop A ──escribe──► Neon ──replica──► Local laptop B
                        └──replica──► Local laptop C
```

Características:

- El local es **de solo lectura** para las tablas replicadas.
- La escritura siempre entra por Neon (la app apunta su `DATABASE_URL` a Neon).
- Si se escribe a mano en el local, la réplica se rompe por conflicto: no hacerlo.
- Es el patrón que mejor cumple "mostrar el cambio en local y en Neon" con poco riesgo.

### Requisitos y pasos

1. **Habilitar replicación lógica en Neon** (una sola vez por proyecto):
   - Consola de Neon → Project Settings → **Logical Replication** → Enable.
   - Cambia `wal_level` a `logical` en todo el proyecto y **no se puede revertir**.
   - Reinicia los computes: las conexiones activas se cortan.
   - Mientras hay suscriptores conectados, el compute no se suspende (consume CU-hours).

2. **Crear la publicación en Neon**:

   ```sql
   CREATE PUBLICATION incendios_pub FOR ALL TABLES;
   ```

3. **Usar la cadena directa (sin `-pooler`)** para replicación. La variable
   `DATABASE_URL_UNPOOLED` de `.env.local` sirve para esto.

4. **El rol de replicación debe tener privilegio `REPLICATION`**. Los roles creados desde la
   consola/CLI/API de Neon lo tienen; los creados con `CREATE ROLE` por SQL **no**, y ese
   privilegio no se puede otorgar por SQL. Usar el rol administrado por Neon para la suscripción.

5. **Crear el esquema en el local** (la replicación lógica **no copia DDL**). Las tablas deben
   existir antes de suscribirse; la suscripción copia los datos iniciales.

6. **Crear la suscripción en cada laptop**:

   ```sql
   CREATE SUBSCRIPTION incendios_sub
   CONNECTION 'postgresql://USUARIO:CLAVE@ep-xxxx.region.aws.neon.tech/neondb?sslmode=require'
   PUBLICATION incendios_pub;
   ```

7. **Verificar**:

   ```sql
   SELECT * FROM pg_stat_subscription;
   SELECT count(*) FROM incendios;
   ```

8. **Cada cambio de esquema** (nueva columna, nueva tabla) se aplica en Neon y en cada local
   manualmente; no se replica. Las migraciones van en `backend/migrations/`.

### Limitaciones que hay que saber decir en la exposición

- La replicación lógica no replica `TRUNCATE` salvo que se configure `publish_truncate`.
- No replica secuencias: los `id` los sigue generando cada base. Como el local es de solo
  lectura, no hay choque.
- No replica DDL (estructura): se migra aparte.
- Los `DELETE` sí se replican (con `REPLICA IDENTITY` adecuada).
- Neon elimina slots de replicación inactivos; si una laptop pasa mucho tiempo apagada, hay que
  revisar el estado de la suscripción.

## Patrón C — Escritura local y sincronización hacia Neon

Es lo que se describe literalmente ("cambio en mi local y luego sube a Neon"). Tiene dos
implementaciones y ambas son costosas:

### C1. Replicación lógica bidireccional nativa

Cada laptop publica y Neon se suscribe a cada una. Problemas:

- Neon (en la nube) necesita **alcanzar** el PostgreSQL de cada laptop: IP pública, NAT o túnel.
  Esto es el bloqueo principal.
- Dos suscripciones cruzadas pueden provocar bucles; se mitiga con `origin = none` (PostgreSQL 16+)
  pero hay que entenderlo bien.
- Conflictos: dos laptops crean el `id = 5`, o editan la misma fila. PostgreSQL no los resuelve.
- `DELETE` y claves foráneas complican la convergencia.

No se recomienda para un proyecto de clase.

### C2. Sincronización desde la aplicación (outbox)

La app escribe en local y un servicio de sincronización empuja a Neon; las otras laptops
descargan los cambios. Requiere desde el diseño:

- Claves primarias **UUID** (no `SERIAL`) para evitar choques entre laptops.
- `updated_at` y regla de conflicto (gana el más reciente).
- Borrado lógico (`deleted_at`) en lugar de `DELETE` físico.
- Cola de salida (`outbox`) con estado `pendiente`/`sincronizado` y reintentos.
- Un módulo en `backend/app/services/sync/` y un endpoint en `backend/app/routes/`.

Es la opción correcta si de verdad se exige escritura local primero, pero es la que más código
y más pruebas necesita.

## Recomendación

1. Para la demo: **Patrón B**. La app escribe en Neon y cada laptop muestra los mismos datos en
   su PostgreSQL local como réplica.
2. Si el profesor acepta que la escritura entre por Neon: B es suficiente y demostrable.
3. Solo ir a C2 si el requisito es explícito: "primero se guarda en el local y después sube".

## Evidencia para mostrar

| Qué se muestra | Dónde |
|---|---|
| Registro creado desde la app | Pantalla de la laptop A |
| Fila en Neon | Consola SQL de Neon / `psql` con `DATABASE_URL_UNPOOLED` |
| Fila en el local de B | `psql -d incendios -c "SELECT * FROM incendios ORDER BY id DESC;"` |
| Modificación | `updated_at` distinto en Neon y en el local de B |
| Persistencia | Reiniciar la app y volver a consultar |

## Antes de activar nada

- Habilitar replicación lógica en Neon es **irreversible** y reinicia los computes.
- Hay que decidir el patrón primero; no se activa por prueba y error en el proyecto compartido.
- El esquema de tablas todavía no existe: primero van las migraciones de la iteración 1.
