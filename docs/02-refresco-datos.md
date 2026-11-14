# Refresco de datos entre laptops

## Qué significa el requisito

Que un dato creado o modificado en una laptop aparezca en la otra. Eso se logra con **dos cosas
separadas**:

1. **Base compartida:** ambas laptops apuntan al mismo `DATABASE_URL` (ver
   `01-conexion-base-datos.md`). Sin esto no hay nada que refrescar.
2. **Refresco:** la interfaz vuelve a consultar los datos cada cierto tiempo o recibe un aviso
   del servidor.

El refresco no comparte datos por sí solo; solo actualiza la pantalla.

## Opciones (de menor a mayor esfuerzo)

| Estrategia | Cómo se ve en la demo | Costo | Recomendación |
|---|---|---|---|
| Manual (F5) | El usuario recarga | Ninguno | Solo como respaldo |
| **Polling cada 3–5 s** | Aparece solo en pocos segundos | Bajo | **Recomendado para la demo** |
| SSE (Server-Sent Events) | Aparece casi instantáneo | Medio | Si el profe exige "en vivo" |
| WebSocket / Neon Realtime | Aparece en tiempo real | Alto | Cuando el proyecto ya esté estable |

## Dónde vivirá el refresco (sin implementar todavía)

| Pieza | Ubicación prevista |
|---|---|
| Cliente HTTP y configuración de la URL del backend | `frontend/src/api/` |
| Hook reutilizable de refresco (`useRefresco`) | `frontend/src/hooks/` |
| Consulta periódica o suscripción | `frontend/src/services/` |
| Pantallas que muestran los datos | `frontend/src/pages/` |
| Endpoint que entrega los datos | `backend/app/routes/` + `controllers/` |

Regla de diseño: el refresco se activa por módulo y se apaga al salir de la pantalla, para no
hacer consultas innecesarias. También conviene pausarlo cuando la pestaña está en segundo plano.

## Evidencia para la presentación

1. Laptop A crea un registro.
2. Laptop B lo ve aparecer (polling o refresco).
3. En ambas se ejecuta `SELECT` en PostgreSQL y devuelve la misma fila.
4. Se modifica en B; en A cambia `updated_at` y se mantiene `created_at`.
5. Se reinicia el backend y los datos siguen: persistencia real.

## Aclaración importante para el informe

El frontend **no** se conecta directo a PostgreSQL. El refresco consulta la API de Flask, y Flask
consulta la base. Así se mantiene el MVC y la base nunca queda expuesta.
