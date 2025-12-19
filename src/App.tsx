import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { AlertCircle, FolderSearch, Loader2, ScanText } from "lucide-react";

import PrivateAssetsGrid, { createMockPrivateCashVouchers, type PrivateCashVoucherTile } from "@/components/PrivateAssetsGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNtag216Json } from "@/hooks/useNtag216";
import TopBar from "@/components/TopBar";
import ReaderStatus from "@/components/ReaderStatus";
import TagStatus from "@/components/TagStatus";
import TagContentPreview from "@/components/TagContentPreview";
import WriteZone from "@/components/WriteZone";
import OverwriteConfirmModal from "@/components/OverwriteConfirmModal";

function prettyJson(raw: string): { pretty: string; error: string | null } {
  try {
    return { pretty: JSON.stringify(JSON.parse(raw), null, 2), error: null };
  } catch (e) {
    return { pretty: raw, error: String(e) };
  }
}

function buildVoucher(parsed: any, idSource?: string): PrivateCashVoucherTile {
  const idFromSource = idSource
    ? idSource.replace(/^.*[\\/]/, "").replace(/\.json$/i, "")
    : undefined;

  const voucher: PrivateCashVoucherTile = {
    id: parsed.id || idFromSource || String(Date.now()),
    voucherId: parsed.voucherId,
    amount: parsed.amount,
    recipient: parsed.recipient,
    secret: parsed.secret,
    salt: parsed.salt,
    txSignature: parsed.txSignature,
    createdAt: parsed.createdAt || new Date().toISOString(),
  };

  const required = [
    voucher.voucherId,
    voucher.amount,
    voucher.recipient,
    voucher.secret,
    voucher.salt,
    voucher.txSignature,
    voucher.createdAt,
  ];

  if (required.some((field) => field === undefined || field === null)) {
    throw new Error("Missing required voucher fields.");
  }

  return voucher;
}

function App() {
  const [jsonText, setJsonText] = useState('{"hello":"ntag216"}');

  const [voucherTiles, setVoucherTiles] = useState<PrivateCashVoucherTile[]>(() => createMockPrivateCashVouchers());
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [hasScannedVouchers, setHasScannedVouchers] = useState(false);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const assetDirectoryInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImportDragOver, setIsImportDragOver] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [stagedNote, setStagedNote] = useState<PrivateCashVoucherTile | null>(null);
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null);
  const [pendingNote, setPendingNote] = useState<PrivateCashVoucherTile | null>(null);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const [walletReady] = useState(true);
  const [walletNeedsExtensionSwitch] = useState(false);
  const [walletMissingZera] = useState(false);
  const [protocolInitialized, setProtocolInitialized] = useState(true);
  const [nullifierSetInitialized, setNullifierSetInitialized] = useState(true);
  const [zeraPrice] = useState<number | null>(1.234567);
  const [loading, setLoading] = useState(false);

  const {
    readerStatus,
    readerLoading,
    readerError,
    checkReader,
    readJson,
    writeJson,
    statusHistory,
    isBusy,
    isReading,
    isWriting,
    pushStatus,
  } = useNtag216Json();

  const busy = isBusy;
  const canRead = !busy;
  const canWrite = !busy && Boolean(jsonText.trim());
  const lastImportTsRef = useRef(0);
  const IMPORT_DEBOUNCE_MS = 500;

  const claimImportSlot = (hasFiles: boolean) => {
    if (!hasFiles) return false;
    const now = Date.now();
    if (now - lastImportTsRef.current < IMPORT_DEBOUNCE_MS) {
      return false;
    }
    lastImportTsRef.current = now;
    return true;
  };

  const handleWindowDragOverReact = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsImportDragOver(true);
  };

  const handleWindowDragLeaveReact = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsImportDragOver(false);
  };

  const handleWindowDropReact = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsImportDragOver(false);
    await handleDataTransferImport(event.dataTransfer);
  };


  useEffect(() => {
    if (assetDirectoryInputRef.current) {
      assetDirectoryInputRef.current.setAttribute("webkitdirectory", "true");
      assetDirectoryInputRef.current.setAttribute("directory", "true");
    }

    const preventDefaultDragOver = (e: DragEvent | DragEvent<Element>) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener("dragover", preventDefaultDragOver as unknown as EventListener);
    let unlistenFileDrop: (() => void) | undefined;

    // Subscribe to Tauri file-drop events to get filesystem paths when the File API is blocked.
    listen(TauriEvent.DRAG_DROP, async (event) => {
      const payload = event.payload as unknown;
      const paths = Array.isArray(payload)
        ? (payload as string[])
        : (payload as { paths?: string[] })?.paths ?? [];
      if (paths.length) {
        await handleFilePathImport(paths);
      }
    })
      .then((unlisten) => {
        unlistenFileDrop = unlisten;
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      window.removeEventListener("dragover", preventDefaultDragOver as unknown as EventListener);
      if (unlistenFileDrop) {
        unlistenFileDrop();
      }
    };
  }, []);

  async function handleReadJson() {
    if (!canRead) return;
    const res = await readJson.mutateAsync();
    if (res?.ndef?.kind === "json" && res.ndef.json) {
        const { pretty, error } = prettyJson(res.ndef.json);
        setJsonText(pretty);
      if (error) {
        pushStatus(`Read JSON from tag, but parse failed: ${error}`);
      }
    } else if (res?.ndef) {
      pushStatus(`Tag has NDEF (${res.ndef.kind}), not JSON.`);
    } else {
      pushStatus("No NDEF found on tag.");
    }
  }

  async function getFileContent(file: File): Promise<string> {
    try {
      return await file.text();
    } catch {
      throw new Error("Unable to read file content from drop.");
    }
  }

  async function loadVoucherFiles(files: File[]): Promise<PrivateCashVoucherTile[]> {
    const loaded: PrivateCashVoucherTile[] = [];

    for (const file of files) {
      try {
        const content = await getFileContent(file);
      const parsed = JSON.parse(content);
      loaded.push(buildVoucher(parsed, file.name));
      } catch (err) {
        pushStatus(`Skipping ${file.name}: ${String(err)}`);
      }
    }

    return loaded;
  }

  async function handleFilePathImport(paths: string[]) {
    const jsonPaths = paths.filter((p) => p.toLowerCase().endsWith(".json"));

    if (jsonPaths.length === 0) {
      pushStatus("Dropped items contained no JSON files.");
      return;
    }

    if (!claimImportSlot(jsonPaths.length > 0)) return;
    setVoucherLoading(true);
    try {
      const loaded: PrivateCashVoucherTile[] = [];
      for (const path of jsonPaths) {
        try {
          const content = await invoke<string>("read_file_text", { path });
        const parsed = JSON.parse(content);
        loaded.push(buildVoucher(parsed, path));
        } catch (err) {
          pushStatus(`Skipping ${path}: ${String(err)}`);
        }
      }
      setVoucherTiles((prev) => {
        const existingIds = new Set(prev.map((v) => v.id));
        const incoming = loaded.filter((v) => !existingIds.has(v.id));
        return [...prev, ...incoming];
      });
      setHasScannedVouchers(true);
      pushStatus(
        loaded.length
          ? `✓ Imported ${loaded.length} voucher file(s) from drop.`
          : "No valid voucher JSON files in dropped items."
      );
    } catch (err) {
      pushStatus(`Drop import failed: ${String(err)}`);
    } finally {
      setVoucherLoading(false);
    }
  }

  async function handleDataTransferImport(dataTransfer: DataTransfer | null) {
    if (!dataTransfer) return;
    const files = Array.from(dataTransfer.files ?? []).filter((file) =>
      file.name.toLowerCase().endsWith(".json")
    );

    if (files.length === 0) {
      pushStatus("Drop JSON voucher files to import.");
      return;
    }

    if (!claimImportSlot(files.length > 0)) return;
    setVoucherLoading(true);
    try {
      const loaded = await loadVoucherFiles(files);
      setVoucherTiles((prev) => {
        const existingIds = new Set(prev.map((v) => v.id));
        const incoming = loaded.filter((v) => !existingIds.has(v.id));
        return [...prev, ...incoming];
      });
      setHasScannedVouchers(true);
      pushStatus(
        loaded.length
          ? `✓ Imported ${loaded.length} voucher file(s) from drop.`
          : "Dropped files did not contain valid voucher JSON."
      );
    } catch (err) {
      pushStatus(`Drop import failed: ${String(err)}`);
    } finally {
      setVoucherLoading(false);
    }
  }

  function handleLocateAssets() {
    assetDirectoryInputRef.current?.click();
  }

  function handleImportDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.types.includes("Files")) {
      setIsImportDragOver(true);
    }
  }

  function handleImportDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsImportDragOver(false);
  }

  async function handleImportDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsImportDragOver(false);

    await handleDataTransferImport(event.dataTransfer);
  }

  async function handleAssetDirectorySelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".json"));
    setVoucherLoading(true);
    try {
      if (files.length === 0) {
        setVoucherTiles([]);
        setHasScannedVouchers(true);
        pushStatus(
          "No voucher JSON files found or folder access was blocked. If Windows shows 'organization turned off access', try 'Choose files' or drag-and-drop individual JSONs instead."
        );
        return;
      }

      const loaded = await loadVoucherFiles(files);
      setVoucherTiles(loaded);
      setHasScannedVouchers(true);
      pushStatus(
        loaded.length
          ? `Loaded ${loaded.length} voucher file(s) from the selected folder.`
          : "No voucher JSON files found in the selected folder."
      );
    } catch (err) {
      pushStatus(`Folder scan failed: ${String(err)}`);
    } finally {
      setVoucherLoading(false);
      event.target.value = "";
    }
  }

  async function handleAssetFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".json"));
    setVoucherLoading(true);
    try {
      if (files.length === 0) {
        pushStatus(
          "No files selected or access was blocked. If you saw a Windows access warning, try drag-and-drop or pick files from a different folder."
        );
        return;
      }

      const loaded = await loadVoucherFiles(files);
      setVoucherTiles(loaded);
      setHasScannedVouchers(true);
      pushStatus(`Loaded ${loaded.length} file(s) into vouchers.`);
    } catch (err) {
      pushStatus(`Load failed: ${String(err)}`);
    } finally {
      setVoucherLoading(false);
      event.target.value = "";
    }
  }

  function handleClearAssets() {
    setVoucherTiles([]);
    setHasScannedVouchers(true);
    pushStatus("Cleared voucher list.");
  }

  function initializeProtocol() {
    setLoading(true);
    pushStatus("Initializing protocol…");
    setTimeout(() => {
      setProtocolInitialized(true);
      setLoading(false);
      pushStatus("Protocol initialized.");
    }, 800);
  }

  function initializeNullifierSet() {
    setLoading(true);
    pushStatus("Initializing nullifier set…");
    setTimeout(() => {
      setNullifierSetInitialized(true);
      setLoading(false);
      pushStatus("Nullifier set initialized.");
    }, 800);
  }


  async function handleWriteNote(note: PrivateCashVoucherTile) {
    if (!canWrite) return;

    try {
      pushStatus("Checking tag status…");
      const tagStatus = await readJson.mutateAsync();
      if (tagStatus && !tagStatus.is_blank) {
        const confirmed = window.confirm(
          `Tag already contains data (UID: ${tagStatus.uid || "unknown"}).\n\nOverwrite?`
        );
        if (!confirmed) {
          pushStatus("Write cancelled by user.");
          return;
        }
      }
      const noteJson = JSON.stringify({
        id: note.id,
        voucherId: note.voucherId,
        amount: note.amount,
        recipient: note.recipient,
        secret: note.secret,
        salt: note.salt,
        txSignature: note.txSignature,
        createdAt: note.createdAt,
      });

      // Write to tag
      pushStatus(`Writing note ${note.id} to tag…`);
      await writeJson.mutateAsync({ json: noteJson });
      pushStatus(`✓ Note ${note.id} written successfully!`);
      
      // Clear staged note after successful write
      setStagedNote(null);
    } catch (err) {
      pushStatus(`Write error: ${String(err)}`);
    }
  }


  async function handleCopyTagNote() {
    if (!readJson.data?.ndef?.json) {
      pushStatus("No JSON data on tag to copy.");
      return;
    }

    try {
      const parsed = JSON.parse(readJson.data.ndef.json);
      const formatted = JSON.stringify(parsed, null, 2);
    
      await navigator.clipboard.writeText(formatted);
      pushStatus("✓ Note JSON copied to clipboard!");
    
      try {
        const newVoucher: PrivateCashVoucherTile = {
          ...parsed,
          id: parsed.id || String(Date.now())
        };
        const exists = voucherTiles.some(v => v.id === newVoucher.id);
        if (!exists) {
          setVoucherTiles(prev => [...prev, newVoucher]);
          pushStatus("✓ Note added to local collection.");
        }
      } catch {
 }
    } catch (err) {
      pushStatus(`Copy error: ${String(err)}`);
    }
  }

  async function handleSaveTagToComputer() {
    if (!readJson.data?.ndef?.json) {
      pushStatus("No JSON data on tag to save.");
      return;
    }

    try {
      const parsed = JSON.parse(readJson.data.ndef.json);
      const newVoucher: PrivateCashVoucherTile = {
        ...parsed,
        id: parsed.id || `note_${readJson.data.uid || Date.now()}`
      };
      const exists = voucherTiles.some(v => v.id === newVoucher.id);
      if (!exists) {
        setVoucherTiles(prev => [...prev, newVoucher]);
        pushStatus("✓ Note saved to computer storage!");
      } else {
        pushStatus("✓ Note already exists in collection.");
      }
    } catch (err) {
      pushStatus(`Save error: ${String(err)}`);
    }
  }

  useEffect(() => {
    void checkReader();
  }, [checkReader]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (draggingNoteId) {
        setTimeout(() => {
          setDraggingNoteId(null);
          setIsDragOver(false);
        }, 50);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [draggingNoteId]);

  return (
    <div
      className={`min-h-screen bg-[var(--background)] text-[var(--text-primary)] ${
        isImportDragOver ? "outline outline-2 outline-[var(--brand-light-green)]/70 outline-offset-4" : ""
      }`}
      onDragOver={handleWindowDragOverReact}
      onDragLeave={handleWindowDragLeaveReact}
      onDrop={handleWindowDropReact}
    >
      <TopBar />
      <div className="px-6 py-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <h1 className="font-pp-machina text-[24px] font-normal leading-[32px] tracking-[-0.006em] text-[var(--text-primary)]">
          Offline Cash
        </h1>
        <div className="flex flex-wrap items-center gap-3 md:gap-4">
          {walletNeedsExtensionSwitch ? (
            <div className="flex items-center gap-2 rounded-[12px] border border-yellow-400/50 bg-yellow-500/10 px-4 py-2 text-[11px] text-yellow-100 max-w-[420px]">
              <span className="font-medium text-yellow-50/90">Switch wallets in your extension.</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="h-5 w-5 rounded-full border border-yellow-200/70 text-[11px] font-semibold text-yellow-50/90"
                    aria-label="Why is this required?"
                  >
                    ?
                  </button>
                </TooltipTrigger>
                <TooltipContent className="tooltip-brand max-w-xs text-[11px] leading-relaxed">
                  Select this wallet in your browser extension before attempting NFC actions so transactions do not fail.
                </TooltipContent>
              </Tooltip>
            </div>
          ) : null}
          {walletMissingZera ? (
            <div className="flex items-center gap-2 rounded-[12px] border border-[var(--brand-light-green)]/60 bg-[var(--brand-dark-green)]/40 px-4 py-2 text-[11px] text-[var(--brand-green-50)] max-w-[420px]">
              <span className="font-medium text-[var(--brand-green-50)]/90">Keep some ZERA in this wallet to write.</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="h-5 w-5 rounded-full border border-[var(--brand-light-green)]/70 text-[11px] font-semibold text-[var(--brand-green-50)]/80"
                    aria-label="Why is ZERA required?"
                  >
                    ?
                  </button>
                </TooltipTrigger>
                <TooltipContent className="tooltip-brand max-w-xs text-[11px] leading-relaxed">
                  Offline Cash currently burns a small amount of ZERA when writing to the contract. Keep a small balance so
                  writes can complete.
                </TooltipContent>
              </Tooltip>
            </div>
          ) : null}
        </div>
      </div>

      <div className="px-6">
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[var(--corange-500)] bg-[color-mix(in_srgb,_var(--corange-900)_80%,_transparent)] px-4 py-3 text-xs text-[var(--corange-50)]">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--corange-300)]" />
          <div className="space-y-1">
            <p className="font-medium text-[11px] uppercase tracking-[0.12em] text-[var(--corange-200)]">Early demo - use with caution</p>
            <p className="leading-relaxed">
              Offline Cash is an early, partial implementation intended for demonstration and testing only. Use at your own risk and
              only write small amounts you are fully prepared to lose.
            </p>
          </div>
        </div>
      </div>

      <section 
        className="px-6 py-6 grid gap-6 lg:grid-cols-[2fr_1fr]"
      >
        <div
          className={`space-y-4 rounded-xl transition-colors ${isImportDragOver ? "border border-[var(--brand-light-green)]/50 bg-[var(--brand-light-dark-green)]/30" : ""}`}
          onDragOver={handleImportDragOver}
          onDragLeave={handleImportDragLeave}
          onDrop={handleImportDrop}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-[16px] font-semibold">Private assets</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" disabled={voucherLoading} onClick={handleLocateAssets} className="gap-1.5" expand>
                {voucherLoading ? (
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
                disabled={voucherLoading}
                onClick={() => assetFileInputRef.current?.click()}
                className="gap-1.5"
              >
                {voucherLoading ? (
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
                disabled={voucherLoading || voucherTiles.length === 0}
                onClick={handleClearAssets}
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
                onChange={handleAssetDirectorySelected}
              />
              <input
                ref={assetFileInputRef}
                type="file"
                accept="application/json,.json"
                multiple
                className="hidden"
                onChange={handleAssetFilesSelected}
              />
            </div>
          </div>
          <PrivateAssetsGrid 
            vouchers={voucherTiles} 
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
            onDragStart={(noteId) => {
              setDraggingNoteId(noteId);
            }}
            onDragEnd={() => {
              setTimeout(() => {
                setDraggingNoteId(null);
                setIsDragOver(false);
              }, 100);
            }}
          />
          {hasScannedVouchers && voucherTiles.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              No voucher files were found in the selected folder. Add voucher JSON files and click Choose files.
            </p>
          ) : null}
        </div>
        <Card
          variant="darkSolidGrey" 
          className="border border-[var(--brand-light-green)]/25 min-h-[540px]"
        >
          <CardHeader>
            <CardTitle className="text-[16px] font-normal">Hardware</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 select-none">
            <ReaderStatus
              readerLoading={readerLoading}
              readerError={readerError}
              readerStatus={readerStatus}
              onRefresh={() => void checkReader()}
            />

            {readJson.data && !readerError && (
              <TagStatus tagData={readJson.data} />
            )}

            {!readerError && readJson.data?.ndef?.kind === "json" && readJson.data.ndef.json && (
              <TagContentPreview
                json={readJson.data.ndef.json}
                busy={busy}
                onCopy={() => void handleCopyTagNote()}
                onSave={() => void handleSaveTagToComputer()}
              />
            )}

            <WriteZone
              stagedNote={stagedNote}
              isDragOver={isDragOver}
              isWriting={isWriting}
              busy={busy}
              isReading={isReading}
              dropZoneRef={dropZoneRef}
              onWrite={() => {
                if (stagedNote) {
                  void handleWriteNote(stagedNote);
                }
              }}
              onClear={() => {
                setStagedNote(null);
                setSelectedNoteId(null);
                pushStatus("Cleared staged note.");
              }}
              onMouseEnter={() => {
                if (draggingNoteId) {
                  setIsDragOver(true);
                }
              }}
              onMouseMove={() => {
                if (draggingNoteId && !isDragOver) {
                  setIsDragOver(true);
                }
              }}
              onMouseLeave={() => {
                setIsDragOver(false);
              }}
              onMouseUp={() => {
                if (draggingNoteId) {
                  const note = voucherTiles.find((v) => v.id === draggingNoteId);
                  if (note) {
                    if (readJson.data && !readJson.data.is_blank && readJson.data.ndef) {
                      setPendingNote(note);
                      setShowOverwriteModal(true);
                    } else {
                      setStagedNote(note);
                      setSelectedNoteId(note.id);
                      pushStatus(`✓ Note ready. Click "Write to Tag" to write to the physical tag.`);
                    }
                  }
                  setDraggingNoteId(null);
                }
                setIsDragOver(false);
              }}
            />

            <div className="grid gap-2">
              <Button 
                variant="greenTint" 
                onClick={handleReadJson} 
                disabled={!canRead}
                className="w-full gap-1.5 text-[var(--brand-green-50)] text-[12px] h-[40px] rounded-[12px]"
              >
                {isReading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Reading...
                  </>
                ) : (
                  <>
                    <ScanText className="size-6" />
                    Read
                  </>
                )}
              </Button>
            </div>

            {isBusy && (
              <div className="rounded-lg border border-[var(--brand-light-green)]/35 bg-[var(--brand-light-dark-green)] px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="size-4 animate-spin text-[var(--brand-green-50)]" />
                  <span className="text-[var(--text-primary)]">
                    {isReading ? "Reading tag..." : "Writing tag..."}
                  </span>
                </div>
              </div>
            )}

            {statusHistory.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Recent operations</div>
                <div className="rounded-lg border border-[var(--brand-light-green)]/15 bg-[var(--brand-light-dark-green)]/30 px-3 py-2 space-y-1 max-h-32 overflow-y-auto">
                  {statusHistory.slice(-5).reverse().map((entry, index) => (
                    <div 
                      key={`${entry}-${index}`} 
                      className="text-xs text-[var(--text-tertiary)] whitespace-pre-line"
                    >
                      {entry}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="px-6 pb-4 space-y-3">
        {!walletReady ? (
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <AlertCircle className="size-4 text-[var(--corange-400)]" />
            <span>Connect a Solana wallet with Privy to use Offline Cash.</span>
          </div>
        ) : null}
        {walletReady && protocolInitialized === false ? (
          <div className="flex items-center justify-between rounded-md border border-[var(--brand-light-green)]/40 bg-[var(--brand-light-dark-green)]/30 px-4 py-3 text-xs text-[var(--text-primary)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-[var(--brand-green)]" />
              <span>Protocol is not initialized for this wallet yet.</span>
            </div>
            <Button size="sm" variant="greenTint" disabled={loading} onClick={initializeProtocol} expand>
              {loading ? "Initializing..." : "Initialize protocol"}
            </Button>
              </div>
        ) : null}
        {walletReady && protocolInitialized && nullifierSetInitialized === false ? (
          <div className="flex items-center justify-between rounded-md border border-[var(--brand-light-green)]/40 bg-[var(--brand-light-dark-green)]/20 px-4 py-3 text-xs text-[var(--text-primary)]">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-4 text-[var(--brand-green)]" />
              <span>Nullifier set must be initialized once before withdrawals.</span>
            </div>
            <Button size="sm" variant="outline" disabled={loading} onClick={initializeNullifierSet} expand>
              {loading ? "Initializing..." : "Initialize nullifier set"}
              </Button>
            </div>
        ) : null}
        {zeraPrice ? (
          <div className="text-xs text-[var(--text-tertiary)]">
            Current ZERA price: <span className="text-[var(--brand-green-50)]">${zeraPrice.toFixed(6)}</span>
        </div>
      ) : null}
      </section>

      <OverwriteConfirmModal
        open={showOverwriteModal}
        onOpenChange={setShowOverwriteModal}
        currentTagJson={readJson.data?.ndef?.kind === "json" ? readJson.data.ndef.json : null}
        pendingNote={pendingNote}
        onCancel={() => {
          setShowOverwriteModal(false);
          setPendingNote(null);
          pushStatus("Cancelled overwrite.");
        }}
        onConfirm={() => {
          if (pendingNote) {
            setStagedNote(pendingNote);
            setSelectedNoteId(pendingNote.id);
            pushStatus(`✓ Note ready. Click "Write to Tag" to overwrite the tag content.`);
          }
          setShowOverwriteModal(false);
          setPendingNote(null);
        }}
      />
    </div>
  );
}

export default App;
