import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import { GitHubCli } from '../cli/github-cli';

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
  listRepositories(): Promise<GitHubRepo[]>;
  getOwners(): Promise<GitHubOwner[]>;
  createRepository(params: {
    name: string;
    description?: string;
    owner: string;
    isPrivate: boolean;
  }): Promise<{ url: string; cloneUrl: string; defaultBranch: string; nameWithOwner: string }>;
  deleteRepository(owner: string, name: string): Promise<void>;
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
  constructor(private readonly getCli: () => GitHubCli) {}

  async listRepositories(): Promise<GitHubRepo[]> {
    const cli = this.getCli();
    const result = await cli.rest<RestRepo[]>({
      endpoint: 'user/repos',
      paginate: true,
    });
    if (!result.success) {
      throw new Error(result.error.message);
    }
    return result.data.map((item) => this.mapRepo(item));
  }

  async getOwners(): Promise<GitHubOwner[]> {
    const cli = this.getCli();
    const userResult = await cli.rest<{ login: string }>({
      endpoint: 'user',
    });
    if (!userResult.success) {
      throw new Error(userResult.error.message);
    }
    const owners: GitHubOwner[] = [{ login: userResult.data.login, type: 'User' }];

    try {
      const orgsResult = await cli.rest<{ login: string }[]>({
        endpoint: 'user/orgs',
        paginate: true,
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
  }): Promise<{ url: string; cloneUrl: string; defaultBranch: string; nameWithOwner: string }> {
    const cli = this.getCli();
    const userResult = await cli.rest<{ login: string }>({
      endpoint: 'user',
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

  async deleteRepository(owner: string, name: string): Promise<void> {
    const cli = this.getCli();
    const result = await cli.rest({
      endpoint: `repos/${owner}/${name}`,
      method: 'DELETE',
    });
    if (!result.success) {
      throw new Error(result.error.message);
    }
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

export const repoService = new GitHubRepositoryServiceImpl(() => {
  return new GitHubCli(new LocalExecutionContext({ root: process.cwd() }));
});
