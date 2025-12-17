import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type NdefKind = "text" | "uri" | "json" | "unknown";

type NdefSummary = {
  kind: NdefKind;
  text?: string | null;
  uri?: string | null;
  language?: string | null;
  mime_type?: string | null;
  json?: string | null;
  message_hex: string;
};

type Ntag216ReadResult = {
  uid?: string | null;
  is_blank: boolean;
  ndef?: NdefSummary | null;
};

type WriteResult = {
  uid?: string | null;
  ok: boolean;
  skipped: boolean;
  error?: string | null;
};

const JSON_MIME = "application/json";

function prettyJson(raw: string): { pretty: string; error: string | null } {
  try {
    return { pretty: JSON.stringify(JSON.parse(raw), null, 2), error: null };
  } catch (e) {
    return { pretty: raw, error: String(e) };
  }
}

function App() {
  const [deviceStatus, setDeviceStatus] = useState<string>("");
  const [jsonText, setJsonText] = useState<string>('{"hello":"ntag216"}');
  const [lastRead, setLastRead] = useState<Ntag216ReadResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);

  const [overwritePrompt, setOverwritePrompt] = useState<{
    uid: string;
    kind: string;
  } | null>(null);
  const overwriteResolveRef = useRef<((ok: boolean) => void) | null>(null);

  function requestOverwriteConfirm(uid: string, kind: string): Promise<boolean> {
    return new Promise((resolve) => {
      overwriteResolveRef.current = resolve;
      setOverwritePrompt({ uid, kind });
    });
  }

  function resolveOverwriteConfirm(ok: boolean) {
    overwriteResolveRef.current?.(ok);
    overwriteResolveRef.current = null;
    setOverwritePrompt(null);
  }

  const lastReadJson = useMemo(() => {
    if (lastRead?.ndef?.kind !== "json") return null;
    return lastRead.ndef.json ?? null;
  }, [lastRead]);

  const lastReadJsonFmt = useMemo(() => {
    if (!lastReadJson) return null;
    return prettyJson(lastReadJson);
  }, [lastReadJson]);

  const jsonSizing = useMemo(() => {
    try {
      const obj = JSON.parse(jsonText);
      const minified = JSON.stringify(obj);
      const payloadBytes = new TextEncoder().encode(minified).length;
      const typeLen = JSON_MIME.length;
      const payloadLenFieldBytes = payloadBytes <= 0xff ? 1 : 4;
      const ndefLen = 1 + 1 + payloadLenFieldBytes + typeLen + payloadBytes;
      const tlvHeaderBytes = ndefLen <= 0xfe ? 2 : 4; // 0x03 + len OR 0x03 0xFF hi lo
      const tlvLen = tlvHeaderBytes + ndefLen + 1; // + 0xFE terminator
      const paddedLen = Math.ceil(tlvLen / 4) * 4;
      const pages = paddedLen / 4;
      // NTAG216 CC reports 0x6D * 8 = 872 bytes usable NDEF memory.
      const maxBytes = 872;
      const fits = paddedLen <= maxBytes;
      return {
        ok: true as const,
        minified,
        payloadBytes,
        ndefLen,
        tlvLen,
        paddedLen,
        pages,
        maxBytes,
        fits,
      };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }, [jsonText]);

  async function checkNfcReader() {
    setDeviceStatus("Checking NFC reader…");
    try {
      const status = await invoke<string>("check_nfc_reader");
      setDeviceStatus(status);
    } catch (e) {
      setDeviceStatus(`Reader error: ${String(e)}`);
    }
  }

  useEffect(() => {
    checkNfcReader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function readJsonTag() {
    if (busy) return;
    setBusy(true);
    setStatus("Reading… (place tag on NFC reader)");
    setLastRead(null);
    try {
      const res = await invoke<Ntag216ReadResult>("read_ntag216_desktop");
      setLastRead(res);
      if (res.ndef?.kind === "json" && res.ndef.json) {
        const { pretty, error } = prettyJson(res.ndef.json);
        setJsonText(pretty);
        setStatus(error ? `Read JSON from tag, but it failed to parse in UI: ${error}` : "Read JSON from tag.");
      } else if (res.ndef) {
        setStatus(`Tag has NDEF (${res.ndef.kind}), not JSON.`);
      } else {
        setStatus("No NDEF found on tag.");
      }
    } catch (e) {
      const errorMsg = String(e);
      setStatus(`Error: ${errorMsg}`);
      console.error("Read error:", e);
    } finally {
      setBusy(false);
    }
  }

  async function writeJsonTag() {
    if (busy) return;
    setBusy(true);
    setStatus("Checking tag… (place tag on NFC reader)");
    try {
      const before = await invoke<Ntag216ReadResult>("read_ntag216_desktop");
      setLastRead(before);

      const willOverwrite = !before.is_blank;
      if (willOverwrite) {
        const uid = before.uid ?? "(unknown uid)";
        const kind = before.ndef?.kind ?? "unknown";
        setStatus("Tag is not blank — confirm overwrite…");
        const ok = await requestOverwriteConfirm(uid, kind);
        if (!ok) {
          setStatus("Cancelled (did not overwrite existing tag).");
          return;
        }
      }

      setStatus(willOverwrite ? "Overwriting… (place tag on NFC reader)" : "Writing… (place tag on NFC reader)");
      const res = await invoke<WriteResult>("write_ntag216_json_desktop", {
        json: jsonText,
        options: { existing_tag_behavior: "overwrite" },
      });
      setStatus(
        res.skipped
          ? "Skipped (already written)."
          : willOverwrite
          ? "Overwrote tag with JSON."
          : "Wrote JSON to blank tag."
      );
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute -left-40 top-0 -z-10 h-80 w-80 rounded-full bg-[var(--brand-green-400)]/15 blur-3xl" />
      <div className="pointer-events-none absolute right-[-120px] top-24 -z-10 h-96 w-96 rounded-full bg-[var(--vb-500)]/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-64 bg-gradient-to-t from-[var(--brand-dark-green)]/60 to-transparent" />

      <main className="relative mx-auto max-w-6xl space-y-6 px-4 py-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--text-tertiary)]">Desktop NFC · NTAG216</p>
            <h1 className="font-pp-machina text-3xl leading-tight text-[var(--text-primary)]">NTAG216 JSON Studio</h1>
            <p className="text-sm text-[var(--text-tertiary)]">
              Modern desk UI to auto-detect your NFC reader, validate payload sizing, and read/write{" "}
              <span className="font-mono">{JSON_MIME}</span> records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={readJsonTag} disabled={busy}>
              {busy ? "Working…" : "Quick read"}
            </Button>
          </div>
        </div>

        <Card
          variant="outline"
          tone="green"
          className="border border-[var(--brand-light-green)]/60 bg-[var(--brand-dark-green)]/50 backdrop-blur"
        >
          <CardHeader className="gap-3">
            <CardTitle className="text-lg">NFC Reader</CardTitle>
            <CardDescription>
              Auto-detects PC/SC-compatible NFC readers (ACR122U, PN532, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={checkNfcReader} disabled={busy}>
                Check Reader
              </Button>
            </div>
            <div className="rounded-lg border border-[var(--brand-light-green)]/25 bg-[var(--brand-light-dark-green)] px-3 py-2 text-sm text-[var(--text-primary)]">
              {deviceStatus || "Waiting for device scan…"}
            </div>
          </CardContent>
        </Card>

        <Card variant="darkSolidGrey" className="border border-[var(--brand-light-green)]/25">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <CardTitle className="font-pp-machina text-xl">JSON Tag</CardTitle>
              <CardDescription>
                Writes as an NDEF MIME record (<span className="font-mono">{JSON_MIME}</span>). Payload is validated and
                minified in Rust.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={readJsonTag} disabled={busy}>
                {busy ? "Working…" : "Read JSON"}
              </Button>
              <Button onClick={writeJsonTag} disabled={busy || !jsonText.trim()}>
                {busy ? "Working…" : "Write JSON"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="json">JSON payload</Label>
                <Textarea
                  id="json"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.currentTarget.value)}
                  rows={14}
                  className="rounded-xl border-[var(--brand-light-green)]/35 bg-[var(--brand-dark-green)]/60 font-mono text-sm leading-6 text-[var(--text-primary)] shadow-[0_0_0_1px_rgba(82,201,125,0.08)]"
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
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  status
                    ? "border-[var(--brand-light-green)]/35 bg-[var(--brand-light-dark-green)] text-[var(--text-primary)]"
                    : "border-transparent bg-transparent text-[var(--text-tertiary)]"
                }`}
              >
                {status || "Ready to read or write."}
              </div>
            </div>

            <div className="space-y-4">
              <Card variant="subtleGreen" className="border border-[var(--brand-light-green)]/25">
                <CardContent className="space-y-2">
                  <div className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Capacity check</div>
                  {jsonSizing.ok ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>Fits tag</span>
                        <span className={jsonSizing.fits ? "text-[var(--text-brand-green)]" : "text-destructive"}>
                          {jsonSizing.fits ? "Yes" : "Too large"}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)]">
                        TLV length {jsonSizing.tlvLen} bytes · NDEF {jsonSizing.ndefLen} bytes
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-destructive">Invalid JSON</div>
                  )}
                </CardContent>
              </Card>

              {lastRead ? (
                <Card variant="dark" className="border border-[var(--brand-light-green)]/20">
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <div className="space-y-1">
                        <div className="text-xs text-[var(--text-tertiary)]">UID</div>
                        <div className="font-mono text-[13px]">{lastRead.uid ?? "(unknown)"}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-[var(--text-tertiary)]">Blank</div>
                        <div>{String(lastRead.is_blank)}</div>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <div className="text-xs text-[var(--text-tertiary)]">NDEF</div>
                        <div className="font-mono text-[13px]">
                          {lastRead.ndef
                            ? lastRead.ndef.kind === "json"
                              ? `json (${(lastRead.ndef.json ?? "").length} chars)`
                              : `${lastRead.ndef.kind} ${lastRead.ndef.text ?? lastRead.ndef.uri ?? ""}`
                            : "(none)"}
                        </div>
                      </div>
                    </div>
                    {lastRead.ndef?.kind === "json" && lastRead.ndef.json ? (
                      <div className="space-y-2">
                        <div className="text-xs text-[var(--text-tertiary)]">Decoded JSON (from tag)</div>
                        <pre className="scrollbar-thin-brand max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--brand-light-green)]/20 bg-black/40 p-3 font-mono text-[12px]">
                          {lastReadJsonFmt?.pretty ?? lastRead.ndef.json}
                        </pre>
                        {lastReadJsonFmt?.error ? (
                          <div className="text-xs text-destructive">Parse error: {lastReadJsonFmt.error}</div>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : (
                <Card variant="ghost" className="border border-dashed border-[var(--brand-light-green)]/30">
                  <CardContent className="text-sm text-[var(--text-tertiary)]">
                    No tag scanned yet. Tap a tag to preview its NDEF summary here.
                  </CardContent>
                </Card>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {overwritePrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close overwrite dialog"
            onClick={() => resolveOverwriteConfirm(false)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-[var(--brand-light-green)]/30 bg-[var(--background)] p-5 shadow-lg">
            <div className="space-y-2">
              <div className="text-lg font-semibold text-[var(--text-primary)]">Overwrite tag?</div>
              <div className="text-sm text-[var(--text-tertiary)]">
                This tag (<span className="font-mono text-[var(--text-primary)]">{overwritePrompt.uid}</span>) already
                contains <span className="font-mono text-[var(--text-primary)]">{overwritePrompt.kind}</span> data.
                Overwriting will replace it.
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => resolveOverwriteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => resolveOverwriteConfirm(true)}>
                Overwrite
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
