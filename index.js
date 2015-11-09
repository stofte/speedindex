var path = require('path');
var _ = require('lodash');
var childProcess = require('child_process');
var phantomjs = require('phantomjs');
var Chrome = require('chrome-remote-interface');
var speedIndex = require('./speedindex');

var loadUrl = 'http://localhost:60261/Dashboard/JobMatch';
var cefPath = path.join(__dirname, 'cef/cefsimple/Release/cefsimple.exe');
console.log('cefPath', cefPath);
var cefArgs = [
    '--url=about:blank',
    //'--enableui=true',
    '--remote-debugging-port=9222'
];

childProcess.execFile(cefPath, cefArgs);

var trace = [];
var viewport = { height: 0, width: 0 };
var events = { networkPending: 0 };

function eventHandler(message) {
    var method = message.method;
    switch (method) {
        case 'Network.requestWillBeSent':
            // determine if this was the first request
            if (!events.networkStart) {
                // todo check this is loadUrl
                events.networkStart = message.params.timestamp;
            }
            events.networkPending++;
            break;
        case 'Network.loadingFinished':
            events.networkPending--;

            break;
        // case 'Page.frameStartedLoading':
        //     console.log('frameStartedLoading', message);
        //     break;
        // case 'Page.domContentEventFired':
        //     console.log('domContentEventFired', message);
        //     break;
        // case 'Page.frameStoppedLoading':
        //     console.log('frameStoppedLoading', message);
        //     break;
        // case 'Page.frameNavigated':
        //     console.log('frameNavigated', message);
        //     break;
        // case 'Page.loadEventFired':
        //     console.log('loadEventFired', message);
        //     break;
        case 'Console.messageAdded':
            var windowDimensions = message.params.message.text.indexOf('WINDOW_DIMENSIONS') !== -1;
            if (windowDimensions) {
                var parts = message.params.message.text.split(' ');
                viewport.height = parseInt(parts[1], 10);
                viewport.width = parseInt(parts[2], 10);
            }
            break;
        case 'Tracing.dataCollected':
            trace = trace.concat(message.params.value);
            break;
        case 'Tracing.tracingComplete':
            // events dont seem sorted by ts
            trace = _.sortBy(trace, 'ts');
            var cats = _.reduce(trace, function(acc, elm) {
                return !_.includes(acc, elm.cat) ? acc.concat([elm.cat]) : acc;
            }, []).sort();

            var report = speedIndex(trace, viewport.width, viewport.height);
            console.log('viewport:', viewport.width, 'x', viewport.height);
            console.log('speedindex:', report.index);
            console.log('graph:', report.graph);
            // should cleanup the cef process
            process.exit(1);
        default:
            // console.log('eventHandler', message);
            // console.log();
            break;
    }
}

// wip
function traceTerminator(chrome) {
    var pending = 0;
    chrome.on('event', function(message) {
        var method = message.method;

        switch (method) {
            case 'Network.requestWillBeSent':
                console.log('requestWillBeSent', message.params.requestId, message.params.request.url);
                pending++;
                break;
            case 'Network.loadingFailed':
            case 'Network.loadingFinished':
                console.log('loadingFailed,loadingFinished', message.params.requestId);
                pending--;
                break;
        }
        console.log('pending', pending, method);
        if (pending === 0) {
            setTimeout(function() {
                if (pending === 0) {
                    chrome.Tracing.end();
                }
            }, 1000);
        }
    });
}

Chrome(function (chrome) {
    chrome.on('event', eventHandler);
    chrome.Console.enable();
    chrome.Page.enable();
    chrome.Network.enable();
    chrome.Tracing.start();
    chrome.once('ready', function () {
        // need to concat to generate single event
        chrome.Page.navigate({'url': loadUrl });
        var expr = 'console.log("WINDOW_DIMENSIONS " + window.innerHeight + " " + window.innerWidth)';
        chrome.Runtime.evaluate({ 'expression': expr });
        traceTerminator(chrome);
        // chrome.once('Page.loadEventFired', function(params) {
        //     setTimeout(function() {
        //         chrome.Tracing.end();
        //     }, 2000);
        // });
    });
}).on('error', function () {
    console.error('Cannot connect to Chrome');
});
