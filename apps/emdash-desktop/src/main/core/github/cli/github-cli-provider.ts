import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import { err, ok, type Result } from '@shared/lib/result';
import type { GitHubApiAuthError } from '../services/github-api-auth-errors';
import type { GitHubApiAuthContext } from '../services/github-api-auth-service';
import { githubApiAuthService } from '../services/github-api-auth-service-instance';
import { GitHubCli } from './github-cli';

export async function getGitHubCli(
  host: string,
  authContext: GitHubApiAuthContext = {}
): Promise<Result<GitHubCli, GitHubApiAuthError>> {
  const token = await githubApiAuthService.getToken(host, authContext);
  if (!token.success) return err(token.error);

  return ok(
    new GitHubCli(new LocalExecutionContext({ root: process.cwd() }), {
      token: token.data,
    })
  );
}
