# macOS Setup Guide for Desktop NFC

## ✅ Good News: No Installation Needed!

**macOS has built-in PC/SC support** - you don't need to install `libpcsclite` via Homebrew. The system's Smart Card Services framework provides PC/SC functionality automatically.

## What You Need

### 1. **Hardware: NFC Reader**
You need to connect a PC/SC-compatible NFC reader:

- **ACR122U** (~$40) - Recommended, works great on macOS
- **PN532 USB** (~$15) - Budget option
- Any PC/SC-compatible NFC reader

### 2. **Connect the Reader**
1. Plug your NFC reader into a USB port
2. macOS should automatically recognize it
3. No drivers needed for most readers

## Verify Your Setup

### Check if Reader is Connected
```bash
# List USB devices
system_profiler SPUSBDataType | grep -i "nfc\|acr\|pn532"

# Or check System Information:
# Apple Menu > About This Mac > System Report > USB
```

### Test PC/SC Detection
The app's "Check Reader" button will tell you if a reader is detected. If you see:

- ✅ **"Reader working! UID: ..."** - Reader detected and tag present
- ✅ **"Reader connected. No tag detected."** - Reader detected, ready for tag
- ❌ **"No NFC reader found"** - No reader connected

## Troubleshooting

### "No NFC reader found"

**Possible causes:**

1. **Reader not connected**
   - Check USB cable
   - Try different USB port
   - Try different USB cable (some cables are power-only)

2. **Reader not recognized**
   - Check System Information (Apple Menu > About This Mac > System Report > USB)
   - Look for your reader in the USB device list
   - If not listed, the reader may not be compatible

3. **Reader needs drivers**
   - Most ACR122U readers work without drivers
   - Some readers may need manufacturer drivers
   - Check reader manufacturer's website

4. **Reader already in use**
   - Close other NFC apps
   - Check Activity Monitor for processes using the reader
   - Restart the app

### "PC/SC service not available"

This shouldn't happen on macOS, but if you see this:

1. **Check Smart Card Services**
   ```bash
   # Check if service is running (should always be running on macOS)
   launchctl list | grep -i smartcard
   ```

2. **Restart Smart Card Services** (rarely needed)
   ```bash
   sudo launchctl stop com.apple.smartcardd
   sudo launchctl start com.apple.smartcardd
   ```

### Reader Detected But Can't Read Tags

1. **Tag placement**
   - Place tag directly on reader
   - Hold tag steady
   - Try different positions

2. **Tag type**
   - Must be NTAG213, NTAG215, or NTAG216
   - Other tag types (Mifare Classic, etc.) won't work

3. **Tag distance**
   - Keep tag close to reader
   - Remove any cases or covers

## Testing Without Hardware

If you don't have a reader yet, you can:

1. **Test the app** - It will show "No NFC reader found" which confirms PC/SC is working
2. **Order a reader** - ACR122U is recommended (~$40 on Amazon/eBay)
3. **Use Proxmark3** - Your existing Proxmark3 commands still work as fallback

## Recommended Readers for macOS

### ACR122U (~$40)
- ✅ Works out of the box
- ✅ No drivers needed
- ✅ Reliable and fast
- ✅ Good macOS support

### PN532 USB (~$15)
- ✅ Very affordable
- ✅ Works on macOS
- ⚠️ May need specific drivers for some models
- ⚠️ Less polished than ACR122U

## Next Steps

1. **Connect your NFC reader** to a USB port
2. **Open the app** and click "Check Reader"
3. **Place an NTAG216 tag** on the reader
4. **Click "Read JSON"** to test reading
5. **Click "Write JSON"** to test writing

## Still Having Issues?

1. Check USB connection
2. Try a different USB port
3. Restart your Mac
4. Check System Information for the reader
5. Verify reader compatibility with macOS

---

**Remember:** On macOS, PC/SC is built-in. You just need to connect a compatible NFC reader!
