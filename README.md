<div align="center">

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/-.GIT_Enhanced-34d399?style=for-the-badge&labelColor=0f1117&logo=git&logoColor=34d399">
  <img alt="DotGit Enhanced" src="https://img.shields.io/badge/-.GIT_Enhanced-34d399?style=for-the-badge&labelColor=0f1117&logo=git&logoColor=34d399">
</picture>

# DotGit Enhanced

**Detect. Download. Extract.** — The first browser extension that automatically finds exposed `.git` repositories on websites you visit, downloads the objects, and **reconstructs the actual source code** — all in one click.

[![License](https://img.shields.io/badge/License-GPL--3.0-blue?style=flat-square)](LICENSE)
[![Manifest](https://img.shields.io/badge/Manifest-V3-34d399?style=flat-square&logo=googlechrome&logoColor=white)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-Compatible-4285f4?style=flat-square&logo=google-chrome&logoColor=white)](#-installation)
[![Firefox](https://img.shields.io/badge/Firefox-Compatible-ff7139?style=flat-square&logo=firefox-browser&logoColor=white)](#-installation)

<br>
</div>

---

## 💡 Why This Exists

Security researchers typically need **three separate tools** to go from discovery to source code:

1. A **finder** to detect exposed `.git` on a website
2. A **dumper** to download the raw Git objects
3. An **extractor** to reconstruct actual files from those objects

**DotGit Enhanced merges all three steps into a single browser extension.** Click the download button, and you get a ZIP containing the reconstructed source files — ready to analyze.

---

## ✨ What It Does

### 🔎 Auto-Detection (Passive Scanning)
Silently checks every website you visit for exposed sensitive files:

| Target | What It Finds | Default |
|--------|--------------|---------|
| **`.git/`** | Full Git repository — source code, history, credentials | ✅ On |
| **`.svn/`** | Subversion database (`wc.db`) | ⬚ Off |
| **`.hg/`** | Mercurial manifest data | ⬚ Off |
| **`.env`** | API keys, database passwords, secrets | ⬚ Off |
| **`.DS_Store`** | macOS file/folder metadata leaks | ⬚ Off |
| **`security.txt`** | Responsible disclosure contact info | ✅ On |

### 📦 One-Click Download + Extraction
When you click download on a `.git` finding:

```
Step 1: DISCOVER  →  Check for directory listing, fetch 50+ well-known Git paths
Step 2: CRAWL     →  Parse refs, logs, packed-refs to find every branch & object
Step 3: DOWNLOAD  →  Fetch all Git objects with smart connection pooling
Step 4: EXTRACT   →  Decompress objects, traverse commit→tree→blob chains
Step 5: DELIVER   →  ZIP with both raw .git data AND reconstructed source files
```

The resulting ZIP contains:

```
website_com.zip
├── website_com_source/          ← ✅ Actual source files (index.html, app.js, etc.)
│   ├── index.html
│   ├── config/
│   │   └── database.yml
│   ├── src/
│   │   └── app.js
│   └── ...
├── website_com_raw_git/         ← Raw .git objects (for manual analysis)
│   ├── HEAD
│   ├── config
│   ├── objects/
│   └── ...
├── ExtractionReport.txt         ← What was found, extracted, or failed
└── DownloadStats.txt            ← HTTP status codes breakdown
```

### 🛡️ Intelligence Features
- **Open Source Check** — Reads `.git/config` to find GitHub/GitLab remote URLs
- **security.txt Detection** — Finds responsible disclosure policies
- **Dynamic Ref Discovery** — Scans downloaded files for branch names not in any static list
- **Directory Listing Detection** — If the server exposes file listings, crawls recursively for maximum coverage

### 🎨 Modern Dark UI
- Stats dashboard with type breakdowns
- Color-coded badges (green `.git`, amber `.env`, blue `.svn`)
- Animated findings list with hover-reveal actions
- Card-based settings with toggle switches
- Desktop notifications for findings and download progress

---

## 🚀 Installation

### From Source

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/maord2000/DotGit-Enhanced.git
   cd DotGit-Enhanced
   ```

2. **Chrome / Edge / Brave:**
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (top right toggle)
   - Click **Load unpacked** → select the `DotGit-Enhanced` folder

3. **Firefox:**
   - Go to `about:debugging#/runtime/this-firefox`
   - Click **Load Temporary Add-on** → select `manifest.json`

---

## 🎯 How the Download & Extraction Engine Works

This is the core innovation — combining three workflows into one:

### Phase 1: Smart Discovery
Before fetching individual objects, the engine checks if `/.git/` returns an HTML directory listing. If it does, it **recursively crawls the entire tree** via link parsing — the fastest possible method. This technique is inspired by [git-dumper](https://github.com/arthaud/git-dumper).

### Phase 2: Expanded Path Fetching
If no directory listing exists, the engine fetches from **50+ well-known Git paths** covering:
- Common branches: `master`, `main`, `staging`, `production`, `development`, `dev`
- All remote origin refs for each branch
- WIP refs (used by git-wip and emacs magit)
- Log files for every ref
- Git hooks (may reveal custom scripts)

### Phase 3: Dynamic Ref Discovery
After the initial files land, the engine **scans their content** for additional ref paths. If `packed-refs` mentions `refs/heads/feature-payments`, that ref and its logs are automatically fetched too. This catches custom branch names that no static list would find — inspired by git-dumper's `FindRefsWorker`.

### Phase 4: Object Crawling
All discovered SHA-1 hashes are resolved to objects. Tree objects are decompressed with Pako (zlib) and traversed recursively to discover every reachable object.

### Phase 5: Source Extraction *(new — inspired by [GitTools Extractor](https://github.com/internetwache/GitTools))*
Once all objects are downloaded, the engine:
1. Finds every **commit** object
2. Reads the commit's **tree** hash
3. Recursively traverses the tree: directories become folders, blobs become files
4. Decompresses each blob to recover the **actual file content** with its **original filename**
5. Writes everything into the `_source/` folder in the ZIP

If extraction fails (e.g., pack-only repo, missing objects), the raw `.git` data is still included with a detailed `ExtractionReport.txt` explaining what happened and what to try next.

### Phase 6: ZIP Delivery
Everything is packaged with JSZip and downloaded through the browser.

### Connection Queue

```
Concurrent requests ≤ max_connections
       │
       ├── capacity available → fetch immediately
       └── at capacity → wait(pending × wait_ms), capped at max_wait_ms
```

| Preset | Connections | Wait | Max Wait | Max Failures |
|--------|-----------|------|----------|-------------|
| Conservative | 5 | 200ms | 20s | 100 |
| **Default** | **20** | **100ms** | **10s** | **250** |
| Aggressive | 50 | 50ms | 5s | 500 |

> ⚠️ Aggressive settings may freeze your browser. All processing happens in RAM.

---

## ⚙️ Settings

Access via the slider icon in the popup or right-click → *Options*.

| Section | Controls |
|---------|----------|
| **Scan Targets** | Toggle detection for each file type |
| **Analysis** | Open source check, security.txt, failed request scanning |
| **Notifications** | Desktop alerts for findings and downloads |
| **Display** | Max sites shown, debug mode |
| **Blacklist** | Comma-separated hostnames to skip (`*` wildcards supported) |
| **Download** | Connection concurrency, wait times, failure thresholds |

---

## 🏗️ Project Structure

```
DotGit-Enhanced/
├── manifest.json          # Chrome/Firefox MV3 manifest
├── dotgit.js              # Background service worker (download + extraction engine)
├── content_script.js      # Content script (detection checks)
├── popup/
│   ├── popup.html         # Extension popup
│   ├── popup.css          # Dark mode styles
│   └── popup.js           # Popup logic + stats
├── options/
│   ├── options.html       # Settings page
│   ├── options.css        # Card-based layout
│   └── options.js         # Settings logic
├── about.html             # Credits & info
├── icons/                 # Extension icons
└── lib/
    ├── jszip.min.js       # ZIP creation
    └── pako_inflate.min.js # zlib decompression
```

---

## 🔐 Permissions

| Permission | Reason |
|-----------|--------|
| `webRequest` | Detect page loads to trigger passive scanning |
| `storage` | Store findings, settings, and scan history locally |
| `notifications` | Desktop alerts for discoveries |
| `downloads` | Save the extracted ZIP files |
| `tabs` | Read tab URLs for scanning |
| `scripting` | Inject detection content scripts |
| `host_permissions (all URLs)` | Check arbitrary websites |

All data stays **local on your machine**. Nothing is sent to any server.

---

## ⚠️ Legal Disclaimer

This tool is for **authorized security research and educational purposes only.**

Accessing systems without authorization is illegal in most jurisdictions. Always ensure you have explicit permission before investigating any findings. The extension saves visited domains locally to avoid duplicate checks — use the trash icon to clear this list.

**Use at your own risk.** The authors are not responsible for any misuse.

---

## 🤝 Credits & Acknowledgments

### Built By

**[Maor D.](https://github.com/maord2000)** — Cyber Intelligence Researcher, Manager of Intelligence & Damages at Kaspersky Israel, and author of *"The Digital Hunter: The Art of Human and Network Intelligence."*

### Standing on the Shoulders of

This project builds upon the ideas and original work of several excellent open-source tools:

| Project | Author | What We Learned |
|---------|--------|----------------|
| **[DotGit](https://github.com/davtur19/DotGit)** | [davtur19](https://github.com/davtur19) | **Original extension** — the core detection engine, content script architecture, object crawling, and download queue system are based on davtur19's work. Full credit for the foundational extension goes to them. |
| **[git-dumper](https://github.com/arthaud/git-dumper)** | [Maxime Arthaud](https://github.com/arthaud) | Inspired the directory listing detection, expanded branch/ref coverage, and dynamic ref discovery from file content. |
| **[GitTools](https://github.com/internetwache/GitTools)** | [@gehaxelt](https://github.com/gehaxelt) / [@internetwache](https://github.com/internetwache) | The Extractor's approach of traversing commit→tree→blob chains to reconstruct source files was the basis for our in-browser extraction engine. |

### Libraries

| Library | Authors | Purpose |
|---------|---------|---------|
| [Pako](https://github.com/nodeca/pako) | Vitaly Puzrin, Andrei Tuputcyn | zlib decompression for Git objects |
| [JSZip](https://github.com/Stuk/jszip) | Stuart Knightley, David Duponchel | ZIP archive creation |

---

## 📄 License

GNU General Public License v3.0 — see [LICENSE](LICENSE).

---

<div align="center">

<br>

**Found a bug or have an idea?** [Open an issue](https://github.com/maord2000/DotGit-Enhanced/issues)

Made with 🔒 for the security research community

</div>
