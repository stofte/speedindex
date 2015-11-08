var path = require('path');
var childProcess = require('child_process');
var phantomjs = require('phantomjs');
var Chrome = require('chrome-remote-interface');

var cefPath = path.join(__dirname, 'cef/cefsimple/Release/cefsimple.exe');
var cefArgs = [
    '--url=about:blank',
    '--enableui=true',
    '--remote-debugging-port=9222'
];
var proc = childProcess.execFile(cefPath, cefArgs, function(err, stdout, stderr) {
    console.log('stdout', stdout);
    console.log('stderr', stderr);
});

Chrome.List(function (err, tabs) {
    if (!err) {
        console.log(tabs);
    }
});