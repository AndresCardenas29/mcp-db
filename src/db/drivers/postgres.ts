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
  return `"${value.replace(/"/g, '""')}"`;
}

async function withClient<T>(
  config: ConnectionConfig,
  database: string | undefined,
  fn: (client: import('pg').Client) => Promise<T>
): Promise<T> {
  const { Client } = await import('pg');
  const client = new Client({
    host: config.host || 'localhost',
    port: config.port || 5432,
    user: config.username,
    password: config.password,
    database: database || config.database || 'postgres',
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

export const postgresDriver: DriverAdapter = {
  async testConnection(config) {
    return withClient(config, config.database, async (client) => {
      const result = await client.query('SELECT version() AS version');
      return { ok: true as const, version: String(result.rows[0]?.version ?? '') };
    });
  },

  async listDatabases(config): Promise<DatabaseInfo[]> {
    return withClient(config, config.database || 'postgres', async (client) => {
      const result = await client.query(
        `SELECT datname AS name
         FROM pg_database
         WHERE datistemplate = false
         ORDER BY datname`
      );
      return result.rows.map((row) => ({ name: String(row.name) }));
    });
  },

  async listSchemas(config, database): Promise<SchemaInfo[]> {
    return withClient(config, database || config.database, async (client) => {
      const result = await client.query(
        `SELECT schema_name AS name
         FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schema_name`
      );
      return result.rows.map((row) => ({ name: String(row.name) }));
    });
  },

  async listTables(config, options = {}): Promise<TableInfo[]> {
    const schema = options.schema;
    return withClient(config, options.database || config.database, async (client) => {
      const params: string[] = [];
      let where = `table_schema NOT IN ('pg_catalog', 'information_schema')`;
      if (schema) {
        params.push(schema);
        where = `table_schema = $1`;
      }
      const result = await client.query(
        `SELECT table_schema AS schema, table_name AS name, table_type AS type
         FROM information_schema.tables
         WHERE ${where}
         ORDER BY table_schema, table_name`,
        params
      );
      return result.rows.map((row) => ({
        schema: String(row.schema),
        name: String(row.name),
        type: String(row.type).toUpperCase().includes('VIEW') ? 'view' : 'table',
      }));
    });
  },

  async listColumns(config, table, options = {}): Promise<ColumnInfo[]> {
    const schema = options.schema || 'public';
    return withClient(config, options.database || config.database, async (client) => {
      const result = await client.query(
        `SELECT
           c.column_name AS name,
           c.data_type AS "dataType",
           c.is_nullable AS nullable,
           c.column_default AS "defaultValue",
           c.character_maximum_length AS "maxLength",
           CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN true ELSE false END AS "isPrimaryKey"
         FROM information_schema.columns c
         LEFT JOIN information_schema.key_column_usage kcu
           ON c.table_schema = kcu.table_schema
          AND c.table_name = kcu.table_name
          AND c.column_name = kcu.column_name
         LEFT JOIN information_schema.table_constraints tc
           ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
          AND tc.constraint_type = 'PRIMARY KEY'
         WHERE c.table_schema = $1 AND c.table_name = $2
         ORDER BY c.ordinal_position`,
        [schema, table]
      );

      const byName = new Map<string, ColumnInfo>();
      for (const row of result.rows) {
        const name = String(row.name);
        const existing = byName.get(name);
        const isPk = Boolean(row.isPrimaryKey);
        if (!existing) {
          byName.set(name, {
            name,
            dataType: String(row.dataType),
            nullable: String(row.nullable).toUpperCase() === 'YES',
            isPrimaryKey: isPk,
            defaultValue: row.defaultValue == null ? null : String(row.defaultValue),
            maxLength: row.maxLength == null ? null : Number(row.maxLength),
          });
        } else if (isPk) {
          existing.isPrimaryKey = true;
        }
      }
      return [...byName.values()];
    });
  },

  async executeQuery(config, sql, options = {}): Promise<QueryResult> {
    const started = Date.now();
    return withClient(config, options.database || config.database, async (client) => {
      if (options.timeoutMs) {
        await client.query(`SET statement_timeout = ${Math.max(1, Math.floor(options.timeoutMs))}`);
      }
      const result = await client.query(sql);
      const rows = (result.rows as Record<string, unknown>[]) ?? [];
      const limit = options.limit;
      const truncated = typeof limit === 'number' && rows.length > limit;
      const limitedRows = truncated ? rows.slice(0, limit) : rows;
      const columns =
        result.fields?.map((field) => field.name) ??
        (limitedRows[0] ? Object.keys(limitedRows[0]) : []);
      return {
        columns,
        rows: limitedRows,
        rowCount: limitedRows.length,
        truncated,
        durationMs: Date.now() - started,
        command: result.command,
      };
    });
  },
};

export function buildPostgresPreviewSql(
  table: string,
  schema = 'public',
  limit = 100
): string {
  return `SELECT * FROM ${quoteIdent(schema)}.${quoteIdent(table)} LIMIT ${Math.max(1, limit)}`;
}
