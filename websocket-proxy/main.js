const WebSocket = require('ws')

const externalPort = 16001;
const pluginPort = 16002;

const externalServer = new WebSocket.Server({ port: externalPort })
const pluginServer = new WebSocket.Server({ port: pluginPort })

let pluginSockets = [];

externalServer.on('connection', ws => {
  ws.on('message', message => {
    for (const pluginSocket of pluginSockets) {
      pluginSocket.send(message);
    }
  })
})

pluginServer.on('connection', ws => {
  pluginSockets.push(ws);

  ws.on('close', () => {
    pluginSockets = pluginSockets.filter(socket => socket !== ws);
  });
})

console.log(
  `Listening on localhost:${externalPort} and localhost:${pluginPort}...`
);
