import { z } from 'zod';

const nonControlString = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !/[\x00-\x1f\x7f]/.test(value), {
    message: 'Control characters are not allowed.',
  });

export const sandcastleTaskOptionsSchema = z.object({
  projectId: z.string().trim().min(1).max(256),
  agentModel: z.string().trim().min(1).max(256),
  prompt: z.string().min(1).max(1_000_000),
  branch: nonControlString,
  provider: z.enum(['docker', 'podman']),
  imageName: nonControlString.optional(),
});

export type SandcastleTaskOptions = z.infer<typeof sandcastleTaskOptionsSchema>;

export interface SandcastleTaskResult {
  iterations: number;
  commits: string[];
  branch: string;
}

export type SandcastleTaskError =
  | { type: 'invalid_options'; message: string }
  | { type: 'project_not_found'; message: string }
  | { type: 'unsupported_project'; message: string }
  | { type: 'provider_not_configured'; message: string }
  | { type: 'execution_failed'; message: string };
