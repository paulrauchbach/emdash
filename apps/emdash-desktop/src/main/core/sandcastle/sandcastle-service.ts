import { access } from 'node:fs/promises';
import path from 'node:path';
import { claudeCode, run } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';
import { podman } from '@ai-hero/sandcastle/sandboxes/podman';
import { projectManager } from '@main/core/projects/project-manager';
import { log } from '@main/lib/logger';
import type {
  SandcastleTaskError,
  SandcastleTaskOptions,
  SandcastleTaskResult,
} from '@shared/core/sandcastle/sandcastle';
import type { Result } from '@shared/lib/result';
import { err, ok } from '@shared/lib/result';

type SandcastleProject = {
  type: string;
  repoPath: string;
};

type SandcastleServiceDependencies = {
  getProject(projectId: string): SandcastleProject | undefined;
  fileExists(filePath: string): Promise<boolean>;
  run: typeof run;
  claudeCode: typeof claudeCode;
  docker: typeof docker;
  podman: typeof podman;
};

const defaultDependencies: SandcastleServiceDependencies = {
  getProject: (projectId) => projectManager.getProject(projectId),
  fileExists: async (filePath) => {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  },
  run,
  claudeCode,
  docker,
  podman,
};

export class SandcastleService {
  constructor(private readonly dependencies = defaultDependencies) {}

  async runTask(
    options: SandcastleTaskOptions
  ): Promise<Result<SandcastleTaskResult, SandcastleTaskError>> {
    const project = this.dependencies.getProject(options.projectId);
    if (!project) {
      return err({
        type: 'project_not_found',
        message: `Project ${options.projectId} is not mounted.`,
      });
    }
    if (project.type !== 'local') {
      return err({
        type: 'unsupported_project',
        message: 'Sandcastle currently supports local projects only.',
      });
    }

    const setupFile = path.join(
      project.repoPath,
      '.sandcastle',
      options.provider === 'docker' ? 'Dockerfile' : 'Containerfile'
    );
    if (!options.imageName && !(await this.dependencies.fileExists(setupFile))) {
      const providerName = options.provider === 'docker' ? 'Docker' : 'Podman';
      return err({
        type: 'provider_not_configured',
        message: `${providerName} sandbox setup is missing. Run Sandcastle initialization for this repository first.`,
      });
    }

    try {
      log.info('Running Sandcastle task', {
        projectId: options.projectId,
        provider: options.provider,
        branch: options.branch,
        agentModel: options.agentModel,
      });

      const providerOptions = options.imageName ? { imageName: options.imageName } : undefined;
      const sandboxProvider =
        options.provider === 'docker'
          ? this.dependencies.docker(providerOptions)
          : this.dependencies.podman(providerOptions);

      const result = await this.dependencies.run({
        agent: this.dependencies.claudeCode(options.agentModel),
        sandbox: sandboxProvider,
        prompt: options.prompt,
        cwd: project.repoPath,
        branchStrategy: { type: 'branch', branch: options.branch },
      });

      return ok({
        iterations: result.iterations.length,
        commits: result.commits.map((c: { sha: string }) => c.sha),
        branch: result.branch,
      });
    } catch (error) {
      log.error('Sandcastle task failed', { error });
      return err({
        type: 'execution_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const sandcastleService = new SandcastleService();
