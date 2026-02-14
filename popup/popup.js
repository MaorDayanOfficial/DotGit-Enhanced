// DotGit Enhanced — Popup Script
// Original by davtur19, UI enhanced

// Firefox view-source prefix
let HREF_PREFIX = "";
if (typeof browser !== "undefined") {
    HREF_PREFIX = "view-source:";
}

let debug = false;

function debugLog(...args) {
    if (debug) {
        console.log('[DotGit]', ...args);
    }
}

// Badge setup (cross-browser)
if (typeof chrome.browserAction !== "undefined" && typeof chrome.browserAction.setBadgeText !== "undefined") {
    chrome.browserAction.setBadgeText({ text: "" });
} else if (typeof chrome.action !== "undefined" && typeof chrome.action.setBadgeText !== "undefined") {
    chrome.action.setBadgeText({ text: "" });
}


// ─── Build Finding Items ──────────────────────────────────────────────
function addElements(element, array, callback, downloading, max_sites) {
    const emptyState = document.getElementById("emptyState");

    if (array.length === 0) {
        emptyState.style.display = "flex";
        return;
    }
    emptyState.style.display = "none";

    // Compute stats
    let gitCount = 0, envCount = 0, svnCount = 0, otherCount = 0;

    for (let i = array.length - 1; i > -1; i--) {
        if (i <= array.length - max_sites) break;

        const type = callback(array[i].type);
        if (type === "git") gitCount++;
        else if (type === "env") envCount++;
        else if (type === "svn") svnCount++;
        else otherCount++;

        // Create finding item
        const li = document.createElement("li");
        li.className = "finding-item";
        li.style.animationDelay = `${(array.length - 1 - i) * 30}ms`;

        // Type badge
        const badge = document.createElement("span");
        badge.className = `finding-type-badge badge-${type}`;
        badge.textContent = type === "ds_store" ? "DS" : type.toUpperCase();
        li.appendChild(badge);

        // URL
        const urlWrap = document.createElement("span");
        urlWrap.className = "finding-url";
        const link = document.createElement("a");

        if (type === "git") link.setAttribute("href", HREF_PREFIX + callback(array[i].url) + "/.git/config");
        else if (type === "svn") link.setAttribute("href", HREF_PREFIX + callback(array[i].url) + "/.svn/");
        else if (type === "hg") link.setAttribute("href", HREF_PREFIX + callback(array[i].url) + "/.hg/");
        else if (type === "env") link.setAttribute("href", HREF_PREFIX + callback(array[i].url) + "/.env");
        else if (type === "ds_store") link.setAttribute("href", HREF_PREFIX + callback(array[i].url) + "/.DS_Store");

        link.textContent = callback(array[i].url);
        link.title = callback(array[i].url);
        urlWrap.appendChild(link);
        li.appendChild(urlWrap);

        // Actions container
        const actions = document.createElement("div");
        actions.className = "finding-actions";

        // Download button (git only)
        if (type === "git") {
            // Download status
            const dsText = document.createElement("span");
            dsText.className = "download-status-text";
            dsText.id = "ds:" + callback(array[i].url);
            dsText.textContent = "";
            actions.appendChild(dsText);

            const dlBtn = document.createElement("button");
            dlBtn.className = "action-btn download-btn" + (downloading.includes(callback(array[i])) ? " disabled" : "");
            dlBtn.id = "db:" + callback(array[i].url);
            dlBtn.title = "Download .git folder as ZIP";
            dlBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
            // Mark as download class for click handler
            dlBtn.classList.add("download");
            actions.appendChild(dlBtn);

            // Open source icon
            const openVal = callback(array[i].open);
            if (openVal !== "false" && openVal !== "undefined") {
                const osBtn = document.createElement("a");
                osBtn.className = "action-btn opensource-btn";
                osBtn.title = "Open source repository";
                osBtn.href = (openVal === "true") ? "about:blank" : openVal;
                osBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
                actions.appendChild(osBtn);
            }
        }

        // Security.txt icon
        const secVal = callback(array[i].securitytxt);
        if (secVal !== "false" && secVal !== "undefined") {
            const secBtn = document.createElement("a");
            secBtn.className = "action-btn security-btn";
            secBtn.title = "Has security.txt";
            secBtn.href = HREF_PREFIX + secVal;
            secBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
            actions.appendChild(secBtn);
        }

        // Delete button
        const delBtn = document.createElement("button");
        delBtn.className = "action-btn delete-btn delete";
        delBtn.id = "del:" + type + ":" + callback(array[i].url);
        delBtn.title = "Remove from list";
        delBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        actions.appendChild(delBtn);

        li.appendChild(actions);
        element.appendChild(li);
    }

    // Update stat counters
    document.getElementById("totalCount").textContent = array.length;
    document.getElementById("gitCount").textContent = gitCount;
    document.getElementById("envCount").textContent = envCount;
    document.getElementById("svnCount").textContent = svnCount;
    document.getElementById("otherCount").textContent = otherCount;
}


// ─── Click Handlers ───────────────────────────────────────────────────
document.addEventListener("click", async (event) => {
    const button = event.target.closest("[id]");
    if (!button) return;

    if (button.id === "request-permissions") {
        await requestPermissions();
    } else if (button.id === "reset") {
        chrome.storage.local.set({
            checked: [],
            withExposedGit: [],
            downloading: []
        }, () => {
            window.location.reload();
        });
    } else if (button.classList.contains("download")) {
        const url = button.id.substring(3);
        button.classList.add("disabled");
        chrome.storage.local.get(["downloading"], function (downloading) {
            if (typeof downloading.downloading !== "undefined" && downloading.downloading.length !== 0) {
                downloading.downloading.push(url);
                chrome.storage.local.set({ downloading: downloading.downloading });
            } else {
                chrome.storage.local.set({ downloading: [url] });
            }
        });
        chrome.runtime.sendMessage({ type: "download", url: url }, function () {
            button.classList.remove("disabled");
        });
    } else if (button.classList.contains("delete")) {
        const split = button.id.split(":");
        const type = split[1];
        const url = split.slice(2).join(":");
        let indexDelete = null;

        button.classList.add("disabled");
        chrome.storage.local.get(["withExposedGit"], function (result) {
            result.withExposedGit.forEach(function (obj, i) {
                if (obj.type === type && obj.url === url) {
                    indexDelete = i;
                }
            });

            if (indexDelete !== null) {
                result.withExposedGit.splice(indexDelete, 1);
                const item = button.closest(".finding-item");
                if (item) {
                    item.style.opacity = "0";
                    item.style.transform = "translateX(20px)";
                    item.style.transition = "all 0.2s";
                    setTimeout(() => item.remove(), 200);
                }

                // Update stats
                document.getElementById("totalCount").textContent = result.withExposedGit.length;
                const hostTitle = document.getElementById("hostsFoundTitle");
                if (hostTitle) {
                    const split2 = hostTitle.textContent.split(" ");
                    const strTitle = split2.slice(3).join(" ");
                    hostTitle.textContent = "Total found: " + result.withExposedGit.length + " " + strTitle;
                }

                chrome.storage.local.set({ withExposedGit: result.withExposedGit });

                if (result.withExposedGit.length === 0) {
                    document.getElementById("emptyState").style.display = "flex";
                }
            }
        });
    } else if (button.id === "options") {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL("options.html"));
        }
    } else if (button.id === "about") {
        window.open(chrome.runtime.getURL("about.html"));
    }
});


// ─── Load Data ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
    chrome.storage.local.get(["options"], function (result) {
        if (result.options && typeof result.options.debug !== "undefined") {
            debug = result.options.debug;
        }
    });

    chrome.storage.local.get(["withExposedGit", "downloading", "options"], function (visitedSite) {
        if (visitedSite.options) {
            let max_sites = visitedSite.options.max_sites || 100;
            let hostElementFoundTitle = document.getElementById("hostsFoundTitle");
            hostElementFoundTitle.textContent = "Total found: 0 Max shown: " + max_sites;
        }

        if (typeof visitedSite.withExposedGit !== "undefined" && visitedSite.withExposedGit.length !== 0) {
            let max_sites = visitedSite.options.max_sites || 100;
            let hostElementFoundTitle = document.getElementById("hostsFoundTitle");
            hostElementFoundTitle.textContent = "Total found: " + visitedSite.withExposedGit.length + " Max shown: " + max_sites;

            let hostElementFound = document.getElementById("hostsFound");
            const dl = (typeof visitedSite.downloading !== "undefined" && visitedSite.downloading.length !== 0)
                ? visitedSite.downloading : [];

            addElements(hostElementFound, visitedSite.withExposedGit, function (url) {
                return `${url}`;
            }, dl, max_sites);
        }
    });

    // Permission check (Firefox)
    if (typeof browser !== "undefined") {
        checkPermissions().then(hasPermissions => {
            document.getElementById("permissions-banner").style.display = hasPermissions ? "none" : "block";
        });
    } else {
        document.getElementById("permissions-banner").style.display = "none";
    }
});


// ─── Download Status Updates ──────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === "downloadStatus") {
        const el = document.getElementById("ds:" + request.url);
        if (!el) { sendResponse({status: true}); return true; }

        let downloadStatusText = el.textContent;
        if (downloadStatusText === "") downloadStatusText = "0/0/0";
        let arr = downloadStatusText.split("/");

        if (request.downloadStatus.successful) arr[0] = request.downloadStatus.successful.toString();
        if (request.downloadStatus.failed) arr[1] = request.downloadStatus.failed.toString();
        if (request.downloadStatus.total) arr[2] = request.downloadStatus.total.toString();

        el.textContent = arr.join("/");
    }
    sendResponse({status: true});
    return true;
});


// ─── Permission Helpers ───────────────────────────────────────────────
async function checkPermissions() {
    try {
        if (typeof browser === "undefined") return true;
        return await browser.permissions.contains({
            origins: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"]
        });
    } catch (error) {
        debugLog("Error checking permissions:", error);
        return false;
    }
}

async function requestPermissions() {
    try {
        if (typeof browser === "undefined") return true;
        const granted = await browser.permissions.request({
            origins: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"]
        });
        if (granted) {
            document.getElementById("permissions-banner").style.display = "none";
            window.location.reload();
        }
        return granted;
    } catch (error) {
        debugLog("Error requesting permissions:", error);
        return false;
    }
}
