import { Clipboard, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import PrivateAssetCard from "@/components/PrivateAssetCard";

interface TagContentPreviewProps {
  json: string;
  busy: boolean;
  onCopy: () => void;
  onSave: () => void;
}

export default function TagContentPreview({ json, busy, onCopy, onSave }: TagContentPreviewProps) {
  try {
    const parsed = JSON.parse(json);
    return (
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Content on tag</div>
        <div className="flex justify-center">
          <PrivateAssetCard
            isFull
            valueUsd={parsed.amount || 0}
            txSignature={parsed.txSignature || parsed.recipient || "Unknown"}
            createdAt={parsed.createdAt || new Date().toISOString()}
            className="scale-90 origin-center"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={busy}
            className="flex-1 gap-1.5"
          >
            <Clipboard className="size-3" />
            Copy JSON
          </Button>
          <Button
            variant="greenTint"
            size="sm"
            onClick={onSave}
            disabled={busy}
            className="flex-1 gap-1.5"
          >
            <Download className="size-3" />
            Save to PC
          </Button>
        </div>
      </div>
    );
  } catch {
    // If JSON parsing fails, show raw JSON
    return (
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Content on tag</div>
        <div className="rounded-lg border border-[var(--brand-light-green)]/20 bg-[var(--brand-light-dark-green)]/50 p-3">
          <pre className="font-mono text-[10px] text-[var(--text-tertiary)] overflow-auto max-h-32 whitespace-pre-wrap break-words">
            {json}
          </pre>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={busy}
            className="flex-1 gap-1.5"
          >
            <Clipboard className="size-3" />
            Copy JSON
          </Button>
          <Button
            variant="greenTint"
            size="sm"
            onClick={onSave}
            disabled={busy}
            className="flex-1 gap-1.5"
          >
            <Download className="size-3" />
            Save to PC
          </Button>
        </div>
      </div>
    );
  }
}
