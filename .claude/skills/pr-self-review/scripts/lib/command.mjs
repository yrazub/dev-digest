// Decides whether a Bash command line would run `git push` or `gh pr create`.
//
// A plain text search is not enough: it blocks `echo "…git push…"` and `grep "git push"`, and
// misses `git -C server push`. So the line is tokenized the way a shell reads it: quoted text is
// one argument, not a command; `&&` `||` `;` `|` newlines, subshells and backticks start a new
// command; heredoc bodies are data. Only the command word of each segment is checked, after
// skipping env assignments, wrappers (`env`, `command`, `time`…) and git's global options.
//
// Known limits, accepted: commands assembled at runtime (`eval "$x"`, a script that pushes) are
// not seen. The gate catches ordinary pushes; it is not a sandbox.

const WRAPPERS = new Set(['env', 'command', 'exec', 'time', 'nohup', 'sudo']);
const SHELLS = new Set(['sh', 'bash', 'zsh']);
// git global options that take a separate value (`-C dir`, `-c key=val`).
const GIT_OPTS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env']);

/** Drop heredoc bodies (`<<EOF … EOF`, `<<-'EOF'`): their lines are input, not commands. */
function stripHeredocs(cmd) {
  const lines = cmd.split('\n');
  const out = [];
  let delimiter = null;
  for (const line of lines) {
    if (delimiter) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }
    out.push(line);
    const m = line.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (m) delimiter = m[2];
  }
  return out.join('\n');
}

/**
 * Split a command line into segments of tokens. Returns `{ segments, nested }`, where `nested`
 * holds the text of `$(…)`/backtick substitutions found inside double quotes, which a shell
 * still executes.
 */
function tokenize(cmd) {
  const segments = [[]];
  const nested = [];
  let tok = '';
  let inTok = false;
  const endTok = () => {
    if (inTok) segments[segments.length - 1].push(tok);
    tok = '';
    inTok = false;
  };
  const endSegment = () => {
    endTok();
    if (segments[segments.length - 1].length > 0) segments.push([]);
  };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      const end = j < 0 ? cmd.length : j;
      tok += cmd.slice(i + 1, end);
      inTok = true;
      i = end;
    } else if (c === '"') {
      let j = i + 1;
      let text = '';
      while (j < cmd.length && cmd[j] !== '"') {
        if (cmd[j] === '\\' && j + 1 < cmd.length) { text += cmd[j + 1]; j += 2; continue; }
        text += cmd[j++];
      }
      if (/\$\(|`/.test(text)) nested.push(text.replace(/^[^$`]*(\$\(|`)/, ''));
      tok += text;
      inTok = true;
      i = j;
    } else if (c === '\\' && i + 1 < cmd.length) {
      if (cmd[i + 1] !== '\n') { tok += cmd[i + 1]; inTok = true; }
      i++;
    } else if (c === '$' && cmd[i + 1] === '(') {
      endSegment();
      i++;
    } else if (c === '`' || c === '\n' || c === ';' || c === '&' || c === '|' || c === '(' || c === ')') {
      endSegment();
    } else if (c === ' ' || c === '\t') {
      endTok();
    } else {
      tok += c;
      inTok = true;
    }
  }
  endTok();
  return { segments: segments.filter((s) => s.length > 0), nested };
}

function segmentIsGated(tokens) {
  let i = 0;
  while (i < tokens.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]) || WRAPPERS.has(tokens[i]))) i++;
  const word = tokens[i];
  if (!word) return false;
  const base = word.split('/').pop();

  if (base === 'git') {
    i++;
    while (i < tokens.length && tokens[i].startsWith('-')) {
      i += GIT_OPTS_WITH_VALUE.has(tokens[i]) ? 2 : 1;
    }
    return tokens[i] === 'push';
  }
  if (base === 'gh') {
    const words = tokens.slice(i + 1).filter((t) => !t.startsWith('-'));
    return words[0] === 'pr' && words[1] === 'create';
  }
  if (SHELLS.has(base)) {
    const c = tokens.indexOf('-c', i + 1);
    return c >= 0 && tokens[c + 1] !== undefined && isGatedCommand(tokens[c + 1]);
  }
  return false;
}

/** True if running `command` would push or open a PR. */
export function isGatedCommand(command) {
  const { segments, nested } = tokenize(stripHeredocs(command));
  return segments.some(segmentIsGated) || nested.some(isGatedCommand);
}
