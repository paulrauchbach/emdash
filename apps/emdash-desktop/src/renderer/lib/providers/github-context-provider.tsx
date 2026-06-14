import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useCallback, useContext, useEffect } from 'react';
import { events, rpc } from '@renderer/lib/ipc';
import { log } from '@renderer/utils/logger';
import { githubAccountsChangedChannel } from '@shared/events/githubEvents';
import type { GitHubAccountState, GitHubAccountSummary, GitHubUser } from '@shared/github';
import {
  GITHUB_ACCOUNTS_QUERY_KEY,
  GITHUB_ACCOUNT_STATE_QUERY_KEY,
  ISSUE_CONNECTION_STATUS_QUERY_KEY,
} from '../hooks/useGithubAccounts';

type GithubContextValue = {
  user: GitHubUser | null;
};

const GithubContext = createContext<GithubContextValue | null>(null);

function accountSummaryToUser(account: GitHubAccountSummary | undefined): GitHubUser | null {
  if (!account) return null;
  const providerAccountId = account.accountId.slice(`${account.host}:`.length);
  const numericId = Number(providerAccountId);
  return {
    id: Number.isFinite(numericId) ? numericId : 0,
    login: account.login,
    name: '',
    email: '',
    avatar_url: account.avatarUrl,
  };
}

export function GithubContextProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const { data: accountState } = useQuery<GitHubAccountState>({
    queryKey: GITHUB_ACCOUNT_STATE_QUERY_KEY,
    queryFn: () => rpc.github.getAccountState(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const defaultAccount = accountState?.accounts.find(
    (account) => account.accountId === accountState.defaultAccountId
  );
  const user = accountSummaryToUser(defaultAccount);

  const invalidateGitHubState = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: GITHUB_ACCOUNTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: GITHUB_ACCOUNT_STATE_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ISSUE_CONNECTION_STATUS_QUERY_KEY });
  }, [queryClient]);

  useEffect(() => {
    const cleanupAccountsChanged = events.on(githubAccountsChangedChannel, () => {
      log.info('[GithubContext] received githubAccountsChangedChannel event');
      invalidateGitHubState();
    });

    return cleanupAccountsChanged;
  }, [invalidateGitHubState]);

  const value: GithubContextValue = {
    user,
  };

  return <GithubContext.Provider value={value}>{children}</GithubContext.Provider>;
}

export function useGithubContext() {
  const ctx = useContext(GithubContext);
  if (!ctx) {
    throw new Error('useGithubContext must be used inside GithubContextProvider');
  }
  return ctx;
}
