#!/usr/bin/env node

var _ = require('underscore');
var commander = require('commander');
var fs = require('fs');
var https = require('https');
var inireader = require('inireader');
var mkdirp = require('mkdirp');
var path = require('path');
var temp = require('temp');
var util = require('util');
var spawn = require('child_process').spawn;

var table = require('./lib/table');
var con = require('./lib/console');

var configDir = path.join(process.env['HOME'], '.mole');
var configFile = path.join(configDir, 'mole.ini');
var certFile = path.join(configDir, 'mole.crt');
var keyFile = path.join(configDir, 'mole.key');
var recipeDir = path.join(configDir, 'tunnels');

mkdirp.sync(recipeDir);

var config = new inireader.IniReader();
try {
    config.load(configFile);
} catch (err) {
    con.info('No config, using defaults.');
    config.param('server.host', 'localhost');
    config.param('server.port', 9443);
    config.write();
}

commander
.command('dig <destination>')
.description('dig a tunnel to the destination')
.action(cmdDig);

commander
.command('list')
.description('list available tunnel definitions')
.action(cmdList);

commander
.command('pull')
.description('get tunnel definitions from the server')
.action(cmdPull);

commander
.command('push <file>')
.description('send a tunnel definition to the server')
.action(cmdPush);

commander
.command('register <server> <token>')
.description('register with a mole server')
.option('-p, --port', 'server port', config.param('server.port'))
.action(cmdRegister);

commander
.command('gettoken')
.description('generate a new registration token')
.action(cmdToken);

commander
.command('newuser <username>')
.description('create a new user')
.option('-a, --admin', 'create an admin user')
.action(cmdNewUser);

commander
.command('export <tunnel> <outfile>')
.description('export tunnel definition to a file')
.action(cmdExport);

commander
.command('view <tunnel>')
.description('show tunnel definition')
.action(cmdView);

commander
.option('-d, --debug', 'display debug information')
.on('--help', function () {
    console.log('  Examples:');
    console.log();
    console.log('    Register with server "mole.example.com" and a token:');
    console.log('      ' + commander.name + ' register mole.example.com 80721953-b4f2-450e-aaf4-a1c0c7599ec2');
    console.log();
    console.log('    List available tunnels:');
    console.log('      ' + commander.name + ' list');
    console.log();
    console.log('    Dig a tunnel to "operator3":');
    console.log('      ' + commander.name + ' dig operator3');
    console.log();
    console.log('    Fetch new and updated tunnel specifications from the server:');
    console.log('      ' + commander.name + ' pull');
    console.log();
});

commander.parse(process.argv);

// There should be a 'command' (typeof 'object') among the arguments
if (!_.any(commander.args, function (a) { return typeof a === 'object' })) {
    process.stdout.write(commander.helpInformation());
    commander.emit('--help');
    process.exit(0);
}

function server(options, callback) {
    var cert = {};
    try {
        cert.key = fs.readFileSync(keyFile, 'utf-8');
        cert.cert = fs.readFileSync(certFile, 'utf-8');
    } catch (err) {
        // We don't have a certificate yet.
    }

    var defaults = {
        host: config.param('server.host'),
        port: config.param('server.port'),
        key: cert.key,
        cert: cert.cert,
        method: 'GET',
        agent: false
    };
    _.defaults(options, defaults);

    var buffer = '';
    var req = https.request(options, function (res) {
        res.setEncoding('utf-8');
        res.on('data', function (chunk) {
            buffer += chunk;
        });
        res.on('end', function () {
            callback(buffer);
        });
    });

    req.on('error', function (err) {
        con.fatal(err);
    });

    return req;
}

function serverSend(name, data, callback) {
    var req = server({ path: '/store/' + name, method: 'PUT' }, callback);
    req.write(data);
    req.end();
}

function serverList(callback) {
    server({ path: '/store' }, function (result) {
        if (result.length === 0) {
            con.fatal('Empty response from server - are you registered?');
        } else {
            callback(JSON.parse(result));
        }
    }).end();
}

function serverFetch(fname, callback) {
    con.debug('Get ' + fname);
    server({ path: '/store/' + fname }, function (result) {
        if (result.length === 0) {
            con.fatal('Empty response from server - are you registered?');
        } else {
            var local = path.join(recipeDir, fname);
            fs.writeFileSync(local, result);
            con.debug('Fetched ' + fname);
            callback(result);
        }
    }).end();
}

// Register using a token, get certificate and key

function serverRegister(token, callback) {
    server({ path: '/register/' + token }, function (result) {
        if (result.length === 0) {
            con.fatal('Empty response from server - verify that the token is correct and not already used.');
        } else {
            callback(JSON.parse(result));
        }
    }).end();
}

function cmdRegister(host, token) {
    if (commander.debug) { con.enableDebug(); }
    con.debug('Requesting registration from server ' + host);
    config.param('server.host', host);
    serverRegister(token, function (result) {
        con.debug('Received certificate and key from server');
        fs.writeFileSync(certFile, result.cert);
        fs.chmodSync(certFile, 0600);
        fs.writeFileSync(keyFile, result.key);
        fs.chmodSync(keyFile, 0600);
        config.write();
        con.ok('Registered');
        cmdPull();
    });
}

// Get a new token that can be used to register another host

function serverToken(callback) {
    server({ path: '/newtoken', method: 'POST' }, function (result) {
        if (result.length === 0) {
            con.fatal('Empty response from server - are you registered?');
        } else {
            callback(JSON.parse(result));
        }
    }).end();
}

function serverNewUser(name, callback) {
    server({ path: '/users/' + name, method: 'POST' }, function (result) {
        if (result.length === 0) {
            con.fatal('Empty response from server - are you a registered admin?');
        } else {
            callback(JSON.parse(result));
        }
    }).end();
}

function cmdToken() {
    if (commander.debug) { con.enableDebug(); }
    con.debug('Requesting new token from server');
    con.info('A token can be used only once');
    con.info('Only the most recently generated token is valid');
    serverToken(function (result) {
        con.ok(result.token);
    });
}

function cmdList() {
    if (commander.debug) { con.enableDebug(); }
    con.debug('listing files in ' + recipeDir);
    fs.readdir(recipeDir, function (err, files) {
        con.debug('Got ' + files.length + ' files');

        var rows = [];
        files.sort().forEach(function (file) {
            var r = loadTunnel(file);
            var descr = r.description;
            var tname = tunnelName(file);
            rows.push([ tname, descr ]);
        });

        table([ 'Tunnel', 'Description' ], rows);
    });
}

function cmdPull() {
    if (commander.debug) { con.enableDebug(); }
    con.debug('Requesting tunnel list from server');
    serverList(function (result) {
        con.debug('Got ' + result.length + ' entries');
        var inProgress = 0;
        _.sortBy(result, 'name').forEach(function (res) {
            var local = path.join(recipeDir, res.name);
            var tname = tunnelName(res.name);
            if (!path.existsSync(local)) {
                inProgress += 1;
                serverFetch(res.name, function () {
                    con.ok('Pulled ' + tname.bold + ' (new)');
                    inProgress -= 1;
                    if (inProgress === 0) {
                        con.ok(result.length + ' tunnel definitions in sync');
                        inProgress = -1;
                    }
                });
            } else {
                var s = fs.statSync(local);
                if (s.mtime.getTime() < res.mtime) {
                    inProgress += 1;
                    serverFetch(res.name, function () {
                        con.ok('Pulled ' + tname.bold + ' (updated)');
                        inProgress -= 1;
                        if (inProgress === 0) {
                            con.ok(result.length + ' tunnel definitions in sync');
                            inProgress = -1;
                        }
                    });
                }
            }
        });
        if (inProgress === 0) {
            con.ok(result.length + ' tunnel definitions in sync');
        }
    });
}

function cmdPush(file) {
    if (commander.debug) { con.enableDebug(); }
    con.debug('Reading ' + file);
    try {
        var data = fs.readFileSync(file, 'utf-8');
    } catch (err) {
        con.fatal(err);
    }
    con.debug('Got ' + data.length + ' bytes');
    serverSend(path.basename(file), data, function (result) {
        con.ok('Sent ' + data.length + ' bytes');
    });
}

function cmdNewUser(name) {
    if (commander.debug) { con.enableDebug(); }
    con.debug('Requesting user ' + name);
    serverNewUser(name, function (result) {
        con.ok(result.token);
    });
}

function cmdDig(tunnel) {
    if (commander.debug) { con.enableDebug(); }

    var sshConfig = require('./lib/ssh-config');
    var expectConfig = require('./lib/expect-config');
    var setupLocalIPs = require('./lib/setup-local-ips');

    // Load a configuration, generate a temporary filename for ssh config.

    con.debug('Loading tunnel');
    var config = loadTunnel(tunnel);
    config.sshConfig = temp.path({suffix: '.sshconfig'});

    // Create and save the ssh config

    con.debug('Creating ssh configuration');
    var defaults = ['Host *', '  UserKnownHostsFile /dev/null', '  StrictHostKeyChecking no'].join('\n') + '\n';
    var conf = defaults + sshConfig(config) + '\n';
    fs.writeFileSync(config.sshConfig, conf);
    con.debug(config.sshConfig);

    // Set up local IP:s needed for forwarding and execute the expect scipt.

    con.debug('Setting up local IP:s for forwarding');
    setupLocalIPs(config, function (c) {
        if (!c) {
            con.warning('Failed to set up IP:s for forwarding. Continuing without forwarding');
            delete config.forwards;
        }

        // Create the expect script and save it to a temp file.

        con.debug('Creating expect script');
        var expect = expectConfig(config, commander.debug) + '\n';
        var expectFile = temp.path({suffix: '.expect'});
        fs.writeFileSync(expectFile, expect);
        con.debug(expectFile);

        con.info('Hang on, digging the tunnel');
        spawn('expect', [ expectFile ], { customFds: [ 0, 1, 2 ] })
        .on('exit', function (code) {
            fs.unlinkSync(expectFile);
            fs.unlinkSync(config.sshConfig);
            // FIXME: Unlink ssh keys
            con.ok('Done');
        });
    });
};

function tunnelName(file) {
    return path.basename(file).replace(/\.js|\.ini$/, '');
}

function loadTunnel(name) {
    var local;

    if (name.indexOf('/') >= 0) {
        // Name contains slashes, we assume it's a full path name
        local = name
    } else {
        // Unqualified names should be in the tunnel dir
        local = path.join(recipeDir, name);
        con.debug('Qualifying ' + name + ' to ' + local);
    }

    if (!name.match(/(\.ini|\.js)$/)) {
        // No extension given, find the file
        if (path.existsSync(local + '.ini')) {
            local = local + '.ini';
        } else if (path.existsSync(local + '.js')) {
            local = local + '.js';
        }
    }

    if (!path.existsSync(local)) {
        con.fatal('Could not find a tunnel matching ' + name);
    }

    if (local.match(/\.js$/)) {
        con.debug('Loading ini format');
        return loadJsTunnel(local);
    } else if (local.match(/\.ini$/)) {
        return loadIniTunnel(local);
    } else {
        con.fatal('Unknown format config ' + local);
    }
}

function loadIniTunnel(name) {
    var ini = new inireader.IniReader();
    ini.load(name);
    var obj = ini.getBlock();

    var config = _.clone(obj.general);
    config.hosts = {};
    config.forwards = {};

    _.each(obj, function (val, key) {
        var m, arr;

        // Host sections look like [host host_name]   
        m = key.match(/^host ([^ ]+)$/);
        if (m) {
            // SSH keys have newlines replaced by spaces
            if (val.key) {
                val.key = val.key.replace(/ /g, '\n').replace(/\nRSA\nPRIVATE\nKEY/g, ' RSA PRIVATE KEY');
            }
            config.hosts[m[1]] = val;
            return
        }

        // Forward sections look like [forward A description here] 
        m = key.match(/^forward +(.+)$/);
        if (m) {
            arr = [];
            _.each(val, function (to, from) {
                arr.push({ from: from, to: to });
            });
            config.forwards[m[1]] = arr;
            return
        }
    });

    return config;
}

function loadJsTunnel(name) {
    try {
        con.debug('Loading ' + name);
        return require(name);
    } catch (err) {
        con.error('Could not load ' + name);
        con.fatal(err);
    }
};

function saveIniTunnel(config, name) {
    var ini = new inireader.IniReader();
    ini.param('general', { description: config.description, main: config.main });

    _.each(config.hosts, function (host, name) {
        if (host.key) {
            // The ini format doesn't handle multiline strings, so we replace newlines with spaces in ssh keys.
            host = _.clone(host);
            host.key = host.key.replace(/\n/g, ' ');
        }
        ini.param('host ' + name, host);
    });

    _.each(config.forwards, function (fwd, name) {
        var obj = {};
        fwd.forEach(function (f) {
            obj[f.from] = f.to;
        });
        ini.param('forward ' + name, obj);
    });

    ini.write(name);
}

function cmdExport(tunnel, outfile) {
    if (commander.debug) { con.enableDebug(); }

    con.debug('Loading tunnel');
    var config = loadTunnel(tunnel);

    con.debug('Saving to INI format');
    saveIniTunnel(config, outfile);

    con.ok(outfile);
};

function cmdView(tunnel) {
    if (commander.debug) { con.enableDebug(); }

    con.debug('Loading tunnel');
    var config = loadTunnel(tunnel);

    con.debug('Saving to INI format');
    var path = temp.path({ suffix: '.ini' });
    saveIniTunnel(config, path);

    con.debug('Show ' + path);
    console.log(fs.readFileSync(path, 'utf-8'));

    fs.unlinkSync(path);
};

