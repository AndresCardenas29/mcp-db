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

/**
 * Find all candidate connection files: explicit env var, default path,
 * and any temp-synced files the extension may have written.
 */
export function discoverConnectionsPaths(): string[] {
  const candidates: string[] = [];
  const envPath = process.env.MCP_DB_CONNECTIONS;
  if (envPath) {
    candidates.push(envPath);
  }
  candidates.push(defaultConnectionsPath());
  try {
    const tmpDir = require('node:os').tmpdir();
    const entries = fs.readdirSync(tmpDir);
    for (const entry of entries) {
      if (entry.startsWith('mcp-db-connections-') && entry.endsWith('.json')) {
        candidates.push(path.join(tmpDir, entry));
      }
    }
  } catch {
    // ignore
  }
  return [...new Set(candidates)];
}

/**
 * Store that merges connections from multiple file locations.
 * Writes go to the primary path; reads merge all discovered files.
 */
export class MultiFileConnectionStore implements ConnectionStore {
  private readonly primaryPath: string;

  constructor(primaryPath?: string) {
    this.primaryPath = primaryPath || process.env.MCP_DB_CONNECTIONS || defaultConnectionsPath();
  }

  private async readAllFiles(): Promise<ConnectionConfig[]> {
    const paths = discoverConnectionsPaths();
    const byId = new Map<string, ConnectionConfig>();
    for (const filePath of paths) {
      try {
        if (!fs.existsSync(filePath)) continue;
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        const items: ConnectionConfig[] = Array.isArray(parsed) ? parsed : [];
        for (const item of items) {
          if (item.id && !byId.has(item.id)) {
            byId.set(item.id, item);
          }
        }
      } catch {
        // skip unreadable files
      }
    }
    return [...byId.values()];
  }

  private async writeAll(connections: ConnectionConfig[]): Promise<void> {
    const dir = path.dirname(this.primaryPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(this.primaryPath, JSON.stringify(connections, null, 2), 'utf8');
  }

  async list(): Promise<ConnectionConfig[]> {
    const all = await this.readAllFiles();
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<ConnectionConfig | undefined> {
    const all = await this.readAllFiles();
    return all.find((item) => item.id === id);
  }

  async upsert(input: ConnectionInput): Promise<ConnectionConfig> {
    const primary = new FileConnectionStore(this.primaryPath);
    return primary.upsert(input);
  }

  async remove(id: string): Promise<boolean> {
    const primary = new FileConnectionStore(this.primaryPath);
    return primary.remove(id);
  }
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
