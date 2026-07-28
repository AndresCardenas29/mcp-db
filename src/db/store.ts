import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createConnectionId,
  type ConnectionConfig,
  type ConnectionInput,
} from './types';

export interface ConnectionStore {
  list(): Promise<ConnectionConfig[]>;
  get(id: string): Promise<ConnectionConfig | undefined>;
  upsert(input: ConnectionInput): Promise<ConnectionConfig>;
  remove(id: string): Promise<boolean>;
}

function normalize(input: ConnectionInput, existing?: ConnectionConfig): ConnectionConfig {
  const now = new Date().toISOString();
  return {
    id: existing?.id || input.id || createConnectionId(),
    name: input.name.trim(),
    driver: input.driver,
    host: input.host?.trim() || undefined,
    port: input.port,
    database: input.database?.trim() || undefined,
    username: input.username?.trim() || undefined,
    password: input.password,
    filename: input.filename?.trim() || undefined,
    ssl: input.ssl,
    options: input.options,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/** File-backed store used by the standalone MCP process. */
export class FileConnectionStore implements ConnectionStore {
  constructor(private readonly filePath: string) {}

  private async readAll(): Promise<ConnectionConfig[]> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as ConnectionConfig[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async writeAll(connections: ConnectionConfig[]): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(this.filePath, JSON.stringify(connections, null, 2), 'utf8');
  }

  async list(): Promise<ConnectionConfig[]> {
    const all = await this.readAll();
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<ConnectionConfig | undefined> {
    const all = await this.readAll();
    return all.find((item) => item.id === id);
  }

  async upsert(input: ConnectionInput): Promise<ConnectionConfig> {
    const all = await this.readAll();
    const existing = input.id ? all.find((item) => item.id === input.id) : undefined;
    const next = normalize(input, existing);
    const index = all.findIndex((item) => item.id === next.id);
    if (index >= 0) {
      all[index] = next;
    } else {
      all.push(next);
    }
    await this.writeAll(all);
    return next;
  }

  async remove(id: string): Promise<boolean> {
    const all = await this.readAll();
    const next = all.filter((item) => item.id !== id);
    if (next.length === all.length) {
      return false;
    }
    await this.writeAll(next);
    return true;
  }
}

export function defaultConnectionsPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
  return path.join(home, '.mcp-db', 'connections.json');
}

export function sanitizeConnection(connection: ConnectionConfig): Omit<ConnectionConfig, 'password'> & {
  hasPassword: boolean;
} {
  const { password, ...rest } = connection;
  return {
    ...rest,
    hasPassword: Boolean(password),
  };
}
