const WebSocket = require('ws')

const externalPort = 16001;
const pluginPort = 16002;

const externalServer = new WebSocket.Server({ port: externalPort })
const pluginServer = new WebSocket.Server({ port: pluginPort })

let pluginSockets = [];
let externalSockets = [];

externalServer.on('connection', ws => {
  externalSockets.push(ws)
  ws.on('message', message => {
    for (const pluginSocket of pluginSockets) {
      pluginSocket.send(message);
    }
  })
  ws.on('close', () => {
    externalSockets = externalSockets.filter(socket => socket !== ws);
  });
})

pluginServer.on('connection', ws => {
  pluginSockets.push(ws);
  externalSockets.forEach(sock => sock.send(JSON.stringify({ type: 'init' })))

  ws.on('close', () => {
    pluginSockets = pluginSockets.filter(socket => socket !== ws);
  });
})

console.log(
  `Listening on localhost:${externalPort} and localhost:${pluginPort}...`
);
