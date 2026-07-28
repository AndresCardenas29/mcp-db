import * as os from 'node:os';
import * as vscode from 'vscode';
import { DatabaseService } from './db/service';
import { ConnectionsTreeProvider, type TreeNode } from './extension/connectionsTree';
import { VsCodeConnectionStore } from './extension/connectionStore';
import { promptAndRunQuery, promptConnection } from './extension/connectionWizard';
import { registerMcpProvider } from './extension/mcpRegistration';
import { TableDataPanel } from './extension/tableDataPanel';

function createService(store: VsCodeConnectionStore): DatabaseService {
  const config = vscode.workspace.getConfiguration('mcpDb');
  return new DatabaseService(store, {
    allowDestructiveQueries: config.get<boolean>('allowDestructiveQueries', false),
    defaultRowLimit: config.get<number>('defaultRowLimit', 100),
    queryTimeoutMs: config.get<number>('queryTimeoutMs', 30000),
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const store = new VsCodeConnectionStore(context);
  let service = createService(store);
  const getService = () => service;
  const tree = new ConnectionsTreeProvider(getService);

  const treeView = vscode.window.createTreeView('mcpDb.connections', {
    treeDataProvider: tree,
    showCollapseAll: true,
  });

  const { disposable: mcpRegistration, syncConnections } = registerMcpProvider(context, store);

  const refreshAll = async () => {
    service = createService(store);
    await syncConnections();
    tree.refresh();
  };

  context.subscriptions.push(
    treeView,
    mcpRegistration,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('mcpDb')) {
        void refreshAll();
      }
    }),
    vscode.commands.registerCommand('mcpDb.refresh', () => tree.refresh()),
    vscode.commands.registerCommand('mcpDb.addConnection', async () => {
      const input = await promptConnection();
      if (!input) {
        return;
      }
      const saved = await getService().upsertConnection(input);
      await refreshAll();
      vscode.window.showInformationMessage(`Conexión «${saved.name}» guardada.`);
    }),
    vscode.commands.registerCommand('mcpDb.editConnection', async (node?: TreeNode) => {
      const connection = node?.connection ?? (await pickConnection(getService));
      if (!connection) {
        return;
      }
      const input = await promptConnection(connection);
      if (!input) {
        return;
      }
      const saved = await getService().upsertConnection({ ...input, id: connection.id });
      await refreshAll();
      vscode.window.showInformationMessage(`Conexión «${saved.name}» actualizada.`);
    }),
    vscode.commands.registerCommand('mcpDb.removeConnection', async (node?: TreeNode) => {
      const connection = node?.connection ?? (await pickConnection(getService));
      if (!connection) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `¿Eliminar la conexión «${connection.name}»?`,
        { modal: true },
        'Eliminar'
      );
      if (confirm !== 'Eliminar') {
        return;
      }
      await getService().removeConnection(connection.id);
      await refreshAll();
    }),
    vscode.commands.registerCommand('mcpDb.testConnection', async (node?: TreeNode) => {
      const connection = node?.connection ?? (await pickConnection(getService));
      if (!connection) {
        return;
      }
      try {
        const result = await getService().testConnection(connection.id);
        vscode.window.showInformationMessage(
          `Conexión OK${result.version ? `: ${result.version.split('\n')[0]}` : ''}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Fallo de conexión: ${message}`);
      }
    }),
    vscode.commands.registerCommand('mcpDb.openTable', async (node?: TreeNode) => {
      if (!node || node.type !== 'table') {
        vscode.window.showInformationMessage('Expande una conexión y haz clic en una tabla.');
        return;
      }
      await TableDataPanel.show(getService(), node);
    }),
    vscode.commands.registerCommand('mcpDb.runQuery', async (node?: TreeNode) => {
      const connection = node?.connection ?? (await pickConnection(getService));
      if (!connection) {
        return;
      }
      await promptAndRunQuery(getService(), connection);
    }),
    vscode.commands.registerCommand('mcpDb.copyConnectionId', async (node?: TreeNode) => {
      const connection = node?.connection;
      if (!connection) {
        return;
      }
      await vscode.env.clipboard.writeText(connection.id);
      vscode.window.showInformationMessage('ID de conexión copiado.');
    }),
    vscode.commands.registerCommand('mcpDb.showMcpInfo', async () => {
      const extensionPath = context.extensionPath.replace(/\\/g, '/');
      const doc = await vscode.workspace.openTextDocument({
        language: 'markdown',
        content: `# MCP DB

El servidor MCP se registra automáticamente en VS Code y Cursor al instalar esta extensión.

## Tools disponibles
- \`db_list_connections\`
- \`db_upsert_connection\`
- \`db_remove_connection\`
- \`db_test_connection\`
- \`db_list_databases\`
- \`db_list_schemas\`
- \`db_list_tables\`
- \`db_describe_table\`
- \`db_preview_table\`
- \`db_execute_query\`

## Uso standalone (Cursor mcp.json / Claude Desktop)

\`\`\`json
{
  "mcpServers": {
    "mcp-db": {
      "command": "node",
      "args": ["${extensionPath}/dist/mcp/server.js"],
      "env": {
        "MCP_DB_CONNECTIONS": "${os.homedir().replace(/\\/g, '/')}/.mcp-db/connections.json"
      }
    }
  }
}
\`\`\`

Las conexiones creadas en la extensión se sincronizan con el servidor MCP registrado automáticamente.
`,
      });
      await vscode.window.showTextDocument(doc, { preview: true });
    })
  );
}

async function pickConnection(getService: () => DatabaseService) {
  const service = getService();
  const connections = await service.listConnections();
  if (!connections.length) {
    vscode.window.showInformationMessage('No hay conexiones. Añade una primero.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    connections.map((connection) => ({
      label: connection.name,
      description: connection.driver,
      detail: connection.id,
      connectionId: connection.id,
    })),
    { title: 'Selecciona una conexión', ignoreFocusOut: true }
  );
  if (!picked) {
    return undefined;
  }
  return service.getConnection(picked.connectionId);
}

export function deactivate(): void {
  // no-op
}
