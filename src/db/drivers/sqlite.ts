import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ColumnInfo,
  ConnectionConfig,
  DatabaseInfo,
  DriverAdapter,
  QueryResult,
  SchemaInfo,
  TableInfo,
} from '../types';

type SqlJsDatabase = import('sql.js').Database;

let sqlJsPromise: Promise<import('sql.js').InitSqlJsStatic> | undefined;

async function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = import('sql.js').then((mod) => {
      const init = (mod as { default?: import('sql.js').InitSqlJsStatic }).default ??
        (mod as unknown as import('sql.js').InitSqlJsStatic);
      return init;
    });
  }
  const initSqlJs = await sqlJsPromise;
  return initSqlJs({
    locateFile: (file) => {
      const candidates = [
        path.join(__dirname, file),
        path.join(__dirname, '..', file),
        path.join(__dirname, '..', '..', 'dist', file),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
      try {
        return require.resolve(`sql.js/dist/${file}`);
      } catch {
        return path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file);
      }
    },
  });
}

function resolveFilename(config: ConnectionConfig): string {
  const filename = config.filename?.trim();
  if (!filename) {
    throw new Error('SQLite requiere la ruta del archivo (filename)');
  }
  return path.resolve(filename);
}

async function openDatabase(config: ConnectionConfig): Promise<{
  db: SqlJsDatabase;
  filename: string;
  persist: () => void;
}> {
  const SQL = await loadSqlJs();
  const filename = resolveFilename(config);
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let db: SqlJsDatabase;
  if (fs.existsSync(filename)) {
    const fileBuffer = fs.readFileSync(filename);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
    const data = db.export();
    fs.writeFileSync(filename, Buffer.from(data));
  }

  return {
    db,
    filename,
    persist: () => {
      const data = db.export();
      fs.writeFileSync(filename, Buffer.from(data));
    },
  };
}

function rowsFromExec(db: SqlJsDatabase, sql: string): QueryResult {
  const started = Date.now();
  const results = db.exec(sql);
  if (!results.length) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      durationMs: Date.now() - started,
    };
  }
  const { columns, values } = results[0];
  const rows = values.map((valueRow) => {
    const record: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      record[column] = valueRow[index];
    });
    return record;
  });
  return {
    columns,
    rows,
    rowCount: rows.length,
    truncated: false,
    durationMs: Date.now() - started,
  };
}

export const sqliteDriver: DriverAdapter = {
  async testConnection(config) {
    const { db } = await openDatabase(config);
    try {
      const result = rowsFromExec(db, 'SELECT sqlite_version() AS version');
      return {
        ok: true as const,
        version: result.rows[0] ? String(result.rows[0].version) : undefined,
      };
    } finally {
      db.close();
    }
  },

  async listDatabases(config): Promise<DatabaseInfo[]> {
    const filename = resolveFilename(config);
    return [{ name: path.basename(filename) }];
  },

  async listSchemas(): Promise<SchemaInfo[]> {
    return [{ name: 'main' }];
  },

  async listTables(config): Promise<TableInfo[]> {
    const { db } = await openDatabase(config);
    try {
      const result = rowsFromExec(
        db,
        `SELECT name, type
         FROM sqlite_master
         WHERE type IN ('table', 'view')
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name`
      );
      return result.rows.map((row) => ({
        name: String(row.name),
        schema: 'main',
        type: String(row.type) === 'view' ? 'view' : 'table',
      }));
    } finally {
      db.close();
    }
  },

  async listColumns(config, table): Promise<ColumnInfo[]> {
    const { db } = await openDatabase(config);
    try {
      const safeTable = table.replace(/'/g, "''");
      const result = rowsFromExec(db, `PRAGMA table_info('${safeTable}')`);
      return result.rows.map((row) => ({
        name: String(row.name),
        dataType: String(row.type || 'ANY'),
        nullable: Number(row.notnull) === 0,
        isPrimaryKey: Number(row.pk) > 0,
        defaultValue: row.dflt_value == null ? null : String(row.dflt_value),
      }));
    } finally {
      db.close();
    }
  },

  async executeQuery(config, sql, options = {}): Promise<QueryResult> {
    const { db, persist } = await openDatabase(config);
    try {
      const result = rowsFromExec(db, sql);
      const trimmed = sql.trim().toLowerCase();
      if (
        trimmed.startsWith('insert') ||
        trimmed.startsWith('update') ||
        trimmed.startsWith('delete') ||
        trimmed.startsWith('create') ||
        trimmed.startsWith('drop') ||
        trimmed.startsWith('alter')
      ) {
        persist();
      }
      const limit = options.limit;
      const truncated = typeof limit === 'number' && result.rows.length > limit;
      return {
        ...result,
        rows: truncated ? result.rows.slice(0, limit) : result.rows,
        rowCount: truncated ? Math.min(result.rowCount, limit!) : result.rowCount,
        truncated,
      };
    } finally {
      db.close();
    }
  },
};

export function buildSqlitePreviewSql(table: string, limit = 100): string {
  const safe = table.replace(/"/g, '""');
  return `SELECT * FROM "${safe}" LIMIT ${Math.max(1, limit)}`;
}
