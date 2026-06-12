import { LocalExecutionContext } from '@main/core/execution-context/local-execution-context';
import type { IssueListError } from '@shared/issue-providers';
import { err, ok, type Result } from '@shared/lib/result';
import type { RepositoryRef } from '@shared/repository-ref';
import { GitHubCli } from '../cli/github-cli';
import { type GitHubCliError } from '../cli/github-cli-errors';

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
    limit?: number
  ): Promise<Result<GitHubIssue[], IssueListError>>;
  searchIssues(
    repository: RepositoryRef,
    searchTerm: string,
    limit?: number
  ): Promise<Result<GitHubIssue[], IssueListError>>;
  getIssue(
    repository: RepositoryRef,
    issueNumber: number
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
  constructor(private readonly getCli: () => GitHubCli) {}

  async listIssues(
    repository: RepositoryRef,
    limit: number = 50
  ): Promise<Result<GitHubIssue[], IssueListError>> {
    const { owner, repo, host } = repository;
    const cli = this.getCli();

    const result = await cli.rest<RestIssue[]>({
      endpoint: `repos/${owner}/${repo}/issues?state=open&per_page=${Math.min(Math.max(limit, 1), 100)}&sort=updated&direction=desc`,
      host,
      paginate: true,
    });

    if (!result.success) return err(this.mapApiError(result.error));

    return ok(
      result.data.filter((issue) => !issue.pull_request).map((item) => this.mapIssue(item))
    );
  }

  async searchIssues(
    repository: RepositoryRef,
    searchTerm: string,
    limit: number = 20
  ): Promise<Result<GitHubIssue[], IssueListError>> {
    const term = searchTerm.trim();
    if (!term) return ok([]);
    const { owner, repo, host } = repository;
    const cli = this.getCli();

    const q = encodeURIComponent(`${term} repo:${owner}/${repo} is:issue is:open`);
    const result = await cli.rest<{ items: RestIssue[] }>({
      endpoint: `search/issues?q=${q}&per_page=${Math.min(Math.max(limit, 1), 100)}&sort=updated&order=desc`,
      host,
    });

    if (!result.success) return err(this.mapApiError(result.error));

    return ok(result.data.items.map((item) => this.mapIssue(item)));
  }

  async getIssue(
    repository: RepositoryRef,
    issueNumber: number
  ): Promise<Result<GitHubIssueDetail | null, IssueListError>> {
    const { owner, repo, host } = repository;
    const cli = this.getCli();

    const result = await cli.rest<RestIssue>({
      endpoint: `repos/${owner}/${repo}/issues/${issueNumber}`,
      host,
    });

    if (!result.success) return err(this.mapApiError(result.error));

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

  private mapApiError(error: GitHubCliError): IssueListError {
    switch (error.code) {
      case 'NOT_AUTHENTICATED':
      case 'SSO_REQUIRED':
        return { type: 'auth_required', host: '', message: error.message };
      case 'UNKNOWN_ERROR':
        if (error.message.includes('rate limit')) {
          return { type: 'rate_limited', host: '', message: error.message };
        }
        if (error.message.includes('Not Found') || error.message.includes('404')) {
          return { type: 'not_found_or_no_access', host: '', message: error.message };
        }
        return { type: 'generic', message: error.message };
      case 'CLI_MISSING':
        return { type: 'generic', message: 'GitHub CLI not installed.' };
      case 'TIMEOUT':
        return { type: 'generic', message: 'Request timed out.' };
      default:
        return { type: 'generic', message: error.message };
    }
  }
}

export const issueService = new GitHubIssueServiceImpl(() => {
  return new GitHubCli(new LocalExecutionContext({ root: process.cwd() }));
});
