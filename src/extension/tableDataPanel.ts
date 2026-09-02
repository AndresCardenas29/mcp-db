import * as vscode from 'vscode';
import type { DatabaseService } from '../db/service';
import type { QueryResult } from '../db/types';
import type { TreeNode } from './connectionsTree';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTableHtml(title: string, subtitle: string, result: QueryResult): string {
  const header = result.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join('');
  const body = result.rows
    .map((row) => {
      const cells = result.columns
        .map((column) => {
          const value = row[column];
          const display =
            value === null || value === undefined
              ? '<span class="null">NULL</span>'
              : escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value);
          return `<td>${display}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border, #444);
      --header: var(--vscode-editor-inactiveSelectionBackground, #2a2a2a);
      --muted: var(--vscode-descriptionForeground, #888);
      --accent: var(--vscode-button-background, #0e639c);
    }
    body {
      margin: 0;
      font-family: var(--vscode-font-family);
      background: var(--bg);
      color: var(--fg);
    }
    header {
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(8px);
    }
    h1 {
      margin: 0 0 4px;
      font-size: 18px;
      font-weight: 600;
    }
    .meta {
      color: var(--muted);
      font-size: 12px;
    }
    .wrap {
      overflow: auto;
      max-height: calc(100vh - 72px);
    }
    table {
      border-collapse: collapse;
      width: max-content;
      min-width: 100%;
      font-size: 12px;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 8px 12px;
      text-align: left;
      white-space: nowrap;
      max-width: 420px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--header);
      font-weight: 600;
      z-index: 1;
    }
    tr:hover td {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .null {
      opacity: 0.55;
      font-style: italic;
    }
    .empty {
      padding: 32px 20px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">${escapeHtml(subtitle)} · ${result.rowCount} filas · ${result.durationMs} ms${
      result.truncated ? ' · truncado' : ''
    }</div>
  </header>
  ${
    result.rows.length
      ? `<div class="wrap"><table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></div>`
      : `<div class="empty">Sin filas</div>`
  }
</body>
</html>`;
}

export class TableDataPanel {
  public static current: TableDataPanel | undefined;
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly service: DatabaseService
  ) {
    this.panel = panel;
    this.panel.onDidDispose(() => {
      if (TableDataPanel.current === this) {
        TableDataPanel.current = undefined;
      }
    });
  }

  static async show(service: DatabaseService, node: TreeNode): Promise<void> {
    if (!node.connection || !node.table) {
      vscode.window.showWarningMessage('Selecciona una tabla para previsualizar.');
      return;
    }

    const title = `${node.table.name} · ${node.connection.name}`;
    const panel =
      TableDataPanel.current?.panel ??
      vscode.window.createWebviewPanel('mcpDb.tableData', title, vscode.ViewColumn.One, {
        enableScripts: false,
        retainContextWhenHidden: true,
      });

    panel.title = title;
    const view = TableDataPanel.current ?? new TableDataPanel(panel, service);
    TableDataPanel.current = view;

    panel.webview.html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px">Cargando ${title}…</body></html>`;

    try {
      const limit = vscode.workspace.getConfiguration('mcpDb').get<number>('defaultRowLimit', 100);
      const result = await service.previewTable(node.connection.id, node.table.name, {
        database: node.database,
        schema: node.schema || node.table.schema,
        limit,
      });
      const subtitle = [node.database, node.schema || node.table.schema, node.table.name]
        .filter(Boolean)
        .join('.');
      panel.webview.html = renderTableHtml(node.table.name, subtitle, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      panel.webview.html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;color:#c00">Error: ${escapeHtml(
        message
      )}</body></html>`;
      vscode.window.showErrorMessage(`No se pudo abrir la tabla: ${message}`);
    }
  }
}
