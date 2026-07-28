import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseDriver } from '../mcp/runtime';
import { handleMcpTool } from '../mcp/tools';
import { DatabaseService } from '../db/service';
import { FileConnectionStore } from '../db/store';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('MCP helpers', () => {
  it('normaliza drivers', () => {
    assert.equal(parseDriver('postgresql'), 'postgres');
    assert.equal(parseDriver('mariadb'), 'mysql');
    assert.equal(parseDriver('sqlserver'), 'mssql');
  });

  it('db_list_connections tool', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-db-tool-'));
    const storeFile = path.join(dir, 'connections.json');
    const service = new DatabaseService(new FileConnectionStore(storeFile));
    await service.upsertConnection({
      name: 'x',
      driver: 'sqlite',
      filename: path.join(dir, 'x.db'),
    });
    const result = await handleMcpTool(service, 'db_list_connections', {});
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /demo-sqlite|\"name\": \"x\"/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
