import type { IExecutionContext } from '@main/core/execution-context/types';
import { err, ok, type Result } from '@shared/lib/result';
import { isGitHubDotComHost } from '@shared/repository-ref';
import { createCliError, type GitHubCliError } from './github-cli-errors';
import type {
  GitHubCliIdentity,
  GitHubGraphqlRequest,
  GitHubRestRequest,
} from './github-cli-types';

type GitHubCliAuthAccount = {
  active?: boolean;
  state?: string;
  host?: string;
  login?: string;
};

function errorDetails(error: unknown): { code?: unknown; message?: unknown } {
  return error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {};
}

export class GitHubCli {
  constructor(
    private readonly execContext: IExecutionContext,
    private readonly options: { token?: string } = {}
  ) {}

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

      const data = JSON.parse(result.stdout) as {
        hosts?: Record<string, GitHubCliAuthAccount[]>;
      };
      const hostData = data.hosts?.[host];
      if (!hostData || !Array.isArray(hostData) || hostData.length === 0) {
        return err(createCliError('NOT_AUTHENTICATED', `No active account for ${host}`));
      }

      const activeAccount = hostData.find((account) => account.active === true) ?? hostData[0];
      if (activeAccount.state !== 'success') {
        return err(
          createCliError(
            'NOT_AUTHENTICATED',
            `Authentication state is ${activeAccount.state} for ${host}`
          )
        );
      }
      if (!activeAccount.host || !activeAccount.login) {
        return err(
          createCliError('NOT_AUTHENTICATED', `Incomplete authentication status for ${host}`)
        );
      }

      return ok({
        host: activeAccount.host,
        user: activeAccount.login,
      });
    } catch (error: unknown) {
      const details = errorDetails(error);
      if (details.code === 'ENOENT') {
        return err(createCliError('CLI_MISSING', 'GitHub CLI (gh) is not installed', error));
      }
      const message =
        typeof details.message === 'string' ? details.message : String(details.message ?? error);
      return err(
        createCliError(
          'NOT_AUTHENTICATED',
          `Not authenticated or gh auth status failed: ${message}`,
          error
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
      return this.executeApi<T>(args, request.host, jsonBody, request.signal, request.paginate);
    }

    return this.executeApi<T>(args, request.host, undefined, request.signal, request.paginate);
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

    const result = await this.executeApi<{ data?: T; errors?: unknown[] }>(
      args,
      request.host,
      input,
      request.signal
    );
    if (!result.success) return result;
    if (result.data.errors?.length) {
      return err(
        createCliError(
          'UNKNOWN_ERROR',
          'GitHub GraphQL request returned errors',
          result.data.errors
        )
      );
    }
    if (!('data' in result.data)) {
      return err(createCliError('UNKNOWN_ERROR', 'GitHub GraphQL response did not contain data'));
    }
    return ok(result.data.data as T);
  }

  private async executeApi<T>(
    args: string[],
    host?: string,
    input?: string,
    signal?: AbortSignal,
    isPaginated?: boolean
  ): Promise<Result<T, GitHubCliError>> {
    try {
      const result = await this.execContext.exec('gh', args, {
        signal,
        input,
        env: this.tokenEnvironment(host),
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
    } catch (error: unknown) {
      return err(this.mapExecError(error));
    }
  }

  private tokenEnvironment(host = 'github.com'): NodeJS.ProcessEnv | undefined {
    const token = this.options.token;
    if (!token) return undefined;
    return isGitHubDotComHost(host) ? { GH_TOKEN: token } : { GH_ENTERPRISE_TOKEN: token };
  }

  private mapExecError(error: unknown): GitHubCliError {
    const details =
      error && typeof error === 'object'
        ? (error as { code?: unknown; message?: unknown; name?: unknown })
        : {};
    if (details.code === 'ENOENT') {
      return createCliError('CLI_MISSING', 'GitHub CLI (gh) is not installed', error);
    }
    const message = typeof details.message === 'string' ? details.message : String(error);
    if (message.includes('timeout') || details.name === 'AbortError') {
      return createCliError('TIMEOUT', 'Request timed out or was aborted', error);
    }
    // TODO parse stderr for rate limits or network issues
    return createCliError('UNKNOWN_ERROR', `Command failed: ${message}`, error);
  }
}
