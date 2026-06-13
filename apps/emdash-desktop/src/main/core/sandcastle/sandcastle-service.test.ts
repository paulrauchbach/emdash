import { describe, expect, it, vi } from 'vitest';

vi.mock('@main/core/projects/project-manager', () => ({
  projectManager: {
    getProject: vi.fn(),
  },
}));

import { SandcastleService } from './sandcastle-service';

function makeService(
  overrides: {
    project?: { type: string; repoPath: string };
    fileExists?: boolean;
  } = {}
) {
  const run = vi.fn().mockResolvedValue({
    iterations: [{}],
    commits: [{ sha: 'abc123' }],
    branch: 'agent/task',
  });
  const docker = vi.fn().mockReturnValue({ name: 'docker' });
  const podman = vi.fn().mockReturnValue({ name: 'podman' });

  return {
    run,
    docker,
    podman,
    service: new SandcastleService({
      getProject: () =>
        overrides.project === undefined ? { type: 'local', repoPath: '/repo' } : overrides.project,
      fileExists: vi.fn().mockResolvedValue(overrides.fileExists ?? true),
      run,
      claudeCode: vi.fn().mockReturnValue({ name: 'claude-code' }),
      docker,
      podman,
    }),
  };
}

describe('SandcastleService', () => {
  it('resolves the cwd from a mounted local project', async () => {
    const { service, run } = makeService();

    await expect(
      service.runTask({
        projectId: 'project-1',
        agentModel: 'claude-sonnet-4-6',
        prompt: 'Fix the test',
        branch: 'agent/task',
        provider: 'docker',
      })
    ).resolves.toEqual({
      success: true,
      data: {
        iterations: 1,
        commits: ['abc123'],
        branch: 'agent/task',
      },
    });

    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: '/repo',
        branchStrategy: { type: 'branch', branch: 'agent/task' },
      })
    );
  });

  it('rejects missing projects instead of accepting an arbitrary cwd', async () => {
    const missingProjectService = new SandcastleService({
      getProject: () => undefined,
      fileExists: vi.fn(),
      run: vi.fn(),
      claudeCode: vi.fn(),
      docker: vi.fn(),
      podman: vi.fn(),
    });

    await expect(
      missingProjectService.runTask({
        projectId: 'missing',
        agentModel: 'claude-sonnet-4-6',
        prompt: 'Fix the test',
        branch: 'agent/task',
        provider: 'docker',
      })
    ).resolves.toEqual({
      success: false,
      error: {
        type: 'project_not_found',
        message: 'Project missing is not mounted.',
      },
    });
  });

  it('rejects SSH projects because Sandcastle runs on the local host', async () => {
    const { service } = makeService({
      project: { type: 'ssh', repoPath: '/remote/repo' },
    });

    await expect(
      service.runTask({
        projectId: 'project-1',
        agentModel: 'claude-sonnet-4-6',
        prompt: 'Fix the test',
        branch: 'agent/task',
        provider: 'docker',
      })
    ).resolves.toEqual({
      success: false,
      error: {
        type: 'unsupported_project',
        message: 'Sandcastle currently supports local projects only.',
      },
    });
  });

  it('reports missing provider setup before invoking Sandcastle', async () => {
    const { service, run } = makeService({ fileExists: false });

    const result = await service.runTask({
      projectId: 'project-1',
      agentModel: 'claude-sonnet-4-6',
      prompt: 'Fix the test',
      branch: 'agent/task',
      provider: 'podman',
    });

    expect(result).toEqual({
      success: false,
      error: {
        type: 'provider_not_configured',
        message:
          'Podman sandbox setup is missing. Run Sandcastle initialization for this repository first.',
      },
    });
    expect(run).not.toHaveBeenCalled();
  });
});
