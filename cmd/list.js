"use strict";

var _ = require('underscore');
var debuggable = require('debuggable');
var fs = require('fs');
var path = require('path');
var table = require('yatf');

var con = require('../lib/console');
var tun = require('../lib/tunnel');

module.exports = list;
list.help = 'List available tunnel definitions';
list.prio = 1;
list.aliases = [ 'ls' ];
debuggable(list);

function printV3List(tunnels) {
    // Build a table with information about the tunnel definitions. Basically,
    // load each of them, create a row with information and push that row to
    // the table.

    var rows = [];
    tunnels.forEach(function (tunnel) {
        if (!tunnel.error) {

            // Add a flag to indicate that a tunnel definitions requires VPN
            // (i.e. vpnc must be installed).

            var opts = '';
            if (tunnel.vpnc) {
                opts += ' (vpnc)'.magenta;
            } else if (tunnel.openconnect) {
                opts += ' (opnc)'.green;
            } else if (tunnel.socks) {
                opts += ' (socks)'.yellow;
            }

            // Generate a lists of hosts. FIXME: For lots of hosts, this isn't
            // all that useful since it'll be truncated by the table formatter.

            var hosts = tunnel.hosts.join(', ');
            if (tunnel.localOnly) {
                hosts = '(local forward)'.grey;
            }

            rows.push([ tunnel.name.blue.bold , tunnel.description + opts, hosts ]);
        } else {
            rows.push([ tunnel.name.red.bold, tunnel.error, '-' ]);
        }
    });

    // Format the table using the specified headers and the rows from above.

    table([ 'TUNNEL', 'DESCRIPTION', 'HOSTS' ], rows, { underlineHeaders: true });
}

function printList(tunnels) {
    tunnels.forEach(function (t) {
        var name = t.name.replace(/\.ini$/, '');
        console.log(name.blue.bold);
    });
}

function list(opts, state) {
    // Get a sorted list of all tunnels.

    state.client.list(function (tunnels, proto) {
        if (proto === '3')
            printV3List(tunnels);
        else
            printList(tunnels);
    });
}
