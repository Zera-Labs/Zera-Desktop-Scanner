# Offline Cash Desktop Application 🎄

**A desktop application for managing and transferring private cash vouchers using NFC tags.**

---

## 📋 Table of Contents

- [What is Offline Cash?](#what-is-offline-cash)
- [Features](#features)
- [System Requirements](#system-requirements)
- [Installation Guide](#installation-guide)
  - [For End Users (Non-Developers)](#for-end-users-non-developers)
  - [For Developers](#for-developers)
- [Hardware Setup](#hardware-setup)
- [Getting Started](#getting-started)
- [Usage Guide](#usage-guide)
- [Platform-Specific Setup](#platform-specific-setup)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)

---

## What is Offline Cash?

Offline Cash is a desktop application that allows you to:
- **Store** private cash vouchers as encrypted JSON files
- **Transfer** vouchers to NFC tags (NTAG216) for offline storage
- **Read** vouchers from NFC tags back into the application
- **Manage** your voucher collection with an intuitive drag-and-drop interface

This application enables secure, offline transfer of digital cash vouchers using NFC technology, perfect for scenarios where you need to transfer value without an internet connection.

---

## Features

✨ **Key Features:**

- 📱 **NFC Tag Support**: Read and write vouchers to NTAG216 NFC tags
- 📁 **File Management**: Import vouchers from JSON files via folder scanning or drag-and-drop
- 🎯 **Drag & Drop**: Intuitive interface for organizing and transferring vouchers
- 🔒 **Secure Storage**: Private voucher data stored locally
- 🔄 **Multiple Reader Support**: Works with both Proxmark3 and PC/SC-compatible NFC readers
- 🖥️ **Cross-Platform**: Available for macOS, Windows, and Linux
- 📊 **Voucher Details**: View detailed information about each voucher
- ⚡ **Fast Operations**: Optimized read/write operations (~300ms per write)

---

## System Requirements

### Minimum Requirements

- **Operating System**: macOS 10.15+, Windows 10+, or Linux (Ubuntu 20.04+)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 100MB free space
- **USB Port**: For NFC reader connection

### Hardware Requirements

You'll need one of the following NFC readers:

| Reader | Price | Recommended For |
|--------|-------|-----------------|
| **ACR122U** | ~$40 | ✅ Best choice - works on all platforms |
| **PN532 USB** | ~$15 | Budget option |
| **Proxmark3** | ~$200 | Advanced users (legacy support) |

**NFC Tags**: NTAG213, NTAG215, or NTAG216 tags

---

## Installation Guide

### For End Users (Non-Developers)

#### Option 1: Download Pre-built Release (Recommended)

1. **Download the latest release**:
   - Go to the [Releases](https://github.com/your-repo/releases) page
   - Download the installer for your operating system:
     - **macOS**: `.dmg` file
     - **Windows**: `.exe` installer
     - **Linux**: `.AppImage` or `.deb` package

2. **Install the application**:
   - **macOS**: Open the `.dmg` file and drag the app to Applications
   - **Windows**: Run the `.exe` installer and follow the prompts
   - **Linux**: 
     - For `.deb`: `sudo dpkg -i package.deb`
     - For `.AppImage`: Make executable (`chmod +x`) and run

3. **Launch the application**:
   - **macOS**: Open from Applications folder
   - **Windows**: Launch from Start Menu
   - **Linux**: Run from Applications menu or terminal

4. **Connect your NFC reader**:
   - Plug your NFC reader into a USB port
   - The app will automatically detect it (see [Hardware Setup](#hardware-setup))

#### Option 2: Build from Source

If pre-built releases aren't available, see [For Developers](#for-developers) section below.

---

### For Developers

#### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **pnpm** (v8 or higher) - Install via: `npm install -g pnpm`
- **Rust** (latest stable) - [Install Rust](https://www.rust-lang.org/tools/install)
- **System Dependencies**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: Microsoft Visual C++ Build Tools
  - **Linux**: See [Platform-Specific Setup](#platform-specific-setup)

#### Step 1: Clone the Repository

```bash
git clone https://github.com/your-repo/zera-tauri.git
cd zera-tauri
```

#### Step 2: Install Dependencies

```bash
# Install Node.js dependencies
pnpm install

# Rust dependencies are automatically installed on first build
```

#### Step 3: Development Mode

```bash
# Start the development server
pnpm tauri dev
```

This will:
- Start the Vite development server
- Build the Rust backend
- Launch the application in development mode
- Enable hot-reload for frontend changes

#### Step 4: Build for Production

```bash
# Build for your current platform
pnpm tauri build

# Build for specific platform (requires cross-compilation setup)
pnpm tauri build --target x86_64-apple-darwin  # macOS
pnpm tauri build --target x86_64-pc-windows-msvc  # Windows
pnpm tauri build --target x86_64-unknown-linux-gnu  # Linux
```

Built applications will be in `src-tauri/target/release/bundle/`

#### Development Tips

- **Enable Rust Debug Logs**: Set `DESK_TAURI_DEBUG=1` environment variable
- **VS Code Setup**: Install extensions:
  - [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
  - [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- **Hot Reload**: Frontend changes reload automatically; Rust changes require restart

---

## Hardware Setup

### Supported NFC Readers

#### 1. ACR122U (Recommended) ✅

**Why choose ACR122U:**
- Works out of the box on all platforms
- No drivers needed (macOS/Linux)
- Reliable and fast (~300ms per write)
- Good community support

**Where to buy:**
- Amazon: Search "ACR122U NFC Reader"
- eBay: Various sellers
- Official retailers: ~$40-50

#### 2. PN532 USB (Budget Option)

**Pros:**
- Very affordable (~$15)
- Works on all platforms

**Cons:**
- May need specific drivers
- Less polished than ACR122U
- Slower performance

#### 3. Proxmark3 (Advanced)

**Note**: Proxmark3 support is maintained for legacy compatibility. For new users, we recommend ACR122U.

### NFC Tags

**Supported Tag Types:**
- ✅ NTAG213 (180 bytes)
- ✅ NTAG215 (540 bytes)
- ✅ NTAG216 (924 bytes) - **Recommended**

**Where to buy:**
- Amazon: Search "NTAG216 NFC tags"
- eBay: Bulk packs available
- NFC tag suppliers: Various online retailers

---

## Getting Started

### First Launch

1. **Connect your NFC reader**:
   - Plug your NFC reader into a USB port
   - Wait a few seconds for the system to recognize it

2. **Check reader status**:
   - Click the **"Check Reader"** button in the Hardware Panel
   - You should see: `"Reader connected. No tag detected."` or `"Reader working! UID: ..."`

3. **Import your first vouchers**:
   - Click **"Locate assets"** to scan a folder for voucher JSON files
   - Or drag and drop JSON files directly onto the app window
   - Vouchers will appear in the Private Assets grid

### Quick Start Guide

1. **Import Vouchers**:
   ```
   Click "Locate assets" → Select folder with voucher JSON files
   OR
   Drag and drop JSON files onto the app
   ```

2. **Write to NFC Tag**:
   ```
   Drag a voucher card → Drop onto "Write Zone"
   OR
   Click a voucher → Click "Write to Tag" button
   Place tag on reader → Wait for confirmation
   ```

3. **Read from NFC Tag**:
   ```
   Place tag on reader → Click "Read JSON"
   View tag contents → Optionally save to computer
   ```

---

## Usage Guide

### Managing Private Assets

#### Importing Vouchers

**Method 1: Folder Scan**
1. Click **"Locate assets"** button
2. Select a folder containing voucher JSON files
3. All valid JSON files will be imported automatically

**Method 2: Choose Files**
1. Click **"Choose files"** button
2. Select one or more JSON files
3. Files will be added to your collection

**Method 3: Drag and Drop**
1. Drag JSON files from your file manager
2. Drop them anywhere on the app window
3. Files are automatically imported

#### Organizing Vouchers

- **Drag to reorder**: Click and drag voucher cards to rearrange them
- **Select voucher**: Click on a voucher card to select it
- **View details**: Click the transaction signature area on a card to view full details
- **Clear all**: Click **"Clear assets"** to remove all vouchers (doesn't delete files)

### NFC Operations

#### Writing to NFC Tags

**Step-by-step:**
1. **Select a voucher** from your Private Assets grid
2. **Drag it** to the Write Zone (right panel) OR click **"Write to Tag"**
3. **Place an NTAG216 tag** on your NFC reader
4. **Wait for confirmation** - Status will show "Wrote JSON to tag"
5. **Verify**: The tag will be automatically read to confirm the write

**Important Notes:**
- ⚠️ Writing will **overwrite** any existing data on the tag
- ✅ The app will ask for confirmation if the tag already has data
- ⏱️ Writing takes approximately 1-2 seconds
- 🔒 Keep the tag steady on the reader during the write operation

#### Reading from NFC Tags

**Step-by-step:**
1. **Place an NFC tag** on your NFC reader
2. **Click "Read JSON"** button
3. **View the results**:
   - If tag has data: JSON content will be displayed
   - If tag is blank: Status will show "Tag is blank"
4. **Save to computer** (optional): Click "Save Tag to Computer" to add to your collection

**Reading Tips:**
- Keep the tag steady on the reader
- Ensure good contact between tag and reader
- Reading takes approximately 0.5-1 second

### Voucher Details

Click on the transaction signature area of any voucher card to view:
- Full transaction details
- Voucher metadata
- Creation timestamp
- Transaction history (if available)

---

## Platform-Specific Setup

### macOS

**✅ Good News: No Installation Needed!**

macOS has built-in PC/SC support via Smart Card Services. Just connect your NFC reader and it should work automatically.

**Verification:**
```bash
# Check if reader is connected
system_profiler SPUSBDataType | grep -i "nfc\|acr\|pn532"

# Or check System Information:
# Apple Menu > About This Mac > System Report > USB
```

**Troubleshooting:**
- If reader isn't detected, try a different USB port
- Some readers may need manufacturer drivers (rare)
- Check System Information to verify USB connection

**See also**: [MACOS_SETUP.md](./MACOS_SETUP.md) for detailed macOS instructions

### Windows

**Driver Installation:**
1. Most NFC readers work automatically with Windows
2. If not detected, download drivers from manufacturer:
   - **ACR122U**: [ACS Official Site](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/)
3. Install drivers and restart if needed

**Verification:**
- Open Device Manager (`Win + X` → Device Manager)
- Look for your NFC reader under "Smart card readers" or "Universal Serial Bus controllers"

**Troubleshooting:**
- Check Device Manager for driver issues
- Try different USB ports
- Ensure no other applications are using the reader

### Linux (Ubuntu/Debian)

**Install PC/SC Support:**

```bash
# Install PC/SC daemon and libraries
sudo apt-get update
sudo apt-get install pcscd libpcsclite-dev libpcsclite1

# Start PC/SC service
sudo systemctl start pcscd
sudo systemctl enable pcscd  # Enable on boot

# Add your user to pcscd group (required for permissions)
sudo usermod -a -G pcscd $USER

# Log out and log back in for group changes to take effect
```

**Verification:**
```bash
# Check if PC/SC service is running
systemctl status pcscd

# List available readers
pcsc_scan
```

**Troubleshooting:**
- If you get "Permission denied", ensure you're in the `pcscd` group
- Restart PC/SC service: `sudo systemctl restart pcscd`
- Check USB permissions if issues persist

**Other Linux Distributions:**

**Fedora/RHEL:**
```bash
sudo dnf install pcsc-lite pcsc-lite-devel
sudo systemctl start pcscd
sudo usermod -a -G pcscd $USER
```

**Arch Linux:**
```bash
sudo pacman -S pcsclite ccid
sudo systemctl start pcscd
sudo usermod -a -G pcscd $USER
```

---

## Troubleshooting

### Common Issues

#### "No NFC reader found"

**Possible causes and solutions:**

1. **Reader not connected**
   - ✅ Check USB cable connection
   - ✅ Try a different USB port
   - ✅ Try a different USB cable (some cables are power-only)

2. **Reader not recognized**
   - **macOS**: Check System Information (Apple Menu > About This Mac > System Report > USB)
   - **Windows**: Check Device Manager for the reader
   - **Linux**: Run `pcsc_scan` to see if reader is detected

3. **Drivers needed**
   - **macOS**: Usually not needed, but check manufacturer website
   - **Windows**: Download drivers from manufacturer (ACR122U drivers available)
   - **Linux**: Ensure `pcscd` service is running and you're in `pcscd` group

4. **Reader already in use**
   - Close other NFC applications
   - Restart the app
   - On Linux: Check for other processes: `ps aux | grep pcsc`

#### "Invalid APDU response" or "Communication error"

**Solutions:**
- Ensure tag is properly placed on reader
- Try repositioning the tag
- Check if tag is NTAG213/215/216 (other types won't work)
- Remove any cases or covers from the tag
- Try a different tag

#### "Permission denied" (Linux)

**Solution:**
```bash
# Add user to pcscd group
sudo usermod -a -G pcscd $USER

# Log out and log back in completely
# Or restart your session
```

#### Reader detected but can't read/write tags

**Checklist:**
- ✅ Tag is NTAG213, NTAG215, or NTAG216
- ✅ Tag is placed directly on reader
- ✅ Tag is held steady during operation
- ✅ No other applications are using the reader
- ✅ Tag is not damaged or corrupted

#### App crashes or freezes

**Solutions:**
- Restart the application
- Disconnect and reconnect the NFC reader
- Check system logs for errors
- Ensure you have the latest version
- Report the issue with system information

### Debug Mode

**Enable Rust debug logs:**
```bash
# macOS/Linux
export DESK_TAURI_DEBUG=1
pnpm tauri dev

# Windows (PowerShell)
$env:DESK_TAURI_DEBUG=1
pnpm tauri dev
```

### Getting Help

If you're still experiencing issues:

1. **Check the logs**: Look for error messages in the app's status area
2. **Verify hardware**: Test your reader with another application if possible
3. **System information**: Note your OS version, reader model, and tag type
4. **Report issues**: Include error messages and steps to reproduce

---

## Development

### Project Structure

```
zera-tauri/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # React components
│   ├── hooks/             # React hooks (useNtag216, etc.)
│   ├── lib/               # Utilities and services
│   └── App.tsx            # Main application component
├── src-tauri/             # Backend (Rust)
│   ├── src/
│   │   ├── ntag216.rs     # Proxmark3 implementation
│   │   ├── ntag216_desktop.rs  # PC/SC implementation
│   │   └── lib.rs         # Tauri command handlers
│   └── Cargo.toml         # Rust dependencies
├── package.json           # Node.js dependencies
└── README.md              # This file
```

### Key Technologies

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite
- **Backend**: Rust, Tauri 2.0
- **NFC**: PC/SC (via `pcsc` crate), Proxmark3 support
- **State Management**: TanStack Query (React Query)

### Building from Source

See [For Developers](#for-developers) section above.

### Testing

**Manual Testing Checklist:**
- [ ] Reader detection works
- [ ] Read from blank tag
- [ ] Read from tag with data
- [ ] Write to blank tag
- [ ] Write to tag with existing data (overwrite confirmation)
- [ ] Import vouchers from folder
- [ ] Import vouchers via drag-and-drop
- [ ] Drag and drop vouchers to write zone
- [ ] Voucher details modal
- [ ] Clear assets functionality

### Code Style

- **TypeScript**: Follow existing patterns, use TypeScript strict mode
- **Rust**: Follow Rust conventions, use `rustfmt` and `clippy`
- **React**: Functional components with hooks, TypeScript for type safety

---

## Contributing

We welcome contributions! Here's how you can help:

1. **Report bugs**: Open an issue with detailed information
2. **Suggest features**: Share your ideas for improvements
3. **Submit pull requests**: 
   - Fork the repository
   - Create a feature branch
   - Make your changes
   - Submit a pull request with a clear description

**Development Workflow:**
- We use the `next` branch for staging
- Main branch is for stable releases
- Follow existing code style and patterns

---

## License

[Add your license information here]

---

## Acknowledgments

- Built with [Tauri](https://tauri.app/) - A framework for building desktop applications
- NFC support via [PC/SC](https://pcsclite.apdu.fr/) - Multi-platform smart card framework
- Thanks to all contributors and testers

---

## Support

- **Documentation**: Check this README and other `.md` files in the repository
- **Issues**: Report problems via GitHub Issues
- **Questions**: [Add your support channel here]

---

**🎄 Happy Holidays! Enjoy using Offline Cash! 🎄**

---

*Last updated: December 2024*
