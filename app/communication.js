"use strict";

(function (term) {

    const prompt = require('electron-prompt');
    const SerialPort = require('serialport');

    const el = document.getElementById.bind(document);

    const port_selector = el("port_selector");
    const reloadports_button = el("reloadports_button");
    const connect_button = el("connect_button");
    const file_list = el("file_list");
    const reloadfiles_button = el("reloadfiles_button");
    const save_current_button = el("save_current_button");
    const exec_current_button = el("exec_current_button");
    const exec_selection_button = el("exec_selection_button");


    let port;
    let cmd_history = "";
    let invisible = false;

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

    function writeInternalAsync(data, encoding) {
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

    async function writeAsync(data, encoding) {
        let chunk = data;
        while(chunk.length > 0) {
            if(chunk.length > 100) {
                await writeInternalAsync(chunk.substring(0, 100));
                await delay(50);
                chunk = chunk.substring(100);
            } else {
                await writeInternalAsync(chunk);
                chunk = '';
            }
        }
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
            connect_button.disabled = true;
            disconnect_button.disabled = true;
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
                connect_button.disabled = false;
                disconnect_button.disabled = true;
            });

            port.on('data', d => {
                const str = d.toString();
                cmd_history += str;

                if (!invisible) {
                    term.write(str);
                }
            });

            await openAsync();


            connect_button.disabled = true;
            disconnect_button.disabled = false;
            log('connected');

            await reloadfiles();
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

    // files
    function delay(howlong) {
        return new Promise((resolve, reject) => {
            setTimeout(() => { resolve(); }, howlong);
        });
    }

    async function command(cmd) {
        //invisible = true;

        try {
            cmd_history = "";
            const mgc = 100000000 + parseInt(Math.random() * 1000000000);
            const rxresult = new RegExp(`>>>${mgc}([\\S\\s]*)<<<${mgc}`);
            console.log(cmd);
            await writeAsync(`\n\nuart.echo(0)\n\n=">>>${mgc}"\n${cmd}\n="<<<${mgc}"\n\nuart.echo(1)\n`);

            let match;
            for (let i = 0; i < 10; i++) {
                match = cmd_history.match(rxresult);
                if (match) break;
                await delay(300);
            }

            if (!match) {
                error("command failed");
            } else {
                return match[1].trim();
            }
        } finally {
            invisible = false;
        }
    }

    async function listfiles() {
        let result = await command('do _l = file.list(); for k,v in pairs(_l) do print(k) end end');
        return result.split(/\r?\n/).map(f => f.trim());
    }

    async function writefile(name, contents) {
        const cmdstr = `
fd = file.open("${name}", "w")
${contents.split(/\r?\n/).map(line => `fd:writeline([==[${line}]==])`).join("\n")}
fd:flush()
fd:close()`;

        const result = await command(cmdstr);

        if (/write-error/.test(result)) {
            error("could not write file");
        }
    }

    async function readfile(name) {
        const mgc = 100000000 + parseInt(Math.random() * 1000000000);
        const cmdstr = `do
            fd = file.open("${name}", "r")
            if fd then
                eof = false;
                while not eof do
                    contents = fd:readline();
                    if contents == nil then
                        eof = true;
                    else
                        uart.write(0, contents);
                    end
                end
                fd:close();
            else
                print('${mgc}-error');
            end
        end`;

        const result = await command(cmdstr);

        if (new RegExp(`${mgc}-error`).test(result)) {
            error("could not read file");
        } else {
            return result;
        }
    }



    // file list ui
    const reloadfiles = async () => {
        const files = await listfiles()
        while (file_list.lastChild) {
            file_list.removeChild(file_list.lastChild);
        }

        files.forEach(file => {
            file_list.appendChild(file_li(file));
        });
    }

    const savefile = async (defaultname) => {

        const data = editor.getValue();

        if (!data) {
            alert('nothing to save');
        } else {
            const fn = await prompt({ title: 'Save File', label: 'Filename:', value: defaultname });

            if (fn) {
                try {
                    await writefile(fn, data);
                    await reloadfiles();
                } catch (e) {
                    error(e);
                }
            }
        }
    }

    const file_li = (name) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        const b1 = document.createElement('a');
        const b2 = document.createElement('a');

        span.textContent = name;

        b1.className = 'delete';
        b1.href = 'javascript:void(0)';
        b1.addEventListener('click', () => confirm("are you sure?") ? concole.log("TODO") : null);

        b2.className = 'load';
        b2.href = 'javascript:void(0)';
        b2.addEventListener('click', () => confirm("load the file?") ? readfile(name).catch(error).then(contents => contents ? editor.setValue(contents) : null) : null);

        li.appendChild(span);
        li.appendChild(b1);
        li.appendChild(b2);

        return li;
    }

    reloadfiles_button.addEventListener('click', () => {
        reloadfiles().catch(error);
    });

    save_current_button.addEventListener('click', () => {
        savefile().catch(error);
    });
})(terminal);