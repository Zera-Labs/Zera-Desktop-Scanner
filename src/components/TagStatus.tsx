interface TagData {
  uid?: string | null;
  is_blank: boolean;
  ndef?: {
    kind: string;
    json?: string | null;
  } | null;
}

interface TagStatusProps {
  tagData: TagData;
}

export default function TagStatus({ tagData }: TagStatusProps) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Tag</div>
      <div className="rounded-lg border border-[var(--brand-light-green)]/25 bg-[var(--brand-light-dark-green)] px-3 py-2 text-sm">
        <div className="space-y-1">
          {tagData.uid && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-tertiary)]">UID:</span>
              <span className="font-mono text-xs text-[var(--text-primary)]">{tagData.uid}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-tertiary)]">Status:</span>
            <span className={tagData.is_blank ? "text-yellow-400" : "text-[var(--brand-green-50)]"}>
              {tagData.is_blank ? "📭 Blank" : "📬 Has content"}
            </span>
          </div>
          {tagData.ndef && !tagData.is_blank && (
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-tertiary)]">Type:</span>
              <span className="font-mono text-xs">{tagData.ndef.kind}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
