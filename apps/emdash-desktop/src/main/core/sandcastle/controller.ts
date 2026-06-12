import type {
  SandcastleTaskOptions,
  SandcastleTaskResult,
} from '../../shared/core/sandcastle/sandcastle';
import { createRPCController } from '../../shared/lib/ipc/rpc';
import type { Result } from '../lib/result';
import { sandcastleService } from './sandcastle-service';

export const sandcastleController = createRPCController({
  runTask: async (options: SandcastleTaskOptions): Promise<Result<SandcastleTaskResult, Error>> => {
    return await sandcastleService.runTask(options);
  },
});
