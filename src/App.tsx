import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, FolderSearch, Loader2, ScanText, Upload } from "lucide-react";

import PrivateAssetsGrid, { createMockPrivateCashVouchers, type PrivateCashVoucherTile } from "@/components/PrivateAssetsGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNtag216Json } from "@/hooks/useNtag216";

const JSON_MIME = "application/json";

function prettyJson(raw: string): { pretty: string; error: string | null } {
  try {
    return { pretty: JSON.stringify(JSON.parse(raw), null, 2), error: null };
  } catch (e) {
    return { pretty: raw, error: String(e) };
  }
}

function App() {
  const [jsonText, setJsonText] = useState('{"hello":"ntag216"}');
  const [showStatusHistory, setShowStatusHistory] = useState(false);

  const [voucherTiles, setVoucherTiles] = useState<PrivateCashVoucherTile[]>(() => createMockPrivateCashVouchers());
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [hasScannedVouchers, setHasScannedVouchers] = useState(false);
  const assetFileInputRef = useRef<HTMLInputElement>(null);

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
    checkReader,
    readJson,
    writeJson,
    status,
    statusHistory,
    statusIsError,
    isBusy,
    isReading,
    pushStatus,
  } = useNtag216Json();

  const jsonSizing = useMemo(() => {
    try {
      const obj = JSON.parse(jsonText);
      const minified = JSON.stringify(obj);
      const payloadBytes = new TextEncoder().encode(minified).length;
      const typeLen = JSON_MIME.length;
      const payloadLenFieldBytes = payloadBytes <= 0xff ? 1 : 4;
      const ndefLen = 1 + 1 + payloadLenFieldBytes + typeLen + payloadBytes;
      const tlvHeaderBytes = ndefLen <= 0xfe ? 2 : 4;
      const tlvLen = tlvHeaderBytes + ndefLen + 1;
      const paddedLen = Math.ceil(tlvLen / 4) * 4;
      const pages = paddedLen / 4;
      const maxBytes = 872;
      const fits = paddedLen <= maxBytes;
      return { ok: true as const, minified, payloadBytes, ndefLen, tlvLen, paddedLen, pages, maxBytes, fits };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }, [jsonText]);

  const busy = isBusy;
  const canRead = !busy;
  const canWrite = !busy && Boolean(jsonText.trim());
  const writeDisabledReason = !jsonText.trim() ? "Add a JSON payload to write" : busy ? "Busy" : undefined;

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

  async function handleWriteJson() {
    if (!canWrite) return;
    await writeJson.mutateAsync({ json: jsonText });
  }

  function handleLocateAssets() {
    setVoucherLoading(true);
    pushStatus("Scanning for voucher files…");
    setTimeout(() => {
      setVoucherTiles(createMockPrivateCashVouchers(Date.now()));
      setVoucherLoading(false);
      setHasScannedVouchers(true);
      pushStatus("Loaded vouchers from mock folder.");
    }, 600);
  }

  function handleAssetFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    setVoucherLoading(true);
    const files = Array.from(event.target.files ?? []);
    setTimeout(() => {
      setVoucherTiles(createMockPrivateCashVouchers(Date.now()));
      setVoucherLoading(false);
      setHasScannedVouchers(true);
      pushStatus(files.length ? `Loaded ${files.length} file(s) into vouchers.` : "No files selected.");
    }, 400);
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

  useEffect(() => {
    void checkReader();
  }, [checkReader]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
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
          <Button
            variant="greenTint"
            onClick={handleReadJson}
            className="gap-1.5 text-[var(--brand-green-50)] text-[12px] px-1 py-0.5 h-[40px] rounded-[12px]"
            disabled={!canRead}
            title={busy ? "Busy" : undefined}
          >
            {busy && isReading ? <Loader2 className="size-4 animate-spin" /> : <ScanText className="size-6" />}
            {busy && isReading ? "Working…" : "Read"}
          </Button>
          <Button
            variant="greenTint"
            onClick={handleWriteJson}
            className="gap-1.5 text-[var(--brand-green-50)] text-[12px] px-1 py-0.5 h-[40px] rounded-[12px]"
            disabled={!canWrite}
            title={writeDisabledReason}
          >
            {busy && !isReading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-6" />}
            {busy && !isReading ? "Working…" : "Write"}
          </Button>
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

      <section className="px-6 py-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
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
                ref={assetFileInputRef}
                type="file"
                accept="application/json,.json"
                multiple
                className="hidden"
                onChange={handleAssetFilesSelected}
              />
            </div>
          </div>
          <PrivateAssetsGrid vouchers={voucherTiles} />
          {hasScannedVouchers && voucherTiles.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              No voucher files were found in the selected folder. Add voucher JSON files and click Choose files.
            </p>
          ) : null}
        </div>
        <Card variant="darkSolidGrey" className="border border-[var(--brand-light-green)]/25 min-h-[540px]">
          <CardHeader>
            <CardTitle className="text-[16px] font-normal">Details panel</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--text-tertiary)]">
            Placeholder for upcoming vertical panel content.
          </CardContent>
        </Card>
      </section>

      <section className="px-6 pb-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card variant="darkSolidGrey" className="border border-[var(--brand-light-green)]/25">
          <CardHeader>
            <CardTitle className="text-[16px] font-normal">NFC JSON payload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="json">JSON payload</Label>
              <Textarea
                id="json"
                value={jsonText}
                onChange={(e) => setJsonText(e.currentTarget.value)}
                rows={10}
                className="rounded-xl border-[var(--brand-light-green)]/35 bg-[var(--wallet-card-grey)] font-mono text-sm leading-6 text-[var(--text-primary)] shadow-[0_0_0_1px_rgba(82,201,125,0.08)]"
              />
            </div>
            {jsonSizing.ok ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--brand-light-green)]/25 bg-[var(--brand-light-dark-green)] px-4 py-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Minified</div>
                  <div className="font-mono text-sm text-[var(--text-primary)]">{jsonSizing.payloadBytes} bytes</div>
                </div>
                <div className="rounded-lg border border-[var(--brand-light-green)]/25 bg-[var(--brand-light-dark-green)] px-4 py-3">
                  <div className="text-xs text-[var(--text-tertiary)]">On-tag (TLV+pads)</div>
                  <div className="font-mono text-sm text-[var(--text-primary)]">
                    {jsonSizing.paddedLen}/{jsonSizing.maxBytes} bytes
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--brand-light-green)]/25 bg-[var(--brand-light-dark-green)] px-4 py-3">
                  <div className="text-xs text-[var(--text-tertiary)]">Pages used</div>
                  <div className="font-mono text-sm text-[var(--text-primary)]">{jsonSizing.pages}</div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                JSON parse error: {jsonSizing.error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="darkSolidGrey" className="border border-[var(--brand-light-green)]/25">
          <CardHeader>
            <CardTitle className="text-[16px] font-normal">Reader status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-[var(--brand-light-green)]/25 bg-[var(--brand-light-dark-green)] px-3 py-2 text-sm text-[var(--text-primary)]">
              {readerLoading ? "Checking NFC reader…" : readerStatus || "Waiting for device scan…"}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void checkReader()} disabled={busy}>
                Check reader
              </Button>
            </div>
            {status ? (
              <div
                className={`rounded-md border px-3 py-3 text-xs ${
                  statusIsError
                    ? "border-[var(--error-soft)]/40 text-[var(--error-soft)]"
                    : "border-white/10 text-[var(--text-tertiary)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="whitespace-pre-line text-left">{status}</p>
                  {statusHistory.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto px-2 text-[11px] text-[var(--brand-green-50)]"
                      onClick={() => setShowStatusHistory((prev) => !prev)}
                    >
                      {showStatusHistory ? "Hide logs" : "Show logs"}
                    </Button>
                  ) : null}
                </div>
                {showStatusHistory ? (
                  <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded bg-black/20 px-3 py-2 text-[11px] text-[var(--text-tertiary)]/90">
                    {statusHistory.map((entry, index) => (
                      <p key={`${entry}-${index}`} className="whitespace-pre-line">
                        {entry}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
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
    </div>
  );
}

export default App;
