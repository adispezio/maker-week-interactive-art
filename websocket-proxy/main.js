const WebSocket = require('ws')

const localServer = new WebSocket.Server({ port: 8080 })
const pluginServer = new WebSocket.Server({ port: 8081 })

let pluginSockets = [];

localServer.on('connection', ws => {
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
