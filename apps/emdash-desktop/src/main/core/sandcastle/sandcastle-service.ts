import { run, claudeCode } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox';
import { podman } from '@ai-hero/sandcastle/sandboxes/podman';
import { vercel } from '@ai-hero/sandcastle/sandboxes/vercel';
import type {
  SandcastleTaskOptions,
  SandcastleTaskResult,
} from '@shared/core/sandcastle/sandcastle';
import { log } from '@main/lib/logger';
import type { Result } from '@shared/lib/result';
import { err, ok } from '@shared/lib/result';

export class SandcastleService {
  async runTask(options: SandcastleTaskOptions): Promise<Result<SandcastleTaskResult, Error>> {
    try {
      log.info('Running Sandcastle task', { options });

      let sandboxProvider;
      switch (options.provider) {
        case 'docker':
          sandboxProvider = docker();
          break;
        case 'podman':
          sandboxProvider = podman();
          break;
        case 'vercel':
          sandboxProvider = vercel();
          break;
        case 'no-sandbox':
        default:
          sandboxProvider = noSandbox();
          break;
      }

      const result = await run({
        agent: claudeCode(options.agentModel),
        sandbox: sandboxProvider,
        prompt: options.prompt,
        cwd: options.cwd,
        branchStrategy: { type: 'branch', branch: options.branch },
      });

      return ok({
        iterations: result.iterations.length,
        commits: result.commits.map((c: { sha: string }) => c.sha),
        branch: result.branch,
      });
    } catch (error) {
      log.error('Sandcastle task failed', { error });
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const sandcastleService = new SandcastleService();
