import { useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import logo from "@/assets/zeralabs-logo-192x192.png";

function TopBar() {
  const appWindow = useMemo(() => getCurrentWindow(), []);

  return (
    <header
      className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-white/10 bg-[var(--background)]/90 px-4 backdrop-blur"
      data-tauri-drag-region
      style={{ WebkitAppRegion: "drag" }}
      onDoubleClick={() => void appWindow.toggleMaximize()}
    >
      <div className="flex min-w-0 select-none items-center gap-2">
        <img
          src={logo}
          alt="Zeralabs logo"
          className="h-7 w-7 rounded-md border border-[var(--brand-light-green)]/30 bg-[var(--brand-green)]/10 object-contain"
          draggable={false}
        />
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

