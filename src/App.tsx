import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

type SerialPortInfo = {
  port_name: string;
  kind: string;
  vid?: number | null;
  pid?: number | null;
  serial_number?: string | null;
  manufacturer?: string | null;
  product?: string | null;
};

const LS_PORT_KEY = "desk_tauri:proxmark_port";
const JSON_MIME = "application/json";

function prettyJson(raw: string): { pretty: string; error: string | null } {
  try {
    return { pretty: JSON.stringify(JSON.parse(raw), null, 2), error: null };
  } catch (e) {
    return { pretty: raw, error: String(e) };
  }
}

function App() {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [port, setPort] = useState<string>(() => localStorage.getItem(LS_PORT_KEY) ?? "");
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

  const portLabel = useMemo(() => {
    if (!port) return "Auto-detect";
    const found = ports.find((p) => p.port_name === port);
    if (!found) return port;
    return found.product || found.manufacturer
      ? `${found.product ?? found.manufacturer} (${found.port_name})`
      : found.port_name;
  }, [port, ports]);

  async function refreshPorts() {
    setDeviceStatus("Scanning serial ports…");
    try {
      const list = await invoke<SerialPortInfo[]>("list_serial_ports");
      setPorts(list);

      // Respect saved selection if it still exists.
      if (port && list.some((p) => p.port_name === port)) {
        setDeviceStatus(list.length ? `Found ${list.length} ports.` : "No serial ports found.");
        return;
      }

      // If only one port exists, pick it.
      if (list.length === 1) {
        setPort(list[0].port_name);
        setDeviceStatus("Auto-selected the only available port.");
        return;
      }

      // Ask backend to guess Proxmark port from USB metadata / naming patterns.
      const guess = await invoke<string | null>("auto_detect_proxmark_port");
      if (guess) {
        setPort(guess);
        setDeviceStatus("Auto-detected a likely Proxmark port.");
      } else {
        setPort("");
        setDeviceStatus(list.length ? "Couldn’t auto-detect; pick the Proxmark port from the list." : "No serial ports found.");
      }
    } catch (e) {
      setDeviceStatus(String(e));
    }
  }

  useEffect(() => {
    refreshPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_PORT_KEY, port);
  }, [port]);

  async function readJsonTag() {
    if (busy) return;
    setBusy(true);
    setStatus("Reading… (keep tag on the Proxmark)");
    setLastRead(null);
    try {
      const res = await invoke<Ntag216ReadResult>("read_ntag216", { port });
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
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function writeJsonTag() {
    if (busy) return;
    setBusy(true);
    setStatus("Checking tag… (keep tag on the Proxmark)");
    try {
      const before = await invoke<Ntag216ReadResult>("read_ntag216", { port });
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

      setStatus(willOverwrite ? "Overwriting… (keep tag on the Proxmark)" : "Writing… (keep tag on the Proxmark)");
      const res = await invoke<WriteResult>("write_ntag216_json", {
        port,
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
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">NTAG216 JSON</h1>
          <p className="text-sm text-muted-foreground">
            Auto-detect Proxmark port, then read/write an
            <span className="font-mono"> application/json</span> NDEF record.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Device</CardTitle>
            <CardDescription>
              If you have only one serial device plugged in, we’ll select it automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="portSelect">Proxmark port</Label>
                <Select id="portSelect" value={port} onChange={(e) => setPort(e.currentTarget.value)}>
                  <option value="">Auto-detect</option>
                  {ports.map((p) => {
                    const label =
                      p.product || p.manufacturer
                        ? `${p.product ?? p.manufacturer} — ${p.port_name}`
                        : p.port_name;
                    return (
                      <option key={p.port_name} value={p.port_name}>
                        {label}
                      </option>
                    );
                  })}
                </Select>
                <div className="text-xs text-muted-foreground">
                  Selected: <span className="font-mono">{portLabel}</span>
                </div>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" onClick={refreshPorts}>
                  Refresh
                </Button>
              </div>
            </div>

            {deviceStatus ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{deviceStatus}</div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>JSON Tag</CardTitle>
            <CardDescription>
              Writes as an NDEF MIME record (<span className="font-mono">{JSON_MIME}</span>). JSON is validated and minified in Rust.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={readJsonTag} disabled={busy}>
                {busy ? "Working…" : "Read JSON"}
              </Button>
              <Button onClick={writeJsonTag} disabled={busy || !jsonText.trim()}>
                {busy ? "Working…" : "Write JSON"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label htmlFor="json">JSON</Label>
              <Textarea
                id="json"
                value={jsonText}
                onChange={(e) => setJsonText(e.currentTarget.value)}
                rows={12}
              />
              <div className="text-xs text-muted-foreground">
                {jsonSizing.ok ? (
                  <div className="space-y-1">
                    <div>
                      Minified JSON: <span className="font-mono">{jsonSizing.payloadBytes}</span> bytes
                    </div>
                    <div>
                      On-tag (TLV+pads):{" "}
                      <span className="font-mono">
                        {jsonSizing.paddedLen}/{jsonSizing.maxBytes}
                      </span>{" "}
                      bytes ({jsonSizing.pages} pages) —{" "}
                      <span className={jsonSizing.fits ? "text-foreground" : "text-destructive"}>
                        {jsonSizing.fits ? "fits" : "too large"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-destructive">JSON parse error: {jsonSizing.error}</span>
                )}
              </div>
            </div>

            {status ? (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{status}</div>
            ) : null}

            {lastRead ? (
              <div className="grid gap-2 rounded-xl border bg-card px-4 py-3 text-sm md:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">UID</div>
                  <div className="font-mono text-[13px]">{lastRead.uid ?? "(unknown)"}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Blank</div>
                  <div>{String(lastRead.is_blank)}</div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <div className="text-xs text-muted-foreground">NDEF</div>
                  <div className="font-mono text-[13px]">
                    {lastRead.ndef
                      ? lastRead.ndef.kind === "json"
                        ? `json (${(lastRead.ndef.json ?? "").length} chars)`
                        : `${lastRead.ndef.kind} ${lastRead.ndef.text ?? lastRead.ndef.uri ?? ""}`
                      : "(none)"}
                  </div>
                </div>
                {lastRead.ndef?.kind === "json" && lastRead.ndef.json ? (
                  <div className="space-y-1 md:col-span-2">
                    <div className="text-xs text-muted-foreground">Decoded JSON (from tag)</div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/30 p-3 font-mono text-[12px]">
                      {lastReadJsonFmt?.pretty ?? lastRead.ndef.json}
                    </pre>
                    {lastReadJsonFmt?.error ? (
                      <div className="text-xs text-destructive">Parse error: {lastReadJsonFmt.error}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
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
          <div className="relative w-full max-w-md rounded-xl border bg-background p-5 shadow-lg">
            <div className="space-y-2">
              <div className="text-lg font-semibold">Overwrite tag?</div>
              <div className="text-sm text-muted-foreground">
                This tag (<span className="font-mono">{overwritePrompt.uid}</span>) already contains{" "}
                <span className="font-mono">{overwritePrompt.kind}</span> data. Overwriting will replace it.
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
