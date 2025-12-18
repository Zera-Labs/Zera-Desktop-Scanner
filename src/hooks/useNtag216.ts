import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

// TODO: Parse with zod? Replace with enum?
export type NdefKind = "text" | "uri" | "json" | "unknown";

export type NdefSummary = {
  kind: NdefKind;
  text?: string | null;
  uri?: string | null;
  language?: string | null;
  mime_type?: string | null;
  json?: string | null;
  message_hex?: string | null;
};

export type Ntag216ReadResult = {
  uid?: string | null;
  is_blank: boolean;
  ndef?: NdefSummary | null;
};

export type WriteResult = {
  uid?: string | null;
  ok: boolean;
  skipped: boolean;
  error?: string | null;
};

type WriteJsonInput = {
  json: string;
};

export function useNtag216Json() {
  const [status, setStatus] = useState("");
  const [statusHistory, setStatusHistory] = useState<string[]>([]);
  const [lastRead, setLastRead] = useState<Ntag216ReadResult | null>(null);

  const pushStatus = useCallback((message: string) => {
    setStatus(message);
    if (!message) return;
    setStatusHistory((prev) => [...prev.slice(-9), message]);
  }, []);

  const readerQuery = useQuery<string>({
    queryKey: ["ntag216", "reader-status"],
    queryFn: async () => invoke<string>("check_nfc_reader"),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const readMutation = useMutation<Ntag216ReadResult, unknown, void>({
    mutationKey: ["ntag216", "read-json"],
    mutationFn: async () => invoke<Ntag216ReadResult>("read_ntag216_json_desktop"),
    onMutate: () => pushStatus("Reading… place tag on NFC reader"),
    onSuccess: (res: Ntag216ReadResult) => {
      setLastRead(res);
      pushStatus("Read JSON from tag.");
    },
    onError: (err: unknown) => {
      pushStatus(`Error: ${String(err)}`);
    },
  });

  const writeMutation = useMutation<WriteResult, unknown, WriteJsonInput>({
    mutationKey: ["ntag216", "write-json"],
    mutationFn: async ({ json }: WriteJsonInput) =>
      invoke<WriteResult>("write_ntag216_json_desktop", {
        json,
        options: { existing_tag_behavior: "overwrite" },
      }),
    onMutate: () => pushStatus("Writing… place tag on NFC reader"),
    onSuccess: () => {
      pushStatus("Wrote JSON to tag.");
    },
    onError: (err: unknown) => {
      pushStatus(`Error: ${String(err)}`);
    },
  });

  const statusIsError = useMemo(() => status.toLowerCase().includes("error"), [status]);
  const isReading = readMutation.isPending;
  const isWriting = writeMutation.isPending;
  const isBusy = isReading || isWriting;

  const checkReader = useCallback(async () => {
    const res = await readerQuery.refetch();
    return res.data;
  }, [readerQuery]);

  return {
    readerStatus: readerQuery.data,
    readerLoading: readerQuery.isLoading,
    checkReader,
    readJson: readMutation,
    writeJson: writeMutation,
    lastRead,
    status,
    statusHistory,
    statusIsError,
    isReading,
    isWriting,
    isBusy,
    pushStatus,
  };
}

