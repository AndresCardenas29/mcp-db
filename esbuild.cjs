const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
  external: ['vscode'],
};

function copyWasm() {
  const src = require.resolve('sql.js/dist/sql-wasm.wasm');
  const destDir = path.join(__dirname, 'dist');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, 'sql-wasm.wasm'));
  const mcpDir = path.join(destDir, 'mcp');
  fs.mkdirSync(mcpDir, { recursive: true });
  fs.copyFileSync(src, path.join(mcpDir, 'sql-wasm.wasm'));
}

async function main() {
  const extensionCtx = await esbuild.context({
    ...shared,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    format: 'cjs',
  });

  const mcpCtx = await esbuild.context({
    ...shared,
    entryPoints: ['src/mcp/server.ts'],
    outfile: 'dist/mcp/server.js',
    format: 'cjs',
    banner: {
      js: '#!/usr/bin/env node',
    },
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), mcpCtx.watch()]);
    copyWasm();
    console.log('[watch] build started…');
  } else {
    await Promise.all([extensionCtx.rebuild(), mcpCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), mcpCtx.dispose()]);
    copyWasm();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
