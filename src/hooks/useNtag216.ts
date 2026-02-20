import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

const DEMO_MODE = false;

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
  const queryClient = useQueryClient();
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
    queryFn: () => {
      if (DEMO_MODE) {
        return Promise.resolve("ACR122U NFC Reader (Demo Mode)");
      }
      return invoke<string>("check_nfc_reader");
    },
    // Don't auto-refetch too aggressively to avoid flickering if pcscd is flaky
    staleTime: 5000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  type SaveNoteResult = {
    path: string;
    already_existed: boolean;
  };

  const saveToDownloadsMutation = useMutation({
    mutationKey: ["ntag216", "save-to-downloads"],
    mutationFn: async ({ noteId, content }: { noteId: string; content: object }) => {
      return invoke<SaveNoteResult>("save_note_to_downloads", {
        noteId,
        content: JSON.stringify(content, null, 2),
      });
    },
    onSuccess: (result) => {
      const fileName = result.path.split(/[/\\]/).pop();
      if (result.already_existed) {
        pushStatus(`✓ Note already in Downloads: ${fileName}`);
      } else {
        pushStatus(`✓ Saved to Downloads: ${fileName}`);
      }
    },
    onError: (err) => {
      pushStatus(`Warning: Could not save to Downloads: ${String(err)}`);
    },
  });

  const readMutation = useMutation<Ntag216ReadResult, unknown, { overrideContent?: string; autoSave?: boolean } | void>({
    mutationKey: ["ntag216", "read-json"],
    mutationFn: async (options) => {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 800));
        const cachedContent = queryClient.getQueryData<string | null>(["ntag216", "demo-tag-content"]);
        const demoNote = {
          id: "demo-1",
          amount: "21111111119999",
          asset: "0",
          secret: "0xcb61b3870d94bef96de22653a3fa20b9e8b386b9",
          blinding: "0x1daf0ee216260d49503ea68acb2b45949db4f749",
          memo: ["0", "0", "0", "0"],
          commitment: "0x74cccbb7db5be82b7c3d2d36e2cddb25649bd217",
          nullifier: "0x9a61b3870d94bef96de22653a3fa20b9e8b386b9",
          leafIndex: 0,
          spent: false,
          createdAt: new Date().toISOString(),
        };
        const content = options?.overrideContent || cachedContent || JSON.stringify(demoNote);
        return {
          uid: "04:AB:CD:EF:12:34:56",
          is_blank: false,
          ndef: { kind: "json" as const, json: content }
        };
      }
      return invoke<Ntag216ReadResult>("read_ntag216_desktop");
    },
    onMutate: () => pushStatus("Reading… place tag on NFC reader"),
    onSuccess: async (res: Ntag216ReadResult, options) => {
      setLastRead(res);
      
      if (res?.ndef?.kind === "json" && res.ndef.json && options?.autoSave !== false) {
        try {
          const parsed = JSON.parse(res.ndef.json);
          const noteId = parsed.commitment || parsed.nullifier || parsed.id || res.uid || "unknown";
          await saveToDownloadsMutation.mutateAsync({ noteId, content: parsed });
          return;
        } catch {
        }
      }
      
      pushStatus("✓ Read JSON from tag.");
    },
    onError: (err: unknown) => {
      pushStatus(`Error: ${String(err)}`);
    },
  });

  const readRawMutation = useMutation<string[], unknown, void>({
    mutationKey: ["ntag216", "read-raw"],
    mutationFn: async () => {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return ["Page 4: 00 00 00 00", "Page 5: 01 02 03 04"];
      }
      return invoke<string[]>("read_ntag216_raw_desktop");
    },
    onMutate: () => {
      pushStatus("Reading raw pages... place tag on reader");
    },
    onSuccess: (data) => {
      pushStatus(`Read ${data.length} pages raw.`);
    },
    onError: (err) => {
      pushStatus(`Raw read error: ${String(err)}`);
    },
  });

  const writeMutation = useMutation<WriteResult, unknown, WriteJsonInput>({
    mutationKey: ["ntag216", "write-json"],
    mutationFn: async ({ json }: WriteJsonInput) => {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        return {
          uid: "04:AB:CD:EF:12:34:56",
          ok: true,
          skipped: false,
          error: null,
        };
      }
      return invoke<WriteResult>("write_ntag216_json_desktop", {
        json,
        options: { existing_tag_behavior: "overwrite" },
      });
    },
    onMutate: () => {
      pushStatus("Writing… place tag on NFC reader");
    },
    onSuccess: (_result, variables) => {
      pushStatus("Wrote JSON to tag.");
      
      if (DEMO_MODE) {
        queryClient.setQueryData(["ntag216", "demo-tag-content"], variables.json);
      }
      
      void readMutation.mutate();
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
    readerError: readerQuery.error,
    checkReader,
    readJson: readMutation,
    readRaw: readRawMutation,
    writeJson: writeMutation,
    lastRead,
    status,
    statusHistory,
    statusIsError,
    isReading,
    isWriting,
    isBusy,
    pushStatus,
    saveToDownloads: saveToDownloadsMutation,
  };
}
