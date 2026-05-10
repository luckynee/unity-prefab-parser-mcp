import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('MCP integration', () => {
  test('lists tools and parses a prefab over stdio', async () => {
    const client = new Client({
      name: 'unity-prefab-parser-test-client',
      version: '1.0.0',
    });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repoRoot, 'dist', 'index.js')],
      cwd: repoRoot,
      stderr: 'pipe',
    });

    const stderrChunks: string[] = [];
    transport.stderr?.on('data', chunk => {
      stderrChunks.push(chunk.toString());
    });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      const toolNames = tools.tools.map(tool => tool.name);

      assert.ok(toolNames.includes('parse_unity_file'));
      assert.ok(toolNames.includes('parse_unity_prefab'));

      const prefabPath = path.join(repoRoot, 'test', 'fixtures', 'BatPF.prefab');
      const result = await client.callTool({
        name: 'parse_unity_file',
        arguments: {
          filePath: prefabPath,
          config: { preset: 'compact' },
        },
      });

      const textContent = result.content.find(item => item.type === 'text');
      assert.ok(textContent && 'text' in textContent, 'Expected text content from MCP tool');
      assert.match(textContent.text, /prefab_name: BatPF/);
      assert.match(textContent.text, /components:/);
    } finally {
      await transport.close();
      assert.ok(!stderrChunks.join('').includes('Fatal error:'), 'Server should not report fatal errors');
    }
  });

  test('parses a text-serialized asset over stdio', async () => {
    const client = new Client({
      name: 'unity-prefab-parser-test-client',
      version: '1.0.0',
    });

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.join(repoRoot, 'dist', 'index.js')],
      cwd: repoRoot,
      stderr: 'pipe',
    });

    try {
      await client.connect(transport);

      const assetPath = path.join(repoRoot, 'test', 'fixtures', 'SampleData.asset');
      const result = await client.callTool({
        name: 'parse_unity_file',
        arguments: {
          filePath: assetPath,
          config: { preset: 'standard' },
        },
      });

      const textContent = result.content.find(item => item.type === 'text');
      assert.ok(textContent && 'text' in textContent, 'Expected text content from MCP tool');
      assert.match(textContent.text, /prefab_name: SampleData/);
      assert.match(textContent.text, /components:/);
      assert.match(textContent.text, /count: 3/);
      assert.match(textContent.text, /label: Example/);
    } finally {
      await transport.close();
    }
  });
});
