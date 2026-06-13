import { beforeEach, describe, expect, it } from 'vitest';
import { err, ok } from '@shared/lib/result';
import {
  GitHubAccountRegistry,
  type GitHubAccountMetadataStore,
  type GitHubAccountSecretStore,
} from '../accounts/github-account-registry';
import { GitHubApiAuthService } from './github-api-auth-service';

class InMemoryMetadataStore implements GitHubAccountMetadataStore {
  accounts = null as Awaited<ReturnType<GitHubAccountMetadataStore['getAccounts']>>;
  defaultAccountId: string | null = null;
  removedCliAccounts = null as Awaited<
    ReturnType<GitHubAccountMetadataStore['getRemovedCliAccounts']>
  >;

  async getAccounts() {
    return this.accounts;
  }

  async setAccounts(accounts: NonNullable<typeof this.accounts>) {
    this.accounts = accounts;
  }

  async getDefaultAccountId() {
    return this.defaultAccountId;
  }

  async setDefaultAccountId(accountId: string | null) {
    this.defaultAccountId = accountId;
  }

  async getRemovedCliAccounts() {
    return this.removedCliAccounts;
  }

  async setRemovedCliAccounts(accounts: NonNullable<typeof this.removedCliAccounts>) {
    this.removedCliAccounts = accounts;
  }
}

class InMemorySecretStore implements GitHubAccountSecretStore {
  private readonly secrets = new Map<string, string>();

  async getSecret(key: string) {
    return this.secrets.get(key) ?? null;
  }

  async setSecret(key: string, value: string) {
    this.secrets.set(key, value);
  }

  async deleteSecret(key: string) {
    this.secrets.delete(key);
  }
}

describe('GitHubApiAuthService', () => {
  let registry: GitHubAccountRegistry;
  let secretStore: InMemorySecretStore;
  let service: GitHubApiAuthService;

  beforeEach(() => {
    secretStore = new InMemorySecretStore();
    registry = new GitHubAccountRegistry(new InMemoryMetadataStore(), secretStore);
    service = new GitHubApiAuthService(registry);
  });

  async function upsertAccount({
    host = 'github.com',
    providerAccountId = '42',
    login = 'monalisa',
    token = `token-${providerAccountId}`,
  }: {
    host?: string;
    providerAccountId?: string;
    login?: string;
    token?: string;
  } = {}) {
    return registry.upsertAccount({
      accessToken: token,
      credentialSource: 'emdash_oauth',
      providerAccount: {
        providerId: 'github',
        providerAccountId,
        host,
        login,
        avatarUrl: '',
      },
    });
  }

  it('uses a selected account token for its host', async () => {
    await upsertAccount({ token: 'selected-account-token' });

    await expect(service.getToken('github.com', { accountId: 'github.com:42' })).resolves.toEqual(
      ok('selected-account-token')
    );
  });

  it('rejects a selected account for a different host', async () => {
    await upsertAccount();

    await expect(
      service.getToken('ghe.example.com', { accountId: 'github.com:42' })
    ).resolves.toEqual(
      err({
        type: 'account_host_mismatch',
        host: 'ghe.example.com',
        accountId: 'github.com:42',
        accountHost: 'github.com',
        message:
          'Selected GitHub account github.com:42 is for github.com, but this repository uses ghe.example.com.',
        hint: 'Run: gh auth login --hostname ghe.example.com',
      })
    );
  });

  it('uses a matching default account when no account is selected', async () => {
    await upsertAccount({
      host: 'ghe.example.com',
      providerAccountId: '168',
      token: 'default-ghes-token',
    });

    await expect(service.getToken('ghe.example.com')).resolves.toEqual(ok('default-ghes-token'));
  });

  it('returns token missing for an account without a saved secret', async () => {
    const account = await upsertAccount();
    await secretStore.deleteSecret(`github-account-token:${account.id}`);

    await expect(service.getToken('github.com', { accountId: account.id })).resolves.toEqual(
      err({
        type: 'token_missing',
        host: 'github.com',
        accountId: account.id,
        message: `Selected GitHub account ${account.id} is missing a saved token.`,
        hint: 'Connect GitHub from account settings.',
      })
    );
  });
});
