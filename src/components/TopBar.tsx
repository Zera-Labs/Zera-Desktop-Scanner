import { useMemo } from "react";
import type { CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

function TopBar() {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const dragRegionStyle: CSSProperties & { WebkitAppRegion?: string } = {
    WebkitAppRegion: "drag",
  };

  return (
    <header
      className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-white/10 bg-[var(--background)]/90 px-4 backdrop-blur"
      data-tauri-drag-region
      style={dragRegionStyle}
      onDoubleClick={() => void appWindow.toggleMaximize()}
    >
      <div className="flex min-w-0 select-none items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--brand-light-green)]/30 bg-[var(--brand-green)]/15 text-sm font-semibold text-[var(--brand-green-50)]">
          Z
        </div>
        <div className="truncate">
          <div className="text-sm font-semibold leading-tight text-[var(--text-primary)]">Offline Cash</div>
          <div className="text-[11px] leading-tight text-[var(--text-tertiary)]">desk_tauri</div>
        </div>
      </div>
      <div className="flex items-center gap-1" data-tauri-drag-region="false">
        <button
          type="button"
          onClick={() => void appWindow.minimize()}
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-primary)] transition hover:bg-white/5"
          aria-label="Minimize"
          data-tauri-drag-region="false"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => void appWindow.toggleMaximize()}
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-primary)] transition hover:bg-white/5"
          aria-label="Maximize"
          data-tauri-drag-region="false"
        >
          <Square className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => void appWindow.close()}
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-primary)] transition hover:bg-red-500/15"
          aria-label="Close"
          data-tauri-drag-region="false"
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  );
}

export default TopBar;

