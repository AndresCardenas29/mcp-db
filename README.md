# MCP DB

Cliente de bases de datos para **VS Code** y **Cursor**, inspirado en DB Code: explora conexiones y tablas desde la barra lateral, previsualiza datos y expone un **servidor MCP** para que el agente de IA gestione tus bases de datos.

## Características

- Extensión instalable (`.vsix`) con vista **Conexiones** en el Activity Bar
- Explorador de bases de datos → schemas → tablas → columnas
- Previsualización de tablas en un panel webview
- Ejecución de consultas SQL desde la paleta de comandos
- Servidor MCP registrado automáticamente en VS Code / Cursor
- Drivers: **PostgreSQL**, **MySQL/MariaDB**, **SQLite**, **SQL Server**
- Bloqueo de consultas destructivas por defecto (`DELETE`/`DROP`/`TRUNCATE`/…)

## Instalación como extensión

```bash
npm install
npm run build
npm run package
```

Instala el `.vsix` generado:

- VS Code: `code --install-extension mcp-db-0.1.0.vsix`
- Cursor: `cursor --install-extension mcp-db-0.1.0.vsix`
  o *Extensions → … → Install from VSIX…*

Tras instalar, abre el icono **MCP DB** en la barra lateral y pulsa **+** para añadir una conexión.

## Uso en la extensión

1. **Añadir conexión** (PostgreSQL, MySQL, SQLite o SQL Server)
2. Expande la conexión para ver bases de datos, schemas y tablas
3. Haz clic en una tabla para ver sus filas
4. Clic derecho → *Ejecutar consulta SQL* / *Probar conexión*

### Comandos

| Comando | Descripción |
|---|---|
| `MCP DB: Añadir conexión` | Alta de conexión |
| `MCP DB: Ver tabla` | Previsualiza filas |
| `MCP DB: Ejecutar consulta SQL` | Corre SQL y muestra JSON |
| `MCP DB: Información del servidor MCP` | Ayuda de tools MCP |

## Servidor MCP (para el agente)

Al activarse la extensión, se registra automáticamente el provider `MCP DB` mediante `mcpServerDefinitionProviders`.

Las conexiones se sincronizan a `~/.mcp-db/connections.json` (ruta canónica compartida entre la UI y el proceso MCP). Si configuras el servidor a mano en `~/.cursor/mcp.json`, apunta esa variable:

```json
{
  "mcpServers": {
    "mcp-db": {
      "command": "node",
      "args": ["C:/ruta/a/mcp-db/dist/mcp/server.js"],
      "env": {
        "MCP_DB_CONNECTIONS": "C:/Users/TU_USUARIO/.mcp-db/connections.json"
      }
    }
  }
}
```

### Tools

| Tool | Descripción |
|---|---|
| `db_list_connections` | Lista conexiones |
| `db_upsert_connection` | Crea/actualiza conexión |
| `db_remove_connection` | Elimina conexión |
| `db_test_connection` | Prueba conectividad |
| `db_list_databases` | Lista databases |
| `db_list_schemas` | Lista schemas |
| `db_list_tables` | Lista tablas/vistas |
| `db_describe_table` | Columnas y tipos |
| `db_preview_table` | Preview de filas |
| `db_execute_query` | Ejecuta SQL |

Ejemplo de prompt:

> Lista mis conexiones MCP DB, lee las tablas de `local-postgres` y muestra el schema de `orders`.

### Uso standalone (stdio)

También puedes lanzar el MCP fuera de la extensión:

```bash
npm run build
node dist/mcp/server.js
```

Configuración Cursor / Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-db": {
      "command": "node",
      "args": ["/ruta/al/repo/dist/mcp/server.js"],
      "env": {
        "MCP_DB_CONNECTIONS": "/home/usuario/.mcp-db/connections.json"
      }
    }
  }
}
```

Formato de `connections.json`:

```json
[
  {
    "id": "conn_local",
    "name": "local-postgres",
    "driver": "postgres",
    "host": "localhost",
    "port": 5432,
    "database": "app",
    "username": "postgres",
    "password": "secret",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
]
```

Variables de entorno:

| Variable | Descripción |
|---|---|
| `MCP_DB_CONNECTIONS` | Ruta al JSON de conexiones |
| `MCP_DB_ALLOW_DESTRUCTIVE` | `1` para permitir DML/DDL destructivo |
| `MCP_DB_ROW_LIMIT` | Límite de filas (default `100`) |
| `MCP_DB_QUERY_TIMEOUT_MS` | Timeout (default `30000`) |

## Ajustes de la extensión

- `mcpDb.defaultRowLimit` — filas al previsualizar tablas
- `mcpDb.queryTimeoutMs` — timeout de consultas
- `mcpDb.allowDestructiveQueries` — permite DELETE/DROP/…
- `mcpDb.mcp.enabled` — activa/desactiva el registro MCP automático

## Desarrollo

```bash
npm install
npm run watch
npm run compile
npm run test:unit
```

Abre el repo en VS Code/Cursor y usa **F5** (*Run Extension*) con la config de `.vscode/launch.json`.

## Estructura

```
src/
  db/           # drivers + servicio compartido
  mcp/          # servidor MCP stdio
  extension/    # UI VS Code (tree, webview, wizard)
  extension.ts  # activate()
```

## Seguridad

- Las contraseñas de la extensión se guardan en `SecretStorage` de VS Code
- El MCP hijo recibe un snapshot temporal sincronizado de las conexiones
- Las consultas destructivas están bloqueadas salvo configuración explícita
- Solo usa MCP con bases de datos cuyo contenido puedas compartir con el cliente de IA

## Licencia

MIT
