// PreToolUse hook of Claude Code (`.claude/settings.json`): refuses the commands and writes that a rule forbids without
// exception, before they run. Exit 2 blocks the tool call and hands stderr back to the agent, which then corrects itself.
// Only rules with no legitimate exception belong here: a refusal the agent cannot route around is a dead end.
import {basename} from 'node:path';
import {pathToFileURL} from 'node:url';

const fork = 'AlexandreDemartin/pgcast';

/** The words after `git` and its own options (`-C <dir>`, `-c <key=value>`): the subcommand first; none if not git. */
function gitWordsOf(command) {
  return gitOptionsAndWordsOf(command).words;
}

/** `git`'s own options, as words, and the words after them; none if not git. */
function gitOptionsAndWordsOf(command) {
  const words = command.split(/\s+/);
  if (words[0] !== 'git') return {options: [], words: []};
  let index = 1;
  while (index < words.length && words[index].startsWith('-')) index += /^-[Cc]$/.test(words[index]) ? 2 : 1;
  return {options: words.slice(1, index), words: words.slice(index)};
}

const commandRefusals = [
  {
    refuses: command => /^git\b.*\bpush\b.*(\s--force(-with-lease)?\b|\s-[a-zA-Z]*f\b|\s\+\S)/.test(command),
    reason: 'A pushed branch is never forced: a fix from below goes up by a normal merge (skill run-step).',
  },
  {
    refuses: command => /^git\b.*(\brebase\b|\bpull\b.*\s(--rebase\b|-r\b))/.test(command),
    reason: 'Never rebase: `git merge -m "<subject>" -m "Co-Authored-By: …" origin/<branch>` instead (agent builder § Git).',
  },
  {
    refuses: command => /^git\b.*\bcommit\b.*\s--amend\b/.test(command),
    reason: 'Never `--amend`: a new commit instead (agent builder § Git).',
  },
  {
    refuses: command => /^git\b.*\b(commit|merge)\b.*\s--no-edit\b/.test(command),
    reason: 'Never `--no-edit`: it drops the Co-Authored-By line or keeps the `# Conflicts:` lines; give `-m` (skill pr-shape § Commits).',
  },
  {
    // with no terminal, a bare merge writes its default message as --no-edit does; these make no commit of their own
    refuses: command => {
      const [subcommand, ...words] = gitWordsOf(command);
      return subcommand === 'merge' &&
        !words.some(word => /^(-[mF]|--(message|file|abort|continue|quit|ff-only|no-commit|squash)\b)/.test(word));
    },
    reason: 'A merge that commits gives `-m "<subject>" -m "Co-Authored-By: …"`: without a terminal, a bare `git merge` writes its default message, with no trailer (skill pr-shape § Commits).',
  },
  {
    refuses: command =>
      /^(npm|npx\s+npm(@\S+)?)\s+(publish|version|dist-tag|unpublish|deprecate)\b/.test(command) ||
      /^gh\s+release\s+(create|edit|upload)\b/.test(command),
    reason: 'Publishing is a mandatory stop point: the user publishes (AGENTS.md § Stop points).',
  },
  {
    // a pushed release tag starts release.yml, which publishes once the owner approves its deployment; read on the words
    // as the shell passes them, quotes taken off, since a quoted refspec is still a refspec
    refuses: (command, unquoted) => {
      const {options, words: [subcommand, ...words]} = gitOptionsAndWordsOf(unquoted);
      return subcommand === 'push' && (options.some(option => /^push\.followtags\b/i.test(option)) ||
        words.some(word => {
          if (/^--(tags|follow-tags|mirror)$/.test(word) || word === 'tag') return true;
          const destination = word.slice(word.lastIndexOf(':') + 1);
          return /^\+?(refs\/tags\/|(tags\/)?(v\d|@pgcast\/[^/:@]+@[^/:@]+))/.test(destination);
        }));
    },
    reason: 'A pushed release tag starts release.yml: the owner pushes it, after the version PR (AGENTS.md § Stop points, docs/WORKFLOW.md § Releases).',
  },
  {
    // the same tag, created through GitHub's API
    refuses: (command, unquoted) => /^gh\s+api\b/.test(unquoted) && /\/git\/refs\b/.test(unquoted) &&
      (/\bref=refs\/tags\//.test(unquoted) ||
        /(-X|--method)[ =]?(POST|PATCH)\b/i.test(unquoted) && /refs\/tags\//.test(unquoted)),
    reason: 'A tag created through `gh api` starts release.yml too: the owner tags the release (AGENTS.md § Stop points).',
  },
  {
    refuses: command => /^gh\s+pr\s+create\b/.test(command) && !new RegExp(`(--repo|-R)[ =]${fork}\\b`).test(command),
    reason: `A PR targets the fork only: \`gh pr create --repo ${fork} --base master …\`, never jawj/zapatos (agent builder § The PR).`,
  },
];

const writingTools = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Files that are generated (`npm run build`) or belong to the user (`.env`): never written by hand. */
function writeRefusalOf(path) {
  if (/(^|\/)dist\//.test(path) || /(^|\/)(db|generate)\.mjs$/.test(path)) {
    return 'Never edit build output (`dist/`, `db.mjs`, `generate.mjs`): change `src/`, then `npm run build`.';
  }
  if (/^\.env(\..+)?$/.test(basename(path))) {
    return 'Never write a `.env`: it holds the user’s local secrets (AGENTS.md § Local environment).';
  }
  return undefined;
}

/**
 * Splits a shell command into the simple commands it runs, so that `cd x && npm publish` is caught but a commit message
 * that merely mentions npm is not: heredoc bodies are dropped and quoted strings emptied (`text`); `unquoted` is the
 * same simple command with each quoted string's content in place of its quotes. Leading `VAR=value` assignments are
 * dropped. Approximate by design: no escaped quote nor nested quoting.
 */
function simpleCommandsOf(command) {
  const quoted = [];
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, '')
    .replace(/"([^"]*)"|'([^']*)'/g, (_, double, single) => `\u0001${quoted.push(double ?? single) - 1}\u0002`)
    .split(/&&|\|\||[;|\n]|\$\(|`/)
    .map(segment => segment.trim().replace(/^(\w+=\S*\s+)+/, ''))
    .filter(segment => segment !== '')
    .map(segment => ({
      text: segment.replace(/\u0001\d+\u0002/g, '""'),
      unquoted: segment.replace(/\u0001(\d+)\u0002/g, (_, index) => quoted[index]),
    }));
}

/**
 * The reason to refuse a tool call, or `undefined` to let it run.
 * @param {{tool_name?: string, tool_input?: Record<string, unknown>}} hookInput the JSON Claude Code writes on stdin
 */
export function refusalOf(hookInput) {
  const toolInput = hookInput.tool_input ?? {};
  if (hookInput.tool_name === 'Bash' && typeof toolInput.command === 'string') {
    for (const {text, unquoted} of simpleCommandsOf(toolInput.command)) {
      const refusal = commandRefusals.find(({refuses}) => refuses(text, unquoted));
      if (refusal) return `${refusal.reason}\nRefused: ${unquoted}`;
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
