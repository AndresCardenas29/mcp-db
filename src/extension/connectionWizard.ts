import * as vscode from 'vscode';
import type { DatabaseService } from '../db/service';
import type { ConnectionConfig, DatabaseDriver } from '../db/types';
import { DEFAULT_PORTS } from '../db/types';

const DRIVERS: Array<{ label: string; value: DatabaseDriver; description: string }> = [
  { label: 'PostgreSQL', value: 'postgres', description: 'Postgres / compatible' },
  { label: 'MySQL', value: 'mysql', description: 'MySQL / MariaDB' },
  { label: 'SQLite', value: 'sqlite', description: 'Archivo local .db / .sqlite' },
  { label: 'SQL Server', value: 'mssql', description: 'Microsoft SQL Server' },
];

async function promptText(
  title: string,
  value?: string,
  password = false
): Promise<string | undefined> {
  return vscode.window.showInputBox({
    title,
    value,
    password,
    ignoreFocusOut: true,
  });
}

export async function promptConnection(
  existing?: ConnectionConfig
): Promise<Omit<ConnectionConfig, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } | undefined> {
  const driverPick = await vscode.window.showQuickPick(
    DRIVERS.map((driver) => ({
      label: driver.label,
      description: driver.description,
      value: driver.value,
    })),
    {
      title: 'Tipo de base de datos',
      placeHolder: existing ? existing.driver : 'Selecciona un driver',
      ignoreFocusOut: true,
    }
  );
  if (!driverPick) {
    return undefined;
  }
  const driver = driverPick.value;

  const name = await promptText('Nombre de la conexión', existing?.name || driverPick.label);
  if (!name) {
    return undefined;
  }

  if (driver === 'sqlite') {
    const fileUri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Seleccionar archivo SQLite',
      filters: { SQLite: ['db', 'sqlite', 'sqlite3'], Todos: ['*'] },
      defaultUri: existing?.filename ? vscode.Uri.file(existing.filename) : undefined,
    });
    let filename = fileUri?.[0]?.fsPath;
    if (!filename) {
      filename = await promptText(
        'Ruta del archivo SQLite (se creará si no existe)',
        existing?.filename
      );
    }
    if (!filename) {
      return undefined;
    }
    return {
      id: existing?.id,
      name,
      driver,
      filename,
    };
  }

  const host = await promptText('Host', existing?.host || 'localhost');
  if (!host) {
    return undefined;
  }

  const portRaw = await promptText(
    'Puerto',
    String(existing?.port || DEFAULT_PORTS[driver])
  );
  if (!portRaw) {
    return undefined;
  }
  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    vscode.window.showErrorMessage('Puerto inválido');
    return undefined;
  }

  const database = await promptText('Base de datos', existing?.database);
  const username = await promptText('Usuario', existing?.username);
  const password = await promptText(
    existing ? 'Contraseña (vacío = mantener)' : 'Contraseña',
    undefined,
    true
  );

  const sslPick = await vscode.window.showQuickPick(
    [
      { label: 'Sin SSL', value: false },
      { label: 'Con SSL', value: true },
    ],
    {
      title: 'SSL',
      ignoreFocusOut: true,
    }
  );

  return {
    id: existing?.id,
    name,
    driver,
    host,
    port,
    database: database || undefined,
    username: username || undefined,
    password: password === undefined || password === '' ? existing?.password : password,
    ssl: sslPick?.value ?? existing?.ssl ?? false,
  };
}

export async function promptAndRunQuery(
  service: DatabaseService,
  connection: ConnectionConfig
): Promise<void> {
  const sql = await vscode.window.showInputBox({
    title: `SQL · ${connection.name}`,
    prompt: 'Escribe una consulta SQL',
    value: 'SELECT 1',
    ignoreFocusOut: true,
  });
  if (!sql) {
    return;
  }

  try {
    const result = await service.executeQuery(connection.id, sql, {
      allowDestructive: vscode.workspace
        .getConfiguration('mcpDb')
        .get<boolean>('allowDestructiveQueries', false),
    });
    const doc = await vscode.workspace.openTextDocument({
      language: 'json',
      content: JSON.stringify(result, null, 2),
    });
    await vscode.window.showTextDocument(doc, { preview: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Error SQL: ${message}`);
  }
}
