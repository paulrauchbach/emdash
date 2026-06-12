import { AlertCircle, CheckCircle, Github, LogIn, User, Terminal } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  useImportGitHubCliAccounts,
  useGitHubAccounts,
} from '@renderer/lib/hooks/useGithubAccounts';
import { Button } from '@renderer/lib/ui/button';

export function SignInStep({ onComplete }: { onComplete: () => void }) {
  const { data: accounts, isLoading: accountsLoading } = useGitHubAccounts();
  const importCliAccountsMutation = useImportGitHubCliAccounts();
  const skippedSignInRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const hasAccounts = (accounts ?? []).length > 0;

  const handleSignIn = async () => {
    skippedSignInRef.current = false;
    setError(null);
    try {
      const result = await importCliAccountsMutation.mutateAsync();
      if (!result.success) {
        if (skippedSignInRef.current) return;
        setError(result.error || 'Import failed');
        return;
      }

      if (result.importedAccountIds.length === 0) {
        if (skippedSignInRef.current) return;
        setError('No GitHub CLI session found. Run gh auth login first.');
        return;
      }

      if (skippedSignInRef.current) {
        return;
      }
      onComplete();
    } catch (err) {
      if (skippedSignInRef.current) return;
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  const handleSkip = () => {
    skippedSignInRef.current = true;
    onComplete();
  };

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-foreground-muted">
        Loading...
      </div>
    );
  }

  if (hasAccounts) {
    return (
      <div className="flex max-w-sm flex-col space-y-8">
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="relative">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background-1">
              <Github className="h-7 w-7 text-foreground-muted" />
            </div>
            <CheckCircle className="text-primary absolute -right-1 -bottom-1 h-5 w-5 fill-background" />
          </div>
          <div className="flex flex-col items-center justify-center gap-1">
            <h1 className="text-center text-xl">
              Connected with {accounts!.length} account{accounts!.length > 1 ? 's' : ''}
            </h1>
          </div>
        </div>
        <Button size={'lg'} onClick={onComplete}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-sm flex-col space-y-8">
      <div className="flex flex-col items-center justify-center gap-6">
        <Terminal className="h-10 w-10 text-foreground" absoluteStrokeWidth strokeWidth={1.5} />
        <div className="flex flex-col items-center justify-center gap-2">
          <h1 className="text-center text-xl">Connect GitHub</h1>
          <p className="text-md text-center text-foreground-muted">
            Emdash uses your GitHub CLI authentication to access repositories and issues.
          </p>
          <div className="mt-4 w-full rounded-md border border-border bg-background-2 p-3 text-left">
            <p className="mb-2 text-xs text-foreground-muted">1. Open your terminal</p>
            <p className="mb-2 text-xs text-foreground-muted">2. Authenticate with GitHub CLI:</p>
            <code className="block rounded bg-background p-2 text-xs select-all">
              gh auth login
            </code>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button size={'lg'} onClick={handleSignIn} disabled={importCliAccountsMutation.isPending}>
          <LogIn className="h-4 w-4" />
          {importCliAccountsMutation.isPending ? 'Checking…' : 'Check connection'}
        </Button>
        {error && (
          <div className="bg-destructive/10 text-destructive flex items-start gap-1.5 rounded-md px-2.5 py-2 text-xs">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button size={'lg'} variant="outline" onClick={handleSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}
