import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { defaultConnectionsPath } from '../db/store';
import type { VsCodeConnectionStore } from './connectionStore';

export function registerMcpProvider(
  context: vscode.ExtensionContext,
  store: VsCodeConnectionStore
): { disposable: vscode.Disposable; syncConnections: () => Promise<void> } {
  /** Canonical path shared by extension UI and any MCP stdio process (mcp.json / auto-register). */
  const canonicalFile = defaultConnectionsPath();
  /** Temp mirror kept for backward compatibility with older MCP launches. */
  const syncFile = path.join(os.tmpdir(), `mcp-db-connections-${context.extension.id}.json`);

  const syncConnections = async () => {
    const connections = await store.exportForMcp();
    const payload = JSON.stringify(connections, null, 2);
    await fs.promises.mkdir(path.dirname(canonicalFile), { recursive: true });
    await fs.promises.writeFile(canonicalFile, payload, 'utf8');
    await fs.promises.writeFile(syncFile, payload, 'utf8');
  };

  const didChangeEmitter = new vscode.EventEmitter<void>();

  const provider = vscode.lm.registerMcpServerDefinitionProvider('mcpDb.mcpProvider', {
    onDidChangeMcpServerDefinitions: didChangeEmitter.event,
    provideMcpServerDefinitions: async () => {
      const enabled = vscode.workspace.getConfiguration('mcpDb').get<boolean>('mcp.enabled', true);
      if (!enabled) {
        return [];
      }
      await syncConnections();
      const serverJs = path.join(context.extensionPath, 'dist', 'mcp', 'server.js');
      return [
        new vscode.McpStdioServerDefinition(
          'MCP DB',
          'node',
          [serverJs],
          {
            MCP_DB_CONNECTIONS: canonicalFile,
            MCP_DB_ALLOW_DESTRUCTIVE: vscode.workspace
              .getConfiguration('mcpDb')
              .get<boolean>('allowDestructiveQueries', false)
              ? '1'
              : '0',
            MCP_DB_ROW_LIMIT: String(
              vscode.workspace.getConfiguration('mcpDb').get<number>('defaultRowLimit', 100)
            ),
            MCP_DB_QUERY_TIMEOUT_MS: String(
              vscode.workspace.getConfiguration('mcpDb').get<number>('queryTimeoutMs', 30000)
            ),
          },
          '0.1.1'
        ),
      ];
    },
    resolveMcpServerDefinition: async (definition) => {
      await syncConnections();
      return definition;
    },
  });

  void syncConnections().then(() => didChangeEmitter.fire());

  const disposable = vscode.Disposable.from(provider, didChangeEmitter, {
    dispose: () => {
      // Keep canonicalFile — agents/mcp.json keep using it after unload.
      try {
        fs.unlinkSync(syncFile);
      } catch {
        // ignore
      }
    },
  });

  return {
    disposable,
    syncConnections: async () => {
      await syncConnections();
      didChangeEmitter.fire();
    },
  };
}
