# OpticLink

Turn your phone into a wireless webcam. That's it. No cables, no drivers to install, just scan a QR code and you're streaming.

Works with Zoom, OBS, Discord, Google Meet, Microsoft Teams, and pretty much anything that can use a webcam.

**[Download Latest Release](https://github.com/Kreesta-r/OpticLink/releases/latest)**

---

## How It Works

1. Download and run OpticLink on your computer
2. Scan the QR code with your phone
3. Tap "Start Streaming"
4. Select "OpticLink Virtual Camera" in your video app

Your phone's camera now shows up as a webcam. Both devices need to be on the same WiFi network.

---

## Downloads

Grab the latest build for your platform:

- **Windows**: `.exe` or `.msi` installer
- **macOS**: `.dmg` (Intel and Apple Silicon)
- **Linux**: `.AppImage` or `.deb`

All builds available at [Releases](https://github.com/Kreesta-r/OpticLink/releases).

---

## Why OpticLink?

Most webcam apps are either paid, require account signup, or install sketchy drivers. OpticLink is:

- Free and open source
- No account needed
- No cloud servers (everything stays on your network)
- Low latency WebRTC streaming
- Native virtual camera (no OBS required)

---

## Building From Source

If you want to build it yourself:

```bash
# Clone the repo
git clone https://github.com/Kreesta-r/OpticLink.git
cd OpticLink

# Install dependencies
npm install

# Run in dev mode
npm run tauri dev

# Build for production
npm run tauri build
```

Requirements:
- Node.js 18+
- Rust (stable)
- Platform-specific build tools (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites))

---

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Rust + Tauri
- **Streaming**: WebRTC (peer-to-peer)
- **Virtual Camera**: Windows Media Foundation (Windows), more platforms coming

---

## Known Limitations

- Virtual camera currently only works on Windows
- macOS and Linux virtual camera support is planned
- Phone browser must support WebRTC (most modern browsers do)

---

## Contributing

Found a bug? Want to add a feature? PRs are welcome.

If you find this useful, consider giving it a star. It helps others find the project.

---

## License

MIT
