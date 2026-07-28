import type {
  ColumnInfo,
  ConnectionConfig,
  DatabaseInfo,
  DriverAdapter,
  QueryResult,
  SchemaInfo,
  TableInfo,
} from '../types';

function quoteIdent(value: string): string {
  return `\`${value.replace(/`/g, '``')}\``;
}

async function withConnection<T>(
  config: ConnectionConfig,
  database: string | undefined,
  fn: (conn: import('mysql2/promise').Connection) => Promise<T>
): Promise<T> {
  const mysql = await import('mysql2/promise');
  const conn = await mysql.createConnection({
    host: config.host || 'localhost',
    port: config.port || 3306,
    user: config.username,
    password: config.password,
    database: database || config.database || undefined,
    ssl: config.ssl ? {} : undefined,
    connectTimeout: 10_000,
    multipleStatements: false,
  });
  try {
    return await fn(conn);
  } finally {
    await conn.end().catch(() => undefined);
  }
}

export const mysqlDriver: DriverAdapter = {
  async testConnection(config) {
    return withConnection(config, config.database, async (conn) => {
      const [rows] = await conn.query('SELECT VERSION() AS version');
      const version = Array.isArray(rows) ? (rows[0] as { version?: string })?.version : undefined;
      return { ok: true as const, version: version ? String(version) : undefined };
    });
  },

  async listDatabases(config): Promise<DatabaseInfo[]> {
    return withConnection(config, undefined, async (conn) => {
      const [rows] = await conn.query(
        `SELECT SCHEMA_NAME AS name
         FROM information_schema.SCHEMATA
         WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
         ORDER BY SCHEMA_NAME`
      );
      return (rows as Array<{ name: string }>).map((row) => ({ name: String(row.name) }));
    });
  },

  async listSchemas(config, database): Promise<SchemaInfo[]> {
    const db = database || config.database;
    if (!db) {
      return [];
    }
    return [{ name: db }];
  },

  async listTables(config, options = {}): Promise<TableInfo[]> {
    const database = options.database || config.database;
    return withConnection(config, database, async (conn) => {
      const params: string[] = [];
      let where = `TABLE_SCHEMA NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')`;
      if (database) {
        params.push(database);
        where = `TABLE_SCHEMA = ?`;
      }
      const [rows] = await conn.query(
        `SELECT TABLE_SCHEMA AS \`schema\`, TABLE_NAME AS name, TABLE_TYPE AS type
         FROM information_schema.TABLES
         WHERE ${where}
         ORDER BY TABLE_SCHEMA, TABLE_NAME`,
        params
      );
      return (rows as Array<{ schema: string; name: string; type: string }>).map((row) => ({
        schema: String(row.schema),
        name: String(row.name),
        type: String(row.type).toUpperCase().includes('VIEW') ? 'view' : 'table',
      }));
    });
  },

  async listColumns(config, table, options = {}): Promise<ColumnInfo[]> {
    const database = options.database || options.schema || config.database;
    if (!database) {
      throw new Error('Se requiere database/schema para listar columnas en MySQL');
    }
    return withConnection(config, database, async (conn) => {
      const [rows] = await conn.query(
        `SELECT
           COLUMN_NAME AS name,
           DATA_TYPE AS dataType,
           IS_NULLABLE AS nullable,
           COLUMN_DEFAULT AS defaultValue,
           CHARACTER_MAXIMUM_LENGTH AS maxLength,
           COLUMN_KEY AS columnKey
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [database, table]
      );
      return (rows as Array<Record<string, unknown>>).map((row) => ({
        name: String(row.name),
        dataType: String(row.dataType),
        nullable: String(row.nullable).toUpperCase() === 'YES',
        isPrimaryKey: String(row.columnKey).toUpperCase() === 'PRI',
        defaultValue: row.defaultValue == null ? null : String(row.defaultValue),
        maxLength: row.maxLength == null ? null : Number(row.maxLength),
      }));
    });
  },

  async executeQuery(config, sql, options = {}): Promise<QueryResult> {
    const started = Date.now();
    return withConnection(config, options.database || config.database, async (conn) => {
      const [rows, fields] = await conn.query({
        sql,
        timeout: options.timeoutMs,
      });
      const recordRows = Array.isArray(rows)
        ? (rows as Record<string, unknown>[])
        : [];
      const limit = options.limit;
      const truncated = typeof limit === 'number' && recordRows.length > limit;
      const limitedRows = truncated ? recordRows.slice(0, limit) : recordRows;
      const columns = Array.isArray(fields)
        ? fields.map((field) => field.name)
        : limitedRows[0]
          ? Object.keys(limitedRows[0])
          : [];
      return {
        columns,
        rows: limitedRows,
        rowCount: limitedRows.length,
        truncated,
        durationMs: Date.now() - started,
      };
    });
  },
};

export function buildMysqlPreviewSql(table: string, database?: string, limit = 100): string {
  const fq =
    database != null && database.length > 0
      ? `${quoteIdent(database)}.${quoteIdent(table)}`
      : quoteIdent(table);
  return `SELECT * FROM ${fq} LIMIT ${Math.max(1, limit)}`;
}
