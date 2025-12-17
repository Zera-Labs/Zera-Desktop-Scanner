// Frontend service for NFC operations
// Supports both Proxmark3 (legacy) and Desktop NFC (PC/SC) readers

import { invoke } from "@tauri-apps/api/core";

export interface NdefSummary {
  kind: "text" | "uri" | "json" | "unknown";
  text?: string;
  uri?: string;
  language?: string;
  mime_type?: string;
  json?: string;
  message_hex: string;
}

export interface Ntag216ReadResult {
  uid?: string;
  is_blank: boolean;
  ndef?: NdefSummary;
}

export interface WriteResult {
  uid?: string;
  ok: boolean;
  skipped: boolean;
  error?: string;
}

export interface WriteOptions {
  existing_tag_behavior: "overwrite" | "skip" | "error";
}

/**
 * NFC Service - All-in-one NFC operations
 * 
 * Usage:
 *   const service = new NfcService();
 *   const tag = await service.readTag();
 *   const result = await service.writeText("Hello NFC!");
 */
export class NfcService {
  /**
   * Check if NFC reader is available and working
   */
  async checkReaderHealth(): Promise<string> {
    try {
      const status: string = await invoke("check_nfc_reader");
      return status;
    } catch (error) {
      return `Reader health check failed: ${error}`;
    }
  }

  /**
   * Read NTAG216 tag (desktop NFC reader)
   * Returns UID, blank status, and NDEF content if present
   */
  async readTag(): Promise<Ntag216ReadResult> {
    try {
      const result: Ntag216ReadResult = await invoke("read_ntag216_desktop");
      return result;
    } catch (error) {
      throw new Error(`Failed to read tag: ${error}`);
    }
  }

  /**
   * Read text from NTAG216 tag
   * Returns the text content or throws if not a text tag
   */
  async readText(): Promise<string> {
    const result = await this.readTag();

    if (result.is_blank) {
      throw new Error("Tag is blank");
    }

    if (!result.ndef) {
      throw new Error("No NDEF data found");
    }

    if (result.ndef.kind !== "text") {
      throw new Error(
        `Tag contains ${result.ndef.kind}, not text. Expected text record.`
      );
    }

    if (!result.ndef.text) {
      throw new Error("Text record found but text is empty");
    }

    return result.ndef.text;
  }

  /**
   * Read JSON from NTAG216 tag
   * Returns parsed JSON object
   */
  async readJson<T = any>(): Promise<T> {
    const jsonStr: string = await invoke("read_ntag216_json_desktop");
    try {
      return JSON.parse(jsonStr);
    } catch (error) {
      throw new Error(`Failed to parse JSON from tag: ${error}`);
    }
  }

  /**
   * Write text to NTAG216 tag
   * Automatically detects if tag already has content (behavior configurable)
   */
  async writeText(
    text: string,
    options?: Partial<WriteOptions>
  ): Promise<WriteResult> {
    try {
      const opts: WriteOptions = {
        existing_tag_behavior: "overwrite",
        ...options,
      };

      const result: WriteResult = await invoke("write_ntag216_text_desktop", {
        text,
        options: opts,
      });

      if (!result.ok && result.error) {
        throw new Error(result.error);
      }

      if (result.skipped) {
        console.warn("Write skipped - tag already contains data");
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to write text: ${error}`);
    }
  }

  /**
   * Write URI to NTAG216 tag
   */
  async writeUri(
    uri: string,
    options?: Partial<WriteOptions>
  ): Promise<WriteResult> {
    try {
      const opts: WriteOptions = {
        existing_tag_behavior: "overwrite",
        ...options,
      };

      const result: WriteResult = await invoke("write_ntag216_uri_desktop", {
        uri,
        options: opts,
      });

      if (!result.ok && result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to write URI: ${error}`);
    }
  }

  /**
   * Write JSON to NTAG216 tag
   * Automatically minifies JSON to maximize storage
   */
  async writeJson<T extends object>(
    data: T,
    options?: Partial<WriteOptions>
  ): Promise<WriteResult> {
    try {
      const json = JSON.stringify(data);
      const opts: WriteOptions = {
        existing_tag_behavior: "overwrite",
        ...options,
      };

      const result: WriteResult = await invoke("write_ntag216_json_desktop", {
        json,
        options: opts,
      });

      if (!result.ok && result.error) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      throw new Error(`Failed to write JSON: ${error}`);
    }
  }

  /**
   * Write complex payload with automatic type detection
   */
  async writeAuto(
    data: string | object | { text?: string; uri?: string; json?: any },
    options?: Partial<WriteOptions>
  ): Promise<WriteResult> {
    if (typeof data === "string") {
      // Check if it looks like a URI
      if (data.startsWith("http://") || data.startsWith("https://")) {
        return this.writeUri(data, options);
      }
      // Otherwise, treat as text
      return this.writeText(data, options);
    }

    // Handle typed objects
    if (data && typeof data === "object") {
      if ("text" in data && data.text) {
        return this.writeText(data.text, options);
      }
      if ("uri" in data && data.uri) {
        return this.writeUri(data.uri, options);
      }
      if ("json" in data) {
        return this.writeJson(data.json, options);
      }
    }

    // Default: treat as JSON
    return this.writeJson(data, options);
  }
}
