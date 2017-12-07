/*
Author: Oleksii Starov

This content script is supposed to run in main frame of each opened tab,
and it calls the periodical updates to trackers and scores.

The script lives as long as the visited website is open, 
and thus information about trackers and the tab scores are always up-to-date.

Finally, it send message "PM_SubmitReport" to submit report for crowdsourcing 
when the page is about to close.

*/

var updateTrackers = function() {
    chrome.runtime.sendMessage({req: "PM_UpdateTrackers"});
};

var updateScores= function() {
    chrome.runtime.sendMessage({req: "PM_UpdateScores"});
};

var start = function() {
    // Request the updates
    updateTrackers();
    updateScores();
    
    // And repeat!
    setInterval(updateTrackers, 1000);
    setInterval(updateScores, 1000);
};

setTimeout(start, 1000);

// Do not forget to send the report to backend
window.onbeforeunload = function(event) {
    chrome.runtime.sendMessage({req: "PM_SubmitReport"});
};

