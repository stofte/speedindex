// speedindex definition: https://sites.google.com/a/webpagetest.org/docs/using-webpagetest/metrics/speed-index
// speedindex code ported from https://github.com/ChromiumWebApps/chromium/blob/master/tools/perf/metrics/speedindex.py
var path = require('path');
var _ = require('lodash');
var childProcess = require('child_process');
var phantomjs = require('phantomjs');
var Chrome = require('chrome-remote-interface');
var speedIndex = require('./speedindex');

var loadUrl = 'http://www.google.com/';
var cefPath = path.join(__dirname, 'cef/cefsimple/Release/cefsimple.exe');
var cefArgs = [
    '--url=about:blank',
    //'--enableui=true',
    '--remote-debugging-port=9222'
];

childProcess.execFile(cefPath, cefArgs);

var trace = [];
var viewport = { height: 0, width: 0 };

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
        var cats = _.reduce(trace, function(acc, elm) {
            return !_.includes(acc, elm.cat) ? acc.concat([elm.cat]) : acc;
        }, []).sort();
        var names = _.reduce(trace, function(acc, elm) {
            return !_.includes(acc, elm.name) ? acc.concat([elm.name]) : acc;
        }, []).sort();
        var idx = speedIndex(trace, viewport.width, viewport.height);
        console.log('viewport:', viewport.width, 'x', viewport.height);
        console.log('speedindex:', idx);
        // should cleanup the cef process
        process.exit(1);
    }
}

Chrome(function (chrome) {
    chrome.Runtime.enable();
    chrome.Page.enable();
    chrome.Console.enable();
    chrome.Profiler.enable();
    chrome.Profiler.setSamplingInterval({'interval' : 1000});
    chrome.Profiler.start();

    chrome.on('event', eventHandler);
    chrome.Tracing.start();
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
