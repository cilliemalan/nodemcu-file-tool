"use strict";

(function (term) {

    const SerialPort = require('serialport');

    const port_selector = document.getElementById("port_selector");
    const reloadports_button = document.getElementById("reloadports_button");
    const connect_button = document.getElementById("connect_button");

    let port;

    function drainAsync() {
        return new Promise((resolve, reject) => {
            if (!port) {
                reject('port closed');
            } else {
                port.drain(e => {
                    if (e) reject(e);
                    else resolve();
                })
            }
        });
    }

    function writeAsync(data, encoding) {
        return new Promise((resolve, reject) => {
            if (!port) {
                reject('port closed');
            } else {
                const _c = {};
                const mustNotDrain = port.write(data, encoding, e => {
                    if (e) reject(e);
                    else {
                        _c.promise.then(resolve, reject);
                    }
                });
                if (mustNotDrain) {
                    _c.promise = Promise.resolve();
                } else {
                    _c.promise = drainAsync();
                }
            }
        });
    }

    function listAsync() {
        return new Promise((resolve, reject) => {
            SerialPort.list().then(resolve, reject);
        });
    }

    function openAsync() {
        return new Promise((resolve, reject) => {
            if (!port) {
                reject('port does not exist');
            } else {
                port.open(e => {
                    if (e) reject(e);
                    else resolve();
                });
            }
        });
    }

    function closeAsync() {
        return new Promise((resolve, reject) => {
            if (!port) {
                resolve();
            } else {
                port.close(e => {
                    if (e) reject(e);
                    else resolve();
                });
            }
        });
    }

    async function enumerate() {
        const ports = await listAsync();
        const portsmap = {};

        ports.forEach(p => {
            portsmap[p.comName] = `${p.comName} (${p.manufacturer})`;
        });

        return portsmap;
    }

    async function connect() {
        const port_to_connect_to = port_selector.value;
        log(`connecting to ${port_to_connect_to}`);

        if (!port_to_connect_to) {
            error("Please select a port");
        } else {
            await disconnect();

            port = new SerialPort(port_to_connect_to, {
                baudRate: 115200,
                autoOpen: false
            });

            port.on('error', e => {
                error(e);
                disconnect().catch(() => { });
                port = null;
            });

            port.on('close', e => {
                port = null;
                log('disconnected');
            });

            port.on('data', d => {
                term.write(d.toString());
            });

            await openAsync();

            log('connected');
        }

    }

    async function disconnect() {
        if (port) {
            let pmse = closeAsync();
            port = null;
            await pmse;
        }
    }

    let updating = false;
    async function updatePorts() {
        if (updating) return;

        updating = true;
        port_selector.disabled = true;
        await disconnect();

        try {

            let ports = await enumerate();

            port_selector.disabled = false;
            while (port_selector.hasChildNodes()) {
                port_selector.removeChild(port_selector.lastChild);
            }

            port_selector.appendChild(new Option("Select a Port...", ""));

            Object.keys(ports)
                .map(p => new Option(ports[p], p))
                .forEach(option => {
                    port_selector.appendChild(option)
                });
        }
        finally {
            updating = false;
        }
    }

    async function write() {
        if (!port) return;

    }

    reloadports_button.addEventListener("click", () => {
        updatePorts().catch(error);
    });

    connect_button.addEventListener("click", () => {
        connect().catch(error);
    });

    disconnect_button.addEventListener("click", () => {
        disconnect().catch(error);
    });

    updatePorts().catch(error);



    //terminal bindings

    terminal.on('key', function (key, ev) {
        if (port) {
            writeAsync(key).catch(error);
        }
    });

    term.on('paste', function (data, ev) {
        writeAsync(data).catch(error);
    });

    function log(wut) {
        term.write(`${wut.toString()}\r\n`);
    }

    function error(wut) {
        term.write(`\u001b[31m${wut.toString()}\u001b[39m\r\n`);
    }

    function warn(wut) {
        term.write(`\u001b[33m${wut.toString()}\u001b[39m\r\n`);
    }

})(terminal);