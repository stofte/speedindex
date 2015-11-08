var path = require('path');
var childProcess = require('child_process');
var phantomjs = require('phantomjs');
var Chrome = require('chrome-remote-interface');

var cefPath = path.join(__dirname, 'cef/cefsimple.exe');
var chromePath = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
var cefArgs = [
    '--url=about:blank',
    '--remote-debugging-port=9222'
];
var chromeArgs = [
    '--incognito',
    '--remote-debugging-port=9222'
];
//console.log(phantomjs.path, childArgs[0], childArgs[1], childArgs[2], childArgs[3]);
var proc = childProcess.execFile(chromePath, chromeArgs, function(err, stdout, stderr) {
    console.log('stdout', stdout);
    console.log('stderr', stderr);
});

Chrome.List(function (err, tabs) {
    if (!err) {
        console.log(tabs);
    }
});