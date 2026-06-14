import type { Result } from '@shared/lib/result';
import type { GitHubCli } from '../cli/github-cli';
import { getGitHubCli } from '../cli/github-cli-provider';
import type { GitHubApiAuthError } from './github-api-auth-errors';
import type { GitHubApiAuthContext } from './github-api-auth-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubRepo {
  id: number;
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  updatedAt: string | null;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
}

export interface GitHubOwner {
  login: string;
  type: 'User' | 'Organization';
}

export interface GitHubRepositoryService {
  listRepositories(authContext?: GitHubApiAuthContext): Promise<GitHubRepo[]>;
  getOwners(authContext?: GitHubApiAuthContext): Promise<GitHubOwner[]>;
  createRepository(params: {
    name: string;
    description?: string;
    owner: string;
    isPrivate: boolean;
    authContext?: GitHubApiAuthContext;
  }): Promise<{ url: string; cloneUrl: string; defaultBranch: string; nameWithOwner: string }>;
  deleteRepository(owner: string, name: string, authContext?: GitHubApiAuthContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// REST response shape (internal)
// ---------------------------------------------------------------------------

interface RestRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  private: boolean;
  updated_at: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class GitHubRepositoryServiceImpl implements GitHubRepositoryService {
  constructor(
    private readonly getCli: (
      host: string,
      authContext?: GitHubApiAuthContext
    ) => Promise<Result<GitHubCli, GitHubApiAuthError>>
  ) {}

  async listRepositories(authContext: GitHubApiAuthContext = {}): Promise<GitHubRepo[]> {
    const { cli, host } = await this.resolveCli(authContext);
    const result = await cli.rest<RestRepo[]>({
      endpoint: 'user/repos',
      paginate: true,
      host,
    });
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data.map((item) => this.mapRepo(item));
  }

  async getOwners(authContext: GitHubApiAuthContext = {}): Promise<GitHubOwner[]> {
    const { cli, host } = await this.resolveCli(authContext);
    const userResult = await cli.rest<{ login: string }>({
      endpoint: 'user',
      host,
    });
    if (!userResult.success) {
      throw new Error(userResult.error.message);
    }
    const owners: GitHubOwner[] = [{ login: userResult.data.login, type: 'User' }];

    try {
      const orgsResult = await cli.rest<{ login: string }[]>({
        endpoint: 'user/orgs',
        paginate: true,
        host,
      });
      if (orgsResult.success) {
        for (const org of orgsResult.data) {
          owners.push({ login: org.login, type: 'Organization' });
        }
      }
    } catch {}

    return owners;
  }

  async createRepository(params: {
    name: string;
    description?: string;
    owner: string;
    isPrivate: boolean;
    authContext?: GitHubApiAuthContext;
  }): Promise<{ url: string; cloneUrl: string; defaultBranch: string; nameWithOwner: string }> {
    const { cli, host } = await this.resolveCli(params.authContext ?? {});
    const userResult = await cli.rest<{ login: string }>({
      endpoint: 'user',
      host,
    });
    if (!userResult.success) {
      throw new Error(userResult.error.message);
    }
    const isCurrentUser = params.owner === userResult.data.login;

    const createParams = {
      name: params.name,
      description: params.description,
      private: params.isPrivate,
    };

    const result = await cli.rest<RestRepo>({
      endpoint: isCurrentUser ? 'user/repos' : `orgs/${params.owner}/repos`,
      method: 'POST',
      body: createParams,
      host,
    });

    if (!result.success) {
      throw new Error(result.error.message);
    }

    const { data } = result;

    return {
      url: data.html_url,
      cloneUrl: data.clone_url,
      defaultBranch: data.default_branch || 'main',
      nameWithOwner: data.full_name,
    };
  }

  async deleteRepository(
    owner: string,
    name: string,
    authContext: GitHubApiAuthContext = {}
  ): Promise<void> {
    const { cli, host } = await this.resolveCli(authContext);
    const result = await cli.rest({
      endpoint: `repos/${owner}/${name}`,
      method: 'DELETE',
      host,
    });
    if (!result.success) {
      throw new Error(result.error.message);
    }
  }

  private async resolveCli(
    authContext: GitHubApiAuthContext
  ): Promise<{ cli: GitHubCli; host: string }> {
    const host = this.hostForAuthContext(authContext);
    const cli = await this.getCli(host, authContext);
    if (!cli.success) throw new Error(cli.error.message);
    return { cli: cli.data, host };
  }

  private hostForAuthContext(authContext: GitHubApiAuthContext): string {
    const accountId = authContext.accountId?.trim();
    if (!accountId) return 'github.com';
    return accountId.split(':')[0] || 'github.com';
  }

  private mapRepo(item: RestRepo): GitHubRepo {
    return {
      id: item.id,
      name: item.name,
      nameWithOwner: item.full_name,
      description: item.description,
      url: item.html_url,
      cloneUrl: item.clone_url,
      sshUrl: item.ssh_url,
      defaultBranch: item.default_branch,
      isPrivate: item.private,
      updatedAt: item.updated_at,
      language: item.language,
      stargazersCount: item.stargazers_count,
      forksCount: item.forks_count,
    };
  }
}

export const repoService = new GitHubRepositoryServiceImpl(getGitHubCli);
