import { DatabaseService } from '../db/service';
import type { ConnectionStore } from '../db/store';
import { MultiFileConnectionStore, defaultConnectionsPath } from '../db/store';
import type { ConnectionInput, DatabaseDriver } from '../db/types';

export interface McpRuntimeOptions {
  store?: ConnectionStore;
  connectionsPath?: string;
  allowDestructiveQueries?: boolean;
  defaultRowLimit?: number;
  queryTimeoutMs?: number;
}

export function createDatabaseService(options: McpRuntimeOptions = {}): DatabaseService {
  const store =
    options.store ??
    new MultiFileConnectionStore(options.connectionsPath || process.env.MCP_DB_CONNECTIONS || defaultConnectionsPath());

  return new DatabaseService(store, {
    allowDestructiveQueries: options.allowDestructiveQueries,
    defaultRowLimit: options.defaultRowLimit,
    queryTimeoutMs: options.queryTimeoutMs,
  });
}

export function parseDriver(value: string): DatabaseDriver {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'postgres' ||
    normalized === 'postgresql' ||
    normalized === 'pg'
  ) {
    return 'postgres';
  }
  if (normalized === 'mysql' || normalized === 'mariadb') {
    return 'mysql';
  }
  if (normalized === 'sqlite' || normalized === 'sqlite3') {
    return 'sqlite';
  }
  if (
    normalized === 'mssql' ||
    normalized === 'sqlserver' ||
    normalized === 'sql-server'
  ) {
    return 'mssql';
  }
  throw new Error(`Driver no válido: ${value}. Usa postgres, mysql, sqlite o mssql.`);
}

export function connectionInputFromArgs(args: Record<string, unknown>): ConnectionInput {
  return {
    id: typeof args.id === 'string' ? args.id : undefined,
    name: String(args.name ?? ''),
    driver: parseDriver(String(args.driver ?? '')),
    host: args.host == null ? undefined : String(args.host),
    port: args.port == null ? undefined : Number(args.port),
    database: args.database == null ? undefined : String(args.database),
    username: args.username == null ? undefined : String(args.username),
    password: args.password == null ? undefined : String(args.password),
    filename: args.filename == null ? undefined : String(args.filename),
    ssl: typeof args.ssl === 'boolean' ? args.ssl : undefined,
  };
}
