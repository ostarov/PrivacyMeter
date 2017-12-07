/*
Author: Oleksii Starov

This script for options.html saves and restores the extension's setting from the "sync" storage:
- binary options: crowdsourcing enabled, highlight leaky forms, warn about general security flaws;
- settings of each of the four widgets: selected engine, baseline levelm and the show issue flag.

*/

// Saves preferences to chrome.storage
function save_options() {
    this.blur();
    chrome.storage.sync.set({
        crowdsourcing: document.getElementById('crowdsourcing').checked,
        mark_forms: document.getElementById('mark_forms').checked, 
        warn_security: document.getElementById('warn_security').checked,
        trackers_engine: document.getElementById('trackers_engine').value,
        trackers_baseline: document.getElementById('trackers_baseline').value,
        trackers_issues: document.getElementById('trackers_issues').checked,
        fingerprinting_engine: document.getElementById('fingerprinting_engine').value,
        fingerprinting_baseline: document.getElementById('fingerprinting_baseline').value,
        fingerprinting_issues: document.getElementById('fingerprinting_issues').checked,
        thirdparties_engine: document.getElementById('thirdparties_engine').value,
        thirdparties_baseline: document.getElementById('thirdparties_baseline').value,
        thirdparties_issues: document.getElementById('thirdparties_issues').checked,
        leakyforms_engine: document.getElementById('leakyforms_engine').value,
        leakyforms_baseline: document.getElementById('leakyforms_baseline').value,
        leakyforms_issues: document.getElementById('leakyforms_issues').checked,
    }, function() {
        // Update status to let user know options were saved
        var status = document.getElementById('status');
        status.textContent = 'Configuration saved.';
        setTimeout(function() {
            status.textContent = '';
        }, 1000);
    });
}

// Restores preferences from chrome.storage
function restore_options() {
    chrome.storage.sync.get({
        crowdsourcing: true,
        mark_forms: true, 
        warn_security: true,
        trackers_engine: "sigma",
        trackers_baseline: "green",
        trackers_issues: true,
        fingerprinting_engine: "sigma",
        fingerprinting_baseline: "green",
        fingerprinting_issues: true,
        thirdparties_engine: "sigma",
        thirdparties_baseline: "green",
        thirdparties_issues: true,
        leakyforms_engine: "sigma",
        leakyforms_baseline: "green",
        leakyforms_issues: true,
    }, function(items) {
        document.getElementById('crowdsourcing').checked = items.crowdsourcing;
        document.getElementById('mark_forms').checked = items.mark_forms;
        document.getElementById('warn_security').checked = items.warn_security;
        document.getElementById('trackers_engine').value = items.trackers_engine;
        document.getElementById('trackers_baseline').value = items.trackers_baseline;
        document.getElementById('trackers_issues').checked = items.trackers_issues;
        document.getElementById('fingerprinting_engine').value = items.fingerprinting_engine;
        document.getElementById('fingerprinting_baseline').value = items.fingerprinting_baseline;
        document.getElementById('fingerprinting_issues').checked = items.fingerprinting_issues;
        document.getElementById('thirdparties_engine').value = items.thirdparties_engine;
        document.getElementById('thirdparties_baseline').value = items.thirdparties_baseline;
        document.getElementById('thirdparties_issues').checked = items.thirdparties_issues;
        document.getElementById('leakyforms_engine').value = items.leakyforms_engine;
        document.getElementById('leakyforms_baseline').value = items.leakyforms_baseline;
        document.getElementById('leakyforms_issues').checked = items.leakyforms_issues;
  });
}

document.getElementById('save').addEventListener('click', save_options);
document.addEventListener('DOMContentLoaded', restore_options);

