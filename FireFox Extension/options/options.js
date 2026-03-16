// DotGit Enhanced — Options Script
// Original by davtur19, UI enhanced

function set_gui(options) {
    // Toggles (checkboxes)
    document.getElementById("gitOn").checked = options.functions.git;
    document.getElementById("svnOn").checked = options.functions.svn;
    document.getElementById("hgOn").checked = options.functions.hg;
    document.getElementById("envOn").checked = options.functions.env;
    document.getElementById("ds_storeOn").checked = options.functions.ds_store;
    document.getElementById("debugOn").checked = options.debug;
    document.getElementById("checkFailedOn").checked = options.check_failed;
    document.getElementById("on1").checked = options.notification.new_git;
    document.getElementById("on2").checked = options.notification.download;
    document.getElementById("on3").checked = options.check_opensource;
    document.getElementById("on4").checked = options.check_securitytxt;

    // Number inputs
    document.getElementById("max_sites").value = options.max_sites;
    document.getElementById("max_connections").value = options.download.max_connections;
    document.getElementById("failed_in_a_row").value = options.download.failed_in_a_row;
    document.getElementById("wait").value = options.download.wait;
    document.getElementById("max_wait").value = options.download.max_wait;

    // Textarea
    document.getElementById("blacklist").value = options.blacklist.join(", ");
}

document.addEventListener("DOMContentLoaded", function () {
    chrome.storage.local.get(["options"], function (result) {
        set_gui(result.options);

        document.addEventListener("change", (e) => {
            const id = e.target.id;
            const name = e.target.name;

            // Toggle-based function settings
            if (name === "git" || name === "svn" || name === "hg" || name === "env" || name === "ds_store") {
                result.options.functions[name] = e.target.checked;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: name, value: e.target.checked }, function () {});
            }
            // Notification toggles
            else if (name === "notification_new_git") {
                result.options.notification.new_git = e.target.checked;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: name, value: e.target.checked }, function () {});
            }
            else if (name === "notification_download") {
                result.options.notification.download = e.target.checked;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: name, value: e.target.checked }, function () {});
            }
            // Analysis toggles
            else if (name === "check_opensource") {
                result.options.check_opensource = e.target.checked;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: name, value: e.target.checked }, function () {});
            }
            else if (name === "check_securitytxt") {
                result.options.check_securitytxt = e.target.checked;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: name, value: e.target.checked }, function () {});
            }
            else if (name === "debug") {
                result.options.debug = e.target.checked;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: name, value: e.target.checked }, function () {});
            }
            else if (name === "check_failed") {
                result.options.check_failed = e.target.checked;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: name, value: e.target.checked }, function () {});
            }
            // Number inputs
            else if (e.target.validity.valid && id === "max_sites") {
                result.options.max_sites = e.target.value;
                chrome.storage.local.set(result);
            }
            else if (e.target.validity.valid && (id === "max_connections" || id === "wait" || id === "max_wait" || id === "failed_in_a_row")) {
                result.options.download[id] = e.target.value;
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: id, value: e.target.value }, function () {});
            }
            // Blacklist textarea
            else if (id === "blacklist") {
                result.options.blacklist = e.target.value.replace(/\s/g, "").split(",").filter(el => el !== "");
                chrome.storage.local.set(result);
                chrome.runtime.sendMessage({ type: id, value: result.options.blacklist }, function () {});
            }
        });

        // Reset button
        document.addEventListener("click", (e) => {
            if (e.target.id === "reset_default" || e.target.closest("#reset_default")) {
                chrome.runtime.sendMessage({ type: "reset_options" }, function (response) {
                    if (response && response.options) {
                        result.options = response.options;
                        set_gui(response.options);
                    }
                });
            }
        });
    });
});
