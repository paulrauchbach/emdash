import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import { GitHubCli } from './github-cli';

// Single global execution context for GitHub CLI commands
const cliContext = new LocalExecutionContext();

// Shared GitHub CLI wrapper
export const githubCli = new GitHubCli(cliContext);
