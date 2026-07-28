export type DatabaseDriver = 'postgres' | 'mysql' | 'sqlite' | 'mssql';

export interface ConnectionConfig {
  id: string;
  name: string;
  driver: DatabaseDriver;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  /** Absolute path for SQLite files */
  filename?: string;
  ssl?: boolean;
  options?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type ConnectionInput = Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export interface DatabaseInfo {
  name: string;
}

export interface SchemaInfo {
  name: string;
}

export interface TableInfo {
  name: string;
  schema?: string;
  type: 'table' | 'view';
  rowEstimate?: number | null;
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: string | null;
  maxLength?: number | null;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  command?: string;
}

export interface DriverAdapter {
  testConnection(config: ConnectionConfig): Promise<{ ok: true; version?: string }>;
  listDatabases(config: ConnectionConfig): Promise<DatabaseInfo[]>;
  listSchemas(config: ConnectionConfig, database?: string): Promise<SchemaInfo[]>;
  listTables(
    config: ConnectionConfig,
    options?: { database?: string; schema?: string }
  ): Promise<TableInfo[]>;
  listColumns(
    config: ConnectionConfig,
    table: string,
    options?: { database?: string; schema?: string }
  ): Promise<ColumnInfo[]>;
  executeQuery(
    config: ConnectionConfig,
    sql: string,
    options?: { database?: string; limit?: number; timeoutMs?: number }
  ): Promise<QueryResult>;
  dispose?(config: ConnectionConfig): Promise<void>;
}

export const DEFAULT_PORTS: Record<Exclude<DatabaseDriver, 'sqlite'>, number> = {
  postgres: 5432,
  mysql: 3306,
  mssql: 1433,
};

export function createConnectionId(): string {
  return `conn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
