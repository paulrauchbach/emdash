import { isGitHubCliError, type GitHubCliError } from '@main/core/github/cli/github-cli-errors';
import type { GitHubApiAuthError } from '@main/core/github/services/github-api-auth-errors';
import {
  classifyGitHubApiError,
  type GitHubApiOperationError,
} from '@main/core/github/services/github-api-errors';
import type { RepositoryRefParseError } from '@shared/repository-ref';

export type PrSyncHostUnreachableError = {
  type: 'host_unreachable';
  host: string;
  reason: string;
};

export type PrSyncApiError = {
  type: 'api_error';
  message: string;
};

export type PrSyncCancelledError = {
  type: 'sync_cancelled';
  message: string;
};

export type PrSyncNotFoundOrNoAccessError = {
  type: 'not_found_or_no_access';
  host: string;
  message: string;
};

export type PrSyncEngineError =
  | RepositoryRefParseError
  | GitHubApiAuthError
  | GitHubApiOperationError
  | PrSyncCancelledError
  | PrSyncApiError
  | PrSyncHostUnreachableError
  | PrSyncNotFoundOrNoAccessError;

export function isPrSyncHostUnreachable(
  error: PrSyncEngineError
): error is PrSyncHostUnreachableError {
  return error.type === 'host_unreachable';
}

export function toPrApiError(
  error: unknown,
  fallback: string,
  host?: string,
  nameWithOwner?: string
): PrSyncEngineError {
  if (error && typeof error === 'object') {
    if ('type' in error && 'message' in error) {
      return error as PrSyncEngineError;
    }
    // Check if it's a GitHubCliError
    if (isGitHubCliError(error)) {
      return mapCliErrorToPrError(error, host ?? 'github.com');
    }
  }
  return classifyGitHubApiError(error, { host, nameWithOwner, fallback });
}

export function mapCliErrorToPrError(error: GitHubCliError, host: string): PrSyncEngineError {
  switch (error.code) {
    case 'NOT_AUTHENTICATED':
      return { type: 'auth_required', host, message: error.message };
    case 'SSO_REQUIRED':
      return {
        type: 'sso_required',
        host,
        message: error.message,
        status: 403,
      } as PrSyncEngineError;
    case 'RATE_LIMITED':
      return {
        type: 'rate_limited',
        host,
        message: error.message,
        status: 403,
      } as PrSyncEngineError;
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return { type: 'host_unreachable', host, reason: error.message };
    default:
      if (error.message.includes('404') || error.message.includes('Not Found')) {
        return { type: 'not_found_or_no_access', host, message: error.message };
      }
      return { type: 'api_error', message: error.message };
  }
}

export function prSyncEngineErrorMessage(error: PrSyncEngineError): string {
  switch (error.type) {
    case 'invalid-repository-ref':
      return `Invalid GitHub repository URL: "${error.input}"`;
    case 'auth_required':
    case 'account_not_found':
    case 'account_host_mismatch':
    case 'token_missing':
      return error.message;
    case 'not_found_or_no_access':
    case 'sso_required':
    case 'rate_limited':
    case 'forbidden':
      return error.message;
    case 'host_unreachable':
      return `Unable to reach ${error.host}: ${error.reason}`;
    case 'sync_cancelled':
    case 'api_error':
      return error.message;
  }
}
