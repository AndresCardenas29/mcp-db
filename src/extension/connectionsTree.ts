import * as vscode from 'vscode';
import type { DatabaseService } from '../db/service';
import type { ColumnInfo, ConnectionConfig, TableInfo } from '../db/types';

export type TreeNodeType = 'connection' | 'database' | 'schema' | 'table' | 'column' | 'message';

export interface TreeNode {
  type: TreeNodeType;
  label: string;
  connection?: ConnectionConfig;
  database?: string;
  schema?: string;
  table?: TableInfo;
  column?: ColumnInfo;
  description?: string;
  collapsible?: boolean;
}

export class ConnectionsTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly getService: () => DatabaseService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    const collapsible =
      element.collapsible === false
        ? vscode.TreeItemCollapsibleState.None
        : element.type === 'column' || element.type === 'message'
          ? vscode.TreeItemCollapsibleState.None
          : vscode.TreeItemCollapsibleState.Collapsed;

    const item = new vscode.TreeItem(element.label, collapsible);
    item.description = element.description;
    item.contextValue = element.type;
    item.tooltip = this.tooltipFor(element);

    switch (element.type) {
      case 'connection':
        item.iconPath = new vscode.ThemeIcon('database');
        break;
      case 'database':
        item.iconPath = new vscode.ThemeIcon('server-environment');
        break;
      case 'schema':
        item.iconPath = new vscode.ThemeIcon('symbol-namespace');
        break;
      case 'table':
        item.iconPath = new vscode.ThemeIcon(
          element.table?.type === 'view' ? 'symbol-interface' : 'table'
        );
        item.command = {
          command: 'mcpDb.openTable',
          title: 'Ver tabla',
          arguments: [element],
        };
        break;
      case 'column':
        item.iconPath = new vscode.ThemeIcon(
          element.column?.isPrimaryKey ? 'key' : 'symbol-field'
        );
        break;
      default:
        item.iconPath = new vscode.ThemeIcon('info');
    }

    return item;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    const service = this.getService();
    try {
      if (!element) {
        const connections = await service.listConnections();
        if (!connections.length) {
          return [
            {
              type: 'message',
              label: 'Sin conexiones. Pulsa + para añadir una.',
              collapsible: false,
            },
          ];
        }
        const full = await Promise.all(connections.map((c) => service.getConnection(c.id)));
        return full.map((connection) => ({
          type: 'connection' as const,
          label: connection.name,
          description: connection.driver,
          connection,
        }));
      }

      if (element.type === 'connection' && element.connection) {
        if (element.connection.driver === 'sqlite') {
          const tables = await service.listTables(element.connection.id);
          return tables.map((table) => ({
            type: 'table' as const,
            label: table.name,
            description: table.type,
            connection: element.connection,
            database: element.connection!.database,
            schema: table.schema,
            table,
          }));
        }

        const databases = await service.listDatabases(element.connection.id);
        if (!databases.length && element.connection.database) {
          return this.childrenForDatabase(service, element.connection, element.connection.database);
        }
        return databases.map((database) => ({
          type: 'database' as const,
          label: database.name,
          connection: element.connection,
          database: database.name,
        }));
      }

      if (element.type === 'database' && element.connection && element.database) {
        return this.childrenForDatabase(service, element.connection, element.database);
      }

      if (element.type === 'schema' && element.connection && element.schema) {
        const tables = await service.listTables(element.connection.id, {
          database: element.database,
          schema: element.schema,
        });
        return tables.map((table) => ({
          type: 'table' as const,
          label: table.name,
          description: table.type,
          connection: element.connection,
          database: element.database,
          schema: element.schema,
          table,
        }));
      }

      if (element.type === 'table' && element.connection && element.table) {
        const columns = await service.listColumns(element.connection.id, element.table.name, {
          database: element.database,
          schema: element.schema || element.table.schema,
        });
        return columns.map((column) => ({
          type: 'column' as const,
          label: column.name,
          description: `${column.dataType}${column.isPrimaryKey ? ' · PK' : ''}`,
          connection: element.connection,
          database: element.database,
          schema: element.schema,
          table: element.table,
          column,
          collapsible: false,
        }));
      }

      return [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return [
        {
          type: 'message',
          label: `Error: ${message}`,
          collapsible: false,
        },
      ];
    }
  }

  private async childrenForDatabase(
    service: DatabaseService,
    connection: ConnectionConfig,
    database: string
  ): Promise<TreeNode[]> {
    if (connection.driver === 'mysql') {
      const tables = await service.listTables(connection.id, { database });
      return tables.map((table) => ({
        type: 'table' as const,
        label: table.name,
        description: table.type,
        connection,
        database,
        schema: database,
        table,
      }));
    }

    const schemas = await service.listSchemas(connection.id, database);
    if (!schemas.length) {
      const tables = await service.listTables(connection.id, { database });
      return tables.map((table) => ({
        type: 'table' as const,
        label: table.name,
        description: table.type,
        connection,
        database,
        schema: table.schema,
        table,
      }));
    }

    return schemas.map((schema) => ({
      type: 'schema' as const,
      label: schema.name,
      connection,
      database,
      schema: schema.name,
    }));
  }

  private tooltipFor(element: TreeNode): string {
    switch (element.type) {
      case 'connection':
        return `${element.connection?.name} (${element.connection?.driver})`;
      case 'table':
        return [element.database, element.schema, element.table?.name].filter(Boolean).join('.');
      case 'column':
        return `${element.column?.name}: ${element.column?.dataType}`;
      default:
        return element.label;
    }
  }
}
