import React from "react";
import { Eraser, Loader2, ScanText } from "lucide-react";

import ReaderStatus from "@/components/ReaderStatus";
import TagContentPreview from "@/components/TagContentPreview";
import TagStatus from "@/components/TagStatus";
import WriteZone from "@/components/WriteZone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type PrivateCashNoteTile } from "@/lib/note";

const SHOW_DEBUG_BUTTON = false;

type HardwarePanelProps = {
  readerLoading: boolean;
  readerError?: unknown;
  readerStatus?: string | null;
  onCheckReader: () => void;
  tagData: any;
  busy: boolean;
  isWriting: boolean;
  isErasing: boolean;
  status: string;
  onSaveTagToComputer: () => void;
  onReadJson: () => void;
  onReadRaw: () => void;
  onEraseTag: () => void;
  canRead: boolean;
  stagedNote: PrivateCashNoteTile | null;
  isDragOver: boolean;
  dropZoneRef: React.RefObject<HTMLDivElement> | React.MutableRefObject<HTMLDivElement | null>;
  onWrite: () => void;
  onClear: () => void;
  onMouseEnter: () => void;
  onMouseMove: () => void;
  onMouseLeave: () => void;
  onMouseUp: () => void;
  statusHistory: string[];
};

export default function HardwarePanel({
  readerLoading,
  readerError,
  readerStatus,
  onCheckReader,
  tagData,
  busy,
  isWriting,
  isErasing,
  status,
  onReadJson,
  onReadRaw,
  onEraseTag,
  canRead,
  stagedNote,
  isDragOver,
  dropZoneRef,
  onWrite,
  onClear,
  onMouseEnter,
  onMouseMove,
  onMouseLeave,
  onMouseUp,
  statusHistory,
}: HardwarePanelProps) {
  return (
    <Card variant="darkSolidGrey" className="border border-[var(--brand-light-green)]/25 min-h-[540px]">
      <CardHeader>
        <CardTitle className="text-[16px] font-normal">Hardware</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 select-none">
        <ReaderStatus
          readerLoading={readerLoading}
          readerError={readerError}
          readerStatus={readerStatus ?? undefined}
          onCheckReader={onCheckReader}
        />

        {tagData && <TagStatus tagData={tagData} />}

        <div className="grid gap-2">
          {!busy && (
            <div className="flex gap-2">
              <Button
                variant="greenTint"
                onClick={onReadJson}
                disabled={!canRead}
                className="flex-1 gap-1.5 text-[var(--brand-green-50)] text-[12px] h-[40px] rounded-[12px]"
              >
                <ScanText className="size-6" />
                Read Tag
              </Button>
              {SHOW_DEBUG_BUTTON && (
                <Button
                  variant="outline"
                  onClick={onReadRaw}
                  disabled={!canRead}
                  className="w-[80px] text-[var(--text-secondary)] text-[10px] h-[40px] rounded-[12px] border-[var(--brand-light-green)]/25"
                  title="Debug Mode: Read Raw Pages"
                >
                  Debug
                </Button>
              )}
            </div>
          )}
        </div>

        {tagData?.ndef?.kind === "json" && tagData.ndef.json && (
          <TagContentPreview json={tagData.ndef.json} />
        )}

        {tagData && !tagData.is_blank && !isErasing && (
          <div className="flex justify-center">
            <button
              onClick={onEraseTag}
              disabled={busy}
              className="h-[28px] px-3 rounded-[8px] border border-[var(--brand-light-green)]/25 bg-transparent text-[var(--text-tertiary)] text-[11px] flex items-center gap-1.5 hover:bg-red-500/10 hover:border-red-500/40 hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Clear tag contents (set to blank)"
            >
              <Eraser className="size-3.5" />
              Clear tag
            </button>
          </div>
        )}

        {isErasing && (
          <div className="flex items-center justify-center gap-2 h-[32px] text-[11px] text-[var(--text-tertiary)]">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Clearing tag...</span>
          </div>
        )}

        <div className="border-t border-[var(--brand-light-green)]/20 my-4"></div>
        {busy && status && (
          <div className="rounded-lg border border-[var(--brand-light-green)]/35 bg-[var(--brand-light-dark-green)] px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-[var(--brand-green-50)]" />
              <span className="text-[var(--text-primary)]">{status}</span>
            </div>
          </div>
        )}
        <WriteZone
          stagedNote={stagedNote}
          isDragOver={isDragOver}
          isWriting={isWriting}
          busy={busy}
          dropZoneRef={dropZoneRef}
          onWrite={onWrite}
          onClear={onClear}
          onMouseEnter={onMouseEnter}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onMouseUp={onMouseUp}
        />


        {statusHistory.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Recent operations</div>
            <div className="rounded-lg border border-[var(--brand-light-green)]/15 bg-[var(--brand-light-dark-green)]/30 px-3 py-2 space-y-1 max-h-32 overflow-y-auto">
              {statusHistory.slice(-5).reverse().map((entry, index) => (
                <div 
                  key={`${entry}-${index}`} 
                  className={`text-xs whitespace-pre-line ${index === 0 ? 'text-[var(--brand-green)]' : 'text-[var(--text-tertiary)]'}`}
                >
                  {entry}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

