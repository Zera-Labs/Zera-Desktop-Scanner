import { useMemo, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

const isMac = navigator.platform.toUpperCase().includes("MAC");

function TopBar() {
  const appWindow = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    if (!isMac) {
      void appWindow.setDecorations(false);
    }
  }, [appWindow]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    void appWindow.startDragging();
  };

  const WinControls = () => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void appWindow.minimize()}
        className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-primary)] transition hover:bg-white/5"
        aria-label="Minimize"
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => void appWindow.toggleMaximize()}
        className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-primary)] transition hover:bg-white/5"
        aria-label="Maximize"
      >
        <Square className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => void appWindow.close()}
        className="grid h-8 w-8 place-items-center rounded-md text-[var(--text-primary)] transition hover:bg-red-500/15"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </div>
  );

  return (
    <header
      data-tauri-drag-region
      className={`sticky top-0 z-20 flex h-12 items-center justify-between border-b border-white/10 bg-[var(--background)]/90 backdrop-blur ${
        isMac ? "pl-20 pr-4" : "px-4"
      }`}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => void appWindow.toggleMaximize()}
    >
      <div className="flex min-w-0 select-none items-center gap-2 pointer-events-none">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--brand-light-green)]/30 bg-[var(--brand-green)]/15 text-sm font-semibold text-[var(--brand-green-50)]">
          Z
        </div>
        <span className="text-sm font-semibold text-[var(--text-primary)]">Zera Desktop</span>
      </div>

      {!isMac && <WinControls />}
    </header>
  );
}

export default TopBar;
