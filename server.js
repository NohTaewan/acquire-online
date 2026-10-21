const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DISCONNECT_GRACE_MS = 30_000;
const rooms = new Map();
const clients = new Map();
const disconnectTimers = new Map();

function code() {
  let c;
  do c = String(Math.floor(100000 + Math.random() * 900000)); while (rooms.has(c));
  return c;
}
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function timerKey(roomCode, clientId) { return `${roomCode}:${clientId}`; }
function clearDisconnectTimer(roomCode, clientId) {
  const key = timerKey(roomCode, clientId);
  const timer = disconnectTimers.get(key);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(key);
}
function automationAuthority(room) {
  const available = room.members.filter(m => m.connected && !m.left);
  if (!available.length) return null;
  return available.find(m => m.clientId === room.hostId)?.clientId || available[0].clientId;
}
function roomPayload(room) {
  return {
    type: 'room', roomCode: room.code, hostId: room.hostId,
    automationAuthorityId: automationAuthority(room),
    pendingDepartures: room.pendingDepartures || [],
    members: room.members.map(m => ({
      clientId:m.clientId, name:m.name, connected:!!m.connected,
      autoPlay:!!m.autoPlay, left:!!m.left,
      disconnectedAt:Number(m.disconnectedAt)||0,
      disconnectDeadline:Number(m.disconnectDeadline)||0,
    })),
    gameState: room.gameState || null
  };
}
function broadcastRoom(room) {
  const payload = JSON.stringify(roomPayload(room));
  for (const m of room.members) {
    if (m.left) continue;
    const c = clients.get(m.clientId);
    if (c?.ws?.readyState === WebSocket.OPEN) c.ws.send(payload);
  }
}
function findRoomByClient(clientId) {
  for (const room of rooms.values()) if (room.members.some(m => m.clientId === clientId && !m.left)) return room;
  return null;
}
function chooseNewHost(room) {
  if (room.members.some(m => m.clientId === room.hostId && !m.left)) return;
  room.hostId = room.members.find(m => m.connected && !m.left)?.clientId || room.members.find(m => !m.left)?.clientId || null;
}
function removeMember(room, clientId) {
  clearDisconnectTimer(room.code, clientId);
  room.members = room.members.filter(m => m.clientId !== clientId);
  chooseNewHost(room);
  if (!room.members.length) rooms.delete(room.code);
}
function queueSetupDeparture(room, member, reason) {
  if (!member) return;
  const action = {clientId:member.clientId, name:member.name, reason, at:Date.now()};
  room.pendingDepartures = room.pendingDepartures || [];
  if (!room.pendingDepartures.some(x => x.clientId === member.clientId)) room.pendingDepartures.push(action);
  removeMember(room, member.clientId);
  if (rooms.has(room.code)) broadcastRoom(room);
}
function markAutoPlay(room, member, reason, left=false) {
  if (!member) return;
  clearDisconnectTimer(room.code, member.clientId);
  member.connected = false;
  member.autoPlay = true;
  member.left = !!left;
  member.disconnectedAt = Number(member.disconnectedAt) || Date.now();
  member.disconnectDeadline = 0;
  member.autoReason = reason;
  if (member.clientId === room.hostId) {
    const replacement = room.members.find(m => m.clientId !== member.clientId && m.connected && !m.left);
    if (replacement) room.hostId = replacement.clientId;
  }
  broadcastRoom(room);
}
function expireDisconnect(roomCode, clientId) {
  disconnectTimers.delete(timerKey(roomCode, clientId));
  const room = rooms.get(roomCode);
  if (!room) return;
  const member = room.members.find(m => m.clientId === clientId);
  if (!member || member.connected || member.left) return;
  const phase = room.gameState?.phase;
  if (!room.gameState || room.gameState?.screen !== 'game') {
    removeMember(room, clientId);
    if (rooms.has(roomCode)) broadcastRoom(room);
    return;
  }
  if (phase === 'SETUP_PICK' || phase === 'SETUP_REVEAL') {
    queueSetupDeparture(room, member, 'reconnect_timeout');
    return;
  }
  markAutoPlay(room, member, 'reconnect_timeout', false);
}
function scheduleDisconnect(room, member) {
  if (!room || !member || member.left) return;
  clearDisconnectTimer(room.code, member.clientId);
  member.connected = false;
  member.autoPlay = false;
  member.disconnectedAt = Date.now();
  member.disconnectDeadline = Date.now() + DISCONNECT_GRACE_MS;
  const timer = setTimeout(() => expireDisconnect(room.code, member.clientId), DISCONNECT_GRACE_MS);
  disconnectTimers.set(timerKey(room.code, member.clientId), timer);
  broadcastRoom(room);
}
function safeName(name) {
  return String(name || '').trim().slice(0,12) || '플레이어';
}

const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg','.ogg':'audio/ogg'};
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
          member = {clientId,name:safeName(msg.name),connected:true,autoPlay:false,left:false,disconnectedAt:0,disconnectDeadline:0};
          room.members.push(member);
        }
        if (member && !member.left) {
          clearDisconnectTimer(room.code, clientId);
          const disconnectedFor = member.disconnectedAt ? Math.max(0,Date.now()-Number(member.disconnectedAt)) : 0;
          const currentGamePlayer = room.gameState?.players?.[room.gameState?.currentPlayer];
          if (disconnectedFor && currentGamePlayer?.clientId===clientId && Number(room.gameState?.turnDeadline)>0) {
            room.gameState.turnDeadline += disconnectedFor; // 재접속 유예 동안 턴 타이머를 사실상 일시정지
          }
          member.connected = true;
          member.autoPlay = false;
          member.disconnectedAt = 0;
          member.disconnectDeadline = 0;
          if (msg.name) member.name=safeName(msg.name);
          broadcastRoom(room);
        }
      }
      return;
    }
    if (!clientId) return send(ws,{type:'error',message:'연결 초기화 중입니다. 잠시 후 다시 시도해 주세요.'});
    if (msg.type === 'create') {
      const old = findRoomByClient(clientId);
      if (old) removeMember(old, clientId);
      const room = {code:code(),hostId:clientId,members:[{clientId,name:safeName(msg.name),connected:true,autoPlay:false,left:false,disconnectedAt:0,disconnectDeadline:0}],gameState:null,pendingDepartures:[]};
      rooms.set(room.code,room); broadcastRoom(room); return;
    }
    if (msg.type === 'join') {
      const room = rooms.get(String(msg.roomCode || ''));
      if (!room) return send(ws,{type:'error',message:'방을 찾을 수 없습니다.'});
      if (room.gameState) return send(ws,{type:'error',message:'이미 시작한 게임에는 새로 참가할 수 없습니다.'});
      if (room.members.length >= 6 && !room.members.some(m=>m.clientId===clientId)) return send(ws,{type:'error',message:'방이 가득 찼습니다.'});
      const old=findRoomByClient(clientId); if(old && old!==room) removeMember(old,clientId);
      let member=room.members.find(m=>m.clientId===clientId);
      if(!member){member={clientId,name:safeName(msg.name),connected:true,autoPlay:false,left:false,disconnectedAt:0,disconnectDeadline:0};room.members.push(member);}
      else {clearDisconnectTimer(room.code,clientId);member.connected=true;member.autoPlay=false;member.left=false;member.disconnectedAt=0;member.disconnectDeadline=0;member.name=safeName(msg.name);}
      broadcastRoom(room); return;
    }
    if (msg.type === 'leave') {
      const room = findRoomByClient(clientId);
      if (!room) { send(ws,{type:'room',roomCode:'',hostId:null,members:[],gameState:null}); return; }
      const member = room.members.find(m=>m.clientId===clientId);
      const phase = room.gameState?.phase;
      if (!room.gameState || room.gameState?.screen !== 'game') {
        removeMember(room, clientId);
        if (rooms.has(room.code)) broadcastRoom(room);
      } else if (phase === 'SETUP_PICK' || phase === 'SETUP_REVEAL') {
        queueSetupDeparture(room, member, 'left');
      } else {
        markAutoPlay(room, member, 'left', true);
        if (room.members.every(m=>m.left)) rooms.delete(room.code);
      }
      send(ws,{type:'room',roomCode:'',hostId:null,automationAuthorityId:null,pendingDepartures:[],members:[],gameState:null});
      return;
    }
    const room = rooms.get(String(msg.roomCode || ''));
    if (!room || !room.members.some(m=>m.clientId===clientId && !m.left)) return;
    if (msg.type === 'emote') {
      const member=room.members.find(m=>m.clientId===clientId && !m.left);
      if (!member) return;
      const now=Date.now();
      const payload={
        type:'emote', clientId,
        id:String(msg.id||`e_${now}`).slice(0,80),
        emoji:String(msg.emoji||'💬').slice(0,16),
        text:String(msg.text||'').slice(0,40),
        source:String(msg.source||'basic').slice(0,16),
        createdAt:now, expiresAt:now+3000
      };
      const encoded=JSON.stringify(payload);
      room.members.forEach(m=>{ if(!m.left){ const c=clients.get(m.clientId); if(c?.ws?.readyState===WebSocket.OPEN)c.ws.send(encoded); } });
      return;
    }
    if (msg.type === 'start') {
      if (room.hostId !== clientId) return send(ws,{type:'error',message:'방장만 시작할 수 있습니다.'});
      if (room.members.filter(m=>m.connected && !m.left).length < 2) return send(ws,{type:'error',message:'최소 2명이 필요합니다.'});
      room.gameState = msg.gameState;
      room.pendingDepartures=[];
      const payload=JSON.stringify({type:'game',gameState:room.gameState});
      room.members.forEach(m=>{const c=clients.get(m.clientId);if(c?.ws?.readyState===WebSocket.OPEN)c.ws.send(payload);});
      broadcastRoom(room);
      return;
    }
    if (msg.type === 'sync' && room.gameState) {
      room.gameState = msg.gameState;
      const presentIds = new Set((room.gameState?.players || []).map(p=>p.clientId));
      room.pendingDepartures = (room.pendingDepartures||[]).filter(x=>presentIds.has(x.clientId));
      if (room.gameState?.screen === 'lobby') {
        room.gameState = null;
        room.pendingDepartures=[];
        broadcastRoom(room);
        return;
      }
      const payload=JSON.stringify({type:'game',gameState:room.gameState});
      room.members.forEach(m=>{if(m.clientId!==clientId){const c=clients.get(m.clientId);if(c?.ws?.readyState===WebSocket.OPEN)c.ws.send(payload);}});
      broadcastRoom(room);
    }
  });
  ws.on('close', () => {
    if (!clientId) return;
    const c=clients.get(clientId);
    if(c?.ws!==ws) return; // 이미 새 WebSocket으로 재연결된 경우 오래된 close 이벤트는 무시
    clients.delete(clientId);
    const room=findRoomByClient(clientId);
    if(room){
      const m=room.members.find(x=>x.clientId===clientId);
      if(m && !m.left) scheduleDisconnect(room,m);
    }
  });
});

server.listen(PORT,'0.0.0.0',()=>console.log(`Acquire Online: http://localhost:${PORT}`));
