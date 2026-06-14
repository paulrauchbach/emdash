export interface GitHubCliIdentity {
  host: string;
  user: string;
}

export interface GitHubRestRequest {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  host?: string;
  paginate?: boolean;
  signal?: AbortSignal;
}

export interface GitHubGraphqlRequest {
  query: string;
  variables?: Record<string, unknown>;
  host?: string;
  signal?: AbortSignal;
}
