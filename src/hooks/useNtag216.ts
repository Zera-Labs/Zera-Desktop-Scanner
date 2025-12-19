import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";

const DEMO_MODE = true;

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
  const [demoTagContent, setDemoTagContent] = useState<string | null>(null);

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
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const readMutation = useMutation<Ntag216ReadResult, unknown, { overrideContent?: string } | void>({
    mutationKey: ["ntag216", "read-json"],
    mutationFn: async (options) => {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 800));
    
        const currentContent = options?.overrideContent || demoTagContent || JSON.stringify({
          id: "demo-1",
          voucherId: "0x74cccbb7db5be82b7c3d2d36e2cddb25649bd217",
          amount: 99.99,
          recipient: "9Y6Aftit2gGPgY6H2DaDH1qnXE6qVhZ6kTpsuRWpuQXy",
          secret: "0xcb61b3870d94bef96de22653a3fa20b9e8b386b9",
          salt: "0x1daf0ee216260d49503ea68acb2b45949db4f749",
          txSignature: "DemoTxSignature123abc456def789",
          createdAt: new Date().toISOString(),
        });
        
        const hasContent = options?.overrideContent || demoTagContent;
        
        return {
          uid: "04:AB:CD:EF:12:34:56",
          is_blank: !hasContent,
          ndef: hasContent ? {
            kind: "json",
            json: currentContent
          } : null
        };
      }
      return invoke<Ntag216ReadResult>("read_ntag216_json_desktop");
    },
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
    mutationFn: async ({ json }: WriteJsonInput) => {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        return {
          uid: "04:AB:CD:EF:12:34:56",
          ok: true,
          skipped: false,
          json,
        };
      }
      return invoke<WriteResult>("write_ntag216_json_desktop", {
        json,
        options: { existing_tag_behavior: "overwrite" },
      });
    },
    onMutate: () => pushStatus("Writing… place tag on NFC reader"),
    onSuccess: (_result, variables) => {
      pushStatus("Wrote JSON to tag.");
      if (DEMO_MODE) {
        setDemoTagContent(variables.json);
        
        void readMutation.mutate({ overrideContent: variables.json });
      }
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

