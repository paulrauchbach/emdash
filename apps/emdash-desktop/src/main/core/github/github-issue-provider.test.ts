import { beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '@shared/lib/result';
import { githubAccountRegistry } from './accounts/github-account-registry-instance';
import { githubIssueProvider } from './github-issue-provider';
import { githubRepositoryResolver } from './services/github-repository-resolver';
import { issueService } from './services/issue-service';
import { resolveProjectGitHubAuthContext } from './services/project-github-auth-context';

vi.mock('./services/issue-service', () => ({
  issueService: {
    listIssues: vi.fn(),
    searchIssues: vi.fn(),
  },
}));

vi.mock('./accounts/github-account-registry-instance', () => ({
  githubAccountRegistry: {
    getDefaultAccountId: vi.fn(),
    listAccounts: vi.fn(),
    resolveToken: vi.fn(),
  },
}));

vi.mock('./services/github-repository-resolver', () => ({
  githubRepositoryResolver: {
    resolve: vi.fn(),
  },
}));

vi.mock('./services/project-github-auth-context', () => ({
  resolveProjectGitHubAuthContext: vi.fn(),
}));

const mockIssueService = vi.mocked(issueService);
const mockRepositoryResolver = vi.mocked(githubRepositoryResolver);
const mockGithubAccountRegistry = vi.mocked(githubAccountRegistry);
const mockResolveProjectGitHubAuthContext = vi.mocked(resolveProjectGitHubAuthContext);

const githubRepository = {
  host: 'github.com',
  owner: 'owner',
  repo: 'repo',
  nameWithOwner: 'owner/repo',
  repositoryUrl: 'https://github.com/owner/repo',
};

const ghesRepository = {
  host: 'ghe.example.com',
  owner: 'owner',
  repo: 'repo',
  nameWithOwner: 'owner/repo',
  repositoryUrl: 'https://ghe.example.com/owner/repo',
};

describe('githubIssueProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRepositoryResolver.resolve.mockResolvedValue(ok(githubRepository));
    mockGithubAccountRegistry.getDefaultAccountId.mockResolvedValue(null);
    mockGithubAccountRegistry.listAccounts.mockResolvedValue([]);
    mockGithubAccountRegistry.resolveToken.mockResolvedValue(null);
    mockResolveProjectGitHubAuthContext.mockResolvedValue(ok({ accountId: 'github.com:42' }));
  });

  it('reports GitHub connected when a default linked account exists', async () => {
    mockGithubAccountRegistry.getDefaultAccountId.mockResolvedValue('github.com:42');
    mockGithubAccountRegistry.listAccounts.mockResolvedValue([
      {
        id: 'github.com:42',
        providerAccountId: '42',
        host: 'github.com',
        login: 'monalisa',
        avatarUrl: '',
        credentialSource: 'emdash_oauth',
        connectedAt: 1,
        updatedAt: 1,
      },
    ]);
    mockGithubAccountRegistry.resolveToken.mockResolvedValue('gho_monalisa');

    await expect(githubIssueProvider.checkConnection()).resolves.toEqual({
      connected: true,
      displayName: 'monalisa',
      capabilities: githubIssueProvider.capabilities,
    });
  });

  it('reports disconnected when the default linked account token is missing', async () => {
    mockGithubAccountRegistry.getDefaultAccountId.mockResolvedValue('github.com:42');
    mockGithubAccountRegistry.listAccounts.mockResolvedValue([
      {
        id: 'github.com:42',
        providerAccountId: '42',
        host: 'github.com',
        login: 'monalisa',
        avatarUrl: '',
        credentialSource: 'emdash_oauth',
        connectedAt: 1,
        updatedAt: 1,
      },
    ]);
    mockGithubAccountRegistry.resolveToken.mockResolvedValue(null);

    await expect(githubIssueProvider.checkConnection()).resolves.toEqual({
      connected: false,
      displayName: undefined,
      capabilities: githubIssueProvider.capabilities,
    });
  });

  it('uses repositoryUrl to resolve the GitHub repository before listing issues', async () => {
    mockIssueService.listIssues.mockResolvedValue(ok([]));

    await githubIssueProvider.listIssues({
      repositoryUrl: 'https://github.com/owner/repo',
      projectId: 'project-1',
      limit: 7,
    });

    expect(mockIssueService.listIssues).toHaveBeenCalledWith(githubRepository, 7, {
      accountId: 'github.com:42',
    });
  });

  it('falls back to the resolved remote when repositoryUrl is not provided', async () => {
    mockIssueService.searchIssues.mockResolvedValue(ok([]));

    await githubIssueProvider.searchIssues({
      remote: 'git@github.com:owner/repo.git',
      searchTerm: 'bug',
      limit: 3,
    });

    expect(mockIssueService.searchIssues).toHaveBeenCalledWith(
      githubRepository,
      'bug',
      3,
      undefined
    );
  });

  it('returns unsupported host errors from repository resolution', async () => {
    mockRepositoryResolver.resolve.mockResolvedValue(
      err({ type: 'not_github', host: 'gitlab.example.com', reason: 'not GitHub' })
    );

    await expect(
      githubIssueProvider.listIssues({
        repositoryUrl: 'https://gitlab.example.com/owner/repo',
        limit: 7,
      })
    ).resolves.toEqual({
      success: false,
      error: 'This remote does not appear to be GitHub or GitHub Enterprise.',
      errorType: 'unsupported_host',
      host: 'gitlab.example.com',
    });
  });

  it('returns host reachability errors from repository resolution', async () => {
    mockRepositoryResolver.resolve.mockResolvedValue(
      err({
        type: 'host_unreachable',
        host: 'ghe.example.com',
        reason: 'VPN disconnected',
      })
    );

    await expect(
      githubIssueProvider.searchIssues({
        remote: 'https://ghe.example.com/owner/repo',
        searchTerm: 'bug',
      })
    ).resolves.toEqual({
      success: false,
      error: 'VPN disconnected',
      errorType: 'host_unreachable',
      host: 'ghe.example.com',
    });
  });

  it('returns GHES auth errors from the issue service', async () => {
    mockRepositoryResolver.resolve.mockResolvedValue(ok(ghesRepository));
    mockIssueService.listIssues.mockResolvedValue(
      err({
        type: 'auth_required',
        host: 'ghe.example.com',
        message: 'Run: gh auth login --hostname ghe.example.com',
      })
    );

    await expect(
      githubIssueProvider.listIssues({
        repositoryUrl: 'https://ghe.example.com/owner/repo',
        limit: 7,
      })
    ).resolves.toEqual({
      success: false,
      error: 'Run: gh auth login --hostname ghe.example.com',
      errorType: 'auth_required',
      host: 'ghe.example.com',
    });
  });
});
