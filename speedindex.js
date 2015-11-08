var _ = require('lodash');

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
            var endTime = e.ts;
            // there's no e.end, so assuming ts+dur works
            if (!timeAreas[endTime]) timeAreas[endTime] = 0;
            timeAreas[endTime] += adjustedArea;
        });
    });
    return timeAreas;
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
    var completeness = 0;
    var timeCompletenessList = [{ ts: paintEvents[0].ts, completeness: completeness }];
    _.forEach(timeAreas, function(area, time) {
        completeness += area / totalArea;
        timeCompletenessList.push({ ts: parseInt(time, 10), completeness: completeness });
    });
    return timeCompletenessList;
}

function speedIndex(events, width, height) {
    var timeCompletenessList = getTimeCompletenessList(events, width, height);
    var prevCompleteness = 0;
    var idx = 0;
    var prevTime = timeCompletenessList[0].ts;
    _.forEach(timeCompletenessList, function(elm) {
        var elapsed = elm.ts - prevTime;
        var incompleteness = (1 - prevCompleteness);
        idx += elapsed * incompleteness;
        prevCompleteness = elm.completeness;
        prevTime = elm.ts;
    });
    // chrome dev tools uses microsecond ts it seems, but algorithm written for ms
    return Math.round(idx / 1000);
}

module.exports = speedIndex;
