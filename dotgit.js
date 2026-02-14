import "/lib/jszip.min.js";
import "/lib/pako_inflate.min.js";

const DEFAULT_OPTIONS = {
    "functions": {
        "git": true,
        "svn": false,
        "hg": false,
        "env": false,
        "ds_store": false
    },
    "color": "grey",
    "max_sites": 100,
    "notification": {
        "new_git": true,
        "download": true
    },
    "check_opensource": true,
    "check_securitytxt": true,
    "debug": false,
    "check_failed": true,
    "download": {
        "wait": 100,
        "max_wait": 10000,
        "max_connections": 20,
        "failed_in_a_row": 250
    },
    "blacklist": [
        'localhost'
    ]
};

const EXTENSION_ICON = {
    "48": "icons/dotgit-48.png",
    "96": "icons/dotgit-96.png"
};

const GIT_PATH = "/.git/";
const SVN_PATH = "/.svn/";
const HG_PATH = "/.hg/";
const ENV_PATH = "/.env";
const DS_STORE = "/.DS_Store";

const GIT_TREE_HEADER = "tree ";
const GIT_OBJECTS_PATH = "objects/";
const GIT_OBJECTS_SEARCH = "[a-f0-9]{40}";
const GIT_PACK_PATH = "objects/pack/";
const GIT_PACK_SEARCH = "pack\\-[a-f0-9]{40}";
const GIT_PACK_EXT = ".pack";
const GIT_IDX_EXT = ".idx";
const SHA1_SIZE = 20;
const GIT_BLOB_DELIMITER = String.fromCharCode(0);
const STATUS_DESCRIPTION = "HTTP Status code for downloaded files: 200 Good, 404 Normal, 403 and 5XX Bad\n";

// ─── Expanded well-known paths (git-dumper-inspired) ───
const GIT_WELL_KNOW_PATHS = [
    "HEAD", "ORIG_HEAD", "FETCH_HEAD",
    "description", "config", "COMMIT_EDITMSG",
    "index", "packed-refs",
    "info/refs", "info/exclude", "objects/info/packs",
    // Branch refs
    "refs/heads/master", "refs/heads/main",
    "refs/heads/staging", "refs/heads/production",
    "refs/heads/development", "refs/heads/develop", "refs/heads/dev",
    // Remote refs
    "refs/remotes/origin/HEAD", "refs/remotes/origin/master",
    "refs/remotes/origin/main", "refs/remotes/origin/staging",
    "refs/remotes/origin/production", "refs/remotes/origin/development",
    "refs/stash",
    // WIP refs
    "refs/wip/wtree/refs/heads/master", "refs/wip/wtree/refs/heads/main",
    "refs/wip/index/refs/heads/master", "refs/wip/index/refs/heads/main",
    // Logs
    "logs/HEAD", "logs/refs/stash",
    "logs/refs/heads/master", "logs/refs/heads/main",
    "logs/refs/heads/staging", "logs/refs/heads/production",
    "logs/refs/heads/development",
    "logs/refs/remotes/origin/HEAD", "logs/refs/remotes/origin/master",
    "logs/refs/remotes/origin/main", "logs/refs/remotes/origin/staging",
    "logs/refs/remotes/origin/production", "logs/refs/remotes/origin/development",
    // Hooks
    "hooks/pre-commit.sample", "hooks/pre-push.sample",
    "hooks/post-commit.sample", "hooks/post-receive.sample",
    "hooks/update.sample",
];

let wait;
let max_wait;
let max_connections;
let notification_new_git;
let notification_download;
let check_opensource;
let check_securitytxt;
let check_git;
let check_svn;
let check_hg;
let check_env;
let check_ds_store;
let failed_in_a_row;
let check_failed;
let blacklist = [];
let processingUrls = new Set();
let debug = false;

function debugLog(...args) {
    if (debug) {
        console.log('[DotGit Debug]', ...args);
    }
}
debugLog('Background script loaded');

// ─── Firefox MV3 persistence ───
let isWorkerActive = true;
const keepAlive = setInterval(() => {
    if (!isWorkerActive) { clearInterval(keepAlive); return; }
    chrome.storage.local.get(['lastActivity'], () => {
        chrome.storage.local.set({ lastActivity: Date.now() });
    });
}, 25000);

chrome.runtime.onStartup.addListener(() => { isWorkerActive = true; });
chrome.runtime.onInstalled.addListener((details) => { isWorkerActive = true; });
chrome.runtime.onSuspend.addListener(() => { isWorkerActive = false; });


function notification(title, message) {
    if (title === "Download status") {
        if (!notification_download) return true;
    } else {
        if (!notification_new_git) return true;
    }
    chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL(EXTENSION_ICON["48"]),
        title: title,
        message: message
    });
}

function sendDownloadStatus(url, downloadStatus) {
    chrome.runtime.sendMessage({
        type: "downloadStatus",
        url: url,
        downloadStatus: downloadStatus
    }, function () { chrome.runtime.lastError; });
}

async function setBadge() {
    try {
        const result = await chrome.storage.local.get(["withExposedGit"]);
        if (typeof chrome.action !== "undefined" && typeof chrome.action.setBadgeText !== "undefined") {
            const text = (result.withExposedGit || []).length.toString();
            await chrome.action.setBadgeText({text});
        }
    } catch (error) {
        debugLog('setBadge - Error:', error);
    }
}


// ═══════════════════════════════════════════════════════════════════════
//  DOWNLOAD + EXTRACT ENGINE
//  Combines: DotGit download → git-dumper discovery → GitTools extraction
// ═══════════════════════════════════════════════════════════════════════

function startDownload(baseUrl, downloadFinished) {
    const downloadedFiles = [];   // [path, ArrayBuffer] — raw .git files
    const walkedPaths = [];
    const decompressedObjects = new Map(); // hash → decompressed string content

    let running_tasks = 0;
    let waiting = 0;
    let fileExist = false;
    let downloadStats = {};
    let failedInARow = 0;
    let downloadStatus = { successful: 0, failed: 0, total: 0 };

    function arrayBufferToString(buffer) {
        let result = "";
        buffer.forEach(function (part) { result += String.fromCharCode(part); });
        return result;
    }

    // ─── git-dumper-inspired: Parse directory listing ───
    function parseDirectoryListing(html) {
        const links = [];
        const hrefRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi;
        let match;
        while ((match = hrefRegex.exec(html)) !== null) {
            const href = match[1];
            if (href && !href.startsWith('/') && !href.startsWith('http') &&
                !href.startsWith('?') && !href.startsWith('#') &&
                href !== '../' && href !== './') {
                links.push(href);
            }
        }
        return links;
    }

    // ─── git-dumper-inspired: Dynamic ref discovery ───
    function extractRefsFromContent(text) {
        const paths = [];
        const refRegex = /(refs(\/[a-zA-Z0-9\-._]+)+)/g;
        let match;
        while ((match = refRegex.exec(text)) !== null) {
            const ref = match[1];
            if (!ref.endsWith('*')) {
                paths.push(ref);
                paths.push("logs/" + ref);
            }
        }
        return paths;
    }

    function tryDirectoryListing(callback) {
        fetch(baseUrl + GIT_PATH, {
            redirect: "manual", headers: {"Accept": "text/html"},
        }).then(function (response) {
            if (response.ok && response.status === 200) {
                const ct = response.headers.get("Content-Type") || "";
                if (ct.includes("text/html")) return response.text();
            }
            return null;
        }).then(function (html) {
            if (html && html.includes("HEAD")) {
                debugLog("Directory listing detected");
                crawlDirectory("", html);
                callback(true);
            } else {
                callback(false);
            }
        }).catch(function () { callback(false); });
    }

    function crawlDirectory(relativePath, html) {
        const entries = parseDirectoryListing(html);
        for (const entry of entries) {
            const fullPath = relativePath + entry;
            if (entry.endsWith('/')) {
                downloadFile(fullPath, false, function(content) {
                    if (content.includes('<') && content.includes('href')) {
                        crawlDirectory(fullPath, content);
                    }
                });
            } else {
                const shouldDecompress = fullPath.startsWith("objects/") &&
                    !fullPath.startsWith("objects/info/") &&
                    !fullPath.startsWith("objects/pack/");
                downloadFile(fullPath, shouldDecompress, checkResult);
            }
        }
    }

    function discoverDynamicRefs() {
        for (const file of downloadedFiles) {
            const path = file[0];
            if (path === "packed-refs" || path === "config" || path === "FETCH_HEAD" ||
                path === "info/refs" || path.startsWith("logs/") ||
                (path.startsWith("refs/") && !path.includes("objects/"))) {
                try {
                    const content = arrayBufferToString(new Uint8Array(file[1]));
                    const newRefs = extractRefsFromContent(content);
                    for (const ref of newRefs) {
                        if (!walkedPaths.includes(ref)) {
                            downloadFile(ref, false, checkResult);
                        }
                    }
                } catch (e) { /* skip */ }
            }
        }
    }


    // ═══════════════════════════════════════════════════════════════
    //  GitTools Extractor — Pure JS implementation
    //  Reconstructs actual source files from Git objects in-memory
    // ═══════════════════════════════════════════════════════════════

    /**
     * Parse a decompressed Git object to determine its type and body.
     * Git loose objects: "<type> <size>\0<content>"
     */
    function parseGitObject(decompressed) {
        const nullIdx = decompressed.indexOf(GIT_BLOB_DELIMITER);
        if (nullIdx === -1) return null;
        const header = decompressed.substring(0, nullIdx);
        const spaceIdx = header.indexOf(' ');
        if (spaceIdx === -1) return null;
        const type = header.substring(0, spaceIdx);   // "commit", "tree", "blob", "tag"
        const body = decompressed.substring(nullIdx + 1);
        return { type, body };
    }

    /**
     * Parse a Git tree object body into entries: [{mode, name, hash}, ...]
     * Tree format: "<mode> <name>\0<20-byte-sha1>" repeated
     */
    function parseTreeEntries(body) {
        const entries = [];
        let i = 0;
        while (i < body.length) {
            // Find the null byte separating "mode name" from the hash
            const nullPos = body.indexOf(GIT_BLOB_DELIMITER, i);
            if (nullPos === -1 || nullPos + 1 + SHA1_SIZE > body.length) break;

            const header = body.substring(i, nullPos);
            const spacePos = header.indexOf(' ');
            if (spacePos === -1) break;

            const mode = header.substring(0, spacePos);
            const name = header.substring(spacePos + 1);

            // Read 20-byte SHA1 hash
            let hash = "";
            for (let j = nullPos + 1; j < nullPos + 1 + SHA1_SIZE; j++) {
                let chr = body.charCodeAt(j).toString(16);
                hash += chr.length < 2 ? "0" + chr : chr;
            }

            entries.push({ mode, name, hash });
            i = nullPos + 1 + SHA1_SIZE;
        }
        return entries;
    }

    /**
     * Get the tree hash from a commit object body.
     * Commit format: "tree <hash>\nparent <hash>\n..."
     */
    function getTreeFromCommit(commitBody) {
        const match = commitBody.match(/^tree ([a-f0-9]{40})/);
        return match ? match[1] : null;
    }

    /**
     * Decompress a raw object buffer and return its string content.
     * Caches results in decompressedObjects map.
     */
    function decompressObject(hash) {
        if (decompressedObjects.has(hash)) return decompressedObjects.get(hash);

        // Find the raw file in downloadedFiles
        const objPath = GIT_OBJECTS_PATH + hash.slice(0, 2) + "/" + hash.slice(2);
        const file = downloadedFiles.find(f => f[0] === objPath);
        if (!file) return null;

        try {
            const words = new Uint8Array(file[1]);
            const data = pako.ungzip(words);
            const str = arrayBufferToString(data);
            decompressedObjects.set(hash, str);
            return str;
        } catch (e) {
            debugLog("Failed to decompress object:", hash, e);
            return null;
        }
    }

    /**
     * Recursively traverse a tree and collect all files.
     * Returns [{path, hash, content}, ...] for blobs
     * Inspired by GitTools extractor.sh traverse_tree()
     */
    function traverseTree(treeHash, basePath) {
        const extractedFiles = [];
        const raw = decompressObject(treeHash);
        if (!raw) return extractedFiles;

        const parsed = parseGitObject(raw);
        if (!parsed || parsed.type !== "tree") return extractedFiles;

        const entries = parseTreeEntries(parsed.body);
        for (const entry of entries) {
            const fullPath = basePath ? basePath + "/" + entry.name : entry.name;

            if (entry.mode.startsWith("4")) {
                // Directory (mode 40000) — recurse
                const subFiles = traverseTree(entry.hash, fullPath);
                extractedFiles.push(...subFiles);
            } else {
                // Blob (file) — extract content
                const blobRaw = decompressObject(entry.hash);
                if (blobRaw) {
                    const blobParsed = parseGitObject(blobRaw);
                    if (blobParsed && blobParsed.type === "blob") {
                        extractedFiles.push({
                            path: fullPath,
                            content: blobParsed.body
                        });
                    }
                }
            }
        }
        return extractedFiles;
    }

    /**
     * Main extraction: find all commit objects, get their trees,
     * traverse trees to extract source files.
     * Returns a Map of filepath → content (latest commit wins)
     */
    function extractSourceFiles() {
        const allFiles = new Map();
        let commitCount = 0;
        let errorCount = 0;

        // Find all downloaded object files
        const objectFiles = downloadedFiles.filter(f =>
            f[0].startsWith("objects/") &&
            !f[0].startsWith("objects/info/") &&
            !f[0].startsWith("objects/pack/")
        );

        debugLog("Extraction: processing", objectFiles.length, "objects");
        sendDownloadStatus(baseUrl, { ...downloadStatus, phase: "Extracting..." });

        for (const file of objectFiles) {
            // Reconstruct hash from path: objects/ab/cdef... → abcdef...
            const pathParts = file[0].replace("objects/", "").split("/");
            if (pathParts.length !== 2) continue;
            const hash = pathParts[0] + pathParts[1];

            try {
                const raw = decompressObject(hash);
                if (!raw) continue;

                const parsed = parseGitObject(raw);
                if (!parsed) continue;

                if (parsed.type === "commit") {
                    commitCount++;
                    const treeHash = getTreeFromCommit(parsed.body);
                    if (treeHash) {
                        const files = traverseTree(treeHash, "");
                        for (const f of files) {
                            // Latest commit's version overwrites older ones
                            allFiles.set(f.path, f.content);
                        }
                    }
                }
            } catch (e) {
                errorCount++;
                debugLog("Extraction error for object", hash, e);
            }
        }

        debugLog("Extraction complete:", commitCount, "commits,",
            allFiles.size, "files extracted,", errorCount, "errors");
        return { files: allFiles, commits: commitCount, errors: errorCount };
    }


    // ─── ZIP Creation (with extraction) ───
    function downloadZip() {
        if (running_tasks === 0 && waiting === 0) {
            notification("Download status", "Extracting source files...");
            sendDownloadStatus(baseUrl, { ...downloadStatus, phase: "Extracting..." });

            let zip = new JSZip();
            let filename = baseUrl.replace(/^http(s?):\/\//i, "").replace(/[.:@]/g, "_");

            // 1. Add raw .git files
            let rawFolder = zip.folder(filename + "_raw_git");
            downloadedFiles.forEach(function (file) {
                rawFolder.file(file[0], file[1], {arrayBuffer: true});
            });

            // 2. Run extraction — reconstruct actual source files
            let extractionReport = "";
            try {
                const result = extractSourceFiles();

                if (result.files.size > 0) {
                    let sourceFolder = zip.folder(filename + "_source");
                    result.files.forEach(function (content, filepath) {
                        sourceFolder.file(filepath, content);
                    });
                    extractionReport += "=== EXTRACTION SUCCESSFUL ===\n";
                    extractionReport += "Commits found: " + result.commits + "\n";
                    extractionReport += "Source files extracted: " + result.files.size + "\n";
                    extractionReport += "Errors: " + result.errors + "\n\n";
                    extractionReport += "Extracted files:\n";
                    result.files.forEach(function (_, filepath) {
                        extractionReport += "  " + filepath + "\n";
                    });

                    notification("Download status",
                        "Extracted " + result.files.size + " source files from " +
                        result.commits + " commits");
                } else {
                    extractionReport += "=== EXTRACTION: NO FILES RECOVERED ===\n";
                    extractionReport += "Commits found: " + result.commits + "\n";
                    extractionReport += "Errors: " + result.errors + "\n";
                    extractionReport += "\nPossible reasons:\n";
                    extractionReport += "  - Repository uses pack files (not fully supported in-browser)\n";
                    extractionReport += "  - Objects were incomplete or corrupted\n";
                    extractionReport += "  - Server blocked access to key objects\n";
                    extractionReport += "\nThe raw .git data is still included — use git-dumper or\n";
                    extractionReport += "GitTools Extractor locally for full recovery.\n";
                }
            } catch (e) {
                extractionReport += "=== EXTRACTION FAILED ===\n";
                extractionReport += "Error: " + e.message + "\n";
                extractionReport += "\nThe raw .git data is still included in the ZIP.\n";
                debugLog("Extraction failed:", e);
            }

            // 3. Add stats
            let strStatus = STATUS_DESCRIPTION;
            Object.keys(downloadStats).forEach(function (key) {
                strStatus += "\n" + key + ": " + downloadStats[key];
            });
            zip.file("DownloadStats.txt", strStatus);
            zip.file("ExtractionReport.txt", extractionReport);

            // 4. Generate and download
            notification("Download status", "Creating ZIP...");
            sendDownloadStatus(baseUrl, { ...downloadStatus, phase: "Zipping..." });

            if (typeof URL.createObjectURL === 'function') {
                zip.generateAsync({type: "blob"}).then(function (zipBlob) {
                    chrome.downloads.download({
                        url: URL.createObjectURL(zipBlob),
                        filename: `${filename}.zip`
                    });
                    downloadFinished(fileExist, downloadStats);
                });
            } else {
                zip.generateAsync({type: "base64"}).then(function (zipData) {
                    chrome.downloads.download({
                        url: `data:application/octet-stream;base64,${zipData}`,
                        filename: `${filename}.zip`
                    });
                    downloadFinished(fileExist, downloadStats);
                });
            }
        }
    }


    function downloadFile(path, decompress, callback) {
        if (walkedPaths.includes(path)) { downloadZip(); return; }
        if (failedInARow > failed_in_a_row) { downloadZip(); return; }

        if (running_tasks >= max_connections) {
            waiting++;
            setTimeout(function () {
                waiting--;
                downloadFile(path, decompress, callback);
            }, ((waiting * wait) <= max_wait) ? (waiting * wait) : max_wait);
        } else {
            walkedPaths.push(path);
            running_tasks++;
            downloadStatus.total++;

            fetch(baseUrl + GIT_PATH + path, {
                redirect: "manual",
                headers: {"Accept": "text/html"},
            }).then(function (response) {
                downloadStats[response.status] = (typeof downloadStats[response.status] === "undefined") ? 1 : downloadStats[response.status] + 1;
                if (response.ok && response.status === 200) {
                    fileExist = true;
                    downloadStatus.successful++;
                    failedInARow = 0;
                    sendDownloadStatus(baseUrl, downloadStatus);
                    return response.arrayBuffer();
                }
                running_tasks--;
                downloadStatus.failed++;
                failedInARow++;
                sendDownloadStatus(baseUrl, downloadStatus);
            }).then(function (buffer) {
                if (typeof buffer !== "undefined") {
                    downloadedFiles.push([path, buffer]);
                    const words = new Uint8Array(buffer);

                    if (decompress) {
                        try {
                            let data = pako.ungzip(words);
                            callback(arrayBufferToString(data));
                        } catch (e) { /* do nothing */ }
                    } else {
                        callback(arrayBufferToString(words));
                    }
                    running_tasks--;
                }
                downloadZip();
            });
        }
    }


    function checkTree(result) {
        if (result.startsWith(GIT_TREE_HEADER)) {
            for (let i = 0; i < result.length; i++) {
                if (result[i] === GIT_BLOB_DELIMITER && i + 1 + SHA1_SIZE <= result.length) {
                    let hash = "";
                    for (let j = i + 1; j < i + 1 + SHA1_SIZE; j++) {
                        let chr = result.charCodeAt(j).toString(16);
                        hash += chr.length < 2 ? "0" + chr : chr;
                    }
                    let path = GIT_OBJECTS_PATH + hash.slice(0, 2) + "/" + hash.slice(2);
                    downloadFile(path, true, checkResult);
                }
            }
        }
    }

    function checkObject(result) {
        let matches;
        const search = new RegExp(GIT_OBJECTS_SEARCH, "g");
        while ((matches = search.exec(result)) !== null) {
            if (matches.index === search.lastIndex) search.lastIndex++;
            for (let i = 0; i < matches.length; i++) {
                let path = GIT_OBJECTS_PATH + matches[i].slice(0, 2) + "/" + matches[i].slice(2);
                downloadFile(path, true, checkResult);
            }
        }
    }

    function checkPack(result) {
        let matches;
        const search = new RegExp(GIT_PACK_SEARCH, "g");
        while ((matches = search.exec(result)) !== null) {
            if (matches.index === search.lastIndex) search.lastIndex++;
            for (let i = 0; i < matches.length; i++) {
                downloadFile(GIT_PACK_PATH + matches[i] + GIT_PACK_EXT, false, function () {});
                downloadFile(GIT_PACK_PATH + matches[i] + GIT_IDX_EXT, false, function () {});
            }
        }
    }

    function checkResult(result) {
        checkTree(result);
        checkObject(result);
        checkPack(result);
    }

    // ─── Start: try directory listing first, then well-known paths ───
    tryDirectoryListing(function(hasListing) {
        if (!hasListing) {
            debugLog("No directory listing — using well-known paths + object discovery");
            for (let i = 0; i < GIT_WELL_KNOW_PATHS.length; i++) {
                downloadFile(GIT_WELL_KNOW_PATHS[i], false, checkResult);
            }
            setTimeout(function() { discoverDynamicRefs(); }, 3000);
        }
    });
}


// ═══════════════════════════════════════════════════════════════════════
//  OPTIONS / SETTINGS
// ═══════════════════════════════════════════════════════════════════════

function set_options(options) {
    wait = options.download.wait;
    max_wait = options.download.max_wait;
    max_connections = options.download.max_connections;
    failed_in_a_row = options.download.failed_in_a_row;
    notification_new_git = options.notification.new_git;
    notification_download = options.notification.download;
    check_opensource = options.check_opensource;
    check_securitytxt = options.check_securitytxt;
    check_git = options.functions.git;
    check_svn = options.functions.svn;
    check_hg = options.functions.hg;
    check_env = options.functions.env;
    check_ds_store = options.functions.ds_store;
    debug = options.debug;
    check_failed = options.check_failed;
    blacklist = options.blacklist;
}

function checkOptions(default_options, storage_options) {
    for (let [key] of Object.entries(default_options)) {
        if (typeof storage_options[key] === "object") {
            storage_options[key] = checkOptions(default_options[key], storage_options[key]);
        } else if (typeof storage_options[key] === "undefined") {
            storage_options[key] = default_options[key];
        }
    }
    return storage_options;
}


// ═══════════════════════════════════════════════════════════════════════
//  MESSAGE HANDLERS
// ═══════════════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    debugLog('Received message:', msg.type);

    if (msg.type === "FINDINGS_FOUND") {
        chrome.storage.local.get(["withExposedGit"], async (result) => {
            try {
                let withExposedGit = result.withExposedGit || [];
                const data = msg.data;
                const origin = data.url;
                let updatedList = false;
                let newFindings = [];

                for (const type of data.types) {
                    const findingUrl = origin + (
                        type === 'git' ? GIT_PATH :
                        type === 'svn' ? SVN_PATH :
                        type === 'hg' ? HG_PATH :
                        type === 'env' ? ENV_PATH :
                        DS_STORE
                    );

                    if (!withExposedGit.some(item =>
                        item.url === origin && item.type === type
                    )) {
                        withExposedGit.push({
                            type: type,
                            url: origin,
                            open: data.opensource || false,
                            securitytxt: data.securitytxt || false,
                            foundAt: findingUrl
                        });
                        updatedList = true;
                        newFindings.push({type, findingUrl});
                    }
                }

                if (updatedList) {
                    await chrome.storage.local.set({withExposedGit});
                    await setBadge();

                    if (newFindings.length > 0) {
                        const title = newFindings.length === 1
                            ? `Exposed ${newFindings[0].type} found!`
                            : 'Multiple exposures found!';
                        const message = newFindings.length === 1
                            ? `Found at: ${newFindings[0].findingUrl}`
                            : newFindings.map(f => `${f.type}: ${f.findingUrl}`).join('\n');
                        chrome.notifications.create({
                            type: "basic",
                            iconUrl: chrome.runtime.getURL(EXTENSION_ICON["48"]),
                            title: title,
                            message: message
                        });
                    }
                }
                sendResponse({status: true});
            } catch (error) {
                debugLog('Error processing findings:', error);
                sendResponse({status: false, error: error.message});
            }
        });
        return true;
    } else if (msg.type === "download") {
        notification("Download status", "Download started\nFetching objects, then extracting source...");
        startDownload(msg.url, async (fileExist, downloadStats) => {
            let strStatus = Object.entries(downloadStats)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n');

            const downloading = await chrome.storage.local.get(["downloading"]);
            if (downloading.downloading?.length) {
                const index = downloading.downloading.indexOf(msg.url);
                if (index > -1) {
                    downloading.downloading.splice(index, 1);
                    await chrome.storage.local.set({downloading: downloading.downloading});
                }
            }

            notification("Download status",
                fileExist
                ? `Downloaded & extracted ${msg.url}\n${strStatus}`
                : `Failed to download ${msg.url}\nNo files found\n${strStatus}`
            );
            sendResponse({status: fileExist});
        });
        return true;
    } else if (msg.type === "REQUEST_GIT_CHECK") {
        const {origin} = msg;
        chrome.storage.local.get(["options", "checked"], async (result) => {
            const options = result.options || DEFAULT_OPTIONS;
            const alreadyChecked = result.checked || [];
            if (!options.functions.git || alreadyChecked.includes(origin)) {
                sendResponse({shouldFetch: false}); return;
            }
            alreadyChecked.push(origin);
            await chrome.storage.local.set({checked: alreadyChecked});
            sendResponse({shouldFetch: true});
        });
        return true;
    }

    // Handle simple option updates
    const optionHandlers = {
        'git': () => check_git = msg.value,
        'svn': () => check_svn = msg.value,
        'hg': () => check_hg = msg.value,
        'env': () => check_env = msg.value,
        'ds_store': () => check_ds_store = msg.value,
        'notification_new_git': () => notification_new_git = msg.value,
        'notification_download': () => notification_download = msg.value,
        'check_opensource': () => check_opensource = msg.value,
        'check_securitytxt': () => check_securitytxt = msg.value,
        'debug': () => debug = msg.value,
        'max_connections': () => max_connections = msg.value,
        'wait': () => wait = msg.value,
        'max_wait': () => max_wait = msg.value,
        'failed_in_a_row': () => failed_in_a_row = msg.value,
        'blacklist': () => blacklist = msg.value
    };

    if (optionHandlers[msg.type]) {
        optionHandlers[msg.type]();
        sendResponse({status: true});
        return false;
    }

    if (msg.type === "check_failed") {
        check_failed = msg.value;
        try { chrome.webRequest.onErrorOccurred.removeListener(processListener); } catch (e) {}
        if (msg.value) {
            chrome.webRequest.onErrorOccurred.addListener(processListener, {urls: ["<all_urls>"]});
        }
        sendResponse({status: true});
        return false;
    }

    if (msg.type === "reset_options") {
        chrome.storage.local.set({options: DEFAULT_OPTIONS});
        set_options(DEFAULT_OPTIONS);
        sendResponse({status: true, options: DEFAULT_OPTIONS});
        return false;
    }

    return false;
});


// ═══════════════════════════════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════

chrome.storage.local.get(["checked", "withExposedGit", "options"], function (result) {
    if (typeof result.checked === "undefined") {
        result = { checked: [], withExposedGit: [] };
        chrome.storage.local.set(result);
    }
    if (typeof result.options === "undefined") {
        result.options = DEFAULT_OPTIONS;
        chrome.storage.local.set({options: DEFAULT_OPTIONS});
    }
    // upgrade 3.7.4 => 4.0
    if (typeof result.options.functions === "undefined" || (typeof result.withExposedGit[0] !== "undefined" && typeof result.withExposedGit[0].type === "undefined")) {
        let urls = [];
        result.options.functions = DEFAULT_OPTIONS.functions;
        result.withExposedGit.forEach(function (url) { urls.push({type: "git", url: url}); });
        result.withExposedGit = urls;
        chrome.storage.local.set({withExposedGit: result.withExposedGit});
    }

    chrome.storage.local.set({options: checkOptions(DEFAULT_OPTIONS, result.options)});
    set_options(result.options);

    chrome.webRequest.onCompleted.addListener(
        details => processListener(details), {urls: ["<all_urls>"]}
    );
    if (check_failed) {
        chrome.webRequest.onErrorOccurred.addListener(
            details => processListener(details), {urls: ["<all_urls>"]}
        );
    }
    chrome.webRequest.onHeadersReceived.addListener(
        details => processListener(details), {urls: ["<all_urls>"]}
    );
});

chrome.storage.local.set({ downloading: [] });

async function requestPermissions() {
    try {
        const granted = await chrome.permissions.request({
            origins: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"]
        });
        return granted;
    } catch (error) { return false; }
}

async function processListener(details) {
    const origin = new URL(details.url).origin;
    if (!check_failed && (details.error || details.statusCode >= 400)) return;
    if (processingUrls.has(origin)) return;

    try {
        processingUrls.add(origin);
        const hasPermissions = await chrome.permissions.contains({ origins: [origin + "/*"] });
        if (!hasPermissions && !(await requestPermissions())) return;

        const result = await chrome.storage.local.get(["checked", "options"]);
        const options = result.options || DEFAULT_OPTIONS;
        const alreadyChecked = result.checked || [];
        if (alreadyChecked.includes(origin) || checkBlacklist(new URL(origin).hostname)) return;

        alreadyChecked.push(origin);
        await chrome.storage.local.set({checked: alreadyChecked});

        const tabReady = await new Promise((resolve) => {
            const listener = (tabId, changeInfo, tab) => {
                try {
                    if (new URL(tab.url).origin === origin && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve(tab);
                    }
                } catch (e) {}
            };
            chrome.tabs.onUpdated.addListener(listener);
        });
        if (!tabReady) return;

        const isContentScriptAvailable = await new Promise(resolve => {
            chrome.tabs.sendMessage(tabReady.id, {type: "PING"}, response => {
                resolve(!chrome.runtime.lastError);
            });
        });
        if (!isContentScriptAvailable) {
            await chrome.scripting.executeScript({ target: {tabId: tabReady.id}, files: ['content_script.js'] });
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        await chrome.tabs.sendMessage(tabReady.id, { type: "CHECK_SITE", url: origin, options: options });
    } catch (error) {
        debugLog('Error in processListener:', error);
    } finally {
        processingUrls.delete(origin);
    }
}

function checkBlacklist(hostname) {
    for (const b of blacklist) {
        let splits = b.split('*');
        if (splits[1] !== "undefined") {
            let parts = [];
            splits.forEach(el => parts.push(escapeRegExp(el)));
            let re = new RegExp(parts.join('.*'));
            if (re.test(hostname) === true) return true;
        }
    }
    return false;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install' || details.reason === 'update') {
        await chrome.storage.local.set({
            checked: [], withExposedGit: [], downloading: [], options: DEFAULT_OPTIONS
        });
        const hasPermissions = await chrome.permissions.contains({
            origins: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"]
        });
        if (!hasPermissions) {
            notification("Welcome to DotGit Enhanced!", "Click the extension icon to get started.");
        }
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.withExposedGit) {
        debugLog('Storage updated - findings:', changes.withExposedGit.newValue?.length || 0);
    }
});
