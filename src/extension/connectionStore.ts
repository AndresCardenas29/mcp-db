import * as vscode from 'vscode';
import type { ConnectionStore } from '../db/store';
import type { ConnectionConfig, ConnectionInput } from '../db/types';
import { createConnectionId } from '../db/types';

const CONNECTIONS_KEY = 'mcpDb.connections';

type StoredConnection = Omit<ConnectionConfig, 'password'>;

export class VsCodeConnectionStore implements ConnectionStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private async readMeta(): Promise<StoredConnection[]> {
    return this.context.globalState.get<StoredConnection[]>(CONNECTIONS_KEY, []);
  }

  private async writeMeta(connections: StoredConnection[]): Promise<void> {
    await this.context.globalState.update(CONNECTIONS_KEY, connections);
  }

  private async readPassword(id: string): Promise<string | undefined> {
    return this.context.secrets.get(`mcpDb.password.${id}`);
  }

  private async writePassword(id: string, password: string | undefined): Promise<void> {
    const key = `mcpDb.password.${id}`;
    if (!password) {
      await this.context.secrets.delete(key);
      return;
    }
    await this.context.secrets.store(key, password);
  }

  async list(): Promise<ConnectionConfig[]> {
    const meta = await this.readMeta();
    const result: ConnectionConfig[] = [];
    for (const item of meta) {
      const password = await this.readPassword(item.id);
      result.push({ ...item, password });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<ConnectionConfig | undefined> {
    const all = await this.list();
    return all.find((item) => item.id === id);
  }

  async upsert(input: ConnectionInput): Promise<ConnectionConfig> {
    const meta = await this.readMeta();
    const existing = input.id ? meta.find((item) => item.id === input.id) : undefined;
    const now = new Date().toISOString();
    const id = existing?.id || input.id || createConnectionId();
    const nextMeta: StoredConnection = {
      id,
      name: input.name.trim(),
      driver: input.driver,
      host: input.host?.trim() || undefined,
      port: input.port,
      database: input.database?.trim() || undefined,
      username: input.username?.trim() || undefined,
      filename: input.filename?.trim() || undefined,
      ssl: input.ssl,
      options: input.options,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const index = meta.findIndex((item) => item.id === id);
    if (index >= 0) {
      meta[index] = nextMeta;
    } else {
      meta.push(nextMeta);
    }
    await this.writeMeta(meta);

    if (input.password !== undefined) {
      await this.writePassword(id, input.password || undefined);
    }

    const password = await this.readPassword(id);
    return { ...nextMeta, password };
  }

  async remove(id: string): Promise<boolean> {
    const meta = await this.readMeta();
    const next = meta.filter((item) => item.id !== id);
    if (next.length === meta.length) {
      return false;
    }
    await this.writeMeta(next);
    await this.writePassword(id, undefined);
    return true;
  }

  /** Export connections (with passwords) for the MCP child process env bridge. */
  async exportForMcp(): Promise<ConnectionConfig[]> {
    return this.list();
  }
}

// Re-export ConnectionStore type path convenience
export type { ConnectionStore } from '../db/store';
