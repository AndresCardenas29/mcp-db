import type {
  ColumnInfo,
  ConnectionConfig,
  DatabaseInfo,
  DriverAdapter,
  QueryResult,
  SchemaInfo,
  TableInfo,
} from '../types';

type TediousConnection = import('tedious').Connection;
type TediousRequest = import('tedious').Request;

async function connect(config: ConnectionConfig, database?: string): Promise<TediousConnection> {
  const { Connection } = await import('tedious');
  return new Promise((resolve, reject) => {
    const connection = new Connection({
      server: config.host || 'localhost',
      authentication: {
        type: 'default',
        options: {
          userName: config.username || '',
          password: config.password || '',
        },
      },
      options: {
        port: config.port || 1433,
        database: database || config.database || undefined,
        encrypt: config.ssl ?? true,
        trustServerCertificate: true,
        connectTimeout: 10_000,
        requestTimeout: 30_000,
        rowCollectionOnRequestCompletion: true,
      },
    });

    connection.on('connect', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(connection);
      }
    });
    connection.connect();
  });
}

async function execSql(
  connection: TediousConnection,
  sql: string
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const { Request } = await import('tedious');
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    let columns: string[] = [];
    const request = new Request(sql, (err, _rowCount, resultRows) => {
      if (err) {
        reject(err);
        return;
      }
      if (Array.isArray(resultRows) && resultRows.length && !rows.length) {
        for (const row of resultRows as Array<Array<{ metadata: { colName: string }; value: unknown }>>) {
          const record: Record<string, unknown> = {};
          for (const col of row) {
            record[col.metadata.colName] = col.value;
          }
          rows.push(record);
        }
        if (!columns.length && rows[0]) {
          columns = Object.keys(rows[0]);
        }
      }
      resolve({ columns, rows });
    });

    request.on('columnMetadata', (columnsMetadata) => {
      const meta = (Array.isArray(columnsMetadata) ? columnsMetadata : [columnsMetadata]) as unknown as Array<{
        colName: string;
      }>;
      columns = meta.map((col) => col.colName);
    });

    request.on('row', (columnsData) => {
      const record: Record<string, unknown> = {};
      const cols = (Array.isArray(columnsData) ? columnsData : []) as unknown as Array<{
        metadata: { colName: string };
        value: unknown;
      }>;
      for (const col of cols) {
        record[col.metadata.colName] = col.value;
      }
      rows.push(record);
    });

    connection.execSql(request as TediousRequest);
  });
}

async function withConnection<T>(
  config: ConnectionConfig,
  database: string | undefined,
  fn: (connection: TediousConnection) => Promise<T>
): Promise<T> {
  const connection = await connect(config, database);
  try {
    return await fn(connection);
  } finally {
    connection.close();
  }
}

export const mssqlDriver: DriverAdapter = {
  async testConnection(config) {
    return withConnection(config, config.database, async (connection) => {
      const result = await execSql(connection, 'SELECT @@VERSION AS version');
      return {
        ok: true as const,
        version: result.rows[0] ? String(result.rows[0].version) : undefined,
      };
    });
  },

  async listDatabases(config): Promise<DatabaseInfo[]> {
    return withConnection(config, config.database, async (connection) => {
      const result = await execSql(
        connection,
        `SELECT name
         FROM sys.databases
         WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
         ORDER BY name`
      );
      return result.rows.map((row) => ({ name: String(row.name) }));
    });
  },

  async listSchemas(config, database): Promise<SchemaInfo[]> {
    return withConnection(config, database || config.database, async (connection) => {
      const result = await execSql(
        connection,
        `SELECT name
         FROM sys.schemas
         WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner', 'db_accessadmin',
           'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 'db_datareader',
           'db_datawriter', 'db_denydatareader', 'db_denydatawriter')
         ORDER BY name`
      );
      return result.rows.map((row) => ({ name: String(row.name) }));
    });
  },

  async listTables(config, options = {}): Promise<TableInfo[]> {
    const schema = options.schema;
    return withConnection(config, options.database || config.database, async (connection) => {
      const where = schema
        ? `TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'`
        : `TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')`;
      const result = await execSql(
        connection,
        `SELECT TABLE_SCHEMA AS [schema], TABLE_NAME AS name, TABLE_TYPE AS type
         FROM INFORMATION_SCHEMA.TABLES
         WHERE ${where}
         ORDER BY TABLE_SCHEMA, TABLE_NAME`
      );
      return result.rows.map((row) => ({
        schema: String(row.schema),
        name: String(row.name),
        type: String(row.type).toUpperCase().includes('VIEW') ? 'view' : 'table',
      }));
    });
  },

  async listColumns(config, table, options = {}): Promise<ColumnInfo[]> {
    const schema = options.schema || 'dbo';
    return withConnection(config, options.database || config.database, async (connection) => {
      const result = await execSql(
        connection,
        `SELECT
           c.COLUMN_NAME AS name,
           c.DATA_TYPE AS dataType,
           c.IS_NULLABLE AS nullable,
           c.COLUMN_DEFAULT AS defaultValue,
           c.CHARACTER_MAXIMUM_LENGTH AS maxLength,
           CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey
         FROM INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
             ON tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
         ) pk
           ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA
          AND c.TABLE_NAME = pk.TABLE_NAME
          AND c.COLUMN_NAME = pk.COLUMN_NAME
         WHERE c.TABLE_SCHEMA = '${schema.replace(/'/g, "''")}'
           AND c.TABLE_NAME = '${table.replace(/'/g, "''")}'
         ORDER BY c.ORDINAL_POSITION`
      );
      return result.rows.map((row) => ({
        name: String(row.name),
        dataType: String(row.dataType),
        nullable: String(row.nullable).toUpperCase() === 'YES',
        isPrimaryKey: Number(row.isPrimaryKey) === 1,
        defaultValue: row.defaultValue == null ? null : String(row.defaultValue),
        maxLength: row.maxLength == null ? null : Number(row.maxLength),
      }));
    });
  },

  async executeQuery(config, sql, options = {}): Promise<QueryResult> {
    const started = Date.now();
    return withConnection(config, options.database || config.database, async (connection) => {
      const result = await execSql(connection, sql);
      const limit = options.limit;
      const truncated = typeof limit === 'number' && result.rows.length > limit;
      return {
        columns: result.columns,
        rows: truncated ? result.rows.slice(0, limit) : result.rows,
        rowCount: truncated ? Math.min(result.rows.length, limit!) : result.rows.length,
        truncated,
        durationMs: Date.now() - started,
      };
    });
  },
};

export function buildMssqlPreviewSql(table: string, schema = 'dbo', limit = 100): string {
  const q = (value: string) => `[${value.replace(/]/g, ']]')}]`;
  return `SELECT TOP (${Math.max(1, limit)}) * FROM ${q(schema)}.${q(table)}`;
}
