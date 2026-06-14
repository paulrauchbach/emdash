import { AlertCircle, Loader2, Terminal } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@renderer/lib/hooks/use-toast';
import { useImportGitHubCliAccounts } from '@renderer/lib/hooks/useGithubAccounts';
import { type BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { cn } from '@renderer/utils/utils';

export function GithubConnectModal({ onSuccess, onClose }: BaseModalProps<void>) {
  const { toast } = useToast();
  const importCliAccountsMutation = useImportGitHubCliAccounts();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCliAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await importCliAccountsMutation.mutateAsync();
      if (!result.success) {
        setError(result.error);
        return;
      }

      if (result.importedAccountIds.length === 0) {
        setError('No GitHub CLI session found. Run gh auth login first.');
        return;
      }

      toast({
        title: 'GitHub CLI accounts imported',
        description:
          result.importedAccountIds.length === 1
            ? '1 account is available in Emdash.'
            : `${result.importedAccountIds.length} accounts are available in Emdash.`,
      });
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect GitHub</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="flex flex-col gap-4">
        <div className="flex flex-col items-center justify-center gap-4 py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background-2">
            <Terminal className="h-6 w-6 text-foreground" />
          </div>
          <div className="text-center">
            <p className="text-sm text-foreground">
              Emdash uses your GitHub CLI authentication to access repositories and issues.
            </p>
            <div className="mt-4 rounded-md border border-border bg-background-2 p-3 text-left">
              <p className="mb-2 text-xs text-foreground-muted">1. Open your terminal</p>
              <p className="mb-2 text-xs text-foreground-muted">2. Authenticate with GitHub CLI:</p>
              <code className="block rounded bg-background p-2 text-xs select-all">
                gh auth login
              </code>
            </div>
          </div>
        </div>

        {error && <InlineError message={error} />}
      </DialogContentArea>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={() => void refreshCliAuth()} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Check Connection
        </Button>
      </DialogFooter>
    </>
  );
}

function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <div
      className={cn(
        'bg-destructive/10 text-destructive flex items-start gap-1.5 rounded-md px-2.5 py-2 text-xs',
        className
      )}
    >
      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
