import { buildPreviewSql, getDriver } from './drivers';
import type { ConnectionStore } from './store';
import { sanitizeConnection } from './store';
import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionInput,
  DatabaseInfo,
  QueryResult,
  SchemaInfo,
  TableInfo,
} from './types';

const DESTRUCTIVE_PATTERN =
  /^\s*(drop|truncate|alter\s+table|delete\s+from|update\s+\S+\s+set|create\s+or\s+replace)/i;

export interface DatabaseServiceOptions {
  allowDestructiveQueries?: boolean;
  defaultRowLimit?: number;
  queryTimeoutMs?: number;
}

export class DatabaseService {
  constructor(
    private readonly store: ConnectionStore,
    private readonly options: DatabaseServiceOptions = {}
  ) {}

  async listConnections() {
    const connections = await this.store.list();
    return connections.map(sanitizeConnection);
  }

  async getConnection(idOrName: string): Promise<ConnectionConfig> {
    const connections = await this.store.list();
    const found =
      connections.find((item) => item.id === idOrName) ||
      connections.find((item) => item.name.toLowerCase() === idOrName.toLowerCase());
    if (!found) {
      throw new Error(`Conexión no encontrada: ${idOrName}`);
    }
    return found;
  }

  async upsertConnection(input: ConnectionInput): Promise<ConnectionConfig> {
    return this.store.upsert(input);
  }

  async removeConnection(id: string): Promise<boolean> {
    return this.store.remove(id);
  }

  async testConnection(idOrName: string) {
    const connection = await this.getConnection(idOrName);
    return getDriver(connection.driver).testConnection(connection);
  }

  async listDatabases(idOrName: string): Promise<DatabaseInfo[]> {
    const connection = await this.getConnection(idOrName);
    return getDriver(connection.driver).listDatabases(connection);
  }

  async listSchemas(idOrName: string, database?: string): Promise<SchemaInfo[]> {
    const connection = await this.getConnection(idOrName);
    return getDriver(connection.driver).listSchemas(connection, database);
  }

  async listTables(
    idOrName: string,
    options?: { database?: string; schema?: string }
  ): Promise<TableInfo[]> {
    const connection = await this.getConnection(idOrName);
    return getDriver(connection.driver).listTables(connection, options);
  }

  async listColumns(
    idOrName: string,
    table: string,
    options?: { database?: string; schema?: string }
  ): Promise<ColumnInfo[]> {
    const connection = await this.getConnection(idOrName);
    return getDriver(connection.driver).listColumns(connection, table, options);
  }

  async describeTable(
    idOrName: string,
    table: string,
    options?: { database?: string; schema?: string }
  ) {
    const connection = await this.getConnection(idOrName);
    const columns = await this.listColumns(idOrName, table, options);
    return {
      connectionId: connection.id,
      connectionName: connection.name,
      driver: connection.driver,
      database: options?.database || connection.database,
      schema: options?.schema,
      table,
      columns,
    };
  }

  async previewTable(
    idOrName: string,
    table: string,
    options?: { database?: string; schema?: string; limit?: number }
  ): Promise<QueryResult> {
    const connection = await this.getConnection(idOrName);
    const limit = options?.limit ?? this.options.defaultRowLimit ?? 100;
    const sql = buildPreviewSql(connection, table, {
      database: options?.database,
      schema: options?.schema,
      limit,
    });
    return this.executeQuery(idOrName, sql, {
      database: options?.database,
      limit,
    });
  }

  async executeQuery(
    idOrName: string,
    sql: string,
    options?: { database?: string; limit?: number; allowDestructive?: boolean }
  ): Promise<QueryResult> {
    const connection = await this.getConnection(idOrName);
    const allowDestructive =
      options?.allowDestructive ?? this.options.allowDestructiveQueries ?? false;
    if (!allowDestructive && DESTRUCTIVE_PATTERN.test(sql)) {
      throw new Error(
        'Consulta potencialmente destructiva bloqueada. Activa mcpDb.allowDestructiveQueries o pasa allowDestructive=true.'
      );
    }
    return getDriver(connection.driver).executeQuery(connection, sql, {
      database: options?.database,
      limit: options?.limit ?? this.options.defaultRowLimit,
      timeoutMs: this.options.queryTimeoutMs,
    });
  }
}

export function isSelectLike(sql: string): boolean {
  const trimmed = sql.trim().toLowerCase();
  return (
    trimmed.startsWith('select') ||
    trimmed.startsWith('with') ||
    trimmed.startsWith('show') ||
    trimmed.startsWith('describe') ||
    trimmed.startsWith('explain') ||
    trimmed.startsWith('pragma')
  );
}
