import React, { type ChangeEvent, type DragEvent, type RefObject } from "react";
import { FolderSearch, Loader2 } from "lucide-react";

import PrivateAssetsGrid from "@/components/PrivateAssetsGrid";
import { Button } from "@/components/ui/button";
import { type PrivateCashNoteTile } from "@/lib/note";

type NotePanelProps = {
  notes: PrivateCashNoteTile[];
  selectedNoteId: string | null;
  noteLoading: boolean;
  hasScannedNotes: boolean;
  isImportDragOver: boolean;
  onImportDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onImportDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onImportDrop: (event: DragEvent<HTMLDivElement>) => void;
  onLocateAssets: () => void;
  onChooseFiles: () => void;
  onClearAssets: () => void;
  onSelectNote: (id: string) => void;
  onViewDetails: (id: string) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  assetDirectoryInputRef: RefObject<HTMLInputElement> | React.MutableRefObject<HTMLInputElement | null>;
  assetFileInputRef: RefObject<HTMLInputElement> | React.MutableRefObject<HTMLInputElement | null>;
  onAssetDirectorySelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onAssetFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
};

export default function NotePanel({
  notes,
  selectedNoteId,
  noteLoading,
  hasScannedNotes,
  isImportDragOver,
  onImportDragOver,
  onImportDragLeave,
  onImportDrop,
  onLocateAssets,
  onChooseFiles,
  onClearAssets,
  onSelectNote,
  onViewDetails,
  onDragStart,
  onDragEnd,
  assetDirectoryInputRef,
  assetFileInputRef,
  onAssetDirectorySelected,
  onAssetFilesSelected,
}: NotePanelProps) {
  return (
    <div
      className={`space-y-4 rounded-xl transition-colors ${
        isImportDragOver ? "border border-[var(--brand-light-green)]/50 bg-[var(--brand-light-dark-green)]/30" : ""
      }`}
      onDragOver={onImportDragOver}
      onDragLeave={onImportDragLeave}
      onDrop={onImportDrop}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-[16px] font-semibold">Private assets</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" disabled={noteLoading} onClick={onLocateAssets} className="gap-1.5" expand>
            {noteLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Loading
              </>
            ) : (
              <>
                <FolderSearch className="size-4" />
                Locate assets
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={noteLoading}
            onClick={onChooseFiles}
            className="gap-1.5"
          >
            {noteLoading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processing
              </>
            ) : (
              "Choose files"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={noteLoading || notes.length === 0}
            onClick={onClearAssets}
            className="gap-1.5 text-[var(--corange-300)] hover:text-[var(--corange-100)]"
          >
            Clear assets
          </Button>
          <input
            ref={assetDirectoryInputRef}
            type="file"
            accept="application/json,.json"
            multiple
            className="hidden"
            onChange={onAssetDirectorySelected}
          />
          <input
            ref={assetFileInputRef}
            type="file"
            accept="application/json,.json"
            multiple
            className="hidden"
            onChange={onAssetFilesSelected}
          />
        </div>
      </div>
      <PrivateAssetsGrid
        notes={notes}
        selectedNoteId={selectedNoteId}
        onSelectNote={onSelectNote}
        onViewDetails={onViewDetails}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      />
      {hasScannedNotes && notes.length === 0 ? (
        <p className="text-xs text-[var(--text-tertiary)]">
          No note files were found in the selected folder. Add note JSON files and click Choose files.
        </p>
      ) : null}
    </div>
  );
}
