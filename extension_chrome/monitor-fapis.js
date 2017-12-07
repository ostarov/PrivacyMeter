/*
Author: Oleksii Starov

This content script injects common fingerprinting-related APIs on a web page in the execution environment of the page,
then listens to reports about called APIs, and sends the results to the background page.

ASSUMPTIONS:
- It stops reporting after 20 rounds (i.e., 10 seconds after page load), or after reaching the limit of 2000 overall calls to APIs
(again, we target the immediate situation after page load, without much of user interaction!)

Sends messages:
- PMfingerprints to notify background page about new detections.

*/

var actualCode = '(' + function() {    
    // Reporting to the original content-script
    var numReports = 0;
    var report = function(api) {
        if (numReports > 2000) return;  // With the limit of 2000 overall calls!
        numReports++;
        window.postMessage({type: "PM_FingerprintPost", text: api}, "*");
    }
    
    // Intercepting calls to global objects
    gl_window_apis = ['indexedDB', 'localStorage', 'sessionStorage', 'devicePixelRatio', 'TouchEvent', 'webdriver', 'domAutomation', 'domAutomationController', 'callPhantom', '_phantom', 'RunPerfTest', 'RTCPeerConnection', 'mozRTCPeerConnection', 'webkitRTCPeerConnection'];
    gl_navigator_apis = ['appCodeName', 'appName', 'appVersion', 'cookieEnabled', 'doNotTrack', 'language', 'languages', 'maxTouchPoints', 'mediaDevices', 'mimeTypes', 'platform', 'plugins', 'product', 'productSub', 'userAgent', 'vendor', 'vendorSub', 'hardwareConcurrency', 'cpuClass', 'javaEnabled', 'onLine'];
    gl_screen_apis = ['availHeight', 'availLeft', 'availTop', 'availWidth', 'colorDepth', 'height', 'orientation', 'pixelDepth', 'width'];
    
    // Intercepting calls to prototypes
    pr_htmlcanvas_apis =  ['getContext', 'getImageData', 'toDataURL']                                           // HTMLCanvasElement
    pr_canvas_apis = ['getImageData', 'fillText', 'strokeText'];                                                // CanvasRenderingContext2D
    pr_webgl_apis = ['getImageData', 'fillText', 'strokeText', 'getParameter', 'getShaderPrecisionFormat'];     // WebGLRenderingContext
    pr_htmlelement_apis = ['offsetHeight', 'offsetWidth'];                                                      // JS-based font detection
    
    // Intercepting window APIs
    for (i = 0; i < gl_window_apis.length; ++i) {
        var api = gl_window_apis[i];
        var prev = window[api];
        (function(api, prev) {
            window.__defineGetter__(api, function () {
                report("window." + api);
                return prev;
            });
        })(api, prev);
    }
    
    // Special Chrome-based case ('chrome' on window seems impossible to intercept)
    var prev_webstore = window.chrome.webstore;
    window.chrome.__defineGetter__('webstore', function () {
        report('window.chrome.webstore');
        return prev_webstore;
    });
    
    // For now, we just hide lookups for global objects
    window.__defineGetter__('__lookupGetter__', function () {
        return function () {
          return "function () { [native code] }";
        };
    });
    
    // Intercepting navigator APIs
    for (i = 0; i < gl_navigator_apis.length; ++i) {
        var api = gl_navigator_apis[i];
        var prev = navigator[api];
        (function(api, prev) {
            navigator.__defineGetter__(api, function () {
                report("navigator." + api);
                return prev;
            });
        })(api, prev);
    }
    
    // For now, we just hide lookups for global objects
    navigator.__defineGetter__('__lookupGetter__', function () {
        return function () {
          return "function () { [native code] }";
        };
    });
    
    // Intercepting screen APIs
    for (i = 0; i < gl_screen_apis.length; ++i) {
        var api = gl_screen_apis[i];
        var prev = screen[api];
        (function(api, prev) {
            screen.__defineGetter__(api, function () {
                report("screen." + api);
                return prev;
            });
        })(api, prev);
    }
    
    // For now, we just hide lookups for global objects
    screen.__defineGetter__('__lookupGetter__', function () {
        return function () {
          return "function () { [native code] }";
        };
    });
    
    // Intercepting htmlcanvas APIs
    for (i = 0; i < pr_htmlcanvas_apis.length; ++i) {
        var api = pr_htmlcanvas_apis[i];
        var prev = HTMLCanvasElement.prototype[api];
        (function(api, prev) {
            HTMLCanvasElement.prototype.__defineGetter__(api, function () {
                report("HTMLCanvasElement." + api);
                return prev;
            });
        })(api, prev);
    }
    
    // Intercepting canvas APIs
    for (i = 0; i < pr_canvas_apis.length; ++i) {
        var api = pr_canvas_apis[i];
        var prev = CanvasRenderingContext2D.prototype[api];
        (function(api, prev) {
            CanvasRenderingContext2D.prototype.__defineGetter__(api, function () {
                report("CanvasRenderingContext2D." + api);
                return prev;
            });
        })(api, prev);
    }
        
    // Intercepting webgl APIs
    for (i = 0; i < pr_webgl_apis.length; ++i) {
        var api = pr_webgl_apis[i];
        var prev = WebGLRenderingContext.prototype[api];
        (function(api, prev) {
            WebGLRenderingContext.prototype.__defineGetter__(api, function () {
                report("WebGLRenderingContext." + api);
                return prev;
            });
        })(api, prev);
    }
    
    // Intercepting htmlelement APIs
    for (i = 0; i < pr_htmlelement_apis.length; ++i) {
        var api = pr_htmlelement_apis[i];
        var prev = HTMLElement.prototype.__lookupGetter__(api);   // Note, no [api] for properties (tested on http://jsbeautifier.org/)
        (function(api, prev) {
            HTMLElement.prototype.__defineGetter__(api, function () {
                report("HTMLElement." + api);
                return prev.apply(this, arguments);
            });
        })(api, prev);
    }
    
    var prev_getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;   // And this is a normal function
    HTMLElement.prototype.__defineGetter__("getBoundingClientRect", function () {
        report("HTMLElement.getBoundingClientRect");
        return prev_getBoundingClientRect;
    });
    
    var prev_addBehavior = HTMLElement.prototype.addBehavior; 
    HTMLElement.prototype.__defineGetter__("addBehavior", function () {
        report("HTMLElement.addBehavior");
        return prev_addBehavior;
    });
        
    // More additional APIs to consider

    // Intercept calls to Date
    var prev_getTimezoneOffset = Date.prototype.getTimezoneOffset;
    Date.prototype.__defineGetter__('getTimezoneOffset', function () {
        report('Date.getTimezoneOffset');
        return prev_getTimezoneOffset;
    });
    
    // Intercepting createEvent
    var prev_createEvent = document.createEvent;
    document.__defineGetter__('createEvent', function () {
        //console.log("createEvent.");
        return function() {
            //console.log("A TouchEvent created.");
            if ("TouchEvent" === arguments[0]) {
                report("createEvent('TouchEvent')");
            }
            return prev_createEvent.apply(this, arguments);
        };
    });
    
    // Intercepting mousemoves
    var prev_addEventListener = HTMLElement.prototype.addEventListener;
    HTMLElement.prototype.__defineGetter__("addEventListener", function () {
        return function() {
            if ("mousemove" === arguments[0]) {
                report("addEventListener('mousemove')");
            }
            return prev_addEventListener.apply(this, arguments);
        };
    });
 
} + ')();';

// Quickly add and remove the script
var script = document.createElement('script');
script.textContent = actualCode;
(document.head || document.documentElement).appendChild(script);
script.remove();

// Temporary collecting calls here
var detected_calls = {};

// Listener to report detected fingerprinting
window.addEventListener("message", function(event) {
    // We only accept messages from ourselves
    if (event.source != window) return;
    if (event.data.type && (event.data.type == "PM_FingerprintPost")) {
        var api = event.data.text.split(".").join("&#46;");
        // Updating the value
        var prev = detected_calls[api] !== undefined ? detected_calls[api] : 0;
        detected_calls[api] = prev + 1;
    }
}, false);

const NUM_API_REPORTS = 20;
var num_api_reports = 0;
// Reporting to the background page
var interval = setInterval(function() {
    num_api_reports++;
    // Peridoically send updates when needed
    chrome.runtime.sendMessage({req: "PM_FingerprintCalls", data: detected_calls});
    detected_calls = {};    // This buffer was sent, we can flush it
    
    if (num_api_reports > NUM_API_REPORTS) clearInterval(interval);
}, 500);


