import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReaderStatusProps {
  readerLoading: boolean;
  readerError: unknown;
  readerStatus?: string;
  onRefresh: () => void;
}

export default function ReaderStatus({ readerLoading, readerError, readerStatus, onRefresh }: ReaderStatusProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Reader</div>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={readerLoading}
          className="h-6 px-2 text-xs"
        >
          {readerLoading ? (
            <>
              <Loader2 className="size-3 animate-spin mr-1" />
              Checking...
            </>
          ) : (
            'Refresh'
          )}
        </Button>
      </div>
      <div className="rounded-lg border border-[var(--brand-light-green)]/25 bg-[var(--brand-light-dark-green)] px-3 py-2 text-sm text-[var(--text-primary)]">
        {readerLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="size-3 animate-spin" />
            Checking reader…
          </div>
        ) : readerError ? (
          <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <AlertCircle className="size-4 text-yellow-400" />
            <span>No NFC reader detected</span>
          </div>
        ) : readerStatus ? (
          <div className="flex items-center gap-2 text-[var(--brand-green-50)]">
            <CheckCircle className="size-4 text-[var(--brand-green)]" />
            <div className="whitespace-pre-line">{readerStatus}</div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
            <AlertCircle className="size-4 text-yellow-400" />
            <span>No NFC reader detected</span>
          </div>
        )}
      </div>
    </div>
  );
}
