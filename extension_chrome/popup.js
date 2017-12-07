/*
Author: Oleksii Starov

This script handles the rendering of the scores in the extension's popup (popup.html):
- two main parts of the UI: four widegts (box plots), and the specific warnings;
- each item can invoke a modal alert to show details;
- user has ability to switch the category of website (and also, report it).

*/

// Highcharts configuration for each privacy widget
function generateChartConfig(data, title) {
    var status_color = data["score"];
    
    // Updating all the colors (default)
    var chart_config = {
        type: 'boxplot',
        backgroundColor: '#dff0d8',
        borderColor: '#d0e9c6',
        borderRadius: 5,
        borderWidth: 1,
    };
    var point_name = "Good!";
    var point_format = 'Normal: {point.y}';
    
    // Determine the colors based on the "danger" level
    if (status_color == 'red') {
        chart_config = {
            type: 'boxplot',
            backgroundColor: '#f2dede',
            borderColor: '#ebccd1',
            borderRadius: 5,
            borderWidth: 1,
        };
        point_name = "Danger!";
        point_format = 'Very high: {point.y}'
    }
    else if (status_color == 'orange') {
        chart_config = {
            type: 'boxplot',
            backgroundColor: '#fcf8e3',
            borderColor: '#faf2cc',
            borderRadius: 5,
            borderWidth: 1,
        };
        point_name = "Warning!";
        point_format = 'Too high: {point.y}'
    }
    
    var config =  {
        chart: chart_config,

        title: {
            text: title,
            style: {
                fontWeight: 'bold'
            }
        },

        legend: {
            enabled: false
        },
        
        credits: {
            enabled: false
        },

        xAxis: {
            categories: [title],
            title: {
                text: null
            },
            visible : false
        },
        
        yAxis: {
            title: {
                text: null
            },
            min: 0,
            max: Math.max(data['benchmarks']['max'], data['current']),  // so the point will show up on the plot
            maxPadding: 0,
            endOnTick: false
        },
        
        plotOptions:{
            series:{
                point: {
                    events: {
                        click: function(e){
                            $("#detailed-info").html(data["message"]);
                            $("#infoModal").modal("show");
                        }
                    } 
                }
            }
        },

        series: [{
            name: 'Observations',
            data: [
                // Box plot is based on five data points: min, first quartile, median, third quartile and the maximum value
                [data['benchmarks']['min'], data['benchmarks']['q1'], data['benchmarks']['median'], data['benchmarks']['q3'], data['benchmarks']['max']]
            ],
            tooltip: {
                headerFormat: null
            }
        }, {
            name: point_name,
            color: status_color,
            type: 'scatter',
            data: [
                [0, data['current']]
            ],
            marker: {
                fillColor: status_color,
                lineWidth: 1,
                lineColor: Highcharts.getOptions().colors[0]
            },
            tooltip: {
                pointFormat: point_format
            }
        }]
    }
    
    return config;
}

// Displaying the four charts (one per privacy widget)
function drawCharts(trackers, fingerprinting, contents, lforms) {
    // Show the four main widgets
    Highcharts.chart('containerTrackers', generateChartConfig(trackers, 'Number of trackers'));
    Highcharts.chart('containerFingerprinting', generateChartConfig(fingerprinting, 'Fingerprinting APIs called'));
    Highcharts.chart('containerIframes', generateChartConfig(contents, 'Third-party content'));
    Highcharts.chart('containerForms', generateChartConfig(lforms, 'Number of leaky forms'));
}

// Build the HTML
var drawClassification = function(classification) {
    var cur_category = classification["category"];
    $("#categories").val(cur_category);
    var cur_data = classification[cur_category]["widgets"];
    
    // Showing widgets for each privacy category
    drawCharts(cur_data['trackers']['plot'], cur_data['fingerprinting']['plot'], cur_data['mixed-contents']['plot'], cur_data['leaky-forms']['plot']);

    // Showing alerts with proper color, message and link for details
    $("#output_alerts tr").remove();
    for (key in cur_data) {
        if ("problems" in cur_data[key] && cur_data[key]["problems"].length > 0) {
            for (var i = 0; i < cur_data[key]["problems"].length; ++i) {
                var tr = document.createElement("tr");
                var td = document.createElement("td");
                td.setAttribute("colspan", 4);

                var alert = document.createElement("div");
                color = cur_data[key]["problems"][i]["color"];
                if (color == "red") {
                    alert.innerHTML = '<div class="alert alert-danger"><strong>Danger!</strong> ' 
                        + cur_data[key]["problems"][i]["message"] + ' <a data-toggle="modal" data-target="#infoModal">Details.</a>';
                    alert.innerHTML += '<span class="hidden">' + cur_data[key]["problems"][i]["info"] + '</span></div>';
                }
                else if (color == "orange") {
                    alert.innerHTML = '<div class="alert alert-warning"><strong>Warning!</strong> ' 
                        + cur_data[key]["problems"][i]["message"] + ' <a data-toggle="modal" data-target="#infoModal">Details.</a>';
                    alert.innerHTML += '<span class="hidden">' + cur_data[key]["problems"][i]["info"] + '</span></div>';
                }
                else {
                    alert.innerHTML = '<div class="alert alert-success"><strong>Good!</strong> ' 
                        + cur_data[key]["problems"][i]["message"] + ' <a data-toggle="modal" data-target="#infoModal">Details.</a>';
                    alert.innerHTML += '<span class="hidden">' + cur_data[key]["problems"][i]["info"] + '</span></div>';
                }

                td.appendChild(alert);
                tr.appendChild(td);
                
                /*
                if (color == "red") {
                    $("#output_alerts").prepend(tr);
                }
                else {
                    $("#output_alerts").append(tr);
                }
                */
                $("#output_alerts").append(tr);
            }
        }
    }

    $(".alert").click(function(){
        hidenInfo = $(this).siblings(".hidden")[0].innerHTML;
        $("#detailed-info").html(hidenInfo);
    });
};

// Main function
var handleClassification = function(classification) {
    // Listeing to the category change
    $("#categories").change(function() {
        classification["category"] = $("#categories").val();
        drawClassification(classification);
    });
    
    drawClassification(classification);
};

var CURRENT_DOMAIN; // To know, what website we are currently reporting

$(document).ready(function() {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        var background = chrome.extension.getBackgroundPage();
        handleClassification(background.SCORE_BY_TAB[tabs[0].id]);
        CURRENT_DOMAIN = background.SITES_BY_TAB[tabs[0].id]["tld1"];        
    });
});

// Link to go to the options page
$('#about').on('click', function() {
    chrome.tabs.create({'url': '/options.html'})
    return false;
});

// Report the category action
$('#report').on('submit', function() {
    var category = $("#categories").val();
    chrome.extension.getBackgroundPage().reportTheCategory(CURRENT_DOMAIN, category);
    
    $('#save').blur();
    
    // Show the action result
    var status = $('#status');
    status.text('Saved.');
    
    setTimeout(function() {
        status.text('');
    }, 1000);
    
    return false;
});













