import { mysqlDriver, buildMysqlPreviewSql } from './mysql';
import { mssqlDriver, buildMssqlPreviewSql } from './mssql';
import { postgresDriver, buildPostgresPreviewSql } from './postgres';
import { sqliteDriver, buildSqlitePreviewSql } from './sqlite';
import type { ConnectionConfig, DatabaseDriver, DriverAdapter } from '../types';

const drivers: Record<DatabaseDriver, DriverAdapter> = {
  postgres: postgresDriver,
  mysql: mysqlDriver,
  sqlite: sqliteDriver,
  mssql: mssqlDriver,
};

export function getDriver(driver: DatabaseDriver): DriverAdapter {
  const adapter = drivers[driver];
  if (!adapter) {
    throw new Error(`Driver no soportado: ${driver}`);
  }
  return adapter;
}

export function buildPreviewSql(
  config: ConnectionConfig,
  table: string,
  options?: { schema?: string; database?: string; limit?: number }
): string {
  const limit = options?.limit ?? 100;
  switch (config.driver) {
    case 'postgres':
      return buildPostgresPreviewSql(table, options?.schema || 'public', limit);
    case 'mysql':
      return buildMysqlPreviewSql(table, options?.database || options?.schema || config.database, limit);
    case 'sqlite':
      return buildSqlitePreviewSql(table, limit);
    case 'mssql':
      return buildMssqlPreviewSql(table, options?.schema || 'dbo', limit);
    default:
      throw new Error(`Driver no soportado: ${config.driver}`);
  }
}

export { mysqlDriver, mssqlDriver, postgresDriver, sqliteDriver };
