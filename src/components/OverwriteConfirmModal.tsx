import { AlertTriangle, ArrowDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import PrivateAssetCard from "@/components/PrivateAssetCard";

interface Note {
  id: string;
  amount: number;
  txSignature: string;
  createdAt: string;
}

interface OverwriteConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTagJson: string | null | undefined;
  pendingNote: Note | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function OverwriteConfirmModal({
  open,
  onOpenChange,
  currentTagJson,
  pendingNote,
  onCancel,
  onConfirm,
}: OverwriteConfirmModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-[32rem] max-w-[90vw] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-[var(--brand-light-green)]/10">
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <AlertTriangle className="size-5 text-yellow-500" />
              </div>
              <DialogTitle className="text-xl font-pp-machina text-[var(--text-primary)]">
                Overwrite Tag Content?
              </DialogTitle>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-lg hover:bg-[var(--brand-light-dark-green)] transition-colors"
            >
              <X className="size-5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" />
            </button>
          </div>
        </DialogHeader>
        
        <div className="px-6 py-6 space-y-4">
          <p className="text-sm pb-6 text-[var(--text-tertiary)]">
            This tag already has content. Do you want to overwrite it with the new note?
          </p>

          <div className="space-y-4">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-4 text-center">
                Current content on tag
              </div>
              {currentTagJson && (() => {
                try {
                  const parsed = JSON.parse(currentTagJson);
                  return (
                    <div className="flex justify-center">
                      <PrivateAssetCard
                        isFull
                        valueUsd={parsed.amount || 0}
                        txSignature={parsed.txSignature || parsed.nullifier || parsed.commitment || parsed.recipient || "Unknown"}
                        createdAt={parsed.createdAt || new Date().toISOString()}
                      />
                    </div>
                  );
                } catch {
                  return <div className="text-xs text-[var(--text-tertiary)]">Invalid JSON data</div>;
                }
              })()}
            </div>

            <div className="flex justify-center py-1">
              <ArrowDown className="size-5 text-[var(--brand-green)]" />
            </div>
            
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-4 text-center">
                New note to write
              </div>
              {pendingNote && (
                <div className="flex justify-center">
                  <PrivateAssetCard
                    isFull
                    valueUsd={pendingNote.amount}
                    txSignature={pendingNote.txSignature}
                    createdAt={pendingNote.createdAt}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 pb-6 pt-0">
          <Button 
            variant="outline" 
            onClick={onCancel}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button 
            variant="greenTint" 
            onClick={onConfirm}
            className="flex-1"
          >
            Overwrite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

