/*
Author: Oleksii Starov

Common helper functions used accross the background scripts.

*/

const ENABLE_LOGGING = true;    // Wether to enable or disable the logging to console

// Preffered logging function instead of console.log
var LOG = function(msg) {
    if (ENABLE_LOGGING) console.log(msg);
};

// Universal function to request HTTP APIs on the back-end
var sendRequest = function(method, url, is_local, payload, on_success, on_failure) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
    xhr.onreadystatechange = function() {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (is_local || xhr.status === 200) {
                if (on_success) on_success(xhr.responseText);
            }
            else {
                if (on_failure) on_failure();
            }
        }
    }
    // Also, on connection errors
    if (on_failure) {
        xhr.onerror = function () {
            on_failure();
        };
    }
    // With payload or not
    if (payload) {
        xhr.send(payload);
    }
    else {
        xhr.send(); 
    }
};

// Raw URL with path, but without any query string 
var getUrlKey = function(url) {
    return url.split('?')[0].split("#")[0];
};

//  Separating the query string
var getUrlQuery = function(url) {
    var tmp = url.split('?');
    if (tmp.length > 1) return tmp[1];
    else return "";
};

// Sorting dictionary items
var sortDictionaryByValue = function(dict) {
    var items = Object.keys(dict).map(function(key) {
        return [key, dict[key]];
    });
    items.sort(function(first, second) {
        return second[1] - first[1];
    });
    return items;
}; 

// Sorting dictionary keys
var sortDictionaryKeys = function(dict) {
    var items = Object.keys(dict).map(function(key) {
        return key;
    });
    items.sort();
    return items;
}; 

