// PreToolUse hook of Claude Code (`.claude/settings.json`): refuses the commands and writes that a rule forbids without
// exception, before they run. Exit 2 blocks the tool call and hands stderr back to the agent, which then corrects itself.
// Only rules with no legitimate exception belong here: a refusal the agent cannot route around is a dead end.
// Adapted from Bienvenue's guard.
import {basename} from 'node:path';
import {pathToFileURL} from 'node:url';

const fork = 'AlexandreDemartin/pgcast';

const commandRefusals = [
  {
    refuses: command => /^git\b.*\bpush\b.*(\s--force(-with-lease)?\b|\s-[a-zA-Z]*f\b|\s\+\S)/.test(command),
    reason: 'A pushed branch is never forced: a fix from below goes up by a normal merge (skill run-step).',
  },
  {
    refuses: command => /^git\b.*(\brebase\b|\bpull\b.*\s(--rebase\b|-r\b))/.test(command),
    reason: 'Never rebase: `git merge origin/<branch>` instead (agent builder § Git).',
  },
  {
    refuses: command => /^git\b.*\bcommit\b.*\s--amend\b/.test(command),
    reason: 'Never `--amend`: a new commit instead (agent builder § Git).',
  },
  {
    refuses: command =>
      /^(npm|npx\s+npm(@\S+)?)\s+(publish|version|dist-tag|unpublish|deprecate)\b/.test(command) ||
      /^gh\s+release\s+(create|edit|upload)\b/.test(command),
    reason: 'Publishing is a mandatory stop point: the user publishes (AGENTS.md § Points d’arrêt).',
  },
  {
    refuses: command => /^gh\s+pr\s+create\b/.test(command) && !new RegExp(`(--repo|-R)[ =]${fork}\\b`).test(command),
    reason: `A PR targets the fork only: \`gh pr create --repo ${fork} --base master …\`, never jawj/zapatos (agent builder § La PR).`,
  },
];

const writingTools = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Files that are generated (`npm run build`) or belong to the user (`.env`): never written by hand. */
function writeRefusalOf(path) {
  if (/(^|\/)dist\//.test(path) || /(^|\/)(db|generate)\.mjs$/.test(path)) {
    return 'Never edit build output (`dist/`, `db.mjs`, `generate.mjs`): change `src/`, then `npm run build`.';
  }
  if (/^\.env(\..+)?$/.test(basename(path))) {
    return 'Never write a `.env`: it holds the user’s local secrets (AGENTS.md § Environnement local).';
  }
  return undefined;
}

/**
 * Splits a shell command into the simple commands it runs, so that `cd x && npm publish` is caught but a commit message
 * that merely mentions npm is not: heredoc bodies and quoted strings are emptied first. Leading `VAR=value` assignments
 * are dropped. Approximate by design: no escaped quote nor nested quoting.
 */
function simpleCommandsOf(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, '')
    .replace(/"[^"]*"|'[^']*'/g, '""')
    .split(/&&|\|\||[;|\n]|\$\(|`/)
    .map(segment => segment.trim().replace(/^(\w+=\S*\s+)+/, ''))
    .filter(segment => segment !== '');
}

/**
 * The reason to refuse a tool call, or `undefined` to let it run.
 * @param {{tool_name?: string, tool_input?: Record<string, unknown>}} hookInput the JSON Claude Code writes on stdin
 */
export function refusalOf(hookInput) {
  const toolInput = hookInput.tool_input ?? {};
  if (hookInput.tool_name === 'Bash' && typeof toolInput.command === 'string') {
    for (const simpleCommand of simpleCommandsOf(toolInput.command)) {
      const refusal = commandRefusals.find(({refuses}) => refuses(simpleCommand));
      if (refusal) return `${refusal.reason}\nRefused: ${simpleCommand}`;
    }
    return undefined;
  }
  const writtenPath = writingTools.has(hookInput.tool_name ?? '')
    ? (toolInput.file_path ?? toolInput.notebook_path)
    : undefined;
  return typeof writtenPath === 'string' ? writeRefusalOf(writtenPath) : undefined;
}

async function readStandardInput() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const refusal = refusalOf(JSON.parse(await readStandardInput()));
  if (refusal !== undefined) {
    process.stderr.write(`${refusal}\n`);
    process.exit(2);
  }
}
