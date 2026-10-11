import { Severity } from '@devdigest/shared';

export const SERVER_NAME = 'devdigest-mcp';
export const SERVER_VERSION = '0.0.0';

// Shown to the calling model at startup (the `instructions` of the server options).
export const SERVER_INSTRUCTIONS =
  'DevDigest reviews GitHub pull requests with reviewer agents. repo is owner/name; pr is the PR number. ' +
  'To review, call run_agent_on_pr: it waits and returns the verdict and findings (spends LLM credits). ' +
  "Call list_agents first only when you do not know the agent's id or exact name. " +
  'If it answers status "running", do not start it again: call get_findings with the returned run_id. ' +
  'To read an existing review, call get_findings. The DevDigest API must be running locally.';

// Most severe first: CRITICAL, WARNING, SUGGESTION.
export const SEVERITY_ORDER = Severity.options;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const MAX_TITLE = 120;
export const MAX_RATIONALE = 240;
export const MAX_SUMMARY = 600;
// A file path in a finding or a convention's evidence.
export const MAX_PATH = 240;
export const MAX_AGENT_NAME = 120;
// An agent's `provider/model` string.
export const MAX_MODEL = 120;
// An id the API generated (agent id, run id) or a timestamp it formatted: free strings in the contract.
export const MAX_ID = 64;
// A repository's `owner/name` (GitHub allows 39 + 1 + 100).
export const MAX_REPO = 140;
export const MAX_RULE = 400;
export const MAX_DESCRIPTION = 200;
export const MAX_CONVENTIONS = 50;
export const MAX_AGENTS = 50;
// Names or numbers quoted in an error text.
export const MAX_LISTED = 10;
export const MAX_ERROR_TEXT = 300;
// One progress notification: a status line from a run event, not a quoted value.
export const MAX_PROGRESS_TEXT = 200;
export const REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_WAIT_SECONDS = 120;
