import { z } from 'zod';
import type { DatabaseService } from '../db/service';
import { connectionInputFromArgs } from './runtime';

function text(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

export const mcpToolDefinitions = [
  {
    name: 'db_list_connections',
    description: 'Lista las conexiones de base de datos configuradas (sin contraseñas).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'db_upsert_connection',
    description:
      'Crea o actualiza una conexión. Drivers: postgres, mysql, sqlite, mssql. Para sqlite usa filename.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'ID existente para actualizar' },
        name: { type: 'string' },
        driver: { type: 'string', enum: ['postgres', 'mysql', 'sqlite', 'mssql'] },
        host: { type: 'string' },
        port: { type: 'number' },
        database: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string' },
        filename: { type: 'string', description: 'Ruta del archivo SQLite' },
        ssl: { type: 'boolean' },
      },
      required: ['name', 'driver'],
    },
  },
  {
    name: 'db_remove_connection',
    description: 'Elimina una conexión por id.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'string' },
      },
      required: ['connectionId'],
    },
  },
  {
    name: 'db_test_connection',
    description: 'Prueba una conexión por id o nombre.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string', description: 'ID o nombre de la conexión' },
      },
      required: ['connection'],
    },
  },
  {
    name: 'db_list_databases',
    description: 'Lista bases de datos disponibles en una conexión.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string' },
      },
      required: ['connection'],
    },
  },
  {
    name: 'db_list_schemas',
    description: 'Lista schemas de una base de datos.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string' },
        database: { type: 'string' },
      },
      required: ['connection'],
    },
  },
  {
    name: 'db_list_tables',
    description: 'Lista tablas y vistas. Opcionalmente filtra por database/schema.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string' },
        database: { type: 'string' },
        schema: { type: 'string' },
      },
      required: ['connection'],
    },
  },
  {
    name: 'db_describe_table',
    description: 'Describe columnas, tipos y claves de una tabla.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string' },
        table: { type: 'string' },
        database: { type: 'string' },
        schema: { type: 'string' },
      },
      required: ['connection', 'table'],
    },
  },
  {
    name: 'db_preview_table',
    description: 'Devuelve una previsualización de filas de una tabla.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string' },
        table: { type: 'string' },
        database: { type: 'string' },
        schema: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['connection', 'table'],
    },
  },
  {
    name: 'db_execute_query',
    description:
      'Ejecuta SQL en una conexión. Por defecto bloquea operaciones destructivas salvo allowDestructive=true.',
    inputSchema: {
      type: 'object',
      properties: {
        connection: { type: 'string' },
        sql: { type: 'string' },
        database: { type: 'string' },
        limit: { type: 'number' },
        allowDestructive: { type: 'boolean' },
      },
      required: ['connection', 'sql'],
    },
  },
] as const;

export async function handleMcpTool(
  service: DatabaseService,
  name: string,
  args: Record<string, unknown>
) {
  try {
    switch (name) {
      case 'db_list_connections': {
        const connections = await service.listConnections();
        if (!connections.length) {
          const { discoverConnectionsPaths } = await import('../db/store');
          const paths = discoverConnectionsPaths();
          return text({
            connections: [],
            message:
              'No se encontraron conexiones. Crea una con db_upsert_connection o añádela desde la extensión MCP DB en VS Code/Cursor.',
            searchedPaths: paths,
          });
        }
        return text(connections);
      }

      case 'db_upsert_connection': {
        const parsed = z
          .object({
            id: z.string().optional(),
            name: z.string().min(1),
            driver: z.string().min(1),
            host: z.string().optional(),
            port: z.number().optional(),
            database: z.string().optional(),
            username: z.string().optional(),
            password: z.string().optional(),
            filename: z.string().optional(),
            ssl: z.boolean().optional(),
          })
          .parse(args);
        const saved = await service.upsertConnection(connectionInputFromArgs(parsed));
        return text({
          id: saved.id,
          name: saved.name,
          driver: saved.driver,
          message: 'Conexión guardada',
        });
      }

      case 'db_remove_connection': {
        const connectionId = String(args.connectionId ?? '');
        const removed = await service.removeConnection(connectionId);
        return text({ removed, connectionId });
      }

      case 'db_test_connection':
        return text(await service.testConnection(String(args.connection ?? '')));

      case 'db_list_databases':
        return text(await service.listDatabases(String(args.connection ?? '')));

      case 'db_list_schemas':
        return text(
          await service.listSchemas(
            String(args.connection ?? ''),
            args.database == null ? undefined : String(args.database)
          )
        );

      case 'db_list_tables':
        return text(
          await service.listTables(String(args.connection ?? ''), {
            database: args.database == null ? undefined : String(args.database),
            schema: args.schema == null ? undefined : String(args.schema),
          })
        );

      case 'db_describe_table':
        return text(
          await service.describeTable(String(args.connection ?? ''), String(args.table ?? ''), {
            database: args.database == null ? undefined : String(args.database),
            schema: args.schema == null ? undefined : String(args.schema),
          })
        );

      case 'db_preview_table':
        return text(
          await service.previewTable(String(args.connection ?? ''), String(args.table ?? ''), {
            database: args.database == null ? undefined : String(args.database),
            schema: args.schema == null ? undefined : String(args.schema),
            limit: args.limit == null ? undefined : Number(args.limit),
          })
        );

      case 'db_execute_query':
        return text(
          await service.executeQuery(String(args.connection ?? ''), String(args.sql ?? ''), {
            database: args.database == null ? undefined : String(args.database),
            limit: args.limit == null ? undefined : Number(args.limit),
            allowDestructive:
              typeof args.allowDestructive === 'boolean' ? args.allowDestructive : undefined,
          })
        );

      default:
        return errorResult(new Error(`Tool desconocida: ${name}`));
    }
  } catch (error) {
    return errorResult(error);
  }
}
