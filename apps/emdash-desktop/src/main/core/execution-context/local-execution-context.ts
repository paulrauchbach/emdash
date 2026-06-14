import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  GIT_EXECUTABLE,
  isMissingGitExecutableError,
  missingGitExecutableError,
} from '@main/core/utils/exec';
import { NON_INTERACTIVE_GIT_ENV } from './non-interactive-git-env';
import type { ExecOptions, ExecResult, IExecutionContext } from './types';

const execFileAsync = promisify(execFile);

function buildCommandEnv(command: string, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv | undefined {
  if (command !== 'git' && !env) return undefined;
  return command === 'git'
    ? { ...process.env, ...env, ...NON_INTERACTIVE_GIT_ENV }
    : { ...process.env, ...env };
}

function execFileWithInput(
  command: string,
  args: string[],
  options: Parameters<typeof execFile>[2],
  input: string | Buffer
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
    child.stdin?.end(input);
  });
}

export class LocalExecutionContext implements IExecutionContext {
  readonly root: string;
  readonly supportsLocalSpawn = true;

  private readonly _lifetime = new AbortController();

  constructor(opts: { root?: string } = {}) {
    this.root = opts.root ?? '';
  }

  private _signal(callerSignal?: AbortSignal): AbortSignal {
    const signals: AbortSignal[] = [this._lifetime.signal];
    if (callerSignal) signals.push(callerSignal);
    return AbortSignal.any(signals);
  }

  private resolveCommand(command: string): string {
    return command === 'git' ? GIT_EXECUTABLE : command;
  }

  exec(command: string, args: string[] = [], opts: ExecOptions = {}): Promise<ExecResult> {
    const { timeout, maxBuffer, input } = opts;
    const executable = this.resolveCommand(command);
    const options = {
      cwd: this.root || undefined,
      env: buildCommandEnv(command, opts.env),
      timeout,
      maxBuffer,
      signal: this._signal(opts.signal),
      encoding: 'utf8' as const,
    };
    const execution =
      input === undefined
        ? (execFileAsync(executable, args, options) as Promise<ExecResult>)
        : execFileWithInput(executable, args, options, input);

    return execution.catch((error) => {
      if (command === 'git' && isMissingGitExecutableError(error)) {
        throw missingGitExecutableError();
      }
      throw error;
    });
  }

  execStreaming(
    command: string,
    args: string[],
    onChunk: (chunk: string) => boolean,
    opts: { signal?: AbortSignal } = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const signal = this._signal(opts.signal);

      if (signal.aborted) {
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        return;
      }

      const child = spawn(this.resolveCommand(command), args, {
        cwd: this.root || undefined,
        env: buildCommandEnv(command),
      });

      let settled = false;

      const onAbort = () => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        if (settled) return;
        if (!onChunk(chunk)) {
          child.kill('SIGTERM');
        }
      });

      child.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        if (!settled) {
          settled = true;
          reject(
            command === 'git' && isMissingGitExecutableError(err)
              ? missingGitExecutableError()
              : err
          );
        }
      });

      child.on('close', () => {
        signal.removeEventListener('abort', onAbort);
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    });
  }

  dispose(): void {
    this._lifetime.abort();
  }
}
