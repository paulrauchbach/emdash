import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubHostService } from './github-host-service';

const mockFetch = vi.hoisted(() => vi.fn());

global.fetch = mockFetch;

describe('GitHubHostService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts github.com without probing', async () => {
    const service = new GitHubHostService();

    await expect(service.probe('github.com')).resolves.toEqual({
      success: true,
      data: { host: 'github.com' },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('probes GHES meta endpoint with the enterprise API base URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ verifiable_password_authentication: true }),
    });
    const service = new GitHubHostService();

    await expect(service.probe('ghe.example.com')).resolves.toEqual({
      success: true,
      data: { host: 'ghe.example.com' },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ghe.example.com/api/v3/meta',
      expect.objectContaining({
        headers: { Accept: 'application/vnd.github.v3+json' },
      })
    );
  });

  it('treats authenticated-only GHES meta responses as compatible', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 });
    const service = new GitHubHostService();

    await expect(service.probe('ghe.example.com')).resolves.toEqual({
      success: true,
      data: { host: 'ghe.example.com' },
    });
  });

  it('returns not_github for a 404 meta response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    const service = new GitHubHostService();

    await expect(service.probe('gitlab.example.com')).resolves.toEqual({
      success: false,
      error: {
        type: 'not_github',
        host: 'gitlab.example.com',
        reason: 'meta endpoint returned 404',
      },
    });
  });
});
