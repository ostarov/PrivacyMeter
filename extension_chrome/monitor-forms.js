
/*
Author: Oleksii Starov

This content script searches for "leaky" forms on a web page:
- third-party forms based on TLD+1 domains comparison;
- forms submitted via insecure non-HTTPS connection;
- forms submitted with insecure HTTP GET method.

In addition, it detects whether form submits passwords, and how many visible inputs it has.

ASSUMPTIONS: 
- will stop after 20 rounds of processing forms (or 10 seconds)
- does not save the forms that dissapeared during this time 
(for now, we target only those, which appear with page load and resume visible to the user!)

Sends messages: 
- "PMgetTabURL" to get the information about cuurent tab;
- "PMformsFound" to notify background page about detected forms.

*/

// Iterate over all forms
var TAB_INFO = null;

/*
Given a url, creates and returns a link element for it
*/
function getFullUrl(url) {
    if (url === null || url === undefined) return {};
    var a = document.createElement('a');
    a.href = url;
    return a;
}

/*
Given a hostname (FQDN), compares it to the current TLD+1 domain
*/
function isThirdParty(hostname) {
    if (hostname === null || hostname === undefined) return true;
    if (hostname === TAB_INFO.tab_domain || hostname.endsWith("." + TAB_INFO.tab_domain)) return false;
    return true;
}

/*
Given a DOM input element, returns whether it is visible or not
*/
function isVisible(element) {
    // A jQuery's way will return false in case if form is not yet shown with style.display == 'none'
    //return element.offsetWidth > 0 || element.offsetHeight > 0;
    return element.type !== "hidden";
}

/*
Given a form, (1) determines if it is leaky, and (2) extracts all the data:
- form action and method
- input tags (visible or not)
*/
function processForm(form) {
    // Retrieve the target URL and method
    var action = getFullUrl(form.getAttribute('action'));
    var method = form.method.toLowerCase();
    
    // Further processing only "leaky" forms
    if (method === "get" || action.protocol === "http:" || isThirdParty(action.hostname)) {
        
        // Additional action of marking
        chrome.storage.sync.get({"mark_forms": true}, function(opt) {
            if (opt["mark_forms"]) {
                form.style.border = "thin solid red";
            }
        });
        
        // Extracting useful information
        var visible_inputs = [];
        var all_inputs = [];
        var inputs = form.getElementsByTagName("input");
        var has_pass = false;
        for (var i = 0; i < inputs.length; ++i) {
            if (inputs[i].type === "password") has_pass = true;
            // Note: we do not want to collect HTML as it can be privacy intrusive!
            if (isVisible(inputs[i])) {
                //visible_inputs.push(inputs[i].outerHTML);
                visible_inputs.push(i);
            }
            //all_inputs.push(inputs[i].outerHTML);
            all_inputs.push(i);
        }

        // Packing retrieved information
        var data = {
            'action': (action.href === undefined) ? "(unknown)" : action.href, 
            'visible_inputs_length': visible_inputs.length,
            'all_inputs_length': all_inputs.length,
            //'visible_inputs': visible_inputs,
            //'all_inputs': all_inputs,
            'method': method,
            "has_pass": has_pass
        }; 
        
        if (action.protocol === "http:") {
            data["protocol"] = "http";
        }
        
        if (isThirdParty(action.hostname)) {
            data["tp"] = true;
        }
        
        return data;
    }

    return null;
}

// Main function
function searchLeakyForms() {
    
    var found_forms = [];   // No need to make it global
    
    // Iterating over forms on the page
    for (var f = 0; f < document.forms.length; ++f) {
        var form_info = processForm(document.forms[f]);
        if (form_info !== null) {
            form_info["frame_id"] = TAB_INFO.frame_id;
            form_info["frame_url"] = TAB_INFO.frame_url;
            found_forms.push(form_info);
        }
    }
     
    // Reporting to the background page when needed
    if (found_forms.length > 0) {
        chrome.runtime.sendMessage({req: "PM_FormsFound", forms: found_forms, frame: TAB_INFO.frame_id});
    }
}

// Settings
const NUM_FORM_REPORTS = 20;
var num_form_reports = 0;

// Main loop starts after "PMgetTabURL" response received
chrome.runtime.sendMessage({req: "PM_GetTabURL"}, function(response) {
    // Other domains are considered to be third parties
    TAB_INFO = response;
    // Reporting to the background page
    var interval = setInterval(function() {
        searchLeakyForms();
        num_form_reports++;
        if (num_form_reports > NUM_FORM_REPORTS) clearInterval(interval);
    }, 500);
});




