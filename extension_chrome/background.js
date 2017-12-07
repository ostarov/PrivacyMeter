/*
Author: Oleksii Starov

The main background script.

*/

/*************************************************************************************************** GLOBAL VARIABLES */

const BACKEND_SERVER = "";
// Crawl or run ID to support separate distributions
var CRAWL_IDENTIFIER = "";

// Check for the source-code distribution
if (!BACKEND_SERVER || BACKEND_SERVER == "") {
    alert("PrivacyMeter runs without any back-end server specified!");
}
    
// Dictionaries to keep current map of the tab-website-score data

var SITES_BY_TAB = {};  // look up website record (i.e., page) by its tab
var SITES_BY_URL = {};  // look up website record (i.e., page) by its url
var SCORE_BY_TAB = {};  // look up score records by tab id

var IP2LOCATION = [];   // the ip-to-country mapper


/*************************************************************************************************** CONFIGURATION */

function showInstallNotice() {
    // True first time (ignoring own version and browser updates)
    if (localStorage.getItem('install_time')) return;
    localStorage.setItem('install_time', (new Date().getTime()));
    
    chrome.tabs.create({url: "options.html"});
}

chrome.runtime.onInstalled.addListener(function() {
    // Flushing the cash of web requests
    chrome.webRequest.handlerBehaviorChanged();
    // Starting the user interface
    setDefaultBadge();
    showInstallNotice();
});

// All the configuration logic
function config() {
    // 1 - Update and load the EasyPrivacy filters
    
    var parseFilters = function(text) {
        // Saving the received filters to the local storage
        chrome.storage.local.set({"easyprivacy": text});
        // Parsing and adding the filters to the matcher
        var res = text.split("\n");
        for (var i = 0; i < res.length; ++i) {
            // TODO: In the future, we want to add the support of websockets!
            if (res[i].length > 0 && res[i][0] !== '!' && res[i].indexOf("websocket") === -1) {
                defaultMatcher.add(Filter.fromText(res[i]));
            }
        }
    };
    
    // First, trying to download the up-to-date list
    sendRequest("GET", "https://easylist.to/easylist/easyprivacy.txt", false, null, function(text) {
        parseFilters(text);
        LOG("New filters are loaded.");
    }, function() {
        // Second, trying to restore from the local storage
        chrome.storage.local.get("easyprivacy", function(items) {
            if (items["easyprivacy"]) {
                parseFilters(items[""]);
                LOG("Stored filters are loaded.");
            }
            else {
                // Third, loading from the bundle
                sendRequest("GET", "assets/easyprivacy.txt", true, null, function(text) {
                    parseFilters(text);
                    LOG("Initial filters are loaded.");
                });
            }
        });
    });
        
    // 2 - Update and load the benchmarks
        
    sendRequest("GET", BACKEND_SERVER + "/stats?run_id=" + CRAWL_IDENTIFIER, false, null, function(text) {
        // Initializing the global variable
        BENCHMARKS = JSON.parse(text);
        
        // Saving the received benchmarks to the local storage
        chrome.storage.local.set({"benchmarks": BENCHMARKS});
                
        LOG("New benchmarks are loaded.");
        
    }, function() {
        chrome.storage.local.get("benchmarks", function(items) {
            // Initializing the global variable
            BENCHMARKS = items["benchmarks"];

            LOG("Old benchmarks are loaded.");
        });
        
        // Note: default in-bundle stats assigned with the declaration in default-stats.js
        
    });
    
    // 3 - Load the ip-to-geolocation engine (only from the local copy)
        
    sendRequest("GET", "assets/IP2LOCATION-LITE-DB1.CSV", true, null, function(text) {
        var res = text.split("\n");
        for (var i = 0; i < res.length; ++i) {
            var tmp = res[i].split('"');
            var l = parseInt(tmp[1]);
            var r = parseInt(tmp[3]);
            var country = tmp[7];
            IP2LOCATION.push({'l': l, 'r': r, 'country': country})     
        }
        
        LOG("Geolocation loaded.");
    });
}

// When background reloads
config();
    
// A helper function to search the IP2LOCATION database
function parseIP4toInt(ip) {
    var tmp = ip.split('.');
    if (tmp.length != 4) return NaN; 
    var segment1 = parseInt(tmp[0]);
    var segment2 = parseInt(tmp[1]);
    var segment3 = parseInt(tmp[2]);
    var segment4 = parseInt(tmp[3]);
    
    var res = segment4 + (segment3 * 256) + (segment2 * 65536) + (segment1 * 16777216);
 
    return res;
}

// Binary search on the sorted IP2LOCATION databse
// TODO: In the future, we want to support IP6!
function mapIP4toCountry(ip) {
    if (!ip) return "Unknown"; 
    var target_ip = parseIP4toInt(ip);
    if (isNaN(target_ip)) return "Unknown";
    
    var min_index = 0;
    var max_index = IP2LOCATION.length - 1;
    var cur_index;
    var cur_block;
 
    while (min_index <= max_index) {
        cur_index = (min_index + max_index) / 2 | 0;
        cur_block = IP2LOCATION[cur_index];
 
        if (cur_block.r < target_ip) {
            min_index = cur_index + 1;
        }
        else if (cur_block.l > target_ip) {
            max_index = cur_index - 1;
        }
        else {
            break;
        }
    }
    
    return cur_block.country;
}

/*************************************************************************************************** TRAFFIC ANALYSIS */

/*
* Given details of a chrome web request, decide if we 
* want to bail in our handler
*/
function shouldIgnoreRequest(details) {
    return details.tabId < 0 || (details.url.indexOf("http") !== 0);
}

function releaseOldTab(tab_id) {
    if (!SITES_BY_TAB[tab_id]) return;
    delete SITES_BY_URL[SITES_BY_TAB[tab_id]["url"]];
    delete SITES_BY_TAB[tab_id];
    delete SCORE_BY_TAB[tab_id];
}

function registerWebsite(details) {
    // First of all, releasing older info
    releaseOldTab(details.tabId);

    // Extracting the URLs
    var currentURL = new URL(details.url);
    var tld1 = getDomain(currentURL.hostname);

    // New website object
    var new_website = {};
    new_website['url'] = getUrlKey(details.url);
    new_website['query'] = getUrlQuery(details.url);
    new_website['domain'] = currentURL.hostname;
    new_website['tld1'] = tld1;
    new_website['server'] = 'unknown';
    new_website['trackers'] = {};
    new_website['iframes'] = {};
    new_website['forms'] = {};
    new_website['inclusions'] = {};
    new_website['fapis'] = {};
    new_website["category"] = "unspecified";

    // Adding website
    SITES_BY_TAB[details.tabId] = new_website;
    SITES_BY_URL[getUrlKey(details.url)] = new_website;
}

chrome.webNavigation.onCommitted.addListener(
    function(details) {
        if (details.frameId !== 0) return;
        if (shouldIgnoreRequest(details)) return;
        if (!SITES_BY_TAB[details.tabId]) return;
        
        //LOG(">>> Navigate: " + details.url + "\t" + details.tabId);
        
        // Saving the main headers information
        var server = SITES_BY_TAB[details.tabId]['server'];
        var p3p = SITES_BY_TAB[details.tabId]['P3P'];
        var ip = SITES_BY_TAB[details.tabId]['ip'];
        var country = SITES_BY_TAB[details.tabId]['country_of_server'];
        var category = SITES_BY_TAB[details.tabId]['category'];
        
        registerWebsite(details);
        
        SITES_BY_TAB[details.tabId]['server'] = server;
        SITES_BY_TAB[details.tabId]['P3P'] = p3p;
        SITES_BY_TAB[details.tabId]['ip'] = ip;
        SITES_BY_TAB[details.tabId]['country_of_server'] = country;
        SITES_BY_TAB[details.tabId]['category'] = category;
    },{
        urls: ["http://*/*", "https://*/*"],
        types: ["main_frame"]
    }
);

chrome.webRequest.onBeforeRequest.addListener(
    function(details) {
        if (shouldIgnoreRequest(details)) return;    
        
        var isMainFrame = (details.type === "main_frame");
        var currentURL = new URL(details.url);
        var tld1 = getDomain(currentURL.hostname);
        
        // Check if the request is for a PM extension page and handle it
        if (isMainFrame) {
            //LOG("Main frame: " + details.url + "\t" + details.timeStamp);
            // Just temporary before navigation occurs
            registerWebsite(details);
        }
        
        if (!isMainFrame) {
            var parent_website = SITES_BY_TAB[details.tabId];
            if (parent_website === undefined) return;

            // Collecting mixed inclusions
            var mainUrl = new URL(parent_website['url']);
            if (mainUrl.protocol === 'https' && currentURL.protocol === 'http') {
                parent_website["inclusions"][details.url] = {"type": details.type, "url": details.url};
            }

            // ABP's stringify and types
            var urlString = exports.stringifyURL(currentURL);
            var requestType;
            
            if (details.type === "sub_frame") {
                // Collecting third-party iframes
                if (tld1 !== parent_website.tld1) {
                    parent_website['iframes'][details.frameId] = {
                        'url': details.url, 
                        'frameId': details.frameId, 
                        'reqType': details.type, 
                        'parentFrameId': details.parentFrameId
                    }
                    
                }
                requestType = "SUBDOCUMENT";
            }
            else {
                requestType = details.type.toUpperCase();
            }
            
            // Uses ABP code detect trackers and checks for the tld1 matches
            var filter = defaultMatcher.matchesAny(
                urlString, RegExpFilter.typeMap[requestType], parent_website.domain, tld1 !== parent_website.tld1
            );
            
            // Collecting third-party trackers
            if (filter instanceof BlockingFilter) {
                parent_website['trackers'][tld1] = {
                    'tracker': tld1, 
                    'url': details.url, 
                    'filter': filter.text, 
                    'frameId': details.frameId, 
                    'reqType': details.type, 
                    'parentFrameId': details.parentFrameId
                };
            }
        }
        
        return {cancel: false};
    },
    {urls: ["http://*/*", "https://*/*"]},
    ["blocking"]
);

// Analyzing the SERVER and P#P headers
chrome.webRequest.onHeadersReceived.addListener(
    function(details) {
        for (var i = 0; i < details.responseHeaders.length; ++i) {
            var header = details.responseHeaders[i];
            if (header.name.toLowerCase() === "server" && header.value) {
                var website = SITES_BY_TAB[details.tabId];
                if (website["server"] !== header.value) {
                    website["server"] = header.value;
                }
            }
            if (header.name.toLowerCase() === "p3p" && header.value) {
                var website = SITES_BY_TAB[details.tabId];
                if (website["P3P"] !== header.value) {
                    website["P3P"] = header.value;
                }
            }
        }
    }, {
        urls: ["http://*/*", "https://*/*"],
        types: ["main_frame"]
    },
    ["responseHeaders"]
);

// Capturing the IP and location of the servers
chrome.webRequest.onResponseStarted.addListener(
    function(details) {
        if (!details.ip) return;
        var website = SITES_BY_TAB[details.tabId];
        if (website) {
            if (details.type === "main_frame") {
                website["ip"] = details.ip;
                website["country_of_server"] = mapIP4toCountry(details.ip);
            }
            else {
                // Checking for a relevant tracker
                var tld1 = getDomain((new URL(details.url)).hostname);
                var tracker = website["trackers"][tld1];
                if (tracker) {
                    tracker["ip"] = details.ip;
                    tracker["country"] = mapIP4toCountry(details.ip);
                }
            }
        }
    }, {
        urls: ["http://*/*", "https://*/*"]
    }
);
    
/*************************************************************************************************** SCORE & BADGE */

function setDefaultBadge(tab_id) {
    chrome.browserAction.disable(tab_id);
    chrome.browserAction.setBadgeText({text: "⧖", "tabId": tab_id});
    chrome.browserAction.setIcon({path: "pm-icon.png", "tabId": tab_id});
    chrome.browserAction.setBadgeBackgroundColor({color: "#539FF3", "tabId": tab_id});
}

chrome.tabs.onActivated.addListener(
    function(activeInfo) {
        if (SCORE_BY_TAB[activeInfo.tabId] != undefined && SCORE_BY_TAB[activeInfo.tabId]["count"] != undefined) {
            chrome.browserAction.enable(activeInfo.tabId);
            chrome.browserAction.setBadgeText({text: SCORE_BY_TAB[activeInfo.tabId]["count"].toString(), "tabId": activeInfo.tabId});
            chrome.browserAction.setIcon({path: "pm-icon-" + SCORE_BY_TAB[activeInfo.tabId]["worst"] + ".png", "tabId": activeInfo.tabId});
        } else {
            setDefaultBadge(activeInfo.tabId);
        }
    }
);

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab){
    if (changeInfo.url && tab.active) {
        setDefaultBadge(tab.id);
    }
});

chrome.tabs.onCreated.addListener(function(tab) {
    setDefaultBadge(tab.id);
});

chrome.tabs.onRemoved.addListener(function(tab_id, remove_info) {
    releaseOldTab(tab_id); 
});

function updateScoresForTab(tabid) {
    var website = SITES_BY_TAB[tabid];
    if (website) {
        var category = CACHED_CATEGORIES.search(website["tld1"]);
        website["category"] = (category) ? category : "unspecified";
        // Basically, that's it
        var scores = calculateScores(website);
        setScoresForTab(scores, tabid); 
    }
}

function setScoresForTab(scores, tabid) {
    SCORE_BY_TAB[tabid] = scores;
    chrome.tabs.query({active : true, currentWindow: true}, function (tabs) {
        if (tabs[0] != undefined)
        {
            if (tabid == tabs[0].id &&  SCORE_BY_TAB[tabid] != undefined && SCORE_BY_TAB[tabid]["count"] != undefined)
            {
                chrome.browserAction.enable(tabid);
                chrome.browserAction.setBadgeText({text: SCORE_BY_TAB[tabid]["count"].toString(), "tabId": tabid});
                chrome.browserAction.setIcon({path: "pm-icon-" + scores["worst"] + ".png", "tabId": tabid});
                chrome.browserAction.setBadgeBackgroundColor({ color: scores["worst"], "tabId": tabid});
            }
        }
    });
}
    
/*************************************************************************************************** CALLS TO BACKEND */

/*
* Makes a request to the server supplying a full report of the tracking fingerprint
* of the visited page. Waits to make sure no error was returned.
*/
var sendReport = function(payload) {
    // We will send stats to the backend only if the user has opt in!
    if (!OPTIONS["crowdsourcing"]) return;
    sendRequest("POST", BACKEND_SERVER + "/report", false, payload, function(text) {
        LOG("Report sent."); 
    });
}

var updateTrackers = function(tabid) {   
    if (!SITES_BY_TAB[tabid]) return;
    website = SITES_BY_TAB[tabid];

    // Selecting what trackers we need to query
    var unprocessed_trackers = [];

    for (var tld1 in website["trackers"]) {
        var tracker = website["trackers"][tld1];
        if (tracker["processed"]) continue;
        var wot = CACHED_TRACKERS.search(tld1);
        if (wot !== null) {
            tracker["wot_data"] = wot;
            tracker["processed"] = true;
        }
        else {
            unprocessed_trackers.push(tracker);
            // Regardless of the success calling the server, temorary - processed!
            tracker["processed"] = true;
        }
    }
    
    if (unprocessed_trackers.length > 0) {
        //LOG("-> requesting trackers info.");
        var payload = JSON.stringify({'trackers': unprocessed_trackers, 'run_id': CRAWL_IDENTIFIER});
        sendRequest("POST", BACKEND_SERVER + "/trackers", false, payload, function(text) {
            var data = JSON.parse(text);
            var website = SITES_BY_TAB[tabid];
            if (website) {  // Website still exists
                var to_cache = [];
                for (var i = 0; i < data["trackers"].length; ++i) {
                    var tld1 = data["trackers"][i]["tracker"];
                    website['trackers'][tld1]["wot_data"] = data["trackers"][i]["wot_data"]
                    website['trackers'][tld1]["processed"] = true;
                    to_cache.push({"key": tld1, "info": data["trackers"][i]["wot_data"]});
                }
                CACHED_TRACKERS.insert(to_cache);
            }

        }, function() {
            //LOG("Couldn't receive WOT information from server.")
        });
    }
}

function reportTheCategory(domain, category) {
    // First, save it locally to cache
    CACHED_CATEGORIES.insert([{"key": domain, "info": category}]);
    // Second, send it to the backend
    var payload =  JSON.stringify({'domain': domain, "category": category, 'run_id': CRAWL_IDENTIFIER});
    sendRequest("POST", BACKEND_SERVER + "/report_category", false, payload);
}


/*************************************************************************************************** MESSAGES */

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    // Processing all the incoming messages
    if (request.req === "PM_FormsFound") {  // Receiving information from monitor-forms.js
        var website = SITES_BY_TAB[sender.tab.id];
        if (website) {
            // Updating information about leaky forms per frame
            website.forms[request.frame] = request.forms;
        }
    }
    else if (request.req == "PM_GetTabURL") {   // Configurational call from monitor-forms.js
        var website = SITES_BY_TAB[sender.tab.id];
        if (website) {
            // Responding back with frame ID, URL, and the tab's domain
            sendResponse({tab_domain: website['tld1'], frame_id: sender.frameId, frame_url: sender.url});
        }
    }
    else if (request.req === "PM_FingerprintCalls") {   // Receiving information from monitor-fapis.js
        var website = SITES_BY_TAB[sender.tab.id];
        if (website) {
            // Aggregating FAPIs received from different content scripts
            for (var api in request.data) {
                var prev = website.fapis[api] !== undefined ? website.fapis[api] : 0;
                website.fapis[api] = prev + request.data[api];  // cumulative number of calls!
            }
        }
    }
    else if (request.req === "PM_UpdateScores") {   // Call for score updates from engine-client.js
        updateScoresForTab(sender.tab.id);
    }
    else if (request.req === "PM_UpdateTrackers") { // Call for tracker updates from engine-client.js
        updateTrackers(sender.tab.id);
    }
    else if (request.req === "PM_SubmitReport") {   // Call to send the report
        var website = SITES_BY_TAB[sender.tab.id];
        if (website) {
            //LOG("Send report: " + JSON.stringify(website, null, 4));
            website["run_id"] = CRAWL_IDENTIFIER;
            sendReport(JSON.stringify(website));
        }
    }
    
});





