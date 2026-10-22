import {createServer} from 'node:http';
import {WebSocketServer,WebSocket} from 'ws';
const port=Number(process.env.PORT||8080),rooms=new Map(),states=new Map();
const http=createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});response.end(JSON.stringify({ok:true,rooms:rooms.size}))});
const server=new WebSocketServer({server:http,maxPayload:4096});
function validRoom(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{6,24}$/.test(value)}
function send(client,message){if(client.readyState===WebSocket.OPEN)client.send(JSON.stringify(message))}
function broadcast(room,message,except){for(const client of rooms.get(room)||[])if(client!==except)send(client,message)}
server.on('connection',client=>{let joined;client.isAlive=true;client.on('pong',()=>client.isAlive=true);client.on('message',raw=>{try{const message=JSON.parse(raw.toString());if(message.type==='join'&&validRoom(message.room)){joined=message.room;if(!rooms.has(joined))rooms.set(joined,new Set());rooms.get(joined).add(client);if(states.has(joined))send(client,{type:'state',selected:states.get(joined)});return}if(!joined||message.room!==joined)return;if(message.type==='state'&&Array.isArray(message.selected)){states.set(joined,message.selected);broadcast(joined,{type:'state',selected:message.selected},client)}else if(message.type==='set-state'&&Array.isArray(message.selected))broadcast(joined,{type:'set-state',selected:message.selected},client);else if(message.type==='request-state'){if(states.has(joined))send(client,{type:'state',selected:states.get(joined)});broadcast(joined,{type:'request-state'},client)}}catch{}});client.on('close',()=>{if(!joined)return;const members=rooms.get(joined);members?.delete(client);if(!members?.size)rooms.delete(joined)})});
setInterval(()=>{for(const client of server.clients){if(client.isAlive===false){client.terminate();continue}client.isAlive=false;client.ping()}},30000);
http.listen(port,'0.0.0.0',()=>console.log(`Relay listening on ${port}`));
