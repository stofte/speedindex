var path = require('path');
var _ = require('lodash');
var childProcess = require('child_process');
var phantomjs = require('phantomjs');
var Chrome = require('chrome-remote-interface');

var loadUrl = 'http://www.google.com/';
var cefPath = path.join(__dirname, 'cef/cefsimple/Release/cefsimple.exe');
var cefArgs = [
    '--url=about:blank',
    //'--enableui=true',
    '--remote-debugging-port=9222'
];
var proc = childProcess.execFile(cefPath, cefArgs, function(err, stdout, stderr) {
    console.log('stdout', stdout);
    console.log('stderr', stderr);
});

var trace = [];
var viewport = { height: 0, width: 0 };

// ported from
// https://github.com/ChromiumWebApps/chromium/blob/master/tools/perf/metrics/speedindex.py

function firstLayoutTime(events) {
    var receivedResponse = true;
    var event = _.find(events, function(e) {
        if (e.name === 'ResourceReceiveResponse') {
            receivedResponse = true;
        }
        return receivedResponse && e.name === 'Layout';
    });
    return event ? event.ts : undefined;
}

function getPaintEventKey(event) {
    var frame = event.args.data.frame;
    var clip = event.args.data.clip;
    // speedindex.py#L314
    var rect = [clip[0], clip[1], clip[4], clip[5]];
    console.log(clip, rect);
    return frame + ' [' + rect.join(',') + ']';
}

function groupEventsByRectangle(events) {
    var grouped = {};
    events.forEach(function(e) {
        var key = getPaintEventKey(e);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
    });
    return grouped;
}

function clippedArea(rectangle, width, height) {
    var x0 = rectangle[0];
    var y0 = rectangle[1];
    var x1 = rectangle[2];
    var y1 = rectangle[3];
    var clippedWidth = Math.max(0, Math.min(width, x1) - Math.max(0, x0));
    var clippedHeight = Math.max(0, Math.min(height, y1) - Math.max(0, y0));
    return clippedWidth * clippedHeight;
}

function timeAreaDict(events, width, height) {
    var fullscreenArea = width * height;
    var grouped = groupEventsByRectangle(events);
    var timeAreas = {};
    _.forEach(grouped, function(events, key) {
        var rect = JSON.parse(key.split(' ')[1]);
        var area = clippedArea(rect, width, height);
        var adjustedArea = area / events.length;
        if (area === width*height) {
            adjustedArea /= 2;
        }
        _.forEach(events, function(e) {
            console.log(e);
            var endTime = e.ts;
            // there's no e.end, so assuming ts+dur works
            if (!timeAreas[endTime]) timeAreas[endTime] = 0;
            timeAreas[endTime] += adjustedArea;
        });
        //console.log('area', area, adjustedArea);
    });
    return timeAreas;
    // console.log('grouped', grouped);
}

function getTimeCompletenessList(events, width, height) {
    var firstLayout = firstLayoutTime(events);
    var paintEvents = _.filter(events, function(e) {
        return e.ts >= firstLayout && e.name === 'Paint';
    });
    var timeAreas = timeAreaDict(paintEvents, width, height);
    var totalArea = _.reduce(timeAreas, function(acc, n) {
        return acc + n;
    }, 0);
    console.log('totalArea', totalArea)
    console.log('timeAreas', timeAreas)
    var completeness = 0;

    var timeCompletenessList = [{ ts: paintEvents[0].ts, completeness: completeness }];
    _.forEach(timeAreas, function(area, time) {
        //console.log(parseInt(area, 10), (parseInt(area, 10) / totalArea))
        completeness += area / totalArea;
        //console.log('completeness', completeness);
        timeCompletenessList.push({ ts: parseInt(time, 10), completeness: completeness });
    });
    return timeCompletenessList;
}

function calculateSpeedIndex(events, width, height) {
    var timeCompletenessList = getTimeCompletenessList(events, width, height);
    var prevCompleteness = 0;
    var speedIndex = 0;
    var prevTime = timeCompletenessList[0].ts;
    _.forEach(timeCompletenessList, function(elm) {
        var elapsed = elm.ts - prevTime;
        console.log('elapsed', elapsed);
        var incompleteness = (1 - prevCompleteness);
        console.log('incompleteness', incompleteness);
        speedIndex += elapsed * incompleteness;
        console.log('speedIndex', speedIndex);
        prevCompleteness = elm.completeness;
        prevTime = elm.ts;
    });
    return speedIndex / 1000;
}

function eventHandler(message) {
    if (message.method === 'Tracing.dataCollected') {
        trace = trace.concat(message.params.value);
    } else if (message.method === 'Console.messageAdded') {
        var windowDimensions = message.params.message.text.indexOf('WINDOW_DIMENSIONS') !== -1;
        if (windowDimensions) {
            var parts = message.params.message.text.split(' ');
            viewport.height = parseInt(parts[1], 10);
            viewport.width = parseInt(parts[2], 10);
        }
    } else if (message.method === 'Tracing.tracingComplete') {
        // events dont seem sorted by ts
        trace = _.sortBy(trace, 'ts');
        trace.forEach(function(elm) {
            if (elm.ts) {
                //elm.ts = Math.round(elm.ts / 1000);
            }
        });
        var cats = _.reduce(trace, function(acc, elm) {
            return !_.includes(acc, elm.cat) ? acc.concat([elm.cat]) : acc;
        }, []).sort();
        var names = _.reduce(trace, function(acc, elm) {
            return !_.includes(acc, elm.name) ? acc.concat([elm.name]) : acc;
        }, []).sort();
        // console.log('trace categories', cats);
        //console.log('trace names', names);
        var idx = calculateSpeedIndex(trace, viewport.width, viewport.height);
        console.log('viewport', viewport);
        // console.log('trace event count', trace.length);
        console.log('speedIndex', idx);
        // console.log('paint events', paintEvents);
        //console.log('trace snippet', trace.slice(1000,1020))
    }
}

Chrome(function (chrome) {
    // chrome.Network.requestWillBeSent(function (params) {
    //     // console.log(params.request.url);
    // });
    // chrome.Page.domContentEventFired(function(params) {
    //     // console.log('domContentEventFired', params);
    // });
    // chrome.Page.loadEventFired(function(params) {
    //     // console.log('loadEventFired', params);
    // });
    // chrome.on('Timeline.eventRecorded', function(params) {
    //     console.log('Timeline.event', params);
    // });
    chrome.Runtime.enable();
    chrome.Page.enable();
    chrome.Console.enable();
    chrome.Profiler.enable();
    chrome.Profiler.setSamplingInterval({'interval' : 1000});
    chrome.Profiler.start();

    // the API seems wonky, console events dont seem to come in via the on('event') only
    chrome.on('event', eventHandler);
    // params obtained by debugging devtools itself
    chrome.Tracing.start();
    // {
    //     'bufferUsageReportingInterval': 500,
    //     'categories': '-*,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel,blink.console,disabled-by-default-devtools.timeline.stack,disabled-by-default-devtools.timeline.layers,disabled-by-default-devtools.timeline.picture,disabled-by-default-blink.graphics_context_annotations',
    //     'options': 'sampling-frequency=1000'
    // });
    //chrome.Timeline.start({bufferEvents: true});
    // var response = chrome.Timeline.start(6);
    // console.log('Timeline.start', response)
    chrome.once('ready', function () {
        // need to concat to generate single event
        var expr = 'console.log("WINDOW_DIMENSIONS " + window.innerHeight + " " + window.innerWidth)';
        chrome.Runtime.evaluate({ 'expression': expr });
        chrome.Page.navigate({'url': loadUrl });
        chrome.once('Page.loadEventFired', function(params) {
            setTimeout(function() {
                chrome.Tracing.end();
            }, 2000);
        });
    });
}).on('error', function () {
    console.error('Cannot connect to Chrome');
});
