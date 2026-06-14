import { defineEvent } from '@shared/lib/ipc/events';

export const githubAccountsChangedChannel = defineEvent<{
  reason: 'startup-reconciliation' | 'account-updated';
}>('github:accounts-changed');
