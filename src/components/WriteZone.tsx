import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import PrivateAssetCard from "@/components/PrivateAssetCard";

interface Note {
  id: string;
  amount: number;
  txSignature: string;
  createdAt: string;
}

interface WriteZoneProps {
  stagedNote: Note | null;
  isDragOver: boolean;
  isWriting: boolean;
  busy: boolean;
  isReading: boolean;
  dropZoneRef: React.RefObject<HTMLDivElement | null>;
  onWrite: () => void;
  onClear: () => void;
  onMouseEnter: () => void;
  onMouseMove: () => void;
  onMouseLeave: () => void;
  onMouseUp: () => void;
}

export default function WriteZone({
  stagedNote,
  isDragOver,
  isWriting,
  busy,
  isReading,
  dropZoneRef,
  onWrite,
  onClear,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onMouseUp,
}: WriteZoneProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Write zone</div>
      <div
        ref={dropZoneRef}
        className={`rounded-lg border-2 border-dashed px-4 transition-all min-h-[120px] select-none ${
          isDragOver
            ? "border-[var(--brand-green)] bg-[var(--brand-light-green)]/20 py-4 shadow-[0_0_16px_0_#52C97D40] animate-pulse"
            : isWriting
            ? "border-[var(--brand-green)]/60 bg-[var(--brand-light-green)]/10 py-8 animate-pulse"
            : "border-[var(--brand-light-green)]/40 bg-[var(--brand-light-dark-green)]/20 py-8"
        }`}
        onMouseEnter={onMouseEnter}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseUp={onMouseUp}
      >
        {stagedNote ? (
          <div className="space-y-6">
            <div className="flex justify-center">
              <PrivateAssetCard
                isFull
                valueUsd={stagedNote.amount}
                txSignature={stagedNote.txSignature}
                createdAt={stagedNote.createdAt}
                className="scale-90 origin-center"
              />
            </div>
            {!isWriting && (
              <div className="flex gap-3 items-center justify-center">
                <Button
                  variant="greenTint"
                  onClick={onWrite}
                  disabled={busy}
                  className="gap-1.5 text-[var(--brand-green-50)] text-[12px] px-1 py-0.5 h-[40px] rounded-[12px]"
                >
                  <Upload className="size-6" />
                  Write to Tag
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClear}
                  disabled={busy}
                  className="h-9 px-5"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <div className="text-sm text-[var(--text-tertiary)]">
              {isDragOver ? "Drop to preview" : "Drag note tile here"}
            </div>
            <div className="text-xs text-[var(--text-tertiary)]/60 mt-1">
              {isDragOver ? "Note will appear here" : "to prepare for writing"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
