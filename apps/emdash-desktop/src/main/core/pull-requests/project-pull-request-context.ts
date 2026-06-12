import { providerRepositoryService } from '@main/core/repository/provider-repository-service';
import type { PullRequestError } from '@shared/core/pull-requests/pull-requests';
import { err, ok, type Result } from '@shared/lib/result';
import type { ProviderRepositoryError } from '@shared/provider-repository';

export type ProjectPullRequestContext = {
  projectId: string;
  repositoryUrl: string;
  host: string;
  nameWithOwner: string;
};

type ProjectPullRequestContextSourceError = ProviderRepositoryError;

async function resolveProjectPullRequestSourceContext(
  projectId: string
): Promise<Result<ProjectPullRequestContext, ProjectPullRequestContextSourceError>> {
  const repository = await providerRepositoryService.resolveProject(projectId);
  if (!repository.success) return err(repository.error);

  return ok({
    projectId,
    repositoryUrl: repository.data.repositoryUrl,
    host: repository.data.host,
    nameWithOwner: repository.data.nameWithOwner,
  });
}

export async function resolveProjectPullRequestContext(
  projectId: string
): Promise<Result<ProjectPullRequestContext, PullRequestError>> {
  const context = await resolveProjectPullRequestSourceContext(projectId);
  if (context.success) return ok(context.data);
  return err(collapseSourceContextErrorForPullRequests(context.error));
}

function collapseSourceContextErrorForPullRequests(
  error: ProjectPullRequestContextSourceError
): PullRequestError {
  switch (error.type) {
    case 'no_remote':
    case 'invalid_remote':
    case 'unsupported_provider':
    case 'host_unreachable':
    case 'host_error':
      return { type: 'remote_not_ready', status: error.type };
  }
}
