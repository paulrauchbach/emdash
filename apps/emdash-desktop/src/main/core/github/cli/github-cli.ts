import type { IExecutionContext } from '@main/core/execution-context/types';
import { err, ok, type Result } from '@shared/lib/result';
import { createCliError, type GitHubCliError } from './github-cli-errors';
import type {
  GitHubCliIdentity,
  GitHubGraphqlRequest,
  GitHubRestRequest,
} from './github-cli-types';

export class GitHubCli {
  constructor(private readonly execContext: IExecutionContext) {}

  async authStatus(host: string): Promise<Result<GitHubCliIdentity, GitHubCliError>> {
    try {
      const result = await this.execContext.exec('gh', [
        'auth',
        'status',
        '--active',
        '--hostname',
        host,
        '--json',
        'hosts',
      ]);

      if (!result.stdout.trim()) {
        return err(
          createCliError('NOT_AUTHENTICATED', `No authentication status returned for ${host}`)
        );
      }

      const data = JSON.parse(result.stdout);
      const hostData = data?.hosts?.[host];
      if (!hostData || !Array.isArray(hostData) || hostData.length === 0) {
        return err(createCliError('NOT_AUTHENTICATED', `No active account for ${host}`));
      }

      const activeAccount = hostData.find((a: any) => a.active === true) || hostData[0];
      if (activeAccount.state !== 'success') {
        return err(
          createCliError(
            'NOT_AUTHENTICATED',
            `Authentication state is ${activeAccount.state} for ${host}`
          )
        );
      }

      return ok({
        host: activeAccount.host,
        user: activeAccount.login,
      });
    } catch (e: any) {
      if (e?.code === 'ENOENT') {
        return err(createCliError('CLI_MISSING', 'GitHub CLI (gh) is not installed', e));
      }
      return err(
        createCliError(
          'NOT_AUTHENTICATED',
          `Not authenticated or gh auth status failed: ${e?.message}`,
          e
        )
      );
    }
  }

  async rest<T>(request: GitHubRestRequest): Promise<Result<T, GitHubCliError>> {
    const args = ['api', request.endpoint];

    if (request.host) {
      args.push('--hostname', request.host);
    }
    if (request.method) {
      args.push('--method', request.method);
    }
    if (request.headers) {
      for (const [k, v] of Object.entries(request.headers)) {
        args.push('-H', `${k}: ${v}`);
      }
    }
    if (request.paginate) {
      args.push('--paginate', '--slurp');
    }

    if (request.body) {
      const jsonBody = JSON.stringify(request.body);
      args.push('--input', '-');
      // Execute command with body piped in
      return this.executeApi<T>(args, jsonBody, request.signal, request.paginate);
    }

    return this.executeApi<T>(args, undefined, request.signal, request.paginate);
  }

  async graphql<T>(request: GitHubGraphqlRequest): Promise<Result<T, GitHubCliError>> {
    const args = ['api', 'graphql'];

    if (request.host) {
      args.push('--hostname', request.host);
    }

    args.push('--input', '-');

    const input = JSON.stringify({
      query: request.query,
      variables: request.variables,
    });

    return this.executeApi<T>(args, input, request.signal);
  }

  private async executeApi<T>(
    args: string[],
    input?: string,
    signal?: AbortSignal,
    isPaginated?: boolean
  ): Promise<Result<T, GitHubCliError>> {
    try {
      const result = await this.execContext.exec('gh', args, {
        signal,
        input,
      });

      if (!result.stdout.trim()) {
        return ok({} as T);
      }

      const parsed = JSON.parse(result.stdout);
      if (isPaginated && Array.isArray(parsed)) {
        // gh api --slurp wraps everything in an array. Since we fetched pages of arrays,
        // we flatten the array of pages into a single array of items.
        return ok(parsed.flat() as T);
      }
      return ok(parsed as T);
    } catch (e: any) {
      return err(this.mapExecError(e));
    }
  }

  private mapExecError(e: any): GitHubCliError {
    if (e?.code === 'ENOENT') {
      return createCliError('CLI_MISSING', 'GitHub CLI (gh) is not installed', e);
    }
    if (e?.message?.includes('timeout') || e?.name === 'AbortError') {
      return createCliError('TIMEOUT', 'Request timed out or was aborted', e);
    }
    // TODO parse stderr for rate limits or network issues
    return createCliError('UNKNOWN_ERROR', `Command failed: ${e?.message}`, e);
  }
}
