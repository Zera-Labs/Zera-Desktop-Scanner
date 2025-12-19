import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Overwrite Tag Content?</DialogTitle>
          <DialogDescription>
            This tag already has content. Do you want to overwrite it with the new note?
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-[var(--text-tertiary)] mb-2">
              Current content on tag:
            </div>
            {currentTagJson && (() => {
              try {
                const parsed = JSON.parse(currentTagJson);
                return (
                  <div className="flex justify-center">
                    <PrivateAssetCard
                      isFull
                      valueUsd={parsed.amount || 0}
                      txSignature={parsed.txSignature || parsed.recipient || "Unknown"}
                      createdAt={parsed.createdAt || new Date().toISOString()}
                      className="scale-75 origin-center"
                    />
                  </div>
                );
              } catch {
                return <div className="text-xs text-[var(--text-tertiary)]">Invalid JSON data</div>;
              }
            })()}
          </div>
          
          <div>
            <div className="text-xs font-medium text-[var(--text-tertiary)] mb-2">
              New note to write:
            </div>
            {pendingNote && (
              <div className="flex justify-center">
                <PrivateAssetCard
                  isFull
                  valueUsd={pendingNote.amount}
                  txSignature={pendingNote.txSignature}
                  createdAt={pendingNote.createdAt}
                  className="scale-75 origin-center"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="greenTint" onClick={onConfirm}>
            Overwrite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
