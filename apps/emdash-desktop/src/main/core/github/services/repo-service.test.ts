import { describe, expect, it, vi } from 'vitest';
import { GitHubRepositoryServiceImpl } from './repo-service';

const mockCli = {
  rest: vi.fn(),
};

const repoService = new GitHubRepositoryServiceImpl(() => mockCli as any);

describe('GitHubRepositoryServiceImpl', () => {
  describe('listRepositories', () => {
    it('returns repositories mapped to camelCase', async () => {
      mockCli.rest.mockResolvedValue({
        success: true,
        data: [
          {
            id: 1,
            name: 'repo1',
            full_name: 'owner/repo1',
            description: null,
            html_url: 'https://github.com/owner/repo1',
            clone_url: 'https://github.com/owner/repo1.git',
            ssh_url: 'git@github.com:owner/repo1.git',
            default_branch: 'main',
            private: false,
            updated_at: '2024-01-01T00:00:00Z',
            language: 'TypeScript',
            stargazers_count: 10,
            forks_count: 5,
          },
        ],
      });

      const result = await repoService.listRepositories();

      expect(result).toEqual([
        {
          id: 1,
          name: 'repo1',
          nameWithOwner: 'owner/repo1',
          description: null,
          url: 'https://github.com/owner/repo1',
          cloneUrl: 'https://github.com/owner/repo1.git',
          sshUrl: 'git@github.com:owner/repo1.git',
          defaultBranch: 'main',
          isPrivate: false,
          updatedAt: '2024-01-01T00:00:00Z',
          language: 'TypeScript',
          stargazersCount: 10,
          forksCount: 5,
        },
      ]);
    });
  });

  describe('getOwners', () => {
    it('returns the user and organizations', async () => {
      mockCli.rest
        .mockResolvedValueOnce({ success: true, data: { login: 'alice' } })
        .mockResolvedValueOnce({ success: true, data: [{ login: 'acme-corp' }] });

      const owners = await repoService.getOwners();

      expect(owners).toEqual([
        { login: 'alice', type: 'User' },
        { login: 'acme-corp', type: 'Organization' },
      ]);
    });
  });

  describe('createRepository', () => {
    it('creates a repo for the user', async () => {
      mockCli.rest
        .mockResolvedValueOnce({ success: true, data: { login: 'alice' } })
        .mockResolvedValueOnce({
          success: true,
          data: {
            html_url: 'url',
            clone_url: 'clone',
            default_branch: 'main',
            full_name: 'alice/repo',
          },
        });

      const result = await repoService.createRepository({
        name: 'repo',
        owner: 'alice',
        isPrivate: true,
      });

      expect(result).toEqual({
        url: 'url',
        cloneUrl: 'clone',
        defaultBranch: 'main',
        nameWithOwner: 'alice/repo',
      });
      expect(mockCli.rest).toHaveBeenCalledWith({
        endpoint: 'user/repos',
        method: 'POST',
        body: { name: 'repo', description: undefined, private: true },
      });
    });
  });

  describe('deleteRepository', () => {
    it('deletes a repository', async () => {
      mockCli.rest.mockResolvedValue({ success: true });
      await repoService.deleteRepository('owner', 'repo');
      expect(mockCli.rest).toHaveBeenCalledWith({
        endpoint: 'repos/owner/repo',
        method: 'DELETE',
      });
    });
  });
});
