import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createDatabaseService } from './runtime';
import { handleMcpTool, mcpToolDefinitions } from './tools';

export async function startMcpServer(): Promise<void> {
  const allowDestructive = process.env.MCP_DB_ALLOW_DESTRUCTIVE === '1';
  const defaultRowLimit = Number(process.env.MCP_DB_ROW_LIMIT || 100);
  const queryTimeoutMs = Number(process.env.MCP_DB_QUERY_TIMEOUT_MS || 30000);

  const service = createDatabaseService({
    allowDestructiveQueries: allowDestructive,
    defaultRowLimit,
    queryTimeoutMs,
  });

  const server = new Server(
    {
      name: 'mcp-db',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpToolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    return handleMcpTool(service, request.params.name, args);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  startMcpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
