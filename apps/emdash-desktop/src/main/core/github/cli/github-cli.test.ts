import { describe, expect, it, vi } from 'vitest';
import type { ExecResult, IExecutionContext } from '@main/core/execution-context/types';
import { GitHubCli } from './github-cli';

describe('GitHubCli', () => {
  const createMockContext = (
    execMock: (command: string, args?: string[], opts?: any) => Promise<ExecResult>
  ): IExecutionContext => ({
    root: undefined,
    supportsLocalSpawn: true,
    exec: vi.fn(execMock),
    execStreaming: vi.fn(),
    dispose: vi.fn(),
  });

  describe('authStatus', () => {
    it('returns identity when authenticated', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: JSON.stringify({
          hosts: {
            'github.com': [
              { state: 'success', active: true, host: 'github.com', login: 'testuser' },
            ],
          },
        }),
        stderr: '',
      });
      const cli = new GitHubCli(createMockContext(mockExec));

      const result = await cli.authStatus('github.com');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ host: 'github.com', user: 'testuser' });
      }
      expect(mockExec).toHaveBeenCalledWith('gh', [
        'auth',
        'status',
        '--active',
        '--hostname',
        'github.com',
        '--json',
        'hosts',
      ]);
    });

    it('returns error when not authenticated', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: '{"hosts":{}}',
        stderr: '',
      });
      const cli = new GitHubCli(createMockContext(mockExec));

      const result = await cli.authStatus('github.com');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('NOT_AUTHENTICATED');
      }
    });

    it('returns error when gh is missing', async () => {
      const mockExec = vi.fn().mockRejectedValue({ code: 'ENOENT' });
      const cli = new GitHubCli(createMockContext(mockExec));

      const result = await cli.authStatus('github.com');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('CLI_MISSING');
      }
    });
  });

  describe('rest', () => {
    it('calls gh api with method and hostname', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '{"id": 1}', stderr: '' });
      const cli = new GitHubCli(createMockContext(mockExec));

      const result = await cli.rest({
        endpoint: 'repos/owner/repo',
        host: 'github.com',
        method: 'POST',
        headers: { Accept: 'application/json' },
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ id: 1 });
      }

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        [
          'api',
          'repos/owner/repo',
          '--hostname',
          'github.com',
          '--method',
          'POST',
          '-H',
          'Accept: application/json',
        ],
        expect.objectContaining({ input: undefined })
      );
    });

    it('passes body via input', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '{"id": 1}', stderr: '' });
      const cli = new GitHubCli(createMockContext(mockExec));

      await cli.rest({
        endpoint: 'repos/owner/repo',
        body: { description: 'test' },
      });

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['api', 'repos/owner/repo', '--input', '-'],
        expect.objectContaining({ input: '{"description":"test"}' })
      );
    });

    it('uses the selected token without changing global gh account state', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '{"login":"monalisa"}', stderr: '' });
      const cli = new GitHubCli(createMockContext(mockExec), { token: 'selected-token' });

      await cli.rest({
        endpoint: 'user',
        host: 'github.com',
      });

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['api', 'user', '--hostname', 'github.com'],
        expect.objectContaining({
          env: {
            GH_TOKEN: 'selected-token',
          },
        })
      );
    });

    it('uses the enterprise token environment variable for enterprise hosts', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '{"login":"enterprise"}', stderr: '' });
      const cli = new GitHubCli(createMockContext(mockExec), { token: 'enterprise-token' });

      await cli.rest({
        endpoint: 'user',
        host: 'ghe.example.com',
      });

      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['api', 'user', '--hostname', 'ghe.example.com'],
        expect.objectContaining({
          env: {
            GH_ENTERPRISE_TOKEN: 'enterprise-token',
          },
        })
      );
    });
  });

  describe('graphql', () => {
    it('passes query and variables via input', async () => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: '{"data": {}}', stderr: '' });
      const cli = new GitHubCli(createMockContext(mockExec));

      const result = await cli.graphql<{ viewer: { login: string } }>({
        query: 'query { viewer { login } }',
        variables: { limit: 10 },
      });

      expect(result).toEqual({ success: true, data: {} });
      expect(mockExec).toHaveBeenCalledWith(
        'gh',
        ['api', 'graphql', '--input', '-'],
        expect.objectContaining({
          input: JSON.stringify({ query: 'query { viewer { login } }', variables: { limit: 10 } }),
        })
      );
    });

    it('unwraps the GraphQL data envelope returned by gh', async () => {
      const mockExec = vi.fn().mockResolvedValue({
        stdout: JSON.stringify({ data: { viewer: { login: 'monalisa' } } }),
        stderr: '',
      });
      const cli = new GitHubCli(createMockContext(mockExec));

      await expect(
        cli.graphql<{ viewer: { login: string } }>({
          query: 'query { viewer { login } }',
        })
      ).resolves.toEqual({
        success: true,
        data: { viewer: { login: 'monalisa' } },
      });
    });
  });
});
