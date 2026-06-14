export type GitHubCliErrorCode =
  | 'CLI_MISSING'
  | 'NOT_AUTHENTICATED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'SSO_REQUIRED'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface GitHubCliError {
  code: GitHubCliErrorCode;
  message: string;
  originalError?: unknown;
}

export const isGitHubCliError = (error: unknown): error is GitHubCliError => {
  return typeof error === 'object' && error !== null && 'code' in error;
};

export const createCliError = (
  code: GitHubCliErrorCode,
  message: string,
  originalError?: unknown
): GitHubCliError => ({
  code,
  message,
  originalError,
});
