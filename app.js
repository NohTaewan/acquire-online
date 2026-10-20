(() => {
  const ROWS = ['A','B','C','D','E','F','G','H','I'];
  const COLS = Array.from({length:12}, (_,i)=>i+1);
  const ALL_TILES = ROWS.flatMap(r => COLS.map(c => `${c}${r}`));
  const HOTEL_CHAINS = [
    {id:'Sackson', name:'색슨', color:'#e84e5f', base:200, mark:'S'},
    {id:'Tower', name:'타워', color:'#d7a93a', base:200, mark:'T'},
    {id:'American', name:'아메리칸', color:'#5b78d4', base:300, mark:'A'},
    {id:'Festival', name:'페스티벌', color:'#2ec59f', base:300, mark:'F'},
    {id:'Worldwide', name:'월드와이드', color:'#9061c7', base:400, mark:'W'},
    {id:'Continental', name:'콘티넨탈', color:'#28a6ca', base:400, mark:'C'},
    {id:'Imperial', name:'임페리얼', color:'#f08a32', base:500, mark:'I'},
  ];
  const CHAIN = Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,h]));

  const state = {
    screen: 'lobby',
    lobbyPlayers: ['플레이어 1','플레이어 2'],
    players: [],
    roomCode: randomCode(),
    currentPlayer: 0,
    board: {},
    hands: [],
    remainingDeck: [],
    chainBank: Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,25])),
    selectedTile: null,
    pendingPlacement: null,
    pendingBuy: Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0])),
    phase: 'PLACE_TILE',
    round: 1,
    toast: '',
    modal: null,
    merger: null,
    logs: [],
    results: null,
    setupSeeds: [],
  };

  const app = document.getElementById('app');

  const net = {
    ws: null,
    clientId: localStorage.getItem('acquireClientId') || '',
    roomCode: localStorage.getItem('acquireRoomCode') || '',
    hostId: null,
    members: [],
    connected: false,
    name: localStorage.getItem('acquirePlayerName') || '',
  };


  const ui = {
    modal: null,
    startIntro: false,
    settings: (() => {
      try { return Object.assign({boardScale:100,showHints:true,reducedMotion:false}, JSON.parse(localStorage.getItem('acquireUiSettings')||'{}')); }
      catch { return {boardScale:100,showHints:true,reducedMotion:false}; }
    })(),
  };

  function saveUiSettings(){
    localStorage.setItem('acquireUiSettings', JSON.stringify(ui.settings));
    applyUiSettings();
  }
  function applyUiSettings(){
    document.documentElement.style.setProperty('--board-scale', String(ui.settings.boardScale/100));
    document.body.classList.toggle('reduced-motion', !!ui.settings.reducedMotion);
    document.body.classList.toggle('hide-hints', !ui.settings.showHints);
  }
  function showStartIntro(){
    ui.startIntro=true; render();
    clearTimeout(showStartIntro._t);
    showStartIntro._t=setTimeout(()=>{ui.startIntro=false; render();}, 2600);
  }

  function connectNetwork() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    net.ws = new WebSocket(`${proto}//${location.host}/ws`);
    net.ws.addEventListener('open', () => {
      net.connected = true;
      sendNet({type:'hello', clientId:net.clientId, roomCode:net.roomCode, name:net.name});
      render();
    });
    net.ws.addEventListener('message', (event) => {
      let msg; try { msg=JSON.parse(event.data); } catch { return; }
      if(msg.type==='identity') {
        net.clientId=msg.clientId; localStorage.setItem('acquireClientId',net.clientId);
      }
      if(msg.type==='room') {
        net.roomCode=msg.roomCode || ''; net.hostId=msg.hostId || null; net.members=msg.members || [];
        if(net.roomCode) localStorage.setItem('acquireRoomCode',net.roomCode); else localStorage.removeItem('acquireRoomCode');
        if(msg.gameState) applyRemoteState(msg.gameState);
        else if(state.screen!=='game') render();
      }
      if(msg.type==='game') applyRemoteState(msg.gameState);
      if(msg.type==='error') toast(msg.message || '네트워크 오류가 발생했습니다.');
    });
    net.ws.addEventListener('close', () => {
      net.connected=false; render(); setTimeout(connectNetwork,1500);
    });
  }
  function sendNet(payload) {
    if(net.ws && net.ws.readyState===WebSocket.OPEN) net.ws.send(JSON.stringify(payload));
  }
  function snapshotState() {
    const copy=JSON.parse(JSON.stringify(state));
    copy.toast='';
    return copy;
  }
  function syncState() { if(net.roomCode && state.screen==='game') sendNet({type:'sync', roomCode:net.roomCode, gameState:snapshotState()}); }
  function applyRemoteState(remote) {
    if(!remote) return;
    const wasLobby=state.screen!=='game';
    Object.keys(state).forEach(k=>delete state[k]);
    Object.assign(state, remote);
    state.toast='';
    if(wasLobby && state.screen==='game') showStartIntro();
    else render();
  }
  function localDo(fn) { fn(); syncState(); }
  function myPlayerIndex() { return state.players.findIndex(p=>p.clientId===net.clientId); }
  function canControlCurrent() { return state.screen==='game' && state.players[state.currentPlayer]?.clientId===net.clientId; }
  function isHost() { return net.hostId===net.clientId; }

  function randomCode() { return String(Math.floor(100000 + Math.random()*900000)); }
  function shuffle(arr) {
    const copy = [...arr];
    for (let i=copy.length-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      [copy[i],copy[j]]=[copy[j],copy[i]];
    }
    return copy;
  }
  function money(n) { return '$' + Math.max(0,Math.round(n)).toLocaleString('en-US'); }
  function escapeHtml(str) { return String(str).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
  function chainName(id) { return CHAIN[id]?.name || id; }
  function chainColor(id) { return CHAIN[id]?.color || '#8fa9c2'; }
  function log(msg) { state.logs.unshift(msg); state.logs = state.logs.slice(0,18); }
  function toast(msg) {
    state.toast = msg; render();
    clearTimeout(toast._t);
    toast._t=setTimeout(()=>{state.toast='';render();},1800);
  }

  function coord(tile) {
    const m = tile.match(/(\d+)([A-I])/);
    return {c:Number(m[1]), r:ROWS.indexOf(m[2])};
  }
  function tileSortValue(tile) {
    const {c,r}=coord(tile);
    return c*100+r; // 공식 시작 순서: 낮은 숫자 우선, 같은 숫자는 앞 알파벳 우선
  }
  function neighbors(tile) {
    const {c,r}=coord(tile); const out=[];
    [[c-1,r],[c+1,r],[c,r-1],[c,r+1]].forEach(([cc,rr])=>{
      if (cc>=1&&cc<=12&&rr>=0&&rr<9) out.push(`${cc}${ROWS[rr]}`);
    });
    return out;
  }
  function isOccupied(tile) { return !!state.board[tile]; }
  function chainSize(id) { return Object.values(state.board).filter(v=>v.chain===id).length; }
  function activeChains() { return HOTEL_CHAINS.filter(h=>chainSize(h.id)>=2).map(h=>h.id); }
  function isSafe(id) { return chainSize(id)>=11; }
  function inactiveChains() { return HOTEL_CHAINS.map(h=>h.id).filter(id=>chainSize(id)===0); }
  function stockPrice(id, size=chainSize(id)) {
    if (size < 2) return CHAIN[id].base;
    let bump=0;
    if (size===2) bump=0;
    else if (size===3) bump=100;
    else if (size===4) bump=200;
    else if (size===5) bump=300;
    else if (size<=10) bump=400;
    else if (size<=20) bump=500;
    else if (size<=30) bump=600;
    else if (size<=40) bump=700;
    else bump=800;
    return CHAIN[id].base+bump;
  }
  function bonuses(id, size=chainSize(id)) {
    const p=stockPrice(id,size); return {major:p*10, minor:p*5};
  }
  function roundUp100(n) { return Math.ceil(n/100)*100; }

  function addPlayer() {
    if (state.lobbyPlayers.length>=6) return toast('최대 6명까지 참가할 수 있어요.');
    state.lobbyPlayers.push(`플레이어 ${state.lobbyPlayers.length+1}`); render();
  }
  function removePlayer(i) {
    if (state.lobbyPlayers.length<=2) return toast('최소 2명이 필요해요.');
    state.lobbyPlayers.splice(i,1); render();
  }
  function updatePlayer(i,v) { state.lobbyPlayers[i]=v.trimStart().slice(0,12); }

  function startGame() {
    if(!isHost()) return toast('방장만 게임을 시작할 수 있어요.');
    const members=net.members.filter(m=>m.connected!==false).slice(0,6);
    if(members.length<2) return toast('최소 2명이 필요해요.');
    const names=members.map((m,i)=>(m.name||`플레이어 ${i+1}`).trim());
    if(new Set(names).size!==names.length) return toast('플레이어 이름은 서로 다르게 해 주세요.');
    resetGameState();
    let deck=shuffle(ALL_TILES);
    const seeds=members.map((m,i)=>({name:names[i],clientId:m.clientId,tile:deck.shift()})).sort((a,b)=>tileSortValue(a.tile)-tileSortValue(b.tile));
    state.setupSeeds=seeds;
    state.players=seeds.map((s,i)=>({
      id:`p${Date.now()}_${i}`, clientId:s.clientId, name:s.name, cash:6000, profileColor:seatColor(i),
      stocks:Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]))
    }));
    state.board={};
    seeds.forEach(s=>state.board[s.tile]={chain:null,seed:true});
    state.remainingDeck=deck;
    state.hands=state.players.map(()=>state.remainingDeck.splice(0,6));
    state.screen='game'; state.currentPlayer=0; state.phase='PLACE_TILE'; state.round=1;
    log(`게임 시작 · ${state.players[0].name} 선 플레이 (${seeds[0].tile})`);
    log(`초기 타일: ${seeds.map(s=>`${s.name} ${s.tile}`).join(' · ')}`);
    sendNet({type:'start',roomCode:net.roomCode,gameState:snapshotState()});
    showStartIntro();
  }

  function resetGameState() {
    state.players=[]; state.board={}; state.hands=[]; state.remainingDeck=[];
    state.chainBank=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,25]));
    state.selectedTile=null; state.pendingPlacement=null; state.phase='PLACE_TILE'; state.currentPlayer=0;
    state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
    state.modal=null; state.merger=null; state.logs=[]; state.results=null; state.setupSeeds=[];
  }

  function newGame() {
    resetGameState(); state.screen='lobby'; state.roomCode=randomCode(); render();
  }

  function connectedNulls(startTiles) {
    const q=[...startTiles]; const seen=new Set();
    while(q.length){
      const t=q.shift();
      if(seen.has(t)||!state.board[t]||state.board[t].chain!==null) continue;
      seen.add(t);
      neighbors(t).forEach(n=>{ if(state.board[n]&&state.board[n].chain===null&&!seen.has(n)) q.push(n); });
    }
    return [...seen];
  }

  function analyzePlacement(tile) {
    const adj=neighbors(tile).filter(isOccupied);
    const adjChains=[...new Set(adj.map(t=>state.board[t].chain).filter(Boolean))];
    const adjNulls=adj.filter(t=>state.board[t].chain===null);
    if (adjChains.length>=2) {
      const safe=adjChains.filter(isSafe);
      if (safe.length>=2) return {type:'PERMANENT', reason:'안전 체인끼리는 합병할 수 없습니다.', chains:adjChains};
      const sizes=Object.fromEntries(adjChains.map(id=>[id,chainSize(id)]));
      return {type:'MERGER',chains:adjChains,sizes,adjNulls};
    }
    if (adjChains.length===1) return {type:'GROW',chain:adjChains[0],adjNulls};
    if (adjNulls.length>0) {
      if (inactiveChains().length===0) return {type:'TEMPORARY',reason:'7개 체인이 모두 설립되어 새 체인을 만들 수 없습니다.'};
      return {type:'FOUND',adjNulls};
    }
    return {type:'SINGLE'};
  }

  function playability(tile) {
    const a=analyzePlacement(tile);
    if(a.type==='PERMANENT') return {ok:false,kind:'permanent',reason:a.reason};
    if(a.type==='TEMPORARY') return {ok:false,kind:'temporary',reason:a.reason};
    return {ok:true,kind:'playable'};
  }

  function selectTile(tile) {
    if(state.phase!=='PLACE_TILE'||!canControlCurrent()) return;
    const p=playability(tile);
    if(!p.ok) return toast(p.reason);
    state.selectedTile=state.selectedTile===tile?null:tile; render();
  }

  function placeTile(tile) {
    if(state.phase!=='PLACE_TILE') return;
    const hand=state.hands[state.currentPlayer];
    if(!hand.includes(tile)||state.selectedTile!==tile) return;
    const analysis=analyzePlacement(tile);
    if(analysis.type==='PERMANENT'||analysis.type==='TEMPORARY') return toast(analysis.reason);
    state.hands[state.currentPlayer]=hand.filter(t=>t!==tile);
    state.selectedTile=null;
    state.board[tile]={chain:null};
    state.pendingPlacement={tile,analysis};

    if(analysis.type==='SINGLE') {
      log(`${currentPlayer().name}: ${tile} 단독 타일 배치`); finishPlacement();
    } else if(analysis.type==='GROW') {
      absorbIntoChain(tile,analysis.chain);
      log(`${currentPlayer().name}: ${tile} → ${chainName(analysis.chain)} 성장 (${chainSize(analysis.chain)}칸)`); finishPlacement();
    } else if(analysis.type==='FOUND') {
      state.phase='CHOOSE_CHAIN';
      state.modal={type:'chooseChain'}; render();
    } else if(analysis.type==='MERGER') {
      prepareMerger(tile,analysis);
    }
  }

  function absorbIntoChain(tile,id) {
    state.board[tile].chain=id;
    const nulls=connectedNulls(neighbors(tile).filter(n=>state.board[n]?.chain===null));
    nulls.forEach(t=>state.board[t].chain=id);
  }

  function foundChain(id) {
    if(state.phase!=='CHOOSE_CHAIN'||!inactiveChains().includes(id)) return;
    const tile=state.pendingPlacement.tile;
    state.board[tile].chain=id;
    connectedNulls(neighbors(tile).filter(n=>state.board[n]?.chain===null)).forEach(t=>state.board[t].chain=id);
    if(state.chainBank[id]>0){
      currentPlayer().stocks[id]++; state.chainBank[id]--;
      log(`${currentPlayer().name}: ${chainName(id)} 창립 · 창립자 주식 1주 획득`);
    } else log(`${currentPlayer().name}: ${chainName(id)} 창립 (은행 주식 없음)`);
    state.modal=null; finishPlacement();
  }

  function prepareMerger(tile,analysis) {
    const max=Math.max(...analysis.chains.map(id=>analysis.sizes[id]));
    const candidates=analysis.chains.filter(id=>analysis.sizes[id]===max);
    state.merger={tile, chains:analysis.chains, sizes:{...analysis.sizes}, survivor:null, defunct:[], chainIndex:0, playerQueue:[], playerPos:0, bonusText:[]};
    if(candidates.length>1){
      state.phase='CHOOSE_SURVIVOR'; state.modal={type:'chooseSurvivor',candidates}; render();
    } else chooseSurvivor(candidates[0]);
  }

  function chooseSurvivor(id) {
    if(!state.merger) return;
    state.merger.survivor=id;
    state.merger.defunct=[];
    state.merger.remainingDefunct=state.merger.chains.filter(c=>c!==id);
    state.modal=null;
    log(`${currentPlayer().name}: 합병 발생 · 존속 ${chainName(id)}`);
    selectNextDefunct();
  }

  function selectNextDefunct() {
    const m=state.merger;
    if(!m.remainingDefunct || !m.remainingDefunct.length) return finalizeMerger();
    const max=Math.max(...m.remainingDefunct.map(id=>m.sizes[id]));
    const candidates=m.remainingDefunct.filter(id=>m.sizes[id]===max);
    if(candidates.length>1){
      state.phase='CHOOSE_DEFUNCT';
      state.modal={type:'chooseDefunct',candidates};
      return render();
    }
    chooseDefunct(candidates[0]);
  }

  function chooseDefunct(id) {
    const m=state.merger; if(!m || !m.remainingDefunct?.includes(id)) return;
    m.remainingDefunct=m.remainingDefunct.filter(x=>x!==id);
    m.defunct.push(id);
    state.modal=null;
    processDefunctChain(id);
  }

  function payShareholderBonuses(chainId,size) {
    const holders=state.players.map((p,i)=>({i,count:p.stocks[chainId]})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count);
    if(!holders.length) return [];
    const {major,minor}=bonuses(chainId,size); const payouts=[];
    const top=holders[0].count; const topH=holders.filter(h=>h.count===top);
    if(topH.length>=2){
      const each=roundUp100((major+minor)/topH.length);
      topH.forEach(h=>{state.players[h.i].cash+=each;payouts.push(`${state.players[h.i].name} ${money(each)}`);});
    } else {
      state.players[topH[0].i].cash+=major; payouts.push(`${state.players[topH[0].i].name} ${money(major)}(1위)`);
      const rest=holders.filter(h=>h.count<top);
      if(rest.length===0){ state.players[topH[0].i].cash+=minor; payouts.push(`${state.players[topH[0].i].name} ${money(minor)}(2위 보너스)`); }
      else {
        const second=rest[0].count; const seconds=rest.filter(h=>h.count===second); const each=roundUp100(minor/seconds.length);
        seconds.forEach(h=>{state.players[h.i].cash+=each;payouts.push(`${state.players[h.i].name} ${money(each)}(2위)`);});
      }
    }
    return payouts;
  }

  function processDefunctChain(def) {
    const m=state.merger; const size=m.sizes[def];
    m.activeDefunct=def;
    const payouts=payShareholderBonuses(def,size);
    log(`${chainName(def)} 소멸 (${size}칸) · 보너스 ${payouts.length?payouts.join(', '):'주주 없음'}`);
    m.playerQueue=[];
    for(let k=0;k<state.players.length;k++){
      const idx=(state.currentPlayer+k)%state.players.length;
      if(state.players[idx].stocks[def]>0) m.playerQueue.push(idx);
    }
    m.playerPos=0;
    if(!m.playerQueue.length) return selectNextDefunct();
    state.phase='MERGER_DECISION'; openMergerDecision();
  }

  function openMergerDecision() {
    const m=state.merger; const def=m.activeDefunct; const pi=m.playerQueue[m.playerPos];
    const shares=state.players[pi].stocks[def];
    state.modal={type:'mergerDecision',playerIndex:pi,defunct:def,survivor:m.survivor,total:shares,sell:0,tradePairs:0};
    render();
  }

  function adjustMergerDecision(kind,delta) {
    const md=state.modal; if(!md||md.type!=='mergerDecision') return;
    const maxPairs=Math.min(Math.floor(md.total/2), state.chainBank[md.survivor]);
    if(kind==='sell') md.sell=Math.max(0,Math.min(md.total-md.tradePairs*2,md.sell+delta));
    if(kind==='trade') {
      md.tradePairs=Math.max(0,Math.min(maxPairs,md.tradePairs+delta));
      if(md.sell+md.tradePairs*2>md.total) md.sell=Math.max(0,md.total-md.tradePairs*2);
    }
    render();
  }

  function confirmMergerDecision() {
    const md=state.modal; if(!md||md.type!=='mergerDecision') return;
    const p=state.players[md.playerIndex]; const price=stockPrice(md.defunct,state.merger.sizes[md.defunct]);
    if(md.sell>0){
      p.stocks[md.defunct]-=md.sell; state.chainBank[md.defunct]+=md.sell; p.cash+=md.sell*price;
    }
    if(md.tradePairs>0){
      const used=md.tradePairs*2;
      p.stocks[md.defunct]-=used; state.chainBank[md.defunct]+=used;
      p.stocks[md.survivor]+=md.tradePairs; state.chainBank[md.survivor]-=md.tradePairs;
    }
    const held=p.stocks[md.defunct];
    log(`${p.name}: ${chainName(md.defunct)} 매도 ${md.sell} · 교환 ${md.tradePairs*2}→${md.tradePairs} · 보유 ${held}`);
    state.modal=null;
    const m=state.merger; m.playerPos++;
    if(m.playerPos<m.playerQueue.length) openMergerDecision();
    else selectNextDefunct();
  }

  function finalizeMerger() {
    const m=state.merger; const survivor=m.survivor;
    m.defunct.forEach(def=>{
      Object.entries(state.board).forEach(([t,v])=>{ if(v.chain===def) v.chain=survivor; });
    });
    state.board[m.tile].chain=survivor;
    connectedNulls(neighbors(m.tile).filter(n=>state.board[n]?.chain===null)).forEach(t=>state.board[t].chain=survivor);
    log(`${chainName(survivor)} 합병 완료 · ${chainSize(survivor)}칸${isSafe(survivor)?' · 안전 체인':''}`);
    state.merger=null; state.modal=null; finishPlacement();
  }

  function finishPlacement() {
    state.pendingPlacement=null;
    state.phase='BUY_STOCK';
    state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
    render();
  }

  function currentPlayer() { return state.players[state.currentPlayer]; }
  function pendingBuyCount() { return Object.values(state.pendingBuy).reduce((a,b)=>a+b,0); }
  function pendingBuyCost() { return Object.entries(state.pendingBuy).reduce((sum,[id,n])=>sum+n*stockPrice(id),0); }

  function adjustBuy(id,delta) {
    if(state.phase!=='BUY_STOCK'||!activeChains().includes(id)) return;
    const next=Math.max(0,state.pendingBuy[id]+delta);
    const totalWithout=pendingBuyCount()-state.pendingBuy[id];
    if(totalWithout+next>3) return toast('한 턴에 최대 3주까지 살 수 있어요.');
    if(next>state.chainBank[id]) return toast('은행에 남은 주식이 부족해요.');
    state.pendingBuy[id]=next;
    if(pendingBuyCost()>currentPlayer().cash){ state.pendingBuy[id]-=delta; return toast('현금이 부족해요.'); }
    render();
  }

  function confirmBuy() {
    if(state.phase!=='BUY_STOCK') return;
    const cost=pendingBuyCost();
    if(cost>currentPlayer().cash) return toast('현금이 부족해요.');
    const bought=[];
    Object.entries(state.pendingBuy).forEach(([id,n])=>{
      if(n>0){ currentPlayer().cash-=n*stockPrice(id); currentPlayer().stocks[id]+=n; state.chainBank[id]-=n; bought.push(`${chainName(id)} ${n}주`); }
    });
    log(`${currentPlayer().name}: ${bought.length?bought.join(', '):'주식 구매 없음'}${cost?` · ${money(cost)}`:''}`);
    state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
    state.phase='END_TURN'; render();
  }

  function isPermanentTile(tile) { return analyzePlacement(tile).type==='PERMANENT'; }

  function endTurn() {
    if(state.phase!=='END_TURN') return;
    // 플레이한 타일 1장 보충
    if(state.remainingDeck.length&&state.hands[state.currentPlayer].length<6) state.hands[state.currentPlayer].push(state.remainingDeck.shift());
    // 영구적으로 놓을 수 없는 타일은 공개 폐기 후 교체
    let replaced=0, guard=30;
    while(guard-- >0){
      const idx=state.hands[state.currentPlayer].findIndex(isPermanentTile);
      if(idx<0||!state.remainingDeck.length) break;
      state.hands[state.currentPlayer].splice(idx,1,state.remainingDeck.shift()); replaced++;
    }
    if(replaced) log(`${currentPlayer().name}: 영구 불가 타일 ${replaced}장 교체`);
    state.currentPlayer=(state.currentPlayer+1)%state.players.length;
    if(state.currentPlayer===0) state.round++;
    state.phase='PLACE_TILE'; state.selectedTile=null;
    render();
  }

  function canEndGame() {
    const act=activeChains(); if(!act.length) return false;
    return act.some(id=>chainSize(id)>=41) || act.every(isSafe);
  }

  function declareEndGame() {
    if(!canEndGame()) return toast('아직 게임 종료 조건을 만족하지 않았어요.');
    if(!confirm('게임 종료를 선언하고 최종 정산할까요?')) return;
    const bonusLog=[];
    activeChains().forEach(id=>{
      const payouts=payShareholderBonuses(id,chainSize(id));
      bonusLog.push(`${chainName(id)}: ${payouts.join(', ')||'주주 없음'}`);
      const price=stockPrice(id);
      state.players.forEach(p=>{
        const n=p.stocks[id]; if(n){p.cash+=n*price; state.chainBank[id]+=n; p.stocks[id]=0;}
      });
    });
    state.results=state.players.map((p,i)=>({name:p.name,cash:p.cash,seat:i})).sort((a,b)=>b.cash-a.cash);
    state.phase='GAME_OVER'; state.modal={type:'results',bonusLog}; log('게임 종료 · 최종 정산 완료'); render();
  }

  function phaseLabel() {
    return ({PLACE_TILE:'① 타일 배치',CHOOSE_CHAIN:'체인 창립',CHOOSE_SURVIVOR:'합병 존속 체인 선택',CHOOSE_DEFUNCT:'소멸 체인 처리 순서 선택',MERGER_DECISION:'합병 주식 처리',BUY_STOCK:'② 주식 매수',END_TURN:'③ 턴 종료',GAME_OVER:'게임 종료'})[state.phase]||state.phase;
  }

  function playerStockTags(p) {
    const tags=HOTEL_CHAINS.filter(h=>p.stocks[h.id]>0).map(h=>`<span class="stock-mini" style="--c:${h.color}">${h.name} ${p.stocks[h.id]}</span>`);
    return tags.length?tags.join(''):'<span class="muted-mini">보유 주식 없음</span>';
  }

  function tileCell(tile) {
    const v=state.board[tile]; const placed=!!v; const selected=state.selectedTile===tile;
    const c=v?.chain?chainColor(v.chain):null;
    return `<button class="cell ${placed?'placed':''} ${selected?'selectable':''}" data-cell="${tile}" ${placed?'disabled':''} style="${c?`--chain:${c};border-color:${c}aa;background:linear-gradient(145deg,${c}55,#12283b)`:''}">
      <span class="coord">${tile}</span>
      ${placed?(v.chain?`<span class="chain-tile-mark" style="--c:${c}">${CHAIN[v.chain].mark}</span><span class="chain-letter">${chainName(v.chain).slice(0,1)}</span>`:'<span class="hotel-icon">▫️</span>'):''}
    </button>`;
  }

  function seatColor(i) {
    return ['#5cc8ff','#ff8aa1','#ffd166','#61d9a5','#b996ff','#ff9f5f'][i%6];
  }

  function renderLobby() {
    const inRoom=!!net.roomCode;
    const connectedCount=net.members.filter(m=>m.connected!==false).length;
    app.innerHTML=`<div class="app-shell lobby-shell">${headerHtml()}
      <section class="lobby-hero">
        <div class="hero-copy">
          <span class="eyebrow">ONLINE BOARD GAME · 2–6 PLAYERS</span>
          <h1>호텔 제국을 만들고<br><em>합병의 순간을 지배하세요.</em></h1>
          <p>PC와 휴대폰에서 같은 주소로 접속하고 방 코드만 공유하면 바로 시작할 수 있습니다.</p>
          <div class="hero-pills"><span>🏙️ 12×9 도시 보드</span><span>📈 실시간 주식 거래</span><span>🤝 합병 의사결정</span></div>
        </div>
        <div class="hero-mark" aria-hidden="true"><div class="tower t1"></div><div class="tower t2"></div><div class="tower t3"></div><div class="tower t4"></div><div class="hero-grid"></div></div>
      </section>

      <section class="card lobby online-lobby polished-lobby">
        <div class="lobby-statusbar"><div class="status-row"><span class="badge ${net.connected?'green':''}">${net.connected?'● 서버 연결됨':'○ 재연결 중'}</span><span class="badge gold">최대 6인</span></div>${inRoom?`<div class="room-code-mini">ROOM <strong>${escapeHtml(net.roomCode)}</strong></div>`:''}</div>
        ${!inRoom?`<div class="entry-grid">
          <div class="entry-card primary-entry"><div class="entry-icon">＋</div><div><span class="entry-kicker">HOST</span><h3>새 게임 만들기</h3><p>내가 방장이 되어 친구들을 초대합니다.</p></div><label class="input-label" for="createName">플레이어 이름</label><div class="field"><input id="createName" maxlength="12" autocomplete="nickname" placeholder="예: 태완" value="${escapeHtml(net.name)}"></div><button class="btn primary hero-btn" id="createRoom">새 방 만들기 <span>→</span></button></div>
          <div class="entry-card"><div class="entry-icon">⌁</div><div><span class="entry-kicker">JOIN</span><h3>게임 참가하기</h3><p>친구에게 받은 6자리 방 코드를 입력합니다.</p></div><label class="input-label" for="joinName">플레이어 이름</label><div class="field"><input id="joinName" maxlength="12" autocomplete="nickname" placeholder="예: 플레이어2" value="${escapeHtml(net.name)}"></div><label class="input-label" for="joinCode">방 코드</label><div class="field"><input id="joinCode" class="room-input" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="000000"></div><button class="btn join-btn" id="joinRoom">방 참가하기 <span>→</span></button></div>
        </div>`:`<div class="waiting-layout">
          <div class="waiting-main">
            <div class="room-hero"><div><span class="entry-kicker">WAITING ROOM</span><h2>플레이어를 기다리는 중</h2><p>아래 방 코드를 공유하세요. 최대 6명까지 참가할 수 있습니다.</p></div><div class="share-code"><span>ROOM CODE</span><strong>${escapeHtml(net.roomCode)}</strong><button type="button" class="copy-code" id="copyRoom">코드 복사</button></div></div>
            <div class="seat-grid">${Array.from({length:6},(_,i)=>{const m=net.members[i]; return m?`<div class="seat occupied" style="--seat:${seatColor(i)}"><div class="seat-avatar">${escapeHtml((m.name||'?').slice(0,1).toUpperCase())}</div><div class="seat-info"><b>${escapeHtml(m.name||'플레이어')}</b><span>${m.clientId===net.hostId?'방장 · ':''}${m.connected===false?'재접속 대기':'접속됨'}</span></div>${m.clientId===net.clientId?'<span class="me-chip">나</span>':''}</div>`:`<div class="seat empty"><div class="seat-avatar">${i+1}</div><div class="seat-info"><b>빈 자리</b><span>참가자 대기 중</span></div></div>`}).join('')}</div>
          </div>
          <aside class="waiting-side"><div class="ready-card"><div class="ready-count"><strong>${connectedCount}</strong><span>/ 6</span></div><h3>${connectedCount>=2?'게임을 시작할 수 있어요':'한 명 더 필요해요'}</h3><p>${isHost()?'모두 접속했다면 게임을 시작하세요.':'방장이 게임을 시작하면 자동으로 입장합니다.'}</p><button class="btn primary hero-btn" id="startGame" ${!isHost()||connectedCount<2?'disabled':''}>${isHost()?'게임 시작':'방장 시작 대기'} <span>→</span></button><button class="btn ghost-danger" id="leaveRoom">방 나가기</button></div><div class="tips-card"><b>게임 흐름</b><ol><li>타일 1개 배치</li><li>체인 창립·합병 처리</li><li>주식 최대 3주 매수</li><li>타일 보충 후 다음 턴</li></ol></div></aside>
        </div>`}
      </section>
      <footer class="site-foot">ACQUIRE 스타일 온라인 프로토타입 · 친구들과 같은 주소에서 플레이</footer>
    </div>${state.toast?`<div class="toast">${state.toast}</div>`:''}`;
    const create=document.getElementById('createRoom'); if(create) create.onclick=()=>{
      const name=document.getElementById('createName').value.trim(); if(!name)return toast('이름을 입력하세요.'); net.name=name; localStorage.setItem('acquirePlayerName',name); sendNet({type:'create',name});
    };
    const join=document.getElementById('joinRoom'); if(join) join.onclick=()=>{
      const name=document.getElementById('joinName').value.trim(); const roomCode=document.getElementById('joinCode').value.trim(); if(!name||roomCode.length!==6)return toast('이름과 6자리 방 코드를 입력하세요.'); net.name=name; localStorage.setItem('acquirePlayerName',name); sendNet({type:'join',name,roomCode});
    };
    const copy=document.getElementById('copyRoom'); if(copy) copy.onclick=async()=>{ try{ await navigator.clipboard.writeText(net.roomCode); toast('방 코드를 복사했습니다.'); }catch{ toast(`방 코드: ${net.roomCode}`); } };
    const leave=document.getElementById('leaveRoom'); if(leave) leave.onclick=()=>{sendNet({type:'leave'});net.roomCode='';net.members=[];localStorage.removeItem('acquireRoomCode');render();};
    const startBtn=document.getElementById('startGame'); if(startBtn) startBtn.onclick=startGame;
  }

  function renderGame() {
    const cp=currentPlayer(); const mine=myPlayerIndex(); const hand=(mine>=0?state.hands[mine]:[])||[]; const myTurn=canControlCurrent(); const buyCount=pendingBuyCount(); const buyCost=pendingBuyCost();
    app.innerHTML=`<div class="app-shell">${headerHtml(true)}
      <div class="game-layout">
        <aside class="card side-panel"><div class="section-title"><span>👑 플레이어</span><span class="badge">${state.players.length}명</span></div><div class="players-grid-mobile">
          ${state.players.map((p,i)=>`<div class="player-card ${i===state.currentPlayer?'active':''} ${p.clientId===net.clientId?'me':''}" style="--player:${p.profileColor||seatColor(i)}"><div class="player-head"><span class="player-avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</span><strong>${escapeHtml(p.name)}${i===state.currentPlayer?' ◀':''}</strong><span class="badge">${i+1}</span></div><div class="player-meta"><span>타일 ${state.hands[i].length}장</span><span class="cash">${money(p.cash)}</span></div><div class="stock-tags">${playerStockTags(p)}</div></div>`).join('')}
        </div></aside>

        <main class="center-stack">
          <section class="card turn-banner"><div><div class="big">${escapeHtml(cp.name)}님의 턴</div><div class="small">${phaseLabel()}</div></div><div class="status-row"><span class="badge green">LIVE MATCH</span><span class="badge gold">ROUND ${state.round}</span>${canEndGame()?'<span class="badge danger-badge">종료 가능</span>':''}</div></section>
          <section class="card board-card"><div class="board-head"><h2>◆ 도시 보드 <span style="font-size:11px;color:var(--muted);font-weight:700">CITY GRID</span></h2><div class="status-row"><span class="badge">108 ZONES · 12×9</span><span class="badge">배치 ${Object.keys(state.board).length}</span></div></div><div class="board-wrap"><div class="board">${ALL_TILES.map(tileCell).join('')}</div></div>
            <div class="legend"><span>▫️ 독립 타일</span>${HOTEL_CHAINS.map(h=>`<span class="legend-chain"><b class="mini-chain-logo" style="--hc:${h.color}">${h.mark}</b> ${h.name}</span>`).join('')}</div>
          </section>
          <section class="card hand-card"><div class="section-title"><span>🧩 내 타일${mine>=0?' · '+escapeHtml(state.players[mine].name):''}</span><span class="badge gold">${hand.length}장</span></div><div class="hand">
            ${hand.map(t=>{const pl=playability(t);return `<button class="hand-tile ${state.selectedTile===t?'selected':''} ${!pl.ok?pl.kind:''}" data-hand="${t}" ${!myTurn||state.phase!=='PLACE_TILE'||!pl.ok?'disabled':''}>${t}<div class="tile-state">${!pl.ok?(pl.kind==='permanent'?'영구 불가':'일시 불가'):'선택'}</div></button>`}).join('')}
          </div><div class="help game-help">${helpText()}</div></section>
        </main>

        <aside class="card market"><div class="section-title"><span>📈 STOCK EXCHANGE</span><span class="badge">최대 3주</span></div>
          <div class="market-summary"><div style="color:var(--muted);font-size:12px">선택 ${buyCount}/3주 · 총 구매 금액</div><div class="total">${money(buyCost)}</div><div style="color:var(--muted);font-size:11px">보유 현금 ${money(cp.cash)}</div></div>
          <div class="hotel-list">${HOTEL_CHAINS.map(h=>hotelMarketHtml(h)).join('')}</div>
          <div class="market-actions"><button class="btn primary" id="confirmBuy" ${!myTurn||state.phase!=='BUY_STOCK'?'disabled':''}>${buyCount?'선택 주식 구매 확정':'주식 구매 없이 진행'}</button><button class="btn primary" id="endTurn" ${!myTurn||state.phase!=='END_TURN'?'disabled':''}>턴 종료 → 다음 플레이어</button><button class="btn gold" id="declareEnd" ${!myTurn||!canEndGame()||!['BUY_STOCK','END_TURN'].includes(state.phase)?'disabled':''}>🏁 게임 종료 선언</button><button class="btn danger" id="resetGame">방 나가기</button></div>
          <div class="log-box"><div class="section-title"><span>게임 로그</span></div>${state.logs.map(x=>`<div class="log-line">${escapeHtml(x)}</div>`).join('')||'<div class="log-line">게임 기록이 여기에 표시됩니다.</div>'}</div>
        </aside>
      </div>
    </div>${renderModal()}${state.toast?`<div class="toast">${state.toast}</div>`:''}`;

    document.querySelectorAll('[data-hand]').forEach(el=>el.onclick=()=>{if(!canControlCurrent())return toast('현재 내 턴이 아닙니다.');localDo(()=>selectTile(el.dataset.hand));});
    document.querySelectorAll('[data-cell]').forEach(el=>el.onclick=()=>{
      if(state.phase!=='PLACE_TILE') return;
      if(state.selectedTile===el.dataset.cell) localDo(()=>placeTile(el.dataset.cell));
      else if(state.selectedTile) toast(`${state.selectedTile} 타일은 ${state.selectedTile} 칸에 놓습니다.`);
      else toast('먼저 아래에서 내 타일을 선택하세요.');
    });
    document.querySelectorAll('[data-buy-plus]').forEach(el=>el.onclick=()=>localDo(()=>adjustBuy(el.dataset.buyPlus,1)));
    document.querySelectorAll('[data-buy-minus]').forEach(el=>el.onclick=()=>localDo(()=>adjustBuy(el.dataset.buyMinus,-1)));
    document.getElementById('confirmBuy').onclick=()=>localDo(confirmBuy);
    document.getElementById('endTurn').onclick=()=>localDo(endTurn);
    document.getElementById('declareEnd').onclick=()=>localDo(declareEndGame);
    document.getElementById('resetGame').onclick=()=>{if(confirm('방에서 나갈까요?')){sendNet({type:'leave'});net.roomCode='';localStorage.removeItem('acquireRoomCode');state.screen='lobby';render();}};
    bindModal();
  }

  function helpText() {
    if(state.phase==='PLACE_TILE') return state.selectedTile?`<strong>${state.selectedTile}</strong> 선택됨. 보드의 같은 좌표를 누르세요.`:'타일 1장을 선택해 보드에 배치하세요. 주황색은 일시적으로, 빨간색은 영구적으로 놓을 수 없는 타일입니다.';
    if(state.phase==='BUY_STOCK') return '활성 체인의 주식을 합계 최대 3주까지 살 수 있습니다. 사지 않고 진행해도 됩니다.';
    if(state.phase==='END_TURN') return '주식 단계가 끝났습니다. 턴 종료를 눌러 타일을 보충하고 다음 플레이어로 넘기세요.';
    if(state.phase==='MERGER_DECISION') return '합병 주식 처리를 완료해야 다음 단계로 진행됩니다.';
    return '화면의 선택 창에서 현재 단계를 완료하세요.';
  }

  function hotelMarketHtml(h) {
    const size=chainSize(h.id); const active=size>=2; const safe=isSafe(h.id); const n=state.pendingBuy[h.id];
    return `<div class="hotel ${active?'active-chain':''}" style="--hc:${h.color}"><div class="chain-logo">${h.mark}</div><div><div class="hotel-name"><span style="color:${h.color}">●</span> ${h.name}</div><div class="hotel-sub">${active?`${size}칸${safe?' · SAFE':''}`:'미설립'} · 은행 ${state.chainBank[h.id]}주</div><div class="hotel-sub">${active?`1주 ${money(stockPrice(h.id))}`:'거래 불가'}</div></div><div class="stock-step"><button data-buy-minus="${h.id}" ${state.phase!=='BUY_STOCK'||!active||n<=0?'disabled':''}>−</button><b>${n}</b><button data-buy-plus="${h.id}" ${state.phase!=='BUY_STOCK'||!active||state.chainBank[h.id]<=n?'disabled':''}>＋</button></div></div>`;
  }

  function renderModal() {
    const m=state.modal; if(!m) return '';
    if(m.type==='chooseChain') return `<div class="modal-back"><div class="modal card"><h2>🏗️ 새 체인 창립</h2><p>설립할 호텔 체인을 선택하세요. 은행에 주식이 남아 있으면 창립자 주식 1주를 무료로 받습니다.</p><div class="choice-grid">${inactiveChains().map(id=>`<button class="chain-choice" data-found="${id}" style="--c:${chainColor(id)}"><b>${chainName(id)}</b><small>기준가 ${money(CHAIN[id].base)}</small></button>`).join('')}</div></div></div>`;
    if(m.type==='chooseSurvivor') return `<div class="modal-back"><div class="modal card"><h2>🤝 동률 합병</h2><p>가장 큰 체인들이 같은 크기입니다. 합병을 만든 플레이어가 존속 체인을 선택합니다.</p><div class="choice-grid">${m.candidates.map(id=>`<button class="chain-choice" data-survivor="${id}" style="--c:${chainColor(id)}"><b>${chainName(id)}</b><small>${state.merger.sizes[id]}칸</small></button>`).join('')}</div></div></div>`;
    if(m.type==='chooseDefunct') return `<div class="modal-back"><div class="modal card"><h2>🔀 소멸 체인 처리 순서</h2><p>같은 크기의 소멸 체인이 있습니다. 합병을 만든 플레이어가 먼저 처리할 체인을 선택합니다.</p><div class="choice-grid">${m.candidates.map(id=>`<button class="chain-choice" data-defunct="${id}" style="--c:${chainColor(id)}" ${!canControlCurrent()?'disabled':''}><b>${chainName(id)}</b><small>${state.merger.sizes[id]}칸</small></button>`).join('')}</div>${!canControlCurrent()?'<p class="rule-note">현재 플레이어의 선택을 기다리는 중입니다.</p>':''}</div></div>`;
    if(m.type==='mergerDecision') {
      const p=state.players[m.playerIndex]; const price=stockPrice(m.defunct,state.merger.sizes[m.defunct]); const used=m.sell+m.tradePairs*2; const held=m.total-used;
      if(p.clientId!==net.clientId) return `<div class="modal-back"><div class="modal card"><h2>⏳ ${escapeHtml(p.name)} 선택 대기</h2><p>${chainName(m.defunct)} 주식의 매도·교환·보유 결정을 기다리고 있습니다.</p></div></div>`;
      return `<div class="modal-back"><div class="modal card"><h2>💼 ${escapeHtml(p.name)} · 합병 주식 처리</h2><p><b style="color:${chainColor(m.defunct)}">${chainName(m.defunct)}</b> ${m.total}주를 어떻게 처리할까요? 매도와 교환을 섞을 수 있고 남은 주식은 보유합니다.</p>
        <div class="merger-info"><div><small>소멸 체인 주가</small><b>${money(price)}</b></div><div><small>존속 체인</small><b style="color:${chainColor(m.survivor)}">${chainName(m.survivor)}</b></div><div><small>존속 체인 은행 주식</small><b>${state.chainBank[m.survivor]}주</b></div></div>
        <div class="decision-row"><span>현금 매도</span><div class="counter"><button data-md="sell,-1">−</button><b>${m.sell}주</b><button data-md="sell,1">＋</button></div><strong>+${money(m.sell*price)}</strong></div>
        <div class="decision-row"><span>2:1 주식 교환</span><div class="counter"><button data-md="trade,-1">−</button><b>${m.tradePairs*2} → ${m.tradePairs}주</b><button data-md="trade,1">＋</button></div><strong>${chainName(m.survivor)}</strong></div>
        <div class="decision-row hold"><span>그대로 보유</span><strong>${held}주</strong><span class="muted-mini">나중에 같은 체인이 재창립될 수 있음</span></div>
        <button class="btn primary" id="confirmMerger" style="width:100%;padding:13px;margin-top:12px">처리 확정</button></div></div>`;
    }
    if(m.type==='results') {
      const top=state.results.slice(0,3);
      const podium=[top[1],top[0],top[2]].map((r,idx)=>r?`<div class="podium p${idx}"><div class="podium-avatar">${escapeHtml(r.name.slice(0,1).toUpperCase())}</div><b>${escapeHtml(r.name)}</b><strong>${money(r.cash)}</strong><span>${idx===1?'1st':idx===0?'2nd':'3rd'}</span></div>`:'').join('');
      return `<div class="modal-back results-back"><div class="modal card results-modal"><div class="confetti" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><span class="entry-kicker">FINAL RANKING</span><h2>🏆 ${escapeHtml(state.results[0]?.name||'승자')} 승리!</h2><p class="result-sub">최종 자산 기준으로 순위를 계산했습니다.</p><div class="podium-wrap">${podium}</div><div class="results-list">${state.results.map((r,i)=>`<div class="result-row ${i===0?'winner':''}"><span><b>${i+1}위</b> · ${escapeHtml(r.name)}</span><strong>${money(r.cash)}</strong></div>`).join('')}</div><details><summary>최종 주주 보너스 내역</summary>${m.bonusLog.map(x=>`<div class="log-line">${escapeHtml(x)}</div>`).join('')}</details><button class="btn primary" id="resultNew" style="width:100%;margin-top:14px">대기실로 돌아가기</button></div></div>`;
    }
    return '';
  }

  function bindModal() {
    document.querySelectorAll('[data-found]').forEach(el=>el.onclick=()=>{if(canControlCurrent())localDo(()=>foundChain(el.dataset.found));});
    document.querySelectorAll('[data-survivor]').forEach(el=>el.onclick=()=>{if(canControlCurrent())localDo(()=>chooseSurvivor(el.dataset.survivor));});
    document.querySelectorAll('[data-defunct]').forEach(el=>el.onclick=()=>{if(canControlCurrent())localDo(()=>chooseDefunct(el.dataset.defunct));});
    document.querySelectorAll('[data-md]').forEach(el=>el.onclick=()=>{const [k,d]=el.dataset.md.split(',');localDo(()=>adjustMergerDecision(k,Number(d)));});
    const cm=document.getElementById('confirmMerger'); if(cm)cm.onclick=()=>localDo(confirmMergerDecision);
    const rn=document.getElementById('resultNew'); if(rn)rn.onclick=newGame;
  }

  function headerHtml(inGame=false) {
    return `<header class="header"><div class="brand"><div class="logo"><span>◆</span></div><div><div class="brand-title">ACQUIRE <span class="classic-tag">CLASSIC</span></div><div class="brand-sub">HOTEL EMPIRE · ONLINE BOARD GAME</div></div></div><div class="top-actions"><span class="connection-dot ${net.connected?'online':''}"><i></i>${net.connected?'ONLINE':'CONNECTING'}</span>${net.roomCode?`<span class="badge room-badge">ROOM ${escapeHtml(net.roomCode)}</span>`:''}${inGame?`<span class="badge gold">ROUND ${state.round}</span>`:''}<button type="button" class="header-icon-btn" data-open-info="rules" aria-label="규칙 보기">?</button><button type="button" class="header-icon-btn" data-open-info="settings" aria-label="설정">⚙</button></div></header>`;
  }

  function renderInfoModal(){
    if(!ui.modal) return '';
    if(ui.modal==='rules') return `<div class="modal-back local-modal-back"><div class="modal card info-modal"><button class="modal-close" data-close-info aria-label="닫기">×</button><span class="entry-kicker">HOW TO PLAY</span><h2>게임 규칙</h2><div class="rules-grid"><section><b>① 타일 배치</b><p>내 타일 1장을 같은 좌표에 놓습니다. 인접 타일에 따라 독립 타일, 체인 성장, 신규 체인, 합병이 발생합니다.</p></section><section><b>② 체인과 안전 체인</b><p>연결된 타일이 2개 이상이면 호텔 체인이 됩니다. 11칸 이상인 체인은 안전 체인이며 다른 안전 체인과 합병되지 않습니다.</p></section><section><b>③ 합병</b><p>더 큰 체인이 존속합니다. 동률이면 합병을 만든 플레이어가 존속 체인을 고릅니다. 소멸 체인의 주주는 보너스를 받고 매도·2:1 교환·보유를 선택합니다.</p></section><section><b>④ 주식 매수</b><p>타일 처리 후 활성 체인의 주식을 합계 최대 3주까지 살 수 있습니다. 현금과 은행 재고 범위 안에서 선택합니다.</p></section><section><b>⑤ 게임 종료</b><p>한 체인이 41칸 이상이 되거나 모든 활성 체인이 안전 체인이면 현재 플레이어가 종료를 선언할 수 있습니다.</p></section><section><b>승리 조건</b><p>종료 시 활성 체인의 주주 보너스와 보유 주식을 현금화한 뒤 최종 자산이 가장 많은 플레이어가 승리합니다.</p></section></div><button class="btn primary" data-close-info style="width:100%;margin-top:16px">확인</button></div></div>`;
    return `<div class="modal-back local-modal-back"><div class="modal card info-modal"><button class="modal-close" data-close-info aria-label="닫기">×</button><span class="entry-kicker">DISPLAY</span><h2>화면 설정</h2><div class="settings-list"><label><span><b>보드 크기</b><small>PC에서 보드 칸 크기를 조절합니다.</small></span><select id="boardScaleSetting"><option value="90" ${ui.settings.boardScale===90?'selected':''}>90%</option><option value="100" ${ui.settings.boardScale===100?'selected':''}>100%</option><option value="110" ${ui.settings.boardScale===110?'selected':''}>110%</option></select></label><label><span><b>진행 도움말</b><small>내 타일 아래 단계 설명을 표시합니다.</small></span><input id="hintSetting" type="checkbox" ${ui.settings.showHints?'checked':''}></label><label><span><b>애니메이션 줄이기</b><small>게임 시작과 결과 화면의 움직임을 줄입니다.</small></span><input id="motionSetting" type="checkbox" ${ui.settings.reducedMotion?'checked':''}></label></div><button class="btn primary" data-save-settings style="width:100%;margin-top:16px">설정 저장</button></div></div>`;
  }

  function startIntroHtml(){
    if(!ui.startIntro || state.screen!=='game') return '';
    return `<div class="start-intro" aria-live="polite"><div class="start-city"><i></i><i></i><i></i><i></i><i></i></div><span>ACQUIRE</span><strong>게임 시작</strong><p>${escapeHtml(state.players[0]?.name||'첫 플레이어')}부터 시작합니다</p></div>`;
  }

  function bindGlobalUi(){
    document.querySelectorAll('[data-open-info]').forEach(el=>el.onclick=()=>{ui.modal=el.dataset.openInfo;render();});
    document.querySelectorAll('[data-close-info]').forEach(el=>el.onclick=()=>{ui.modal=null;render();});
    const save=document.querySelector('[data-save-settings]');
    if(save) save.onclick=()=>{
      ui.settings.boardScale=Number(document.getElementById('boardScaleSetting').value)||100;
      ui.settings.showHints=document.getElementById('hintSetting').checked;
      ui.settings.reducedMotion=document.getElementById('motionSetting').checked;
      saveUiSettings(); ui.modal=null; render(); toast('화면 설정을 저장했습니다.');
    };
  }

  const _renderLobby=renderLobby, _renderGame=renderGame;
  renderLobby=function(){ _renderLobby(); app.insertAdjacentHTML('beforeend', renderInfoModal()+startIntroHtml()); bindGlobalUi(); };
  renderGame=function(){ _renderGame(); app.insertAdjacentHTML('beforeend', renderInfoModal()+startIntroHtml()); bindGlobalUi(); };

  function render() { state.screen==='lobby'?renderLobby():renderGame(); }
  applyUiSettings();
  render();
  connectNetwork();
})();
