const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const rooms = new Map();
const clients = new Map();

function code() {
  let c;
  do c = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(c));
  return c;
}
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function roomPayload(room) {
  return {
    type: 'room', roomCode: room.code, hostId: room.hostId,
    members: room.members.map(m => ({clientId:m.clientId,name:m.name,connected:m.connected})),
    gameState: room.gameState || null
  };
}
function broadcastRoom(room) {
  const payload = JSON.stringify(roomPayload(room));
  for (const m of room.members) {
    const c = clients.get(m.clientId);
    if (c?.ws?.readyState === WebSocket.OPEN) c.ws.send(payload);
  }
}
function findRoomByClient(clientId) {
  for (const room of rooms.values()) if (room.members.some(m => m.clientId === clientId)) return room;
  return null;
}
function leaveRoom(clientId) {
  const room = findRoomByClient(clientId);
  if (!room) return;
  room.members = room.members.filter(m => m.clientId !== clientId);
  if (!room.members.length) { rooms.delete(room.code); return; }
  if (room.hostId === clientId) room.hostId = room.members[0].clientId;
  broadcastRoom(room);
}
function safeName(name) {
  return String(name || '').trim().slice(0,12) || '플레이어';
}

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const server = http.createServer((req,res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/healthz') {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end('ok');
  }
  let urlPath = pathname;
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err,data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  });
});

const wss = new WebSocket.Server({server, path:'/ws'});
wss.on('connection', ws => {
  let clientId = '';
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'hello') {
      clientId = String(msg.clientId || '') || `c_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
      clients.set(clientId,{ws});
      send(ws,{type:'identity',clientId});
      if (msg.roomCode && rooms.has(String(msg.roomCode))) {
        const room = rooms.get(String(msg.roomCode));
        let member = room.members.find(m => m.clientId === clientId);
        if (!member && room.members.length < 6 && !room.gameState) {
          member = {clientId,name:safeName(msg.name),connected:true}; room.members.push(member);
        }
        if (member) { member.connected = true; if (msg.name) member.name=safeName(msg.name); broadcastRoom(room); }
      }
      return;
    }
    if (!clientId) return send(ws,{type:'error',message:'연결 초기화 중입니다. 잠시 후 다시 시도해 주세요.'});
    if (msg.type === 'create') {
      leaveRoom(clientId);
      const room = {code:code(),hostId:clientId,members:[{clientId,name:safeName(msg.name),connected:true}],gameState:null};
      rooms.set(room.code,room); broadcastRoom(room); return;
    }
    if (msg.type === 'join') {
      const room = rooms.get(String(msg.roomCode || ''));
      if (!room) return send(ws,{type:'error',message:'방을 찾을 수 없습니다.'});
      if (room.gameState) return send(ws,{type:'error',message:'이미 시작한 게임에는 새로 참가할 수 없습니다.'});
      if (room.members.length >= 6 && !room.members.some(m=>m.clientId===clientId)) return send(ws,{type:'error',message:'방이 가득 찼습니다.'});
      leaveRoom(clientId);
      let member=room.members.find(m=>m.clientId===clientId);
      if(!member){member={clientId,name:safeName(msg.name),connected:true};room.members.push(member);} else {member.connected=true;member.name=safeName(msg.name);}
      broadcastRoom(room); return;
    }
    if (msg.type === 'leave') { leaveRoom(clientId); send(ws,{type:'room',roomCode:'',hostId:null,members:[],gameState:null}); return; }
    const room = rooms.get(String(msg.roomCode || ''));
    if (!room || !room.members.some(m=>m.clientId===clientId)) return;
    if (msg.type === 'start') {
      if (room.hostId !== clientId) return send(ws,{type:'error',message:'방장만 시작할 수 있습니다.'});
      if (room.members.filter(m=>m.connected).length < 2) return send(ws,{type:'error',message:'최소 2명이 필요합니다.'});
      room.gameState = msg.gameState;
      const payload=JSON.stringify({type:'game',gameState:room.gameState});
      room.members.forEach(m=>{const c=clients.get(m.clientId);if(c?.ws?.readyState===WebSocket.OPEN)c.ws.send(payload);});
      return;
    }
    if (msg.type === 'sync' && room.gameState) {
      // Prototype: only a room member may publish state. UI limits actions to the proper player.
      room.gameState = msg.gameState;
      const payload=JSON.stringify({type:'game',gameState:room.gameState});
      room.members.forEach(m=>{if(m.clientId!==clientId){const c=clients.get(m.clientId);if(c?.ws?.readyState===WebSocket.OPEN)c.ws.send(payload);}});
    }
  });
  ws.on('close', () => {
    if (!clientId) return;
    const room=findRoomByClient(clientId);
    if(room){const m=room.members.find(x=>x.clientId===clientId);if(m)m.connected=false;broadcastRoom(room);}
    const c=clients.get(clientId); if(c?.ws===ws) clients.delete(clientId);
  });
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Acquire Online: http://localhost:${PORT}`));
