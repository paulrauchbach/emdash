import type { IssueListError } from '@shared/issue-providers';
import { err, ok, type Result } from '@shared/lib/result';
import type { RepositoryRef } from '@shared/repository-ref';
import type { GitHubCli } from '../cli/github-cli';
import { type GitHubCliError } from '../cli/github-cli-errors';
import { getGitHubCli } from '../cli/github-cli-provider';
import type { GitHubApiAuthError } from './github-api-auth-errors';
import type { GitHubApiAuthContext } from './github-api-auth-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubIssue {
  number: number;
  title: string;
  url: string;
  state: string;
  createdAt: string | null;
  updatedAt: string | null;
  comments: number;
  body: string | null;
  user: { login: string; avatarUrl: string } | null;
  assignees: Array<{ login: string; avatarUrl: string }>;
  labels: Array<{ name: string; color: string }>;
}

export type GitHubIssueDetail = GitHubIssue;

export interface GitHubIssueService {
  listIssues(
    repository: RepositoryRef,
    limit?: number,
    authContext?: GitHubApiAuthContext
  ): Promise<Result<GitHubIssue[], IssueListError>>;
  searchIssues(
    repository: RepositoryRef,
    searchTerm: string,
    limit?: number,
    authContext?: GitHubApiAuthContext
  ): Promise<Result<GitHubIssue[], IssueListError>>;
  getIssue(
    repository: RepositoryRef,
    issueNumber: number,
    authContext?: GitHubApiAuthContext
  ): Promise<Result<GitHubIssueDetail | null, IssueListError>>;
}

// ---------------------------------------------------------------------------
// REST response shape (internal)
// ---------------------------------------------------------------------------

interface RestIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string | null;
  updated_at: string | null;
  comments: number;
  user: { login: string; avatar_url: string } | null;
  assignees: Array<{ login: string; avatar_url: string }> | null;
  labels: Array<string | { name?: string; color?: string }>;
  body?: string | null;
  pull_request?: unknown;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class GitHubIssueServiceImpl implements GitHubIssueService {
  constructor(
    private readonly getCli: (
      host: string,
      authContext?: GitHubApiAuthContext
    ) => Promise<Result<GitHubCli, GitHubApiAuthError>>
  ) {}

  async listIssues(
    repository: RepositoryRef,
    limit: number = 50,
    authContext: GitHubApiAuthContext = {}
  ): Promise<Result<GitHubIssue[], IssueListError>> {
    const { owner, repo, host } = repository;
    const cli = await this.getCli(host, authContext);
    if (!cli.success) return err(this.mapAuthError(cli.error));

    const result = await cli.data.rest<RestIssue[]>({
      endpoint: `repos/${owner}/${repo}/issues?state=open&per_page=${Math.min(Math.max(limit, 1), 100)}&sort=updated&direction=desc`,
      host,
    });

    if (!result.success) return err(this.mapApiError(result.error, repository));

    return ok(
      result.data
        .filter((issue) => !issue.pull_request)
        .slice(0, Math.max(limit, 0))
        .map((item) => this.mapIssue(item))
    );
  }

  async searchIssues(
    repository: RepositoryRef,
    searchTerm: string,
    limit: number = 20,
    authContext: GitHubApiAuthContext = {}
  ): Promise<Result<GitHubIssue[], IssueListError>> {
    const term = searchTerm.trim();
    if (!term) return ok([]);
    const { owner, repo, host } = repository;
    const cli = await this.getCli(host, authContext);
    if (!cli.success) return err(this.mapAuthError(cli.error));

    const q = encodeURIComponent(`${term} repo:${owner}/${repo} is:issue is:open`);
    const result = await cli.data.rest<{ items: RestIssue[] }>({
      endpoint: `search/issues?q=${q}&per_page=${Math.min(Math.max(limit, 1), 100)}&sort=updated&order=desc`,
      host,
    });

    if (!result.success) return err(this.mapApiError(result.error, repository));

    return ok(result.data.items.map((item) => this.mapIssue(item)));
  }

  async getIssue(
    repository: RepositoryRef,
    issueNumber: number,
    authContext: GitHubApiAuthContext = {}
  ): Promise<Result<GitHubIssueDetail | null, IssueListError>> {
    const { owner, repo, host } = repository;
    const cli = await this.getCli(host, authContext);
    if (!cli.success) return err(this.mapAuthError(cli.error));

    const result = await cli.data.rest<RestIssue>({
      endpoint: `repos/${owner}/${repo}/issues/${issueNumber}`,
      host,
    });

    if (!result.success) return err(this.mapApiError(result.error, repository));

    return ok(this.mapIssue(result.data));
  }

  private mapIssue(item: RestIssue): GitHubIssue {
    return {
      number: item.number,
      title: item.title,
      url: item.html_url,
      state: item.state,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      comments: item.comments,
      body: item.body ?? null,
      user: item.user ? { login: item.user.login, avatarUrl: item.user.avatar_url } : null,
      assignees: (item.assignees ?? []).map((a) => ({ login: a.login, avatarUrl: a.avatar_url })),
      labels: (item.labels ?? []).map((l) =>
        typeof l === 'string'
          ? { name: l, color: '' }
          : { name: l.name ?? '', color: l.color ?? '' }
      ),
    };
  }

  private mapAuthError(error: GitHubApiAuthError): IssueListError {
    switch (error.type) {
      case 'auth_required':
        return { type: 'auth_required', host: error.host, message: error.message };
      case 'account_not_found':
        return {
          type: 'account_not_found',
          host: error.host,
          accountId: error.accountId,
          message: error.message,
        };
      case 'account_host_mismatch':
        return {
          type: 'account_host_mismatch',
          host: error.host,
          accountId: error.accountId,
          accountHost: error.accountHost,
          message: error.message,
        };
      case 'token_missing':
        return {
          type: 'token_missing',
          host: error.host,
          accountId: error.accountId,
          message: error.message,
        };
    }
  }

  private mapApiError(error: GitHubCliError, repository: RepositoryRef): IssueListError {
    switch (error.code) {
      case 'NOT_AUTHENTICATED':
        return { type: 'auth_required', host: repository.host, message: error.message };
      case 'SSO_REQUIRED':
        return { type: 'sso_required', host: repository.host, message: error.message };
      case 'RATE_LIMITED':
        return { type: 'rate_limited', host: repository.host, message: error.message };
      case 'NETWORK_ERROR':
      case 'TIMEOUT':
        return {
          type: 'host_unreachable',
          host: repository.host,
          message: error.message,
        };
      case 'UNKNOWN_ERROR':
        if (error.message.includes('rate limit')) {
          return { type: 'rate_limited', host: repository.host, message: error.message };
        }
        if (error.message.includes('Not Found') || error.message.includes('404')) {
          return {
            type: 'not_found_or_no_access',
            host: repository.host,
            message: error.message,
          };
        }
        return { type: 'generic', message: error.message };
      case 'CLI_MISSING':
        return { type: 'generic', message: 'GitHub CLI not installed.' };
      default:
        return { type: 'generic', message: error.message };
    }
  }
}

export const issueService = new GitHubIssueServiceImpl(getGitHubCli);
