import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, before, after } from 'node:test';
import { DatabaseService } from './service';
import { FileConnectionStore } from './store';

describe('DatabaseService + SQLite', () => {
  let dir: string;
  let dbFile: string;
  let storeFile: string;
  let service: DatabaseService;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-db-test-'));
    dbFile = path.join(dir, 'demo.sqlite');
    storeFile = path.join(dir, 'connections.json');
    service = new DatabaseService(new FileConnectionStore(storeFile), {
      allowDestructiveQueries: true,
      defaultRowLimit: 50,
    });

    const connection = await service.upsertConnection({
      name: 'demo-sqlite',
      driver: 'sqlite',
      filename: dbFile,
    });

    await service.executeQuery(
      connection.id,
      `CREATE TABLE users (
         id INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         email TEXT
       );`,
      { allowDestructive: true }
    );
    await service.executeQuery(
      connection.id,
      `INSERT INTO users (id, name, email) VALUES
         (1, 'Ada', 'ada@example.com'),
         (2, 'Grace', 'grace@example.com');`,
      { allowDestructive: true }
    );
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lista conexiones sin exponer password', async () => {
    const connections = await service.listConnections();
    assert.equal(connections.length, 1);
    assert.equal(connections[0].name, 'demo-sqlite');
    assert.equal('password' in connections[0], false);
  });

  it('lista tablas y columnas', async () => {
    const tables = await service.listTables('demo-sqlite');
    assert.ok(tables.some((table) => table.name === 'users'));
    const columns = await service.listColumns('demo-sqlite', 'users');
    assert.deepEqual(
      columns.map((column) => column.name),
      ['id', 'name', 'email']
    );
    assert.equal(columns[0].isPrimaryKey, true);
  });

  it('previsualiza filas', async () => {
    const preview = await service.previewTable('demo-sqlite', 'users', { limit: 10 });
    assert.equal(preview.rowCount, 2);
    assert.equal(preview.rows[0].name, 'Ada');
  });

  it('bloquea consultas destructivas si no están permitidas', async () => {
    const safe = new DatabaseService(new FileConnectionStore(storeFile), {
      allowDestructiveQueries: false,
    });
    await assert.rejects(
      () => safe.executeQuery('demo-sqlite', 'DELETE FROM users'),
      /destructiva/i
    );
  });
});
