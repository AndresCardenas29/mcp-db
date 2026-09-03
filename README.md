# MCP DB

Cliente de bases de datos para **VS Code** y **Cursor** (estilo DB Code): explora tablas desde la barra lateral y expone un **servidor MCP** para que el agente de IA consulte y opere sobre tus bases de datos.

## Qué hace

| Capacidad | Dónde |
|---|---|
| Ver conexiones, databases, schemas, tablas y columnas | Extensión (Activity Bar → **MCP DB**) |
| Previsualizar filas de una tabla | Extensión (clic en la tabla) |
| Ejecutar SQL manualmente | Extensión (comando / menú contextual) |
| Listar conexiones, leer schema, preview y SQL | **Agente** vía tools MCP (`db_*`) |

**Drivers:** PostgreSQL · MySQL/MariaDB · SQLite · SQL Server

---

## Requisitos

- [Node.js](https://nodejs.org/) **18+** (recomendado 20/22)
- [Cursor](https://cursor.com/) o VS Code **1.99+**
- Acceso de red al servidor de base de datos que quieras usar

---

## Instalación paso a paso

### Opción recomendada: descargar el `.vsix` desde GitHub

En cada push a `main`, CI genera el `.vsix` y lo publica en el release **Latest**:

**[https://github.com/AndresCardenas29/mcp-db/releases/tag/latest](https://github.com/AndresCardenas29/mcp-db/releases/tag/latest)**

1. Entra al release **Latest**  
2. En **Assets**, descarga `mcp-db-*.vsix`  
3. Instálalo en Cursor / VS Code:

**CLI**

```bash
# Cursor
cursor --install-extension mcp-db-0.1.1.vsix

# VS Code
code --install-extension mcp-db-0.1.1.vsix
```

**Interfaz**

1. Abre Cursor / VS Code  
2. Ve a **Extensions**  
3. Menú `⋯` → **Install from VSIX…**  
4. Selecciona el `.vsix` descargado  
5. Recarga la ventana si te lo pide (`Developer: Reload Window`)

No hace falta clonar el repo ni compilar.

> El workflow está en [`.github/workflows/build-vsix.yml`](.github/workflows/build-vsix.yml). También puedes lanzarlo a mano en **Actions → Build VSIX → Run workflow**.

### Opción alternativa: compilar desde el código

```bash
git clone https://github.com/andrescardenas29/mcp-db.git
cd mcp-db
npm install
npm run build
npm run package
```

Se crea `mcp-db-*.vsix` en la raíz. Luego instálalo igual que arriba.

### Configurar el MCP para el agente (Cursor)

Para que **el chat/agente** use las mismas conexiones que la extensión, edita (o crea) el archivo:

- Windows: `%USERPROFILE%\.cursor\mcp.json`  
- macOS/Linux: `~/.cursor/mcp.json`

Añade el servidor `mcp-db` (ajusta la ruta de `args` a tu usuario):

```json
{
  "mcpServers": {
    "mcp-db": {
      "command": "node",
      "args": [
        "C:/Users/TU_USUARIO/.cursor/extensions/mcp-db.mcp-db-0.1.0/dist/mcp/server.js"
      ],
      "env": {
        "MCP_DB_CONNECTIONS": "C:/Users/TU_USUARIO/.mcp-db/connections.json",
        "MCP_DB_ROW_LIMIT": "100",
        "MCP_DB_ALLOW_DESTRUCTIVE": "0"
      }
    }
  }
}
```

Notas importantes:

- Tras instalar el `.vsix`, la carpeta suele estar en  
  `~/.cursor/extensions/mcp-db.mcp-db-<versión>/dist/mcp/server.js`  
  (el nombre exacto puede variar; búscalo si hace falta).
- **`MCP_DB_CONNECTIONS` es obligatorio** para el agente: apunta al archivo canónico donde la extensión sincroniza las conexiones.
- En Windows usa rutas con `/` o escapa las `\`.
- Hay un ejemplo en [`.cursor/mcp.json.example`](.cursor/mcp.json.example).

También puedes apuntar `args` al `dist/mcp/server.js` del repo si desarrollas en local:

```json
"args": ["C:/Users/TU_USUARIO/Documents/MCP/mcp-db/dist/mcp/server.js"]
```

### Reiniciar / recargar MCP

1. Guarda `mcp.json`  
2. En Cursor: **Settings → MCP** y asegúrate de que `mcp-db` aparece y está habilitado  
3. Si ya estaba cargado, **reinicia Cursor** o desactiva/activa el servidor MCP para que tome el `env` nuevo  

### Crear una conexión en la extensión

1. Abre el icono **MCP DB** en la Activity Bar (barra izquierda)  
2. Pulsa **+** (*Añadir conexión*)  
3. Elige driver (p. ej. SQL Server), host, puerto, base, usuario y contraseña  
4. Clic derecho en la conexión → **Probar conexión**  
5. Expande y haz clic en una tabla para ver filas  

Al guardar, la extensión escribe/actualiza:

```text
~/.mcp-db/connections.json
```

(`%USERPROFILE%\.mcp-db\connections.json` en Windows)

### Verificar que el agente puede usarlo

En el chat de Cursor (modo agente / tools habilitados), prueba:

> Lista mis conexiones de mcp-db y prueba la conexión AXA.

El agente debería llamar tools como `db_list_connections` y `db_test_connection`.

Otras pruebas útiles:

> Lista las bases de datos de AXA  
> Lista las tablas de APIManager  
> Describe la tabla CatalogoSistemas  
> Muéstrame 5 filas de CatalogoSistemas  

Si `db_list_connections` devuelve `[]`, revisa la sección de `mcp.json` / `MCP_DB_CONNECTIONS`.

---

## Uso diario

### Extensión (UI)

1. Activity Bar → **MCP DB**  
2. Expandir conexión → database → schema → tabla  
3. Clic en tabla → preview  
4. Clic derecho → *Ejecutar consulta SQL* / *Probar conexión* / *Editar* / *Eliminar*

### Comandos (Palette)

| Comando | Descripción |
|---|---|
| `MCP DB: Añadir conexión` | Alta de conexión |
| `MCP DB: Ver tabla` | Previsualiza filas |
| `MCP DB: Ejecutar consulta SQL` | Corre SQL y muestra JSON |
| `MCP DB: Probar conexión` | Verifica conectividad |
| `MCP DB: Información del servidor MCP` | Resumen de tools |

### Agente (MCP tools)

| Tool | Descripción |
|---|---|
| `db_list_connections` | Lista conexiones (sin contraseñas) |
| `db_upsert_connection` | Crea/actualiza conexión |
| `db_remove_connection` | Elimina conexión por id |
| `db_test_connection` | Prueba conectividad |
| `db_list_databases` | Lista databases |
| `db_list_schemas` | Lista schemas |
| `db_list_tables` | Lista tablas/vistas |
| `db_describe_table` | Columnas, tipos y PK |
| `db_preview_table` | Preview de filas |
| `db_execute_query` | Ejecuta SQL |

Ejemplo de prompt:

> Lista mis conexiones MCP DB, lee las tablas de `AXA` en `APIManager` y describe `CatalogoSistemas`.

---

## Actualizar la extensión

1. Descarga el `.vsix` nuevo desde el release **[Latest](https://github.com/AndresCardenas29/mcp-db/releases/tag/latest)**  
2. Instálalo otra vez (`Install from VSIX` o `cursor --install-extension …`)  
3. Recarga la ventana  
4. Si cambió la ruta del `server.js` en Extensions, actualiza `args` en `mcp.json`

---

## Desarrollo local (sin empaquetar)

```bash
npm install
npm run build        # o: npm run watch
npm run compile      # typecheck
npm run test:unit
```

- **F5** (*Run Extension*) con `.vscode/launch.json` para depurar la UI.  
- MCP standalone:

```bash
node dist/mcp/server.js
```

---

## Archivo de conexiones

Ruta canónica (compartida UI ↔ agente):

```text
~/.mcp-db/connections.json
```

Formato:

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

Drivers válidos: `postgres` | `mysql` | `sqlite` | `mssql`  
Para SQLite usa `filename` en lugar de host/puerto.

### Variables de entorno del proceso MCP

| Variable | Descripción |
|---|---|
| `MCP_DB_CONNECTIONS` | Ruta al JSON de conexiones (**requerida** en `mcp.json`) |
| `MCP_DB_ALLOW_DESTRUCTIVE` | `1` permite DELETE/DROP/TRUNCATE/… |
| `MCP_DB_ROW_LIMIT` | Límite de filas (default `100`) |
| `MCP_DB_QUERY_TIMEOUT_MS` | Timeout en ms (default `30000`) |

---

## Ajustes de la extensión

| Setting | Descripción |
|---|---|
| `mcpDb.defaultRowLimit` | Filas al previsualizar tablas |
| `mcpDb.queryTimeoutMs` | Timeout de consultas |
| `mcpDb.allowDestructiveQueries` | Permite DML/DDL destructivo |
| `mcpDb.mcp.enabled` | Registro MCP automático vía API de la extensión |

---

## Solución de problemas

| Síntoma | Qué revisar |
|---|---|
| El agente dice que no hay conexiones | `MCP_DB_CONNECTIONS` en `mcp.json` y que exista `~/.mcp-db/connections.json` |
| MCP no aparece en Cursor | Entrada `mcp-db` en `~/.cursor/mcp.json` + reinicio de Cursor |
| `Cannot find module …/server.js` | Ruta en `args`: reinstala el `.vsix` o apunta al `dist` del repo tras `npm run build` |
| Fallo al conectar SQL Server | Host/puerto, usuario, firewall; prueba desde la extensión *Probar conexión* |
| Consulta destructiva bloqueada | Activa `mcpDb.allowDestructiveQueries` o `MCP_DB_ALLOW_DESTRUCTIVE=1` / `allowDestructive: true` en el tool |
| Ves tablas en la UI pero el agente no | La UI y el MCP deben compartir el mismo `connections.json` (`MCP_DB_CONNECTIONS`) |

---

## Estructura del repo

```text
src/
  db/           # drivers + servicio compartido
  mcp/          # servidor MCP stdio
  extension/    # UI VS Code (tree, webview, wizard)
  extension.ts  # activate()
```

---

## Seguridad

- En la extensión, las contraseñas van a `SecretStorage` de VS Code/Cursor.
- Al sincronizar para el MCP, también se escriben en `~/.mcp-db/connections.json` (protege ese archivo; no lo subas a git).
- Las consultas destructivas están bloqueadas por defecto.
- Solo usa el MCP con datos que puedas compartir con el cliente de IA.

---

## Licencia

MIT
