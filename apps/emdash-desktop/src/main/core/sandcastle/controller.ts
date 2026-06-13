import type { SandcastleTaskError, SandcastleTaskResult } from '@shared/core/sandcastle/sandcastle';
import { sandcastleTaskOptionsSchema } from '@shared/core/sandcastle/sandcastle';
import { createRPCController } from '@shared/lib/ipc/rpc';
import { err, type Result } from '@shared/lib/result';
import { sandcastleService } from './sandcastle-service';

export const sandcastleController = createRPCController({
  runTask: async (options: unknown): Promise<Result<SandcastleTaskResult, SandcastleTaskError>> => {
    const parsed = sandcastleTaskOptionsSchema.safeParse(options);
    if (!parsed.success) {
      return err({
        type: 'invalid_options',
        message: 'Invalid Sandcastle task options.',
      });
    }
    return await sandcastleService.runTask(parsed.data);
  },
});
