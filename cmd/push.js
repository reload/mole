"use strict";

var fs = require('fs');
var path = require('path');

var con = require('../lib/console');
var tun = require('../lib/tunnel');

module.exports = push;
push.help = 'Send a tunnel definition to the server';
push.options = {
    'file': { position: 1, help: 'File name', required: true }
};
push.prio = 1;

function push(opts, state) {
    // We load the tunnel, which will cause some validation of it to happen. We
    // don't want to push files that are completely broken.

    con.debug('Testing ' + opts.file);
    try {
        tun.loadFile(opts.file);
        con.debug('It passed validation');
    } catch (err) {
        con.fatal(err);
    }

    // Get the list of tunnel definitions from the server. We want the server
    // version of the tunnel definition to match the local version, if it
    // exists. A mismatch indicates either that the user edited the file
    // directly in the local repo (don't!) or that they didn't pull before
    // editing/pushing. So a very primitive from of conflict prevention.

    con.debug('Requesting tunnel list from server');
    state.client.list(function (result) {
        var base = path.basename(opts.file);
        var serverside = result.filter(function (i) { return i.name === base; });
        if (serverside.length === 1) {
            var local = path.join(state.path.tunnels, base);
            if (fs.existsSync(local)) {
                var s = fs.statSync(local);
                if (s.mtime.getTime() !== serverside[0].mtime) {
                    con.warning('The local repository version of ' + base + ' is different from the server. Never edit');
                    con.warning('the files directly in ~/.mole/tunnels and always pull to make sure you have the latest');
                    con.warning('version before you edit and push. To correct the situation, pull and compare your edits');
                    con.warning('with the version in ~/.mole/tunnels before pushing again.');
                    con.fatal('Cowardly refusing to continue.');
                }
            }
        }

        // We read the file to a buffer to send to the server. There should be no
        // errors here since the tunne load and check above succeeded.

        con.debug('Reading ' + opts.file);
        var data = fs.readFileSync(opts.file, 'utf-8');

        // Send the data to the server. We'll only get the callback if the upload
        // succeeds.

        state.client.send(base, data, function (result) {
            con.ok('Sent ' + data.length + ' bytes');
        });
    });
}
