/*
Author: Oleksii Starov

This background script defines a TemporalCache class that keeps efficient in-memory cache (based on dictionary and queue),
and synchronizes data with the local storage on updates.

In addition, it creates two global cache instances of CACHED_TRACKERS and CACHED_CATEGORIES:
- to keep cached information about WOT scores of trackers;
- to save categories for visited main websites.

ASSUMPTIONS: 
- 10K cache size limit should be enough to store unique tracker domains, and efficient to look them up;
- live time of 7 days should be reasonable for the WOT score.

*/

function TemporalCache(config) {
    
    this.max_size = config.max_size;        // e.g., 10000 (so local storage and memory allocation will be ok)
    this.slice_size = config.slice_size;    // e.g., 1000 (empirical, should be lager than one-time insertion length)
    this.live_time = config.live_time;      // e.g., 604800000 for 7 days
    
    this.dict = {};     // to support search queries fast
    this.fifo = [];     // to easily select older entries
    
    this.storage = chrome.storage.local;    // local storage!
    
    // Each item is expected to have "key" and "info" properties
    this.insert = function(items) {
        
        // Forcedly free older records when over limit
        // NOTE: we do not check the size of items here (assuming it is lower than slice)
        if ((this.fifo.length + items.length) > this.max_size) {
            this.free(true);
        }
        
        var to_store = {};
        
        for (var i = 0; i < items.length; ++i) {
            var key = items[i]["key"];
            var info = items[i]["info"];
            var record = {"info": info};
            if (this.live_time) {
                record["date"] = Date.now();
            }
            if (!this.dict[key]) {
                this.fifo.push(key);
            }
            this.dict[key] = record;
            to_store[key] = record;
        }
        
        this.storage.set(to_store);
    };
    
    // Search by a single key
    this.search = function(key) {
        
        // Just looking up in the dictionary
        var record = this.dict[key];
        if (record) {
            if (this.live_time) {
                var age = record["date"] - Date.now();
                if (age < this.live_time) {
                    return record["info"];
                }
                else {
                    // Meaning, we have outdated records
                    this.free(false);
                }
            }
            else {
                return record["info"];
            }
        }
        
        return null;
    };

    // Free some space (remove outdated items)
    this.free = function(forced) {
        
        // Removing at least slice_size or more
        var offset = 0;
        for (var i = 0; i < this.fifo.length; ++i) {
            if (forced && i < this.slice_size) {
                delete this.dict[this.fifo[i]];
            }
            else {
                if (this.live_time) {
                    var record = this.dict[this.fifo[i]];
                    var age = record["date"] - Date.now();
                    if (age > this.live_time) {
                        delete this.dict[this.fifo[i]];
                    }
                    else {
                        break;
                    }
                }
                else {
                    break;
                } 
            }
            offset = i;
        }
        
        // Updating storage and fifo
        this.storage.remove(this.fifo.slice(0, offset));
        this.fifo = this.fifo.slice(offset + 1);
    };

}

// Trackers WOT score will be cached for a week
var CACHED_TRACKERS = new TemporalCache({
    "max_size": 10000,
    "slice_size": 1000,
    "live_time": 604800000
});

// Here, we do not really care for now
var CACHED_CATEGORIES = new TemporalCache({
    "max_size": 1000000,
    "slice_size": 1000
});

// Restore cashes when background page is loaded
chrome.storage.local.get(null, function(items) {
    
    for (var key in items) {
        if (items[key]["info"]) { 
            if (items[key]["info"]["domain"]) {
                CACHED_TRACKERS.dict[key] = items[key];
                CACHED_TRACKERS.fifo.push(key);
            } 
            else {
                CACHED_CATEGORIES.dict[key] = items[key];
                CACHED_CATEGORIES.fifo.push(key);
            }
        }
    }
    
    // We have to restore the order of FIFO
    CACHED_TRACKERS.fifo.sort(function(a, b) {
        return parseInt(CACHED_TRACKERS.dict[a].date) - parseInt(CACHED_TRACKERS.dict[b].date);
    });
    
    LOG("Cache loaded.")
});


