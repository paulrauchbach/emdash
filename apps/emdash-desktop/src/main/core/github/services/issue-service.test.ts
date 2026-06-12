import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@shared/lib/result';
import { GitHubIssueServiceImpl } from './issue-service';

const mockCli = {
  rest: vi.fn(),
};

const issueService = new GitHubIssueServiceImpl(() => mockCli as any);

const restIssue = {
  number: 1,
  title: 'Test issue',
  html_url: 'https://github.com/owner/repo/issues/1',
  state: 'open',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  comments: 3,
  user: { login: 'alice', avatar_url: 'https://avatar.test/alice' },
  assignees: [{ login: 'bob', avatar_url: 'https://avatar.test/bob' }],
  labels: [{ name: 'bug', color: 'fc2929' }],
};

const expectedIssue = {
  number: 1,
  title: 'Test issue',
  url: 'https://github.com/owner/repo/issues/1',
  state: 'open',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  comments: 3,
  body: null,
  user: { login: 'alice', avatarUrl: 'https://avatar.test/alice' },
  assignees: [{ login: 'bob', avatarUrl: 'https://avatar.test/bob' }],
  labels: [{ name: 'bug', color: 'fc2929' }],
};

const repository = {
  host: 'github.com',
  owner: 'owner',
  repo: 'repo',
  nameWithOwner: 'owner/repo',
  repositoryUrl: 'https://github.com/owner/repo',
};

describe('GitHubIssueServiceImpl', () => {
  describe('listIssues', () => {
    it('maps REST response to camelCase', async () => {
      mockCli.rest.mockResolvedValue({ success: true, data: [restIssue] });
      const result = await issueService.listIssues(repository, 30);
      expect(result).toEqual(ok([expectedIssue]));
    });

    it('filters out pull requests', async () => {
      const pr = { ...restIssue, number: 2, pull_request: { url: 'https://...' } };
      mockCli.rest.mockResolvedValue({ success: true, data: [restIssue, pr] });
      const result = await issueService.listIssues(repository);
      expect(result).toEqual(ok([expectedIssue]));
    });

    it('maps network errors to host reachability failures', async () => {
      mockCli.rest.mockResolvedValue({
        success: false,
        error: { code: 'UNKNOWN_ERROR', message: 'Network error' },
      });
      await expect(issueService.listIssues(repository)).resolves.toEqual(
        err({ type: 'generic', message: 'Network error' })
      );
    });
  });

  describe('searchIssues', () => {
    it('maps search results to camelCase', async () => {
      mockCli.rest.mockResolvedValue({ success: true, data: { items: [restIssue] } });
      const result = await issueService.searchIssues(repository, 'bug fix', 15);
      expect(result).toEqual(ok([expectedIssue]));
    });

    it('returns empty for blank search term', async () => {
      mockCli.rest.mockClear();
      expect(await issueService.searchIssues(repository, '   ')).toEqual(ok([]));
      expect(mockCli.rest).not.toHaveBeenCalled();
    });
  });

  describe('getIssue', () => {
    it('maps detail response to camelCase with body', async () => {
      mockCli.rest.mockResolvedValue({ success: true, data: { ...restIssue, body: 'Issue body' } });
      const result = await issueService.getIssue(repository, 42);
      expect(result).toEqual(ok({ ...expectedIssue, body: 'Issue body' }));
    });
  });
});
