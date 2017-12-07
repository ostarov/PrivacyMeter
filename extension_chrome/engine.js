/*
Author: Oleksii Starov

This script implements all the logic for the privacy score computation, based on the benchmarks,
as well as extracting warnings about specific issues. Finally, it listens for the options change,
to apply proper settings while evaluating the privacy practices.

*/

// Possible rating levels
var ScoreLevels = {
    SEVERE: "red",
    WARNING: "orange",
    GOOD: "green",
    UNKNOWN: "gray"
};

// Four main widgets for stats
var ScoreWidgets = {
    Trackers: "trackers",
    Fingerprinting: "fingerprinting",
    Thirdparties: "mixed-contents",
    Leakyforms: "leaky-forms",
    General: "general",
};

/* Comparative engines and helping functions */

function applyEngine(widget, stats, value) {
    if (OPTIONS[widget + "_engine"] == "quartile") {
        return quartileEngine(stats, value, OPTIONS[widget + "_baseline"]);
    }
    else {
        return sigmaEngine(stats, value, OPTIONS[widget + "_baseline"]); 
    }
}

// Calculate the score based on SD
var quartileEngine = function(stats, value, base_level) {
    var q3 = parseFloat(stats["q3"]);

    if (value < q3) {
        // Base level (default is good == safe)
        return (base_level) ? base_level : ScoreLevels.GOOD;
    } 
    else {  // Only two options with these engine!
        return ScoreLevels.SEVERE;
    }
};


// Calculate the score based on SD
var sigmaEngine = function(stats, value, base_level) {
    var mean = parseFloat(stats["mean"]);
    var sigma = parseFloat(stats["sd"]);
    var value = parseFloat(value);

    if (value < mean + sigma) {
        // Base level (default is good == safe)
        return (base_level) ? base_level : ScoreLevels.GOOD;
    } 
    else if (value < mean + (sigma * 2)) {
        // Medium level (default is warning == considerable)
        return (base_level == ScoreLevels.SEVERE) ? ScoreLevels.SEVERE : ScoreLevels.WARNING;
    }
    else {
        // High level (in any case would be severe)
        return ScoreLevels.SEVERE;
    }
};

// Calculate the score based on threshold
var thresholdEngine = function(low, mid, high, value) {
    if (value <= low) {
        return ScoreLevels.GOOD;
    }
    else if (value <= mid) {
        return ScoreLevels.WARNING;
    }
    else {
        return ScoreLevels.SEVERE;
    }
};

// Helping utility
var getWorseRating = function(a, b) {
    if (a === b) return a;
    if (a === ScoreLevels.SEVERE || b === ScoreLevels.SEVERE) {
        return ScoreLevels.SEVERE;
    }
    if(a === ScoreLevels.WARNING || b === ScoreLevels.WARNING) {
        return ScoreLevels.WARNING;
    }
    return ScoreLevels.GOOD;
};

var STRING_MAX_LEN = 50
// Truncate a long string to n chars + el;ipses
var truncateString = function(str) {
    return str.length <= STRING_MAX_LEN ? str : str.substr(0, STRING_MAX_LEN);
};

var escapeString = function(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
};

var prepareString = function(str) {
    return escapeString(truncateString(str));
};

/* Calculating results for trackers... */

var TRACKERS = {
    "Number": {
        "green": "The number of trackers on this page is <u><i>SAFE</i></u>",
        "orange": "The number of trackers on this page is <u><i>CONSIDERABLE</i></u>",
        "red": "The number of trackers on this page is <u><i>DANGEROUS</i></u>"
    },
    "Location": {
        "green": "Locations of trackers are consitent with this page",
        "orange": "There are international trackers on this page",
        "red": "There are many international trackers on this page"
    },
    "Reputation": {
        "green": "All trackers on this page look reputable",
        "red": "There are trackers with low WOT reputation on this page"
    }
};

// Output is the correctly formatted dictionary for handlerating
var handleTrackersWidget = function(data, benchmarks) {
    var output = {};
    
    // List of unique trackers
    var trackers = data["trackers"];
    
    // Preparing data for the main plot
    output["plot"] = {};
    output["plot"]["benchmarks"] = benchmarks["tracker_count"];
    output["plot"]["current"] = Object.keys(trackers).length;
    var numberScore = applyEngine("trackers", benchmarks["tracker_count"], Object.keys(trackers).length);
    var msg = TRACKERS["Number"][numberScore] + " (" + Object.keys(trackers).length + "):<br/>";
    output["plot"]["score"] = numberScore;
    msg += "<ul>";
    var sortedTrackers = sortDictionaryKeys(trackers);
    for (var i in sortedTrackers) {
        msg += '<li>' + sortedTrackers[i] + '</li>';
    }
    msg += "</ul>";
    output["plot"]["message"] = msg;
    
    // Calculating separate issues:
    output["problems"] = [];
    if (OPTIONS["trackers_issues"] == false) return output;
    
    // Foreign trackers
    var foreignInfo = "The webpage you are visiting originates from <u><i>" + data["country_of_server"] + "</u></i>.<br/>";
    var foreignList = "<ul>";
    // Handle location of some trackers vs. location of serving web server
    var foreignCount = 0;
    for (var i in trackers) {
        if (!trackers[i]["country"] || !data["country_of_server"]) continue;
        if (trackers[i]["country"] !== data["country_of_server"]) {
            foreignCount++;
            foreignList += "<li>" + truncateString(trackers[i]["tracker"]) + " from <u><i>" + trackers[i]["country"] + "</u></i></li>";
        }
    }
    foreignList += "</ul>";
    foreignInfo += "The following foreign trackers are present on this page (" + foreignCount + "):<br/>";
    foreignInfo += foreignList;
    var locationScore = thresholdEngine(0, 1, Infinity, foreignCount);
    if (locationScore != ScoreLevels.GOOD) {
        output["problems"].push({message: TRACKERS["Location"][locationScore], color: locationScore, info: foreignInfo});
    }
    
    // Untrusted trackers
    var shadyList = "<ul>";
    var shadyCount = 0;
    for (var i in trackers) {
        if (!trackers[i]["wot_data"]) continue;
        if (parseInt(trackers[i]["wot_data"]["wot_trust_score"]) < 40 &&
            parseInt(trackers[i]["wot_data"]["wot_trust_confidence"]) >= 10) {
            shadyCount += 1
            shadyList += "<li>" + truncateString(trackers[i]["tracker"]) + "</li>";
        }
    }
    shadyList += "</ul>"
    var shadyInfo = "The following low-reputable trackers are present on this page (" + shadyCount + "):<br/>";
    shadyInfo += shadyList;
    var shadyScore = thresholdEngine(0, 0, Infinity, shadyCount);
    if (shadyScore != ScoreLevels.GOOD) {
        output["problems"].push({message: TRACKERS["Reputation"][shadyScore], color: shadyScore, info: shadyInfo});
    }
    
    // TODO: add NAI?
    
    output["problems"].sort(function(a, b) {
        if (a.color == ScoreLevels.SEVERE) return -1;
        return 1;
    });
    return output;
};


/* Calculating results for fingerprinting... */

var FINGERPRINTING = {
    "Cardinality": {
        "green": "The number of fingerprinting APIs called is <u><i>SAFE</i></u>",
        "orange": "The number of fingerprinting APIs called is <u><i>CONSIDERABLE</i></u>",
        "red": "The number of fingerprinting APIs called is <u><i>DANGEROUS</i></u>"
    },
    "Number": {
        "orange": "This website queries information about your browser considerably",
        "red": "This website queries information about your browser extensively"
    },
};

var handleFingerprintingWidget = function(data, benchmarks) {
    var output = {};
    
    // Preparing data for the main plot
    output["plot"] = {};
    output["plot"]["benchmarks"] = benchmarks["fapi_cardinality"];
    output["plot"]["current"] = Object.keys(data["fapis"]).length;
    output["plot"]["score"] = applyEngine("fingerprinting", benchmarks["fapi_cardinality"], Object.keys(data["fapis"]).length);
    var msg = FINGERPRINTING["Cardinality"][output["plot"]["score"]] + " (" + Object.keys(data["fapis"]).length + "):<br/><ul>";
    var sortedFapis = sortDictionaryByValue(data["fapis"]);
    var overall_calls = 0;
    for (var i in sortedFapis) {
        msg += "<li>" + sortedFapis[i][0] + " : " + sortedFapis[i][1] + " calls </li>";
        overall_calls += sortedFapis[i][1];
    }
    msg += "</ul>";
    output["plot"]["message"] = msg;
    
    // Calculating separate issues:
    output["problems"] = [];
    if (OPTIONS["fingerprinting_issues"] == false) return output;
    
    // Overall count of calls
    var overallScore = applyEngine("fingerprinting", benchmarks["fapi_raw_count"], overall_calls);
    if (overallScore == ScoreLevels.WARNING || overallScore == ScoreLevels.SEVERE) {
        var overallInfo = "This website called fingerprinting APIs more than " + overall_calls + " times:<br/><ul>";
        for (var i in sortedFapis) {
            overallInfo += "<li>" + sortedFapis[i][0] + " : " + sortedFapis[i][1] + " calls </li>";
        }
        overallInfo += "</ul>";
        output["problems"].push({message: FINGERPRINTING["Number"][overallScore], color: overallScore, info: overallInfo});
    }
    
    output["problems"].sort(function(a, b) {
        if (a.color == ScoreLevels.SEVERE) return -1;
        return 1;
    });
    return output;
};


/* Calculating results for iframes... */

var IFRAMES = {
    "Count": {
        "green": "The number of third-party iframes on this page is <u><i>SAFE</i></u>",
        "orange": "The number of third-party iframes on this page is <u><i>CONSIDERABLE</i></u>",
        "red": "The number of third-party iframes on this page is <u><i>DANGEROUS</i></u>"
    }
};

var handleThirdpartiesWidget = function(data, benchmarks) {
    var output = {};
    
    // Preparing data for the plot
    output["plot"] = {};
    output["plot"]["benchmarks"] = benchmarks["tp_iframe_count"];
    output["plot"]["current"] = Object.keys(data["iframes"]).length;
    output["plot"]["score"] = applyEngine("thirdparties", benchmarks["tp_iframe_count"], Object.keys(data["iframes"]).length);
    var msg = IFRAMES["Count"][output["plot"]["score"]] + " (" + Object.keys(data["iframes"]).length + "):<br/><ul>";
    var sortedIframes = [];
    for (var key in data["iframes"]) {
        sortedIframes.push(data["iframes"][key]["url"]);
    }
    sortedIframes.sort();
    for (var i in sortedIframes) {
        msg += "<li>" + prepareString(sortedIframes[i]) + "</li>";
    }
    msg += "</ul>";
    output["plot"]["message"] = msg;
    
    // Calculating issues
    output["problems"] = [];
    if (OPTIONS["thirdparties_issues"] == false) return output;
    
    // TODO: overlapped iframes?
    
    output["problems"].sort(function(a, b) {
        if (a.color == ScoreLevels.SEVERE) return -1;
        return 1;
    });
    return output;
};


/* Calculating results for leaky forms... */

var FORMS = {
    "Number": {
        "green": "The number of problematic forms on this page is <u><i>SAFE</i></u>",
        "orange": "The number of problematic forms on this page is <u><i>CONSIDERABLE</i></u>",
        "red": "The number of problematic forms on this page is <u><i>DANGEROUS</i></u>"
    },
    "GET": {
        "orange": "There are leaky GET forms on this page",
        "red": "There are leaky GET forms with many inputs on this page"
    },
    "HTTP": {
        "orange": "There are unprotected non-HTTPS forms on this page",
        "red": "There are unprotected non-HTTPS form with many inputs on this page"
    },
    "Thirdparty": {
        "orange": "There are third-party forms on this page",
        "red": "There are third-party forms with many inputs on this page"
    },
    "Password": {
        "red": "Passwords on this page are submitted insecurely"
    }
}

var handleLeakyformsWidget = function(data, benchmarks) {
    var output = {};
    
    var forms = [];
    for (var frame in data["forms"]) {
        for (var i = 0; i < data["forms"][frame].length; ++i) {
            forms.push(data["forms"][frame][i]);
        }
    }
    
    var getForms = [];
    var httpForms = [];
    var tpForms = [];
    var passForms = [];
    
    // Preparing data for the plot
    output["plot"] = {};
    output["plot"]["benchmarks"] = benchmarks["form_count"];
    output["plot"]["current"] = forms.length; 
    output["plot"]["score"] = applyEngine("leakyforms", benchmarks["form_count"], forms.length);
    
    var msg = FORMS["Number"][output["plot"]["score"]] + " (" + forms.length + "):<br/><ul>";
    
    for (var i = 0; i < forms.length; ++i) {
        var form = forms[i];
        
        msg += "<li>" + prepareString(form["action"]) + " :";
        if (form["method"] === "get") {
            msg += ' <span class="text-danger">GET</div>';
            getForms.push(form);
        }
        if (form["protocol"] === "http") {
            msg += ' <span class="text-danger">HTTP</div>';
            httpForms.push(form);
        }
        if (form["tp"] === true) {
            msg += ' <span class="text-danger">Third-Party</div>';
            tpForms.push(form);
        }
        msg += "</li>";
        
        if (form["has_pass"]) {
             passForms.push(form);
        }
    }
    msg += "</ul>";
    
    output["plot"]["message"] = msg;
    
    // Calculating issues
    output["problems"] = [];
    if (OPTIONS["leakyforms_issues"] == false) return output;
    
    // Third-party forms
    if (tpForms.length > 0) {
        var thirdpartyInfo = "The following forms submit to third parties (" + tpForms.length + "):<br/><ul>";
        var thirdpartyScore = ScoreLevels.WARNING;
        for (var i in tpForms) {
            var form = tpForms[i];
            thirdpartyInfo += "<li>" + prepareString(form["action"]) + "</li>";
            // Special condition for severity of the warning
            if (form["visible_inputs_length"] > 2 && form["action"] != "(unknown)") {
                thirdpartyScore = ScoreLevels.SEVERE;
            }
        }
        thirdpartyInfo += "</ul>";
        output["problems"].push({message: FORMS["Thirdparty"][thirdpartyScore], color: thirdpartyScore, info: thirdpartyInfo});
    }
    
    // HTTP forms
    if (httpForms.length > 0) {
        var httpInfo = "The following forms submit over insecure HTTP (" + httpForms.length + "):<br/><ul>";
        var httpScore = ScoreLevels.WARNING;
        for (var i in httpForms) {
            var form = httpForms[i];
            httpInfo += "<li>" + prepareString(form["action"]) + "</li>";
            // Special condition for severity of the warning
            if (form["visible_inputs_length"] > 2) {
                httpScore = ScoreLevels.SEVERE;
            }
        }
        httpInfo += "</ul>";
        output["problems"].push({message: FORMS["HTTP"][httpScore], color: httpScore, info: httpInfo});
    }
    
    // GET forms
    if (getForms.length > 0) {
        var getInfo = "The following forms submit with leaky HTTP GET (" + getForms.length + "):<br/><ul>";
        var getScore = ScoreLevels.WARNING;
        for (var i in getForms) {
            var form = getForms[i];
            getInfo += "<li>" + prepareString(form["action"]) + "</li>";
            // Special condition for severity of the warning
            if (form["visible_inputs_length"] > 2) {
                getScore = ScoreLevels.SEVERE;
            }
        }
        getInfo += "</ul>";
        output["problems"].push({message: FORMS["GET"][getScore], color: getScore, info: getInfo});
    }
    
    // Passwords
    if (passForms.length > 0) {
        var passInfo = "The following forms submit passwords insecurely (" + passForms.length + "):<br/><ul>";
        var passScore = ScoreLevels.SEVERE;
        for (var i in passForms) {
            var form = passForms[i];
            passInfo += "<li>" + prepareString(form["action"]) + " :";
            if (form["method"] === "get") passInfo += ' <span class="text-danger">GET</div>';
            if (form["protocol"] === "http") passInfo += ' <span class="text-danger">HTTP</div>';
            if (form["tp"] === true) passInfo += ' <span class="text-danger">Third-Party</div>';
            passInfo += "</li>";
        }
        passInfo += "</ul>";
        output["problems"].push({message: FORMS["GET"][passScore], color: passScore, info: passInfo});
    }
    
    output["problems"].sort(function(a, b) {
        if (a.color == ScoreLevels.SEVERE) return -1;
        return 1;
    });
    return output;
};
    
/* General security signals */

var SECURITY = {
    "Mixed": {
        "orange": "This HTTPS page requests unprotected HTTP resources",
        "red": "This HTTPS page requests unprotected HTTP scripts"
    },
    "Apache-Version": {
        "green": "Up-to-date Apache Version",
        "red": "The website is hosted on a known outdated server"
    },
    "P3P": {
        "green": "This site has a published P3P policy",
        "gray": "This site does not have a published P3P policy"
    }
};

var handleGeneralWidget = function(data) {
    var output = {};
    output["problems"] = [];
    if (OPTIONS["warn_security"] == false) return output;
    
    // Mixed inclusions
    if (data["inclusions"].length > 0) {
        var mixedInfo = "There the following unsafe resources loaded into the page (" + data["inclusions"].length + "):<br/><ul>";
        var mixedScore = ScoreLevels.WARNING;
        for (var i = 0; i < data["inclusions"].length; ++i) {
            var inclusion = data["inclusions"][i];
            if (inclusion["type"] === "script") {
                mixedScore = ScoreLevels.SEVERE;
                mixedInfo += "<li>A script resource, loaded from " + prepareString(inclusion["url"]) + "</li>";
            }
            else if (inclusion["type"] === "image") {
                mixedInfo += "<li>An image resource, loaded from " + prepareString(inclusion["url"]) + "</li>";
            }
        }
        mixedInfo += "</ul>";
        output["problems"].push({message: SECURITY["Mixed"][mixedScore], color: mixedScore, info: mixedInfo});
    }
    
    // Server version
    if (data["server"].includes("Apache/")) {
        var serverInfo = "The following vulnerable server version is being used on this page: <br/>";
        var serverScore = ScoreLevels.WARNING;
        var version = parseFloat(data["server"].split("Apache/")[1].split(" ")[0]); // may return NaN
        if (version < 2.2) {
            serverInfo += '<span class="text-danger">' + prepareString(data["server"]) + '</span>';
            serverScore = ScoreLevels.SEVERE;
        }
        output["problems"].push({message: SECURITY["Apache-Version"][serverScore], color: serverScore, info: serverInfo});
    }
    
    output["problems"].sort(function(a, b) {
        if (a.color == ScoreLevels.SEVERE) return -1;
        return 1;
    });
    
    // P3P policy (only good - in the end, so no need to sort!)
    if (data["P3P"] != undefined) {
        var p3pInfo = "The following P3P information is present by the website: <br/>";
        p3pInfo += '<span class="text-info">' + prepareString(data["P3P"]) + '</span>';
        output["problems"].push({message: SECURITY["P3P"][ScoreLevels.GOOD], color: ScoreLevels.GOOD, info: p3pInfo});
    }
    
    return output;
};

/* MAIN FUNCTIONS */

// Calculate a tab's score based on the provided stats
var calculateScores = function(data) {
    // Preparing the overall results
    var scores = {};
    scores["category"] = data["category"];

    for (var category in BENCHMARKS) {
        // Calculating stats per category
        var cur_benchmarks = BENCHMARKS[category];
        scores[category] = {};
        scores[category]["widgets"] = {};

        // Adding details separately per each widget
        scores[category]["widgets"][ScoreWidgets.Trackers] = handleTrackersWidget(data, cur_benchmarks);
        scores[category]["widgets"][ScoreWidgets.Fingerprinting] = handleFingerprintingWidget(data, cur_benchmarks);
        scores[category]["widgets"][ScoreWidgets.Thirdparties] = handleThirdpartiesWidget(data, cur_benchmarks);
        scores[category]["widgets"][ScoreWidgets.Leakyforms] = handleLeakyformsWidget(data, cur_benchmarks);
        scores[category]["widgets"][ScoreWidgets.General] = handleGeneralWidget(data);

        // Claculating the overol scores
        var worstRating = ScoreLevels.GOOD;
        var issuesCount = 0;

        for (var widget in scores[category]["widgets"]) {
            if (scores[category]["widgets"][widget]["plot"] != undefined) {
                var tempScore = scores[category]["widgets"][widget]["plot"]["score"];
                worstRating = getWorseRating(worstRating, tempScore);
                if (tempScore != ScoreLevels.GOOD) issuesCount++;
            }
            for (var problem in scores[category]["widgets"][widget]["problems"]) {
                tempScore = scores[category]["widgets"][widget]["problems"][problem]["color"];
                worstRating = getWorseRating(worstRating, tempScore);
                if (tempScore != ScoreLevels.GOOD) issuesCount++;
            }
        }

        scores[category]["worst"] = worstRating;
        scores[category]["count"] = issuesCount;
    }

    // For PrivacyMeter's icon
    scores["worst"] = scores[scores["category"]]["worst"];
    scores["count"] = scores[scores["category"]]["count"];
    
    return scores;
};

// Default options
var OPTIONS = {
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
};

// Retrieving options from the storage upon load
chrome.storage.sync.get(function(opt) {
    if (Object.keys(opt).length > 0) {
        OPTIONS = opt;
    }
});

// Keeping the settings up-to-date
chrome.storage.onChanged.addListener(function(changes, areaName) {
    if (areaName === "sync") {
        chrome.storage.sync.get(function(opt) {
            OPTIONS = opt;
        });
    }
});
