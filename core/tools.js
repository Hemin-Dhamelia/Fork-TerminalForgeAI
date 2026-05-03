/**
 * core/tools.js — Local tool executor for TerminalForge agents
 *
 * Gives all 5 agents real filesystem and shell access on the local machine.
 *
 * Tools available to every agent:
 *   read_file        — read any text file
 *   write_file       — create or overwrite a file (creates parent dirs)
 *   list_directory   — ls with type/size, optional recursion (3 levels max)
 *   run_command      — exec any shell command with 30s timeout
 *   search_files     — grep across files, returns matches with line numbers
 *   delete_file      — permanently delete a file
 *   create_directory — mkdir -p
 *   move_file        — rename or move a file / directory
 *
 * All paths may be relative to PROJECT_ROOT or absolute.
 * run_command defaults cwd to PROJECT_ROOT; override with the cwd param.
 */

import { readFile, writeFile, readdir, unlink, mkdir, rename, stat } from 'fs/promises';
import { join, resolve, dirname, relative, isAbsolute } from 'path';
import { fileURLToPath } from 'url';
import { exec }   from 'child_process';
import { promisify } from 'util';
import createDebug from 'debug';

const execAsync = promisify(exec);
const debug = createDebug('tf:tools');

const __dirname   = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(join(__dirname, '..'));

// Output caps — keep context from being overwhelmed
const MAX_FILE_READ_BYTES  = 150_000;   // 150 KB read limit
const MAX_CMD_OUTPUT_CHARS = 30_000;    // 30 K chars command output
const CMD_TIMEOUT_MS       = 30_000;    // 30 s per command

// Dirs to skip when listing recursively
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.next', 'dist',
  'build', '.cache', 'coverage', '.venv', 'venv',
]);

// ── Path helper ──────────────────────────────────────────────────────────

function resolvePath(p) {
  if (!p) return PROJECT_ROOT;
  if (isAbsolute(p)) return p;
  return resolve(join(PROJECT_ROOT, p));
}

// ── Tool Definitions (Anthropic API tool_use format) ─────────────────────

export const TOOL_DEFINITIONS = [
  {
    name: 'read_file',
    description:
      'Read the contents of any text file. Files larger than 150 KB are automatically truncated. ' +
      'Use relative paths from the project root or absolute paths.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path — relative to project root, or absolute' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Write content to a file. Creates the file and any missing parent directories automatically. ' +
      'Overwrites the file if it already exists. Provide the COMPLETE file content, not a diff.',
    input_schema: {
      type: 'object',
      properties: {
        path:    { type: 'string', description: 'File path — relative to project root, or absolute' },
        content: { type: 'string', description: 'Complete file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description:
      'List the files and subdirectories at a given path. ' +
      'Shows name, type (file/dir), and size. node_modules and .git are collapsed.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory to list. Defaults to project root.',
        },
        recursive: {
          type: 'boolean',
          description: 'List recursively up to 3 levels deep. Default: false.',
        },
      },
    },
  },
  {
    name: 'run_command',
    description:
      'Execute any shell command and return its combined stdout + stderr. ' +
      'Timeout is 30 seconds. Use this to run: npm install, npm test, npm run build, ' +
      'git add/commit/push, node scripts, python scripts, pip install, docker commands, ' +
      'curl, mkdir, cp, or any other CLI tool. The command runs in the project root by default.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description:
            'Shell command to execute. Examples: "npm install express", "git init", ' +
            '"python3 app.py", "docker build -t myapp ."',
        },
        cwd: {
          type: 'string',
          description:
            'Working directory for the command. Defaults to project root. ' +
            'Use this when running commands inside a subdirectory.',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'search_files',
    description:
      'Search for a text or regex pattern across project files. ' +
      'Returns up to 100 matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text or regex pattern to search for. Example: "function login" or "import.*express"',
        },
        path: {
          type: 'string',
          description: 'Directory to search in. Defaults to project root.',
        },
        include: {
          type: 'string',
          description: 'File extension filter. Example: "*.js" or "*.py". Optional.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'delete_file',
    description: 'Permanently delete a single file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to delete — relative to project root, or absolute' },
      },
      required: ['path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory and all necessary parent directories (equivalent to mkdir -p).',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path to create — relative to project root, or absolute' },
      },
      required: ['path'],
    },
  },
  {
    name: 'move_file',
    description: 'Move or rename a file or directory.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Source path — relative to project root, or absolute' },
        to:   { type: 'string', description: 'Destination path — relative to project root, or absolute' },
      },
      required: ['from', 'to'],
    },
  },
];

// ── Individual tool implementations ──────────────────────────────────────

async function readFileTool({ path }) {
  const abs = resolvePath(path);
  try {
    const buf = await readFile(abs);
    if (buf.length > MAX_FILE_READ_BYTES) {
      const text = buf.slice(0, MAX_FILE_READ_BYTES).toString('utf8');
      return `${text}\n\n[...truncated — file is ${buf.length.toLocaleString()} bytes, showing first ${MAX_FILE_READ_BYTES.toLocaleString()}]`;
    }
    return buf.toString('utf8');
  } catch (err) {
    return `Error: ${err.message}`;
  }
}

async function writeFileTool({ path, content }) {
  const abs = resolvePath(path);
  try {
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
    const rel = relative(PROJECT_ROOT, abs);
    return `Written ${rel} (${content.length.toLocaleString()} chars, ${content.split('\n').length} lines)`;
  } catch (err) {
    return `Error writing file: ${err.message}`;
  }
}

async function listDirectoryTool({ path = '', recursive = false }) {
  const abs = resolvePath(path);
  try {
    const lines = await _listRecursive(abs, recursive ? 3 : 0, 0, '');
    const header = `${relative(PROJECT_ROOT, abs) || '.'}/\n`;
    return header + (lines.join('\n') || '  (empty)');
  } catch (err) {
    return `Error listing directory: ${err.message}`;
  }
}

async function _listRecursive(dirPath, maxDepth, depth, prefix) {
  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Sort: directories first, then files, both alpha
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const lines = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        lines.push(`${prefix}${entry.name}/  [skipped]`);
        continue;
      }
      lines.push(`${prefix}${entry.name}/`);
      if (depth < maxDepth) {
        const sub = await _listRecursive(
          join(dirPath, entry.name), maxDepth, depth + 1, prefix + '  ',
        );
        lines.push(...sub);
      }
    } else {
      let sizeStr = '';
      try {
        const s = await stat(join(dirPath, entry.name));
        sizeStr = `  (${s.size.toLocaleString()} B)`;
      } catch { /* ignore */ }
      lines.push(`${prefix}${entry.name}${sizeStr}`);
    }
  }
  return lines;
}

async function runCommandTool({ command, cwd }) {
  const workDir = cwd ? resolvePath(cwd) : PROJECT_ROOT;
  debug('run_command cwd=%s cmd=%s', workDir, command);
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd:       workDir,
      timeout:   CMD_TIMEOUT_MS,
      maxBuffer: MAX_CMD_OUTPUT_CHARS * 4,
      shell:     '/bin/bash',
    });
    const parts = [stdout?.trim(), stderr?.trim() ? `[stderr]\n${stderr.trim()}` : ''].filter(Boolean);
    const out   = parts.join('\n') || '(no output)';
    return out.length > MAX_CMD_OUTPUT_CHARS
      ? out.slice(0, MAX_CMD_OUTPUT_CHARS) + `\n\n[...truncated — ${out.length.toLocaleString()} chars total]`
      : out;
  } catch (err) {
    const parts = [
      err.stdout?.trim()  ? err.stdout.trim()  : '',
      err.stderr?.trim()  ? `[stderr]\n${err.stderr.trim()}` : '',
      `Exit code: ${err.code ?? 'unknown'}`,
      err.killed ? `Killed after ${CMD_TIMEOUT_MS / 1000}s timeout` : '',
    ].filter(Boolean);
    return `Command failed:\n${parts.join('\n')}`;
  }
}

async function searchFilesTool({ query, path = '', include }) {
  const searchDir = resolvePath(path);
  const includeFlag = include ? `--include=${JSON.stringify(include)}` : '';
  // -r recursive, -n line numbers, -E extended regex, max 100 results
  const cmd = `grep -rn -E ${includeFlag} ${JSON.stringify(query)} ${JSON.stringify(searchDir)} 2>/dev/null | head -100`;
  try {
    const { stdout } = await execAsync(cmd, { cwd: PROJECT_ROOT, timeout: 10_000, shell: '/bin/bash' });
    if (!stdout.trim()) return `No matches found for pattern: ${query}`;
    return stdout
      .trim()
      .split('\n')
      .map(line => line.replace(PROJECT_ROOT + '/', ''))
      .join('\n');
  } catch {
    return `No matches found for pattern: ${query}`;
  }
}

async function deleteFileTool({ path }) {
  const abs = resolvePath(path);
  try {
    await unlink(abs);
    return `Deleted: ${relative(PROJECT_ROOT, abs)}`;
  } catch (err) {
    return `Error deleting file: ${err.message}`;
  }
}

async function createDirectoryTool({ path }) {
  const abs = resolvePath(path);
  try {
    await mkdir(abs, { recursive: true });
    return `Created: ${relative(PROJECT_ROOT, abs)}/`;
  } catch (err) {
    return `Error creating directory: ${err.message}`;
  }
}

async function moveFileTool({ from, to }) {
  const absFrom = resolvePath(from);
  const absTo   = resolvePath(to);
  try {
    await mkdir(dirname(absTo), { recursive: true });
    await rename(absFrom, absTo);
    return `Moved: ${relative(PROJECT_ROOT, absFrom)} → ${relative(PROJECT_ROOT, absTo)}`;
  } catch (err) {
    return `Error moving: ${err.message}`;
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────

export async function executeTool(name, input) {
  debug('execute tool=%s input=%o', name, input);
  switch (name) {
    case 'read_file':        return readFileTool(input);
    case 'write_file':       return writeFileTool(input);
    case 'list_directory':   return listDirectoryTool(input);
    case 'run_command':      return runCommandTool(input);
    case 'search_files':     return searchFilesTool(input);
    case 'delete_file':      return deleteFileTool(input);
    case 'create_directory': return createDirectoryTool(input);
    case 'move_file':        return moveFileTool(input);
    default:                 return `Unknown tool: ${name}`;
  }
}
