## NTAG216 JSON (Tauri)

Desktop app to **read/write JSON** to **NTAG216** tags as an **NDEF MIME** record (`application/json`).

### How it talks to the tag (today)

This app currently uses a **Proxmark3** and invokes the **`proxmark3` client** (CLI) to perform `hf mfu` read/write operations.

Why: Proxmark3 is not a standard PC/SC NFC reader, so there isn’t a simple “generic NFC crate” that can drive it directly without either:
- bundling/embedding the Proxmark3 client, or
- re-implementing the Proxmark3 client protocol in Rust (bigger project).

If you want “no external CLI dependency”, we can add an **alternate backend** for common NFC readers (PC/SC / libnfc), but that targets **different hardware** than Proxmark3.

### Debugging

- Set `DESK_TAURI_DEBUG=1` to enable `[ntag216]` Rust logs.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Using Next

We will use the next branch as staging for everything as usual.