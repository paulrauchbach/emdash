export interface SandcastleTaskOptions {
  /** The agent to run (e.g. 'claude-opus-4-7') */
  agentModel: string;
  /** Inline prompt to run */
  prompt: string;
  /** The git branch to create/use in the sandbox */
  branch: string;
  /** Host repo directory */
  cwd: string;
  /** The sandbox provider to use */
  provider: 'docker' | 'podman' | 'vercel' | 'no-sandbox';
}

export interface SandcastleTaskResult {
  iterations: number;
  commits: string[];
  branch: string;
}
