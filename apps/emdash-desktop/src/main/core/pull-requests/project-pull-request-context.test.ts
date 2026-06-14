import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveProjectGitHubAuthContext } from '@main/core/github/services/project-github-auth-context';
import { providerRepositoryService } from '@main/core/repository/provider-repository-service';
import { err, ok } from '@shared/lib/result';
import { resolveProjectPullRequestContext } from './project-pull-request-context';

vi.mock('@main/core/repository/provider-repository-service', () => ({
  providerRepositoryService: {
    resolveProject: vi.fn(),
  },
}));

vi.mock('@main/core/github/services/project-github-auth-context', () => ({
  resolveProjectGitHubAuthContext: vi.fn(),
}));

const mockProviderRepositoryService = vi.mocked(providerRepositoryService);
const mockResolveProjectGitHubAuthContext = vi.mocked(resolveProjectGitHubAuthContext);

describe('project GitHub pull request context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectGitHubAuthContext.mockResolvedValue(ok({ accountId: 'github.com:42' }));
  });

  it('resolves pull request repository context for a project', async () => {
    mockProviderRepositoryService.resolveProject.mockResolvedValue(
      ok({
        provider: 'github',
        host: 'github.com',
        repositoryUrl: 'https://github.com/acme/repo',
        nameWithOwner: 'acme/repo',
        capabilities: { pullRequests: true, issues: true },
      })
    );

    await expect(resolveProjectPullRequestContext('project-1')).resolves.toEqual(
      ok({
        projectId: 'project-1',
        repositoryUrl: 'https://github.com/acme/repo',
        host: 'github.com',
        nameWithOwner: 'acme/repo',
        authContext: { accountId: 'github.com:42' },
      })
    );
    expect(mockProviderRepositoryService.resolveProject).toHaveBeenCalledWith('project-1');
  });

  it('maps project repository errors to pull request remote readiness errors', async () => {
    mockProviderRepositoryService.resolveProject.mockResolvedValue(err({ type: 'no_remote' }));

    await expect(resolveProjectPullRequestContext('project-1')).resolves.toEqual(
      err({ type: 'remote_not_ready', status: 'no_remote' })
    );
  });
});
