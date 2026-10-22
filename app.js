(() => {
  const ROWS = ['A','B','C','D','E','F','G','H','I'];
  const COLS = Array.from({length:12}, (_,i)=>i+1);
  const ALL_TILES = ROWS.flatMap(r => COLS.map(c => `${c}${r}`));
  const HOTEL_CHAINS = [
    {id:'Sackson', name:'색슨', color:'#e84e5f', base:200, mark:'S'},
    {id:'Tower', name:'타워', color:'#d7a93a', base:200, mark:'T'},
    {id:'American', name:'아메리칸', color:'#5b78d4', base:300, mark:'A'},
    {id:'Festival', name:'페스티벌', color:'#2ec59f', base:300, mark:'F'},
    {id:'Worldwide', name:'월드와이드', color:'#9061c7', base:300, mark:'W'},
    {id:'Continental', name:'콘티넨탈', color:'#28a6ca', base:400, mark:'C'},
    {id:'Imperial', name:'임페리얼', color:'#f08a32', base:400, mark:'I'},
  ];
  const CHAIN = Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,h]));
  const EMOTE_CATEGORIES = [
    {id:'hello', label:'인사', icon:'👋', items:[
      {emoji:'👋', text:'반가워요!'}, {emoji:'😄', text:'잘 부탁해요!'}, {emoji:'🎲', text:'즐겜 갑시다!'}, {emoji:'😎', text:'오늘도 한 판!'}
    ]},
    {id:'thanks', label:'감사', icon:'🙏', items:[
      {emoji:'🙏', text:'감사합니다!'}, {emoji:'👍', text:'나이스!'}, {emoji:'✨', text:'오~ 고마워요!'}, {emoji:'😆', text:'덕분입니다!'}
    ]},
    {id:'surprise', label:'놀람', icon:'😱', items:[
      {emoji:'😱', text:'헉?!'}, {emoji:'👀', text:'진짜?!'}, {emoji:'😳', text:'이게 된다고?'}, {emoji:'🤯', text:'와... 대박!'}
    ]},
    {id:'taunt', label:'도발', icon:'😏', items:[
      {emoji:'💰', text:'돈 좀 남겨두지 그랬어?'}, {emoji:'😏', text:'지금 후회할 텐데?'}, {emoji:'😎', text:'한 수 늦었네'}, {emoji:'💸', text:'주식 그렇게 사는 거 맞아?'}
    ]},
    {id:'rally', label:'선동', icon:'📣', items:[
      {emoji:'🚌', text:'어서 타요!'}, {emoji:'🚌💨', text:'합병 버스 출발!'}, {emoji:'🔥', text:'같이 갑시다!'}, {emoji:'📣', text:'지금이 타이밍!'}
    ]}
  ];

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
    setupOptions: {},
    setupPicks: {},
    setupPickerIndex: 0,
    drawOptions: [],
    discardedTiles: {},
    lastBonusEvent: null,
    mergerBrief: null,
    playerEmotes: {},
    reactionPrompts: {},
    turnLimitSeconds: 60,
    turnDeadline: 0,
    turnToken: 0,
  };

  const app = document.getElementById('app');

  const net = {
    ws: null,
    clientId: localStorage.getItem('acquireClientId') || '',
    roomCode: localStorage.getItem('acquireRoomCode') || '',
    hostId: null,
    members: [],
    automationAuthorityId: null,
    pendingDepartures: [],
    connected: false,
    name: localStorage.getItem('acquirePlayerName') || '',
  };


  const ui = {
    modal: null,
    startIntro: false,
    localSelectedTile: null,
    pendingPlacementTile: null,
    pendingDiscardTile: null,
    drawReveal: null,
    bonusEffect: null,
    lobbyTurnLimitSeconds: 60,
    lastTimedOutToken: null,
    timeoutHandling: false,
    departureHandling: false,
    autoDisconnectedKey: '',
    mergerBoardPeek: false,
    emoteMenu: false,
    emoteCategory: null,
    mobilePanel: null,
    autoStockSheetKey: '',
    mobileMarketScrollTop: 0,
    dismissedReactionIds: {},
    settings: (() => {
      try { return Object.assign({boardScale:100,showHints:true,reducedMotion:false}, JSON.parse(localStorage.getItem('acquireUiSettings')||'{}')); }
      catch { return {boardScale:100,showHints:true,reducedMotion:false}; }
    })(),
  };


  const bgm = {
    enabled: localStorage.getItem('acquireBgmEnabled') !== '0',
    volume: Math.min(1, Math.max(0, Number(localStorage.getItem('acquireBgmVolume') || '0.28'))),
    currentIndex: 0,
    playing: false,
    unlocked: false,
    gapTimer: null,
    tracks: [
      {src:'bgm1.mp3', label:'BGM 1', gain:1.00},
      {src:'bgm2.mp3', label:'BGM 2', gain:0.75},
    ],
    audio: [],
  };

  function initBgm(){
    if(bgm.audio.length) return;
    bgm.audio=bgm.tracks.map((track,index)=>{
      const a=new Audio(track.src);
      a.preload='auto';
      a.loop=false;
      a.volume=Math.min(1,bgm.volume*track.gain);
      a.addEventListener('ended',()=>{
        if(index!==bgm.currentIndex) return;
        bgm.playing=false;
        bgm.currentIndex=(bgm.currentIndex+1)%bgm.tracks.length;
        updateBgmControls();
        clearTimeout(bgm.gapTimer);
        bgm.gapTimer=setTimeout(()=>{
          bgm.gapTimer=null;
          tryStartBgm();
        },2000);
      });
      a.addEventListener('error',()=>{
        if(index!==bgm.currentIndex) return;
        bgm.playing=false;
        bgm.currentIndex=(bgm.currentIndex+1)%bgm.tracks.length;
        clearTimeout(bgm.gapTimer);
        bgm.gapTimer=setTimeout(()=>{bgm.gapTimer=null;tryStartBgm();},2000);
      });
      return a;
    });
  }
  function applyBgmVolume(){
    initBgm();
    bgm.audio.forEach((a,i)=>{ a.volume=Math.min(1,bgm.volume*bgm.tracks[i].gain); });
  }
  function stopBgm(reset=true){
    clearTimeout(bgm.gapTimer); bgm.gapTimer=null;
    initBgm();
    bgm.audio.forEach(a=>{ a.pause(); if(reset){ try{a.currentTime=0;}catch{} } });
    bgm.playing=false;
    if(reset) bgm.currentIndex=0;
    updateBgmControls();
  }
  async function tryStartBgm(){
    initBgm();
    if(!bgm.enabled || !bgm.unlocked || state.screen!=='game' || bgm.playing || bgm.gapTimer) return;
    const a=bgm.audio[bgm.currentIndex];
    bgm.audio.forEach((other,i)=>{ if(i!==bgm.currentIndex) other.pause(); });
    if(a.ended || !Number.isFinite(a.currentTime) || a.currentTime>=Math.max(0,a.duration-.1)) { try{a.currentTime=0;}catch{} }
    a.volume=Math.min(1,bgm.volume*bgm.tracks[bgm.currentIndex].gain);
    try{
      await a.play();
      bgm.playing=true;
    }catch{
      bgm.playing=false;
    }
    updateBgmControls();
  }
  function syncBgmForScreen(){
    if(state.screen!=='game') { if(bgm.playing || bgm.gapTimer) stopBgm(true); return; }
    if(bgm.enabled && bgm.unlocked && !bgm.playing && !bgm.gapTimer) tryStartBgm();
  }
  function unlockBgm(){
    bgm.unlocked=true;
    if(state.screen==='game' && bgm.enabled) tryStartBgm();
  }
  function toggleBgm(){
    bgm.unlocked=true;
    bgm.enabled=!bgm.enabled;
    localStorage.setItem('acquireBgmEnabled', bgm.enabled?'1':'0');
    if(bgm.enabled) tryStartBgm(); else stopBgm(false);
    updateBgmControls();
  }
  function setBgmVolume(value){
    bgm.volume=Math.min(1,Math.max(0,Number(value)||0));
    localStorage.setItem('acquireBgmVolume',String(bgm.volume));
    applyBgmVolume();
    updateBgmControls();
  }
  function updateBgmControls(){
    const btn=document.getElementById('bgmToggle');
    if(btn){
      btn.textContent=bgm.enabled?'🔊 BGM':'🔇 BGM';
      btn.setAttribute('aria-pressed',bgm.enabled?'true':'false');
      btn.title=bgm.enabled?`${bgm.tracks[bgm.currentIndex]?.label||'BGM'} 재생 중/대기 · 클릭해서 끄기`:'BGM 켜기';
    }
    const range=document.getElementById('bgmVolume');
    if(range && document.activeElement!==range) range.value=String(Math.round(bgm.volume*100));
    const val=document.getElementById('bgmVolumeValue');
    if(val) val.textContent=`${Math.round(bgm.volume*100)}%`;
  }

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
        net.automationAuthorityId=msg.automationAuthorityId || null;
        net.pendingDepartures=msg.pendingDepartures || [];
        if(net.roomCode) localStorage.setItem('acquireRoomCode',net.roomCode); else localStorage.removeItem('acquireRoomCode');
        if(msg.gameState) applyRemoteState(msg.gameState);
        else if(state.screen!=='game') render();
        setTimeout(processNetworkRecovery,0);
      }
      if(msg.type==='game') applyRemoteState(msg.gameState);
      if(msg.type==='emote' && msg.clientId) {
        state.playerEmotes=state.playerEmotes||{};
        state.playerEmotes[msg.clientId]={id:msg.id||`e_${Date.now()}`,emoji:String(msg.emoji||'💬'),text:String(msg.text||'').slice(0,40),source:msg.source||'basic',createdAt:Number(msg.createdAt)||Date.now(),expiresAt:Number(msg.expiresAt)||Date.now()+3000};
        render();
      }
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
    copy.playerEmotes={}; // 말풍선은 별도 실시간 메시지로 전송하며 게임 상태에는 저장하지 않는다.
    // 주식 +/- 선택은 현재 플레이어만 보는 임시 선택이다. 중간 선택값은 서버/다른 플레이어에 공개하지 않는다.
    // 실제 구매 결과(현금/보유주식/은행재고)는 '구매 확정' 또는 '구매 없이 진행' 시점에만 동기화된다.
    if(copy.phase==='BUY_STOCK') copy.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
    return copy;
  }
  function syncState() { if(net.roomCode) sendNet({type:'sync', roomCode:net.roomCode, gameState:snapshotState()}); }
  function applyRemoteState(remote) {
    if(!remote) return;
    const liveEmotes=Object.fromEntries(Object.entries(state.playerEmotes||{}).filter(([,e])=>Number(e.expiresAt)>Date.now()));
    const wasLobby=state.screen!=='game';
    const previousPhase=state.phase;
    const previousBonusId=state.lastBonusEvent?.id || null;
    Object.keys(state).forEach(k=>delete state[k]);
    Object.assign(state, remote);
    state.discardedTiles=state.discardedTiles||{};
    state.setupPickerIndex=state.setupPickerIndex||0;
    state.lastBonusEvent=state.lastBonusEvent||null;
    state.mergerBrief=state.mergerBrief||null;
    state.playerEmotes=liveEmotes;
    state.reactionPrompts=state.reactionPrompts||{};
    state.turnLimitSeconds=(state.turnLimitSeconds===0 || Number(state.turnLimitSeconds)===0) ? 0 : (Number(state.turnLimitSeconds)||60);
    state.turnDeadline=Number(state.turnDeadline)||0;
    state.turnToken=Number(state.turnToken)||0;
    state.toast='';
    ui.localSelectedTile=null; ui.pendingPlacementTile=null; ui.pendingDiscardTile=null; ui.drawReveal=null; ui.bonusEffect=null; ui.mergerBoardPeek=false;
    if(previousPhase!==state.phase){
      if(state.phase==='BUY_STOCK' && canControlCurrent()) {
        ui.mobilePanel='market';
        ui.mobileMarketScrollTop=0;
      } else ui.mobilePanel=null;
      if(state.phase!=='BUY_STOCK') {
        ui.autoStockSheetKey='';
        ui.mobileMarketScrollTop=0;
      }
    }
    if(state.lastBonusEvent?.id && state.lastBonusEvent.id!==previousBonusId) showBonusEffectLocal(state.lastBonusEvent);
    const enteringPlayableGame=(wasLobby && state.screen==='game' && !['SETUP_PICK','SETUP_REVEAL'].includes(state.phase));
    const setupJustFinished=((previousPhase==='SETUP_PICK'||previousPhase==='SETUP_REVEAL') && state.phase==='PLACE_TILE');
    if(enteringPlayableGame || setupJustFinished) showStartIntro();
    else render();
  }
  function localDo(fn) { fn(); syncState(); }
  function myPlayerIndex() { return state.players.findIndex(p=>p.clientId===net.clientId); }
  function canControlCurrent() { return state.screen==='game' && state.players[state.currentPlayer]?.clientId===net.clientId; }
  function isHost() { return net.hostId===net.clientId; }
  function memberStatus(clientId) { return net.members.find(m=>m.clientId===clientId) || null; }
  function isAutomationAuthority() { return !!net.clientId && net.automationAuthorityId===net.clientId; }
  function disconnectSeconds(member) {
    if(!member?.disconnectDeadline) return 0;
    return Math.max(0,Math.ceil((Number(member.disconnectDeadline)-Date.now())/1000));
  }
  function isAutoMember(clientId) { return !!memberStatus(clientId)?.autoPlay; }

  function handleSetupDeparture(clientId,name,reason='disconnect') {
    if(!['SETUP_PICK','SETUP_REVEAL'].includes(state.phase)) return false;
    const idx=state.players.findIndex(p=>p.clientId===clientId);
    if(idx<0) return false;
    const departed=state.players[idx];
    const picked=state.setupPicks?.[clientId];
    if(picked) {
      delete state.setupPicks[clientId];
      state.remainingDeck.push(picked);
      state.remainingDeck=shuffle(state.remainingDeck);
    }
    state.players.splice(idx,1);
    if(Array.isArray(state.hands) && idx<state.hands.length) state.hands.splice(idx,1);
    if(idx<state.setupPickerIndex) state.setupPickerIndex--;
    state.setupPickerIndex=Math.max(0,Math.min(state.setupPickerIndex,state.players.length));
    log(`${name||departed.name}: ${reason==='left'?'게임에서 나감':'30초 내 재접속 실패'} · 순서 결정에서 제외`);
    return true;
  }

  function settleSetupAfterDepartures() {
    if(state.players.length<2) {
      resetGameState();
      state.screen='lobby';
      state.toast='남은 플레이어가 1명이라 게임 시작이 취소되었습니다.';
      return;
    }
    if(state.players.every(p=>state.setupPicks[p.clientId])) {
      finalizeSetupOrder();
      return;
    }
    state.modal={type:'setupPick'};
  }

  function processNetworkRecovery() {
    if(ui.departureHandling || !isAutomationAuthority() || !net.pendingDepartures?.length) return;
    if(!['SETUP_PICK','SETUP_REVEAL'].includes(state.phase)) return;
    const pending=net.pendingDepartures.filter(x=>state.players.some(p=>p.clientId===x.clientId));
    if(!pending.length) return;
    ui.departureHandling=true;
    localDo(()=>{
      let changed=false;
      pending.forEach(x=>{ changed=handleSetupDeparture(x.clientId,x.name,x.reason) || changed; });
      if(changed) settleSetupAfterDepartures();
    });
    ui.departureHandling=false;
  }

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

  function chainMarkHtml(id) {
    if (id === 'Tower') {
      return `<svg class="chain-emblem tower-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path class="tower-emblem-spire" d="M24 3l2.7 7.4h-5.4L24 3Z"/>
        <path class="tower-emblem-crown" d="M18 10h12l2 6h-3v4h5v23H14V20h5v-4h-3l2-6Z"/>
        <path class="tower-emblem-core" d="M20 18h8v25h-8z"/>
        <path class="tower-emblem-window" d="M17 24h3v4h-3zm11 0h3v4h-3zm-11 7h3v4h-3zm11 0h3v4h-3zm5-7h-1v12h1zM15 24h1v12h-1z"/>
        <path class="tower-emblem-door" d="M22 36h4v7h-4z"/>
      </svg>`;
    }
    if (id === 'Sackson') {
      return `<svg class="chain-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M33.8 13.1c-1.8-3.2-5.4-5.1-9.8-5.1-5.5 0-10 2.9-10 7.4 0 9.8 18.8 4.2 18.8 12.7 0 2.7-2.6 4.8-6.8 4.8-3.8 0-7.2-1.5-10-4.4l-4 4.7c3.1 3.6 8.1 5.8 13.9 5.8 7 0 12.7-3.8 12.7-9.8 0-10.6-18.8-5.1-18.8-12.8 0-2.3 2.2-3.9 5.8-3.9 3 0 5.7 1.1 8.1 3.5l4.1-2.9Z" fill="currentColor"/>
      </svg>`;
    }
    if (id === 'American') {
      return `<svg class="chain-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M24 10 10 38h6.1l2.6-5.9h10.6l2.6 5.9H38L24 10Zm0 9.6 3.3 7.6h-6.6l3.3-7.6Z" fill="currentColor"/>
        <circle cx="16" cy="40" r="2.2" fill="currentColor"/><circle cx="24" cy="40" r="2.2" fill="currentColor"/><circle cx="32" cy="40" r="2.2" fill="currentColor"/>
      </svg>`;
    }
    if (id === 'Festival') {
      return `<svg class="chain-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M24 8c1.7 6.7 6.8 11.9 13.5 13.6-5.4 1.3-9.7 5.6-11.1 11-1.4-5.4-5.6-9.7-11-11C22 20 24 14.8 24 8Z" fill="currentColor" opacity=".92"/>
        <path d="M11 22c6.3.9 10.8 5.7 12 12-2.1-3.4-5.9-5.6-10-5.6H11V22Zm26 0v6.4h-2c-4.1 0-7.9 2.2-10 5.6 1.2-6.3 5.7-11.1 12-12Z" fill="currentColor"/>
      </svg>`;
    }
    if (id === 'Worldwide') {
      return `<svg class="chain-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <circle cx="24" cy="24" r="13.5" fill="none" stroke="currentColor" stroke-width="3"/>
        <path d="M11 24h26M24 10.5c4.3 4 6.5 8.5 6.5 13.5s-2.2 9.5-6.5 13.5c-4.3-4-6.5-8.5-6.5-13.5s2.2-9.5 6.5-13.5Zm-9.8 4.5c2.8 1.9 6.2 3 9.8 3s7-1.1 9.8-3M14.2 33c2.8-1.9 6.2-3 9.8-3s7 1.1 9.8 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
    if (id === 'Continental') {
      return `<svg class="chain-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M36.5 16.8c-2.7-3.8-7.3-6.3-12.5-6.3-8.3 0-15 6.1-15 13.5S15.7 37.5 24 37.5c5.2 0 9.8-2.4 12.5-6.3h-6.6c-1.8 1.2-3.9 1.9-5.9 1.9-4.8 0-8.7-3.6-8.7-8.1s3.9-8.1 8.7-8.1c2 0 4.1.7 5.9 1.9h6.6Z" fill="currentColor"/>
        <path d="M14 29.8c3.1 2.4 6.6 3.5 10 3.5 2.5 0 5-.6 7.5-1.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
      </svg>`;
    }
    if (id === 'Imperial') {
      return `<svg class="chain-emblem" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path d="M13 20 10 14l6 2 3-6 5 5 5-5 3 6 6-2-3 6 5 4-4 4H12l-4-4 5-4Z" fill="currentColor"/>
        <path d="M16 29h16v3H16zm2 4h12v3H18z" fill="currentColor" opacity=".92"/>
      </svg>`;
    }
    return escapeHtml(CHAIN[id]?.mark || String(id||'').slice(0,1));
  }
  function log(msg) { state.logs.unshift(`[R${state.round||1}] ${msg}`); state.logs = state.logs.slice(0,80); }
  function toast(msg) {
    state.toast = msg; render();
    clearTimeout(toast._t);
    toast._t=setTimeout(()=>{state.toast='';render();},1800);
  }

  function activePlayerEmote(clientId) {
    const e=state.playerEmotes?.[clientId];
    return e && Number(e.expiresAt)>Date.now() ? e : null;
  }
  function activeReactionPrompt(clientId) {
    const q=state.reactionPrompts?.[clientId];
    return q && Number(q.expiresAt)>Date.now() ? q : null;
  }
  function setReactionPrompt(clientId, emoji, text, durationMs=4000, notBefore=0) {
    if(!clientId) return;
    state.reactionPrompts=state.reactionPrompts||{};
    const start=Math.max(Date.now(),Number(notBefore)||0);
    state.reactionPrompts[clientId]={id:`q_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,emoji,text,startsAt:start,expiresAt:start+durationMs};
  }
  function postEmote(emoji,text,source='basic') {
    const mine=myPlayerIndex(); if(mine<0) return;
    const cid=net.clientId; const prev=state.playerEmotes?.[cid];
    if(prev && Date.now()-Number(prev.createdAt||0)<1500) return toast('이모티콘은 잠깐 쉬었다가 다시 보내주세요.');
    const now=Date.now();
    const event={id:`e_${now}_${Math.random().toString(36).slice(2,7)}`,clientId:cid,emoji:String(emoji||'💬'),text:String(text||'').slice(0,40),source,createdAt:now,expiresAt:now+3000};
    state.playerEmotes=state.playerEmotes||{};
    state.playerEmotes[cid]=event;
    const q=activeReactionPrompt(cid); if(q){ui.dismissedReactionIds=ui.dismissedReactionIds||{};ui.dismissedReactionIds[q.id]=true;}
    ui.emoteMenu=false;
    ui.emoteCategory=null;
    sendNet({type:'emote',roomCode:net.roomCode,emoji:event.emoji,text:event.text,source:event.source,id:event.id,createdAt:event.createdAt,expiresAt:event.expiresAt});
    render();
  }
  function playerEmoteBubbleHtml(p) {
    const e=activePlayerEmote(p.clientId); if(!e) return '';
    return `<div class="player-emote-bubble" aria-live="polite"><span>${escapeHtml(e.emoji)}</span><b>${escapeHtml(e.text)}</b></div>`;
  }
  function mobileEmoteToastHtml() {
    const now=Date.now();
    const active=Object.values(state.playerEmotes||{}).filter(e=>Number(e.expiresAt)>now).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0))[0];
    if(!active) return '';
    const p=state.players.find(x=>x.clientId===active.clientId);
    return `<div class="mobile-emote-toast" aria-live="polite"><span>${escapeHtml(active.emoji)}</span><b>${escapeHtml(p?.name||'플레이어')}</b><em>${escapeHtml(active.text)}</em></div>`;
  }
  function playerQuickReactionHtml(p) {
    if(p.clientId!==net.clientId) return '';
    const q=activeReactionPrompt(p.clientId); if(!q || Date.now()<Number(q.startsAt||0) || ui.dismissedReactionIds?.[q.id]) return '';
    return `<button type="button" class="quick-reaction" data-quick-reaction="1"><span>${escapeHtml(q.emoji)}</span>${escapeHtml(q.text)}</button>`;
  }

  function showBonusEffectLocal(event) {
    if(!event || !event.payouts?.length) return;
    ui.bonusEffect=event;
    clearTimeout(showBonusEffectLocal._t);
    showBonusEffectLocal._t=setTimeout(()=>{ui.bonusEffect=null;render();},2600);
    render();
  }
  function announceBonus(chainId,payouts) {
    if(!payouts?.length) return;
    const event={id:`b_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,chainId,payouts};
    state.lastBonusEvent=event;
    showBonusEffectLocal(event);
  }
  function showDrawReveal(tile) {
    ui.drawReveal={tile,id:`d_${Date.now()}`};
    clearTimeout(showDrawReveal._t);
    showDrawReveal._t=setTimeout(()=>{ui.drawReveal=null;render();},1800);
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
    state.players=members.map((m,i)=>({
      id:`p${Date.now()}_${i}`, clientId:m.clientId, name:names[i], cash:6000, profileColor:seatColor(i),
      stocks:Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]))
    }));
    state.board={};
    state.hands=state.players.map(()=>[]);
    state.remainingDeck=shuffle(ALL_TILES);
    state.setupOptions={}; state.setupPicks={}; state.setupSeeds=[]; state.setupPickerIndex=0;
    state.screen='game'; state.currentPlayer=0; state.phase='SETUP_PICK'; state.round=1;
    state.turnLimitSeconds=Number(ui.lobbyTurnLimitSeconds)===0 ? 0 : Math.max(30,Math.min(180,Number(ui.lobbyTurnLimitSeconds)||60)); state.turnDeadline=0; state.turnToken=0;
    state.modal={type:'setupPick'};
    log('게임 시작 · 전체 타일 더미에서 순서 결정 타일을 한 장씩 뽑습니다.');
    sendNet({type:'start',roomCode:net.roomCode,gameState:snapshotState()});
    render();
  }

  function chooseSetupTile(index) {
    if(state.phase!=='SETUP_PICK') return;
    const picker=state.players[state.setupPickerIndex];
    if(!picker || picker.clientId!==net.clientId) return toast('현재는 다른 플레이어가 타일을 뽑는 중입니다.');
    if(state.setupPicks[picker.clientId]) return toast('이미 순서 타일을 뽑았습니다.');
    const i=Number(index);
    if(!Number.isInteger(i)||i<0||i>=state.remainingDeck.length) return toast('선택할 수 없는 타일입니다.');
    const tile=state.remainingDeck.splice(i,1)[0];
    state.setupPicks[picker.clientId]=tile;
    log(`${picker.name}: 순서 결정 타일 뽑기 완료`);
    state.setupPickerIndex++;
    state.remainingDeck=shuffle(state.remainingDeck);
    if(state.setupPickerIndex>=state.players.length) finalizeSetupOrder();
    else render();
  }

  function finalizeSetupOrder() {
    const ordered=state.players.map(p=>({player:p,tile:state.setupPicks[p.clientId]}))
      .sort((a,b)=>tileSortValue(a.tile)-tileSortValue(b.tile));
    state.players=ordered.map((x,i)=>({...x.player,profileColor:seatColor(i)}));
    state.setupSeeds=ordered.map(x=>({name:x.player.name,clientId:x.player.clientId,tile:x.tile}));
    state.board={};
    state.setupSeeds.forEach(s=>state.board[s.tile]={chain:null,seed:true});
    state.hands=state.players.map(()=>state.remainingDeck.splice(0,Math.min(6,state.remainingDeck.length)));
    state.currentPlayer=0; state.phase='PLACE_TILE'; state.modal=null; state.selectedTile=null;
    log(`플레이 순서 확정: ${state.setupSeeds.map((s,i)=>`${i+1}. ${s.name}(${s.tile})`).join(' → ')}`);
    log(`${state.players[0]?.name||'첫 플레이어'}부터 자동으로 게임을 시작합니다. · 턴 제한 ${state.turnLimitSeconds===0?'무제한':state.turnLimitSeconds+'초'}`);
    startTurnClock();
    ui.startIntro=true;
    clearTimeout(showStartIntro._t);
    showStartIntro._t=setTimeout(()=>{ui.startIntro=false;render();},2600);
    render();
  }

  function confirmSetupReveal() {
    // v10: 모든 플레이어가 순서 타일을 뽑는 즉시 자동 시작합니다.
  }

  function resetGameState() {
    state.players=[]; state.board={}; state.hands=[]; state.remainingDeck=[];
    state.chainBank=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,25]));
    state.selectedTile=null; state.pendingPlacement=null; state.phase='PLACE_TILE'; state.currentPlayer=0;
    state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
    state.modal=null; state.merger=null; state.logs=[]; state.results=null; state.setupSeeds=[];
    state.setupOptions={}; state.setupPicks={}; state.setupPickerIndex=0; state.drawOptions=[]; state.discardedTiles={}; state.lastBonusEvent=null; state.mergerBrief=null; state.playerEmotes={}; state.reactionPrompts={};
    state.turnLimitSeconds=Number(ui.lobbyTurnLimitSeconds)===0 ? 0 : (Number(ui.lobbyTurnLimitSeconds)||60); state.turnDeadline=0; state.turnToken=0; ui.lastTimedOutToken=null; ui.timeoutHandling=false;
    ui.departureHandling=false; ui.autoDisconnectedKey='';
    ui.localSelectedTile=null; ui.pendingPlacementTile=null; ui.pendingDiscardTile=null;
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
    const hand=state.hands[state.currentPlayer]||[];
    if(!hand.includes(tile)) return;
    const p=playability(tile);
    if(!p.ok) {
      if(p.kind==='permanent') {
        ui.localSelectedTile=null; ui.pendingPlacementTile=null; ui.pendingDiscardTile=tile; render(); return;
      }
      return toast(p.reason);
    }
    ui.pendingDiscardTile=null;
    ui.localSelectedTile=ui.localSelectedTile===tile?null:tile;
    ui.pendingPlacementTile=null;
    render();
  }

  function discardPermanentTile(tile) {
    if(state.phase!=='PLACE_TILE'||!canControlCurrent()) return;
    const hand=state.hands[state.currentPlayer]||[];
    if(!hand.includes(tile)) return toast('내 손에 없는 타일입니다.');
    const p=playability(tile);
    if(p.kind!=='permanent') return toast('영구적으로 배치할 수 없는 타일만 폐기할 수 있어요.');
    state.hands[state.currentPlayer]=hand.filter(t=>t!==tile);
    state.discardedTiles=state.discardedTiles||{};
    state.discardedTiles[tile]={by:currentPlayer().name,round:state.round,reason:p.reason};
    ui.localSelectedTile=null; ui.pendingPlacementTile=null; ui.pendingDiscardTile=null;
    log(`${currentPlayer().name}: 영구 불가 타일 ${tile} 폐기`);
    finishPlacement();
  }

  function placeTile(tile) {
    if(state.phase!=='PLACE_TILE') return;
    const hand=state.hands[state.currentPlayer];
    if(!hand.includes(tile)) return;
    const analysis=analyzePlacement(tile);
    if(analysis.type==='PERMANENT'||analysis.type==='TEMPORARY') return toast(analysis.reason);
    state.hands[state.currentPlayer]=hand.filter(t=>t!==tile);
    state.selectedTile=null;
    ui.localSelectedTile=null; ui.pendingPlacementTile=null;
    state.board[tile]={chain:null};
    state.pendingPlacement={tile,analysis};

    if(analysis.type==='SINGLE') {
      log(`${currentPlayer().name}: ${tile} 단독 타일 배치`); finishPlacement();
    } else if(analysis.type==='GROW') {
      const wasSafe=isSafe(analysis.chain);
      absorbIntoChain(tile,analysis.chain);
      if(!wasSafe && isSafe(analysis.chain)) setReactionPrompt(currentPlayer().clientId,'🛡️','SAFE 찍었다!',4000);
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
    const holders=state.players
      .map((p,i)=>({i,count:p.stocks[chainId]}))
      .filter(x=>x.count>0)
      .sort((a,b)=>b.count-a.count);
    if(!holders.length) return [];

    const {major,minor}=bonuses(chainId,size);
    const payouts=[];
    const give=(h,amount,label)=>{
      const cashBefore=state.players[h.i].cash;
      state.players[h.i].cash+=amount;
      payouts.push({playerIndex:h.i,name:state.players[h.i].name,amount,label,cashBefore,cashAfter:state.players[h.i].cash});
    };

    // 주주가 단 1명뿐이면 최대주주 + 2대주주 보너스를 모두 받는다.
    if(holders.length===1){
      give(holders[0],major+minor,'단독 주주 · 최대+2대');
      return payouts;
    }

    const top=holders[0].count;
    const topH=holders.filter(h=>h.count===top);

    // 최대주주가 2명 이상 동률이면 최대+2대 보너스를 합쳐 동률 인원끼리 나눈다.
    if(topH.length>=2){
      const each=roundUp100((major+minor)/topH.length);
      topH.forEach(h=>give(h,each,'공동 최대주주 · 최대+2대 분배'));
      return payouts;
    }

    // 최대주주가 1명이면 최대주주 보너스를 단독 지급한다.
    give(topH[0],major,'최대주주');

    // 나머지 주주 가운데 가장 많은 주식을 가진 사람이 2대주주가 된다.
    const rest=holders.filter(h=>h.count<top);
    const second=rest[0].count;
    const seconds=rest.filter(h=>h.count===second);
    const each=roundUp100(minor/seconds.length);
    seconds.forEach(h=>give(h,each,seconds.length>1?'공동 2대 주주':'2대 주주'));

    return payouts;
  }

  function payoutText(payouts){
    return payouts.map(x=>`${x.name} ${money(x.amount)}(${x.label})`).join(', ');
  }

  function processDefunctChain(def) {
    const m=state.merger; const size=m.sizes[def];
    m.activeDefunct=def;
    const payouts=payShareholderBonuses(def,size);
    const {major,minor}=bonuses(def,size);
    log(`${chainName(def)} 소멸 (${size}칸) · 주주 보너스 ${payouts.length?payoutText(payouts):'주주 없음'}`);

    m.playerQueue=[];
    for(let k=0;k<state.players.length;k++){
      const idx=(state.currentPlayer+k)%state.players.length;
      if(state.players[idx].stocks[def]>0) m.playerQueue.push(idx);
    }
    m.playerPos=0;

    // 보너스 애니메이션 + 합병 설명은 합쳐서 총 4초만 보여준다.
    // 이 4초는 플레이어의 턴 제한 시간에서 차감하지 않는다.
    const now=Date.now();
    const brief={
      id:`mb_${now}_${Math.random().toString(36).slice(2,7)}`,
      chainId:def,
      survivor:m.survivor,
      defunctSize:size,
      survivorSize:m.sizes[m.survivor],
      major,
      minor,
      payouts,
      startedAt:now,
      endsAt:now+4000
    };
    const promptStart=brief.endsAt;
    payouts.forEach(x=>{
      const pl=state.players[x.playerIndex]; if(!pl) return;
      if(String(x.label).includes('2대') && !String(x.label).includes('최대')) setReactionPrompt(pl.clientId,'😎💵','나도 챙겼다!',4000,promptStart);
      else setReactionPrompt(pl.clientId,'👑💰','대주주 먹었다!',4000,promptStart);
    });
    state.players.forEach((pl,pi)=>{
      if((pl.stocks?.[def]||0)>0 && !payouts.some(x=>x.playerIndex===pi)) setReactionPrompt(pl.clientId,'😭📉','내 주식 살려줘...',4000,promptStart);
    });
    const mergerPlayer=currentPlayer();
    if(mergerPlayer && !activeReactionPrompt(mergerPlayer.clientId)) setReactionPrompt(mergerPlayer.clientId,'🔥','합병 가즈아!',4000,promptStart);
    state.mergerBrief=brief;
    state.phase='MERGER_BONUS';
    state.modal={type:'mergerBrief',...brief};
    if(state.turnDeadline) state.turnDeadline+=4000;
    render();
  }

  function advanceMergerBrief() {
    if(state.phase!=='MERGER_BONUS' || state.modal?.type!=='mergerBrief') return;
    const m=state.merger;
    state.mergerBrief=null;
    state.modal=null;
    if(!m) return;
    if(!m.playerQueue.length) return selectNextDefunct();
    state.phase='MERGER_DECISION';
    openMergerDecision();
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
    const m=state.merger; const survivor=m.survivor; const survivorWasSafe=Number(m.sizes?.[survivor]||0)>=11;
    m.defunct.forEach(def=>{
      Object.entries(state.board).forEach(([t,v])=>{ if(v.chain===def) v.chain=survivor; });
    });
    state.board[m.tile].chain=survivor;
    connectedNulls(neighbors(m.tile).filter(n=>state.board[n]?.chain===null)).forEach(t=>state.board[t].chain=survivor);
    if(!survivorWasSafe && isSafe(survivor)) setReactionPrompt(currentPlayer().clientId,'🛡️','SAFE 찍었다!',4000);
    log(`${chainName(survivor)} 합병 완료 · ${chainSize(survivor)}칸${isSafe(survivor)?' · 안전 체인':''}`);
    state.merger=null; state.modal=null; finishPlacement();
  }

  function finishPlacement() {
    state.pendingPlacement=null;
    state.phase='BUY_STOCK';
    state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
    render();
  }

  function startTurnClock() {
    state.turnToken=(Number(state.turnToken)||0)+1;
    state.turnDeadline=Number(state.turnLimitSeconds)===0 ? 0 : Date.now()+(Number(state.turnLimitSeconds)||60)*1000;
    ui.lastTimedOutToken=null;
  }

  function turnSecondsLeft() {
    if(Number(state.turnLimitSeconds)===0) return null;
    if(!state.turnDeadline) return Number(state.turnLimitSeconds)||60;
    return Math.max(0,Math.ceil((state.turnDeadline-Date.now())/1000));
  }

  function turnTimerText() {
    if(state.phase==='MERGER_BONUS') return '정산 중';
    const cp=currentPlayer?.();
    const m=cp?memberStatus(cp.clientId):null;
    if(m && !m.connected && !m.autoPlay && m.disconnectDeadline) return '일시정지';
    const left=turnSecondsLeft();
    if(left===null) return '무제한';
    return `${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;
  }

  function randomChoice(arr) {
    return arr?.length ? arr[Math.floor(Math.random()*arr.length)] : null;
  }

  function autoResolvePlacementChoices(reason='시간 초과') {
    let guard=0;
    while(guard++<100) {
      if(state.phase==='CHOOSE_CHAIN') {
        const id=randomChoice(inactiveChains());
        if(!id) break;
        log(`${currentPlayer().name}: ${reason} · ${chainName(id)} 자동 창립`);
        foundChain(id);
        continue;
      }
      if(state.phase==='CHOOSE_SURVIVOR') {
        const id=randomChoice(state.modal?.candidates||[]);
        if(!id) break;
        log(`${currentPlayer().name}: ${reason} · ${chainName(id)} 자동 존속 선택`);
        chooseSurvivor(id);
        continue;
      }
      if(state.phase==='CHOOSE_DEFUNCT') {
        const id=randomChoice(state.modal?.candidates||[]);
        if(!id) break;
        log(`${currentPlayer().name}: ${reason} · ${chainName(id)} 자동 처리 순서 선택`);
        chooseDefunct(id);
        continue;
      }
      if(state.phase==='MERGER_DECISION' && state.modal?.type==='mergerDecision') {
        const p=state.players[state.modal.playerIndex];
        state.modal.sell=0; state.modal.tradePairs=0;
        log(`${p.name}: ${reason} · 합병 주식 전량 보유 자동 선택`);
        confirmMergerDecision();
        continue;
      }
      break;
    }
  }

  function autoDrawAndFinishTurn(reason='자동') {
    state.modal=null; state.drawOptions=[];
    let tile=null;
    if((state.hands[state.currentPlayer]||[]).length<6 && state.remainingDeck.length) {
      tile=takeRandomTileFromDeck();
      if(tile) state.hands[state.currentPlayer].push(tile);
    }
    log(`${currentPlayer().name}: ${reason} · ${tile?'보충 타일 1장 자동 뽑기':'보충 타일 없음'}`);
    if(tile && canControlCurrent()) showDrawReveal(tile);
    finishTurnAfterDraw();
  }

  function handleTurnTimeout() {
    if(ui.timeoutHandling || state.screen!=='game' || state.phase==='GAME_OVER' || ['SETUP_PICK','SETUP_REVEAL'].includes(state.phase)) return;
    ui.timeoutHandling=true;
    const player=currentPlayer();
    log(`${player.name}: ⏱️ 턴 제한 시간 종료`);
    ui.localSelectedTile=null; ui.pendingPlacementTile=null; ui.pendingDiscardTile=null;

    if(state.phase==='PLACE_TILE') {
      const hand=[...(state.hands[state.currentPlayer]||[])];
      const playable=hand.filter(t=>playability(t).ok);
      const permanent=hand.filter(t=>playability(t).kind==='permanent');
      if(playable.length) {
        const tile=randomChoice(playable);
        log(`${player.name}: 시간 초과 · 손패에서 ${tile} 자동 배치`);
        placeTile(tile);
      } else if(permanent.length) {
        const tile=randomChoice(permanent);
        log(`${player.name}: 시간 초과 · 영구 불가 ${tile} 자동 폐기`);
        discardPermanentTile(tile);
      } else {
        log(`${player.name}: 시간 초과 · 현재 배치 가능한 타일이 없어 타일 단계를 건너뜁니다.`);
        state.phase='BUY_STOCK'; state.modal=null; state.pendingPlacement=null;
        state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
      }
      autoResolvePlacementChoices();
    } else if(['CHOOSE_CHAIN','CHOOSE_SURVIVOR','CHOOSE_DEFUNCT','MERGER_DECISION'].includes(state.phase)) {
      autoResolvePlacementChoices();
    }

    if(state.phase==='BUY_STOCK') {
      state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
      log(`${player.name}: 시간 초과 · 주식 매수 없이 진행`);
      autoDrawAndFinishTurn('시간 초과');
    } else if(state.phase==='DRAW_TILE') {
      autoDrawAndFinishTurn('시간 초과');
    } else if(state.phase!=='GAME_OVER') {
      // 예외적인 선택 단계가 남아 있어도 게임이 멈추지 않도록 한 번 더 자동 처리합니다.
      autoResolvePlacementChoices();
      if(state.phase==='BUY_STOCK') {
        state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
        log(`${player.name}: 시간 초과 · 주식 매수 없이 진행`);
        autoDrawAndFinishTurn('시간 초과');
      }
    }
    ui.timeoutHandling=false;
  }

  function tickTurnTimer() {
    if(Number(state.turnLimitSeconds)===0) return;
    if(state.screen!=='game' || !state.turnDeadline || ['SETUP_PICK','SETUP_REVEAL','MERGER_BONUS','GAME_OVER'].includes(state.phase)) return;
    const cp=currentPlayer(); const cm=cp?memberStatus(cp.clientId):null;
    const el=document.getElementById('turnTimer');
    if(cm && !cm.connected && !cm.autoPlay && cm.disconnectDeadline) {
      if(el) { el.textContent='일시정지'; el.closest('.turn-timer')?.classList.remove('urgent'); }
      return;
    }
    const left=turnSecondsLeft();
    if(el) {
      el.textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;
      el.closest('.turn-timer')?.classList.toggle('urgent',left<=10);
    }
    if(left<=0 && canControlCurrent() && ui.lastTimedOutToken!==state.turnToken) {
      ui.lastTimedOutToken=state.turnToken;
      localDo(handleTurnTimeout);
    }
  }

  function autoDisconnectedMergerOwner() {
    if(state.phase!=='MERGER_DECISION' || state.modal?.type!=='mergerDecision') return false;
    const owner=state.players[state.modal.playerIndex];
    if(!owner || !isAutoMember(owner.clientId)) return false;
    state.modal.sell=0; state.modal.tradePairs=0;
    log(`${owner.name}: 이탈 자동 진행 · 합병 주식 전량 보유`);
    confirmMergerDecision();
    return true;
  }

  function autoDisconnectedCurrentTurn() {
    const cp=currentPlayer();
    if(!cp || !isAutoMember(cp.clientId) || ['SETUP_PICK','SETUP_REVEAL','MERGER_BONUS','GAME_OVER'].includes(state.phase)) return false;
    let changed=false, guard=0;
    while(guard++<120 && currentPlayer()?.clientId===cp.clientId && state.phase!=='GAME_OVER') {
      if(state.phase==='MERGER_DECISION') {
        const owner=state.players[state.modal?.playerIndex];
        if(owner && isAutoMember(owner.clientId)) {
          state.modal.sell=0; state.modal.tradePairs=0;
          log(`${owner.name}: 이탈 자동 진행 · 합병 주식 전량 보유`);
          confirmMergerDecision(); changed=true; continue;
        }
        break;
      }
      if(state.phase==='PLACE_TILE') {
        const hand=[...(state.hands[state.currentPlayer]||[])];
        const playable=hand.filter(t=>playability(t).ok);
        const permanent=hand.filter(t=>playability(t).kind==='permanent');
        if(playable.length) {
          const tile=randomChoice(playable);
          log(`${cp.name}: 이탈 자동 진행 · 손패에서 ${tile} 자동 배치`);
          placeTile(tile); changed=true; continue;
        }
        if(permanent.length) {
          const tile=randomChoice(permanent);
          log(`${cp.name}: 이탈 자동 진행 · 영구 불가 ${tile} 자동 폐기`);
          discardPermanentTile(tile); changed=true; continue;
        }
        log(`${cp.name}: 이탈 자동 진행 · 배치 가능한 타일이 없어 타일 단계 건너뜀`);
        state.phase='BUY_STOCK'; state.modal=null; state.pendingPlacement=null;
        state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0])); changed=true; continue;
      }
      if(['CHOOSE_CHAIN','CHOOSE_SURVIVOR','CHOOSE_DEFUNCT'].includes(state.phase)) {
        const before=state.phase;
        autoResolvePlacementChoices('이탈 자동 진행');
        changed=changed || state.phase!==before;
        if(state.phase===before) break;
        continue;
      }
      if(state.phase==='BUY_STOCK') {
        state.pendingBuy=Object.fromEntries(HOTEL_CHAINS.map(h=>[h.id,0]));
        log(`${cp.name}: 이탈 자동 진행 · 주식 매수 없이 진행`);
        autoDrawAndFinishTurn('이탈 자동 진행'); changed=true; break;
      }
      if(state.phase==='DRAW_TILE') {
        autoDrawAndFinishTurn('이탈 자동 진행'); changed=true; break;
      }
      break;
    }
    return changed;
  }

  function tickNetworkRecovery() {
    const mb=document.querySelector('[data-merger-brief-left]');
    if(mb && state.modal?.type==='mergerBrief') {
      const ms=Math.max(0,Number(state.modal.endsAt||0)-Date.now());
      mb.textContent=ms>0?`${Math.max(1,Math.ceil(ms/1000))}초`:'진행 중';
    }
    document.querySelectorAll('[data-disconnect-deadline]').forEach(el=>{
      const deadline=Number(el.dataset.disconnectDeadline)||0;
      const left=Math.max(0,Math.ceil((deadline-Date.now())/1000));
      el.textContent=`${left}초`;
    });
    processNetworkRecovery();
    if(!isAutomationAuthority() || state.screen!=='game') return;
    if(state.phase==='MERGER_BONUS' && state.modal?.type==='mergerBrief') {
      if(Date.now()>=Number(state.modal.endsAt||0)) localDo(advanceMergerBrief);
      return;
    }
    if(state.phase==='MERGER_DECISION') {
      const owner=state.players[state.modal?.playerIndex];
      if(owner && isAutoMember(owner.clientId)) {
        const key=`md:${state.turnToken}:${owner.clientId}:${state.modal.defunct}:${state.modal.total}`;
        if(ui.autoDisconnectedKey!==key) {
          ui.autoDisconnectedKey=key;
          localDo(autoDisconnectedMergerOwner);
        }
        return;
      }
    }
    const cp=currentPlayer();
    if(cp && isAutoMember(cp.clientId)) {
      const key=`turn:${state.turnToken}:${cp.clientId}:${state.phase}:${state.modal?.type||''}:${state.modal?.playerIndex??''}`;
      if(ui.autoDisconnectedKey!==key) {
        ui.autoDisconnectedKey=key;
        localDo(autoDisconnectedCurrentTurn);
      }
    } else ui.autoDisconnectedKey='';
  }

  function currentPlayer() { return state.players[state.currentPlayer]; }
  function pendingBuyCount() { return Object.values(state.pendingBuy).reduce((a,b)=>a+b,0); }
  function pendingBuyCost() { return Object.entries(state.pendingBuy).reduce((sum,[id,n])=>sum+n*stockPrice(id),0); }

  function adjustBuy(id,delta) {
    if(state.phase!=='BUY_STOCK'||!canControlCurrent()||!activeChains().includes(id)) return false;
    const before=state.pendingBuy[id]||0;
    const next=Math.max(0,before+delta);
    const totalWithout=pendingBuyCount()-before;
    if(totalWithout+next>3) { toast('한 턴에 최대 3주까지 살 수 있어요.'); return false; }
    if(next>state.chainBank[id]) { toast('은행에 남은 주식이 부족해요.'); return false; }
    state.pendingBuy[id]=next;
    if(pendingBuyCost()>currentPlayer().cash){
      state.pendingBuy[id]=before;
      toast('현금이 부족해요.');
      return false;
    }
    return true;
  }

  // 주식 +/-는 전체 화면을 다시 그리지 않고 필요한 DOM만 갱신한다.
  // 모바일 Bottom Sheet의 스크롤/터치 상태를 유지해서 버튼 연타 시 버벅임을 줄인다.
  function refreshBuyUi() {
    const total=pendingBuyCount();
    const cost=pendingBuyCost();
    HOTEL_CHAINS.forEach(h=>{
      const n=state.pendingBuy[h.id]||0;
      document.querySelectorAll(`[data-buy-count="${h.id}"]`).forEach(el=>{el.textContent=String(n);});
      document.querySelectorAll(`[data-buy-minus="${h.id}"]`).forEach(el=>{
        el.disabled=state.phase!=='BUY_STOCK'||!canControlCurrent()||n<=0;
      });
      document.querySelectorAll(`[data-buy-plus="${h.id}"]`).forEach(el=>{
        const active=activeChains().includes(h.id);
        const nextCost=cost+stockPrice(h.id);
        el.disabled=state.phase!=='BUY_STOCK'||!canControlCurrent()||!active||total>=3||n>=state.chainBank[h.id]||nextCost>currentPlayer().cash;
      });
    });
    document.querySelectorAll('[data-buy-summary-count]').forEach(el=>{el.textContent=`${total}/3주`;});
    document.querySelectorAll('[data-buy-summary-cost]').forEach(el=>{el.textContent=money(cost);});
    document.querySelectorAll('[data-buy-confirm]').forEach(el=>{el.textContent=total?'선택 주식 구매 확정':'주식 구매 없이 진행';});
    const mobileConfirm=document.getElementById('mobileConfirmBuy');
    if(mobileConfirm) mobileConfirm.textContent=total?'매수 확정':'매수 없이 진행';
    const mobileStock=document.querySelector('.mobile-action-stock small');
    if(mobileStock && state.phase==='BUY_STOCK' && canControlCurrent()) mobileStock.textContent=`${total}/3 · ${money(cost)}`;
  }

  function handleBuyStep(id,delta) {
    // 터치 연타에서 300ms 지연/더블탭 확대 같은 체감 흔들림을 줄이기 위해 즉시 로컬 반영한다.
    if(adjustBuy(id,delta)) refreshBuyUi();
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
    openDrawTilePopup();
  }

  function isPermanentTile(tile) { return analyzePlacement(tile).type==='PERMANENT'; }

  function takeRandomTileFromDeck() {
    if(!state.remainingDeck.length) return null;
    const i=Math.floor(Math.random()*state.remainingDeck.length);
    return state.remainingDeck.splice(i,1)[0];
  }

  function openDrawTilePopup() {
    state.phase='DRAW_TILE';
    state.drawOptions=[];
    // 주식 매수 확정/구매 없이 진행 직후 모바일 주식창은 자동으로 닫고 타일 뽑기 화면으로 전환한다.
    ui.mobilePanel=null;
    ui.mobileMarketScrollTop=0;
    ui.autoStockSheetKey='';
    state.remainingDeck=shuffle(state.remainingDeck);
    if(!state.remainingDeck.length) return finishTurnAfterDraw();
    state.modal={type:'drawTile'};
    render();
  }

  function chooseDrawTile(index) {
    if(state.phase!=='DRAW_TILE'||!canControlCurrent()) return;
    const i=Number(index);
    if(!Number.isInteger(i)||i<0||i>=state.remainingDeck.length) return toast('선택할 수 없는 타일입니다.');
    const tile=state.remainingDeck.splice(i,1)[0];
    if(state.hands[state.currentPlayer].length<6) state.hands[state.currentPlayer].push(tile);
    log(`${currentPlayer().name}: 보충 타일 1장 뽑기 완료`);
    state.drawOptions=[]; state.modal=null;
    showDrawReveal(tile);
    finishTurnAfterDraw();
  }

  function finishTurnAfterDraw() {
    state.drawOptions=[]; state.modal=null;
    state.currentPlayer=(state.currentPlayer+1)%state.players.length;
    if(state.currentPlayer===0) state.round++;
    state.phase='PLACE_TILE'; state.selectedTile=null;
    ui.localSelectedTile=null; ui.pendingPlacementTile=null; ui.pendingDiscardTile=null;
    startTurnClock();
    render();
  }

  // 이전 버전의 턴 종료 호출과의 호환용. 현재는 타일 선택 팝업 완료 시 자동으로 다음 턴으로 넘어갑니다.
  function endTurn() {
    if(state.phase==='DRAW_TILE') return toast('팝업의 뒤집힌 타일 중 1장을 골라 주세요.');
  }

  function canEndGame() {
    const act=activeChains(); if(!act.length) return false;
    return act.some(id=>chainSize(id)>=41) || act.every(isSafe);
  }

  function declareEndGame() {
    if(!canEndGame()) return toast('아직 게임 종료 조건을 만족하지 않았어요.');
    if(!confirm('게임 종료를 선언하고 최종 정산할까요?')) return;

    const activeAtEnd=activeChains();
    const bonusLog=[];
    const settlement=state.players.map((p,i)=>({
      playerIndex:i,
      name:p.name,
      startCash:p.cash,
      bonuses:[],
      stockSales:[],
      worthless:[],
      bonusTotal:0,
      stockSaleTotal:0,
      finalCash:0,
    }));

    // 1) 활성 호텔별 최대/2대주주 보너스 정산
    activeAtEnd.forEach(id=>{
      const size=chainSize(id);
      const payouts=payShareholderBonuses(id,size);
      bonusLog.push(`${chainName(id)}: ${payouts.length?payoutText(payouts):'주주 없음'}`);
      payouts.forEach(x=>{
        const row=settlement[x.playerIndex];
        if(!row) return;
        row.bonuses.push({chainId:id,chainName:chainName(id),size,amount:x.amount,label:x.label});
        row.bonusTotal+=x.amount;
      });
    });

    // 2) 활성 호텔 보유 주식을 최종 주가로 전량 매도
    activeAtEnd.forEach(id=>{
      const size=chainSize(id);
      const price=stockPrice(id);
      state.players.forEach((p,i)=>{
        const n=p.stocks[id]||0;
        if(!n) return;
        const amount=n*price;
        settlement[i].stockSales.push({chainId:id,chainName:chainName(id),size,shares:n,price,amount});
        settlement[i].stockSaleTotal+=amount;
        p.cash+=amount;
        state.chainBank[id]+=n;
        p.stocks[id]=0;
      });
    });

    // 3) 게임 종료 시 보드에 없는 호텔 주식은 가치가 없음을 표시
    state.players.forEach((p,i)=>{
      HOTEL_CHAINS.filter(h=>!activeAtEnd.includes(h.id)).forEach(h=>{
        const n=p.stocks[h.id]||0;
        if(n>0) settlement[i].worthless.push({chainId:h.id,chainName:h.name,shares:n});
      });
      settlement[i].finalCash=p.cash;
    });

    state.results=state.players
      .map((p,i)=>({name:p.name,cash:p.cash,seat:i,playerIndex:i}))
      .sort((a,b)=>b.cash-a.cash);
    state.phase='GAME_OVER';
    state.modal={type:'results',bonusLog,settlement};
    log('게임 종료 · 최종 정산 완료');
    render();
  }

  function phaseLabel() {
    return ({PLACE_TILE:'① 타일 배치',CHOOSE_CHAIN:'체인 창립',CHOOSE_SURVIVOR:'합병 존속 체인 선택',CHOOSE_DEFUNCT:'소멸 체인 처리 순서 선택',MERGER_BONUS:'합병 정산 · 주주 보너스',SETUP_PICK:'순서 결정 타일 뽑기',SETUP_REVEAL:'플레이 순서 공개',MERGER_DECISION:'합병 주식 처리',BUY_STOCK:'② 주식 매수',DRAW_TILE:'③ 보충 타일 선택',END_TURN:'③ 턴 종료',GAME_OVER:'게임 종료'})[state.phase]||state.phase;
  }

  function playerStockTags(p) {
    const tags=HOTEL_CHAINS.filter(h=>p.stocks[h.id]>0).map(h=>`<span class="stock-mini" style="--c:${h.color}">${h.name} ${p.stocks[h.id]}</span>`);
    return tags.length?tags.join(''):'<span class="muted-mini">보유 주식 없음</span>';
  }

  function compactPlayerStocks(p) {
    const tags=HOTEL_CHAINS.filter(h=>(p.stocks?.[h.id]||0)>0).map(h=>`<span class="mobile-stock-dot" style="--c:${h.color}" title="${escapeHtml(h.name)} ${p.stocks[h.id]}주"><i></i><b>${escapeHtml(h.mark)}</b>${p.stocks[h.id]}</span>`);
    return tags.length?tags.join(''):'<span class="mobile-stock-none">주식 없음</span>';
  }

  function mobilePlayerStripHtml() {
    return `<div class="mobile-player-strip"><div class="mobile-player-strip-scroll">${state.players.map((p,i)=>{const mine=p.clientId===net.clientId;return `<button type="button" class="mobile-player-chip ${i===state.currentPlayer?'active':''} ${mine?'me':''}" ${mine?'data-open-emotes="1"':''} style="--player:${p.profileColor||seatColor(i)}"><span class="mobile-player-chip-name"><i></i>${escapeHtml(p.name)}${i===state.currentPlayer?' ◀':''}</span><strong>${money(p.cash)}</strong><span class="mobile-player-chip-stocks">${compactPlayerStocks(p)}</span></button>`}).join('')}</div><div class="mobile-player-strip-actions"><button type="button" data-mobile-emote-open="1" aria-label="반응 보내기">💬<span>반응</span></button><button type="button" data-open-info="more" aria-label="더보기">⋯<span>더보기</span></button></div></div>`;
  }

  function mobileMyInfoHtml(mine, hand, myTurn) {
    if(mine<0) return '';
    const p=state.players[mine];
    return `<section class="mobile-my-info"><div class="mobile-my-info-head"><div><small>내 정보</small><strong>${escapeHtml(p.name)} · ${money(p.cash)}</strong></div><div class="mobile-my-stocks">${compactPlayerStocks(p)}</div></div><div class="mobile-hand-info">${hand.map(t=>{const pl=playability(t);const permanent=myTurn&&state.phase==='PLACE_TILE'&&pl.kind==='permanent';return permanent?`<button type="button" class="mobile-hand-chip permanent" data-mobile-discard="${t}"><b>${t}</b><small>폐기</small></button>`:`<span class="mobile-hand-chip ${!pl.ok?pl.kind:''}"><b>${t}</b><small>${pl.ok?'보유':pl.kind==='temporary'?'일시 불가':'영구 불가'}</small></span>`}).join('')}</div></section>`;
  }

  function tileCell(tile) {
    const v=state.board[tile]; const placed=!!v; const selected=ui.localSelectedTile===tile;
    const discarded=state.discardedTiles?.[tile]||null;
    const mergerTrigger=!!state.merger && state.merger.tile===tile;
    const safeChain=!!v?.chain && isSafe(v.chain);
    const c=v?.chain?chainColor(v.chain):null;
    const mine=myPlayerIndex();
    const myTurn=canControlCurrent();
    const inMyHand=mine>=0 && (state.hands[mine]||[]).includes(tile);
    const target=myTurn && state.phase==='PLACE_TILE' && inMyHand && !placed && !discarded;
    const pl=target?playability(tile):null;
    const targetClass=target?(pl.ok?'playable-target':pl.kind==='temporary'?'temporary-target':'permanent-target'):'';
    const discardTitle=discarded?`${tile} · 폐기됨${discarded.by?` · ${discarded.by}`:''}`:'';
    return `<button class="cell ${placed?'placed':''} ${safeChain?'safe-chain-cell':''} ${discarded?'discarded-cell':''} ${mergerTrigger?'merger-trigger':''} ${selected?'selectable':''} ${target?'my-hand-target':''} ${targetClass}" data-cell="${tile}" ${placed||discarded||(!target && !selected)?'disabled':''} data-hand-target="${target?'1':'0'}" data-target-ok="${target&&pl?.ok?'1':'0'}" title="${escapeHtml(discardTitle)}" style="${c?`--chain:${c};border-color:${c}aa;background:linear-gradient(145deg,${c}55,#12283b)`:''}" aria-label="${tile}${safeChain?' 안전 체인':''}${discarded?' 폐기된 타일':target?' 내 타일 위치':''}">
      <span class="coord">${tile}</span>
      ${target?`<span class="target-label">${pl.ok?'배치':pl.kind==='permanent'?'폐기 가능':'보유'}</span>`:''}
      ${discarded?`<span class="discard-mark">×</span><span class="discard-label">폐기</span>`:''}
      ${mergerTrigger?`<span class="merger-tile-badge">합병</span>`:''}
      ${safeChain?`<span class="safe-chain-badge" title="안전 체인 · 11칸 이상"><span class="safe-shield">◆</span> SAFE</span>`:''}
      ${placed?(v.chain?`<span class="chain-tile-mark" style="--c:${c}">${chainMarkHtml(v.chain)}</span><span class="chain-letter">${chainName(v.chain).slice(0,1)}</span>`:'<span class="hotel-icon">▫️</span>'):''}
    </button>`;
  }

  function seatColor(i) {
    return ['#5cc8ff','#ff8aa1','#ffd166','#61d9a5','#b996ff','#ff9f5f'][i%6];
  }

  function renderLobby() {
    document.body.classList.remove('game-screen-active');
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
          <aside class="waiting-side"><div class="ready-card"><div class="ready-count"><strong>${connectedCount}</strong><span>/ 6</span></div><h3>${connectedCount>=2?'게임을 시작할 수 있어요':'한 명 더 필요해요'}</h3><p>${isHost()?'턴 제한을 정한 뒤 게임을 시작하세요.':'방장이 게임을 시작하면 자동으로 입장합니다.'}</p>${isHost()?`<label class="turn-limit-setting"><span><b>⏱ 플레이어 턴 제한</b><small>무제한 또는 30초 단위 · 최대 3분</small></span><select id="turnLimitSelect"><option value="0" ${Number(ui.lobbyTurnLimitSeconds)===0?'selected':''}>무제한</option>${[30,60,90,120,150,180].map(sec=>`<option value="${sec}" ${Number(ui.lobbyTurnLimitSeconds)===sec?'selected':''}>${sec<60?sec+'초':sec%60?Math.floor(sec/60)+'분 '+sec%60+'초':sec/60+'분'}</option>`).join('')}</select></label>`:`<div class="turn-limit-view">⏱ 턴 제한은 방장이 게임 시작 시 설정합니다.</div>`}<button class="btn primary hero-btn" id="startGame" ${!isHost()||connectedCount<2?'disabled':''}>${isHost()?'게임 시작':'방장 시작 대기'} <span>→</span></button><button class="btn ghost-danger" id="leaveRoom">방 나가기</button></div><div class="tips-card"><b>시간 초과 시</b><ol><li>타일 단계: 손패의 배치 가능 타일을 무작위 자동 배치</li><li>주식 단계: 매수 없이 진행</li><li>타일 뽑기: 남은 더미에서 1장 자동 뽑기</li><li>자동으로 다음 플레이어 턴 시작</li></ol></div></aside>
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
    const turnLimit=document.getElementById('turnLimitSelect'); if(turnLimit) turnLimit.onchange=()=>{const v=Number(turnLimit.value);ui.lobbyTurnLimitSeconds=v===0?0:Math.max(30,Math.min(180,v||60));};
    const startBtn=document.getElementById('startGame'); if(startBtn) startBtn.onclick=startGame;
  }

  function playerConnectionHtml(p) {
    const m=memberStatus(p.clientId);
    if(!m) return '<span class="presence-chip unknown">상태 확인 중</span>';
    if(m.autoPlay) return `<span class="presence-chip auto">${m.left?'나감 · ':''}자동 진행</span>`;
    if(m.connected) return '<span class="presence-chip online">접속</span>';
    if(m.disconnectDeadline) return `<span class="presence-chip reconnect">재접속 <b data-disconnect-deadline="${Number(m.disconnectDeadline)}">${disconnectSeconds(m)}초</b></span>`;
    return '<span class="presence-chip offline">연결 끊김</span>';
  }

  function currentDisconnectNoticeHtml() {
    const cp=currentPlayer(); if(!cp) return '';
    const m=memberStatus(cp.clientId); if(!m || m.connected) return '';
    if(m.autoPlay) return `<div class="disconnect-notice auto"><b>🤖 ${escapeHtml(cp.name)} 자동 진행</b><span>${m.left?'게임에서 나가':'재접속 유예가 끝나'} 서버 대리 진행 상태입니다.</span></div>`;
    if(m.disconnectDeadline) return `<div class="disconnect-notice"><b>📡 ${escapeHtml(cp.name)} 연결 끊김</b><span><strong data-disconnect-deadline="${Number(m.disconnectDeadline)}">${disconnectSeconds(m)}초</strong> 안에 돌아오면 그대로 이어서 진행합니다. 이후 자동 진행됩니다.</span></div>`;
    return '';
  }

  function renderGame() {
    document.body.classList.add('game-screen-active');
    // 렌더링으로 Bottom Sheet DOM이 교체되기 전에 현재 스크롤 위치를 보존한다.
    const previousMarketSheet=document.querySelector('.market.mobile-info-panel.mobile-open');
    if(previousMarketSheet && ui.mobilePanel==='market') ui.mobileMarketScrollTop=previousMarketSheet.scrollTop;
    const cp=currentPlayer(); const mine=myPlayerIndex(); const hand=(mine>=0?state.hands[mine]:[])||[]; const myTurn=canControlCurrent(); const buyCount=pendingBuyCount(); const buyCost=pendingBuyCost();
    // 모바일에서는 주식 매수 단계 진입 시 내 턴에 한해 Bottom Sheet를 딱 한 번 자동으로 연다.
    const stockSheetKey=`${state.turnToken}:${state.currentPlayer}`;
    if(state.phase==='BUY_STOCK' && myTurn && ui.autoStockSheetKey!==stockSheetKey){
      ui.mobilePanel='market';
      ui.autoStockSheetKey=stockSheetKey;
      ui.mobileMarketScrollTop=0;
    }
    if(state.phase!=='BUY_STOCK' && ui.autoStockSheetKey) ui.autoStockSheetKey='';
    app.innerHTML=`<div class="app-shell one-screen-game">${headerHtml(true)}
      ${ui.mobilePanel?'<button type="button" class="mobile-sheet-backdrop" data-close-mobile-panel aria-label="정보창 닫기"></button>':''}
      <div class="game-layout">
        <aside class="card side-panel mobile-info-panel ${ui.mobilePanel==='players'?'mobile-open':''}"><div class="mobile-sheet-handle"></div><div class="section-title"><span>👑 플레이어 현황</span><span class="sheet-title-actions"><span class="badge">${state.players.length}명</span><button type="button" class="mobile-sheet-close" data-close-mobile-panel aria-label="닫기">×</button></span></div><div class="players-grid-mobile">
          ${state.players.map((p,i)=>{const bp=state.modal?.type==='mergerBrief'?(state.modal.payouts||[]).find(x=>x.playerIndex===i):null;const mineCard=p.clientId===net.clientId;return `<div class="player-card ${i===state.currentPlayer?'active':''} ${mineCard?'me emote-clickable':''} ${memberStatus(p.clientId)?.autoPlay?'auto-player':''} ${bp?'bonus-receiving':''}" ${mineCard?'data-open-emotes="1" role="button" tabindex="0" aria-label="내 이모티콘 열기"':''} style="--player:${p.profileColor||seatColor(i)}">${playerEmoteBubbleHtml(p)}${playerQuickReactionHtml(p)}<div class="player-head"><span class="player-avatar">${escapeHtml(p.name.slice(0,1).toUpperCase())}</span><strong>${escapeHtml(p.name)}${i===state.currentPlayer?' ◀':''}</strong><span class="badge">${i+1}</span></div><div class="player-presence">${playerConnectionHtml(p)}${mineCard?'<span class="emote-hint">💬 내 카드 눌러 반응</span>':''}</div><div class="player-meta"><span>타일 ${state.hands[i].length}장</span><span class="cash ${bp?'cash-counting':''}" ${bp?`data-cash-before="${Number(bp.cashBefore)||0}" data-cash-after="${Number(bp.cashAfter)||p.cash}"`:''}>${money(bp?bp.cashBefore:p.cash)}</span>${bp?`<span class="cash-gain-float">+${money(bp.amount)}</span>`:''}</div><div class="stock-tags">${playerStockTags(p)}</div></div>`}).join('')}
        </div></aside>

        <main class="center-stack">
          <section class="card turn-banner"><div><div class="big">${escapeHtml(cp.name)}님의 턴</div><div class="small">${phaseLabel()}</div></div><div class="status-row"><span class="turn-timer ${Number(state.turnLimitSeconds)===0?'unlimited':''}">⏱ <b id="turnTimer">${turnTimerText()}</b></span><span class="badge green">LIVE MATCH</span><span class="badge gold">ROUND ${state.round}</span>${canEndGame()?'<span class="badge danger-badge">종료 가능</span>':''}</div>${currentDisconnectNoticeHtml()}</section>
          ${mobilePlayerStripHtml()}
          <section class="card board-card"><div class="board-head"><h2>◆ 도시 보드 <span style="font-size:11px;color:var(--muted);font-weight:700">CITY GRID</span></h2><div class="status-row"><span class="badge">108 ZONES · 12×9</span><span class="badge">배치 ${Object.keys(state.board).length}</span><span class="badge discard-badge">폐기 ${Object.keys(state.discardedTiles||{}).length}</span></div></div><div class="board-wrap"><div class="board">${ALL_TILES.map(tileCell).join('')}</div></div>
            <div class="legend"><span>▫️ 독립 타일</span><span>✕ 폐기된 타일</span>${HOTEL_CHAINS.map(h=>`<span class="legend-chain"><b class="mini-chain-logo" style="--hc:${h.color}">${chainMarkHtml(h.id)}</b> ${h.name}</span>`).join('')}</div>
          </section>
          ${mobileMyInfoHtml(mine,hand,myTurn)}
          <section class="card hand-card"><div class="section-title"><span>🧩 내 타일${mine>=0?' · '+escapeHtml(state.players[mine].name):''}</span><span class="badge gold">${hand.length}장</span></div><div class="hand">
            ${hand.map(t=>{const pl=playability(t);const canDiscard=myTurn&&state.phase==='PLACE_TILE'&&pl.kind==='permanent';const disabled=!myTurn||state.phase!=='PLACE_TILE'||(pl.kind==='temporary');return `<button class="hand-tile ${ui.localSelectedTile===t?'selected':''} ${!pl.ok?pl.kind:''} ${canDiscard?'discardable':''}" data-hand="${t}" ${disabled?'disabled':''}>${t}<div class="tile-state">${pl.ok?'선택':pl.kind==='permanent'?'폐기 가능':'일시 불가'}</div></button>`}).join('')}
          </div><div class="help game-help">${helpText()}</div></section>
        </main>

        <aside class="card market mobile-info-panel ${ui.mobilePanel==='market'?'mobile-open':''}"><div class="mobile-sheet-handle"></div><div class="section-title"><span>📈 주식 매수</span><span class="sheet-title-actions"><span class="badge">최대 3주</span><button type="button" class="mobile-sheet-close" data-close-mobile-panel aria-label="닫기">×</button></span></div>
          <div class="market-summary"><div style="color:var(--muted);font-size:12px">선택 <span data-buy-summary-count>${buyCount}/3주</span> · 총 구매 금액</div><div class="total" data-buy-summary-cost>${money(buyCost)}</div><div style="color:var(--muted);font-size:11px">보유 현금 ${money(cp.cash)}</div></div>
          <div class="hotel-list">${HOTEL_CHAINS.map(h=>hotelMarketHtml(h)).join('')}</div>
          <div class="market-actions"><button class="btn primary" id="confirmBuy" data-buy-confirm ${!myTurn||state.phase!=='BUY_STOCK'?'disabled':''}>${buyCount?'선택 주식 구매 확정':'주식 구매 없이 진행'}</button><button class="btn primary" id="endTurn" disabled>팝업에서 타일 뽑기</button><button class="btn gold" id="declareEnd" ${!myTurn||!canEndGame()||!['BUY_STOCK','END_TURN'].includes(state.phase)?'disabled':''}>🏁 게임 종료 선언</button></div>
          <div class="log-box"><div class="section-title"><span>게임 로그</span><button type="button" class="mini-link-btn" data-open-info="history">전체 이력</button></div>${state.logs.slice(0,12).map(x=>`<div class="log-line">${escapeHtml(x)}</div>`).join('')||'<div class="log-line">게임 기록이 여기에 표시됩니다.</div>'}</div>
        </aside>
      </div>
      <div class="mobile-action-bar">
        <div class="mobile-action-state"><small>${myTurn?'내 차례':`${escapeHtml(cp.name)}님 진행 중`}</small><strong>${phaseLabel()}</strong></div>
        <button type="button" class="mobile-action-stock" data-mobile-panel="market">📈 <b>주식</b>${state.phase==='BUY_STOCK'&&myTurn?`<small>${buyCount}/3 · ${money(buyCost)}</small>`:''}</button>
        ${state.phase==='BUY_STOCK'&&myTurn?`<button type="button" class="mobile-action-primary" id="mobileConfirmBuy">${buyCount?'매수 확정':'매수 없이 진행'}</button>`:''}
        ${['CHOOSE_SURVIVOR','CHOOSE_DEFUNCT','MERGER_DECISION','MERGER_BONUS'].includes(state.phase)?`<button type="button" class="mobile-action-primary" data-mobile-merger-board>🗺️ 보드 보기</button>`:''}
        ${state.phase==='DRAW_TILE'&&myTurn?`<button type="button" class="mobile-action-primary" disabled>🎴 타일 뽑기</button>`:''}
      </div>
    </div>${mobileEmoteToastHtml()}${renderModal()}${mergerBoardPeekHtml()}${state.toast?`<div class="toast">${state.toast}</div>`:''}`;

    document.querySelectorAll('[data-mobile-panel]').forEach(el=>el.onclick=()=>{
      const nextPanel=el.dataset.mobilePanel;
      if(nextPanel==='market' && ui.mobilePanel!=='market') ui.mobileMarketScrollTop=0;
      ui.mobilePanel=nextPanel;
      render();
    });
    document.querySelectorAll('[data-close-mobile-panel]').forEach(el=>el.onclick=()=>{ui.mobilePanel=null;render();});
    document.querySelectorAll('[data-mobile-emote-open]').forEach(el=>el.onclick=()=>{ui.emoteMenu=true;ui.emoteCategory=null;render();});
    const mobileBuy=document.getElementById('mobileConfirmBuy'); if(mobileBuy) mobileBuy.onclick=()=>localDo(confirmBuy);
    document.querySelectorAll('[data-mobile-hand-focus]').forEach(el=>el.onclick=()=>{ui.mobilePanel=null;render();const target=document.querySelector('.hand-card');target?.scrollIntoView?.({block:'nearest',behavior:'smooth'});});
    document.querySelectorAll('[data-mobile-merger-board]').forEach(el=>el.onclick=()=>{ui.mergerBoardPeek=true;render();});
    document.querySelectorAll('[data-mobile-discard]').forEach(el=>el.onclick=()=>{if(!canControlCurrent()||state.phase!=='PLACE_TILE')return;ui.pendingDiscardTile=el.dataset.mobileDiscard;render();});
    document.querySelectorAll('[data-open-emotes]').forEach(el=>{
      const open=()=>{ui.emoteMenu=true;ui.emoteCategory=null;render();};
      el.onclick=(ev)=>{ if(ev.target.closest('button')) return; open(); };
      el.onkeydown=(ev)=>{ if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();open();} };
    });
    document.querySelectorAll('[data-quick-reaction]').forEach(el=>el.onclick=(ev)=>{ev.stopPropagation();const q=activeReactionPrompt(net.clientId);if(q)postEmote(q.emoji,q.text,'quick');});

    document.querySelectorAll('[data-hand]').forEach(el=>el.onclick=()=>{
      if(!canControlCurrent())return toast('현재 내 턴이 아닙니다.');
      selectTile(el.dataset.hand); // 확정 전에는 서버로 전송하지 않는 개인 선택
    });
    document.querySelectorAll('[data-cell]').forEach(el=>el.onclick=()=>{
      if(state.phase!=='PLACE_TILE'||!canControlCurrent()) return;
      const tile=el.dataset.cell;
      const hand=state.hands[state.currentPlayer]||[];
      if(!hand.includes(tile)) return toast('내가 가진 타일의 좌표만 놓을 수 있어요.');
      const pl=playability(tile);
      if(!pl.ok) return toast(pl.reason);
      ui.localSelectedTile=tile;
      ui.pendingPlacementTile=tile;
      render();
    });
    document.querySelectorAll('[data-buy-plus]').forEach(el=>el.onclick=(ev)=>{ev.preventDefault();handleBuyStep(el.dataset.buyPlus,1);});
    document.querySelectorAll('[data-buy-minus]').forEach(el=>el.onclick=(ev)=>{ev.preventDefault();handleBuyStep(el.dataset.buyMinus,-1);});
    document.getElementById('confirmBuy').onclick=()=>localDo(confirmBuy);
    document.getElementById('endTurn').onclick=()=>localDo(endTurn);
    document.getElementById('declareEnd').onclick=()=>localDo(declareEndGame);
    const resetGame=document.getElementById('resetGame'); if(resetGame) resetGame.onclick=()=>{if(confirm('방에서 나갈까요?')){sendNet({type:'leave'});net.roomCode='';localStorage.removeItem('acquireRoomCode');state.screen='lobby';render();}};

    // 모바일 주식 Bottom Sheet는 + / - 클릭으로 재렌더링되어도 같은 위치를 유지한다.
    const marketSheet=document.querySelector('.market.mobile-info-panel.mobile-open');
    if(marketSheet && ui.mobilePanel==='market') {
      marketSheet.scrollTop=Number(ui.mobileMarketScrollTop)||0;
      marketSheet.addEventListener('scroll',()=>{ui.mobileMarketScrollTop=marketSheet.scrollTop;},{passive:true});
      requestAnimationFrame(()=>{
        if(document.body.contains(marketSheet)) marketSheet.scrollTop=Number(ui.mobileMarketScrollTop)||0;
      });
    }
    animateBonusCashCounters();
    bindModal();
  }

  function animateBonusCashCounters() {
    document.querySelectorAll('.cash-counting[data-cash-before][data-cash-after]').forEach(el=>{
      if(el.dataset.animating==='1') return;
      el.dataset.animating='1';
      const from=Number(el.dataset.cashBefore)||0;
      const to=Number(el.dataset.cashAfter)||from;
      const duration=1550;
      const started=performance.now();
      const step=(now)=>{
        if(!document.body.contains(el)) return;
        const t=Math.min(1,(now-started)/duration);
        const eased=1-Math.pow(1-t,3);
        el.textContent=money(Math.round(from+(to-from)*eased));
        if(t<1) requestAnimationFrame(step); else el.textContent=money(to);
      };
      requestAnimationFrame(step);
    });
  }

  function helpText() {
    if(state.phase==='SETUP_PICK') return '뒤집힌 전체 타일 더미에서 1장을 고릅니다. 내용은 선택하기 전까지 보이지 않습니다.';
    if(state.phase==='SETUP_REVEAL') return '모든 플레이어가 고르면 순서를 공개하고 자동으로 게임을 시작합니다.';
    if(state.phase==='PLACE_TILE') return ui.localSelectedTile?`<strong>${ui.localSelectedTile}</strong> 선택됨. 보드의 같은 좌표를 누르면 나에게만 배치 확인창이 뜹니다.`:'초록색 타일은 배치 가능, 빨간색 <b>폐기 가능</b> 타일은 영구 배치 불가입니다. 폐기를 확정하면 모든 플레이어 보드에 ✕ 폐기 표시가 남습니다.';
    if(state.phase==='BUY_STOCK') return '활성 체인의 주식을 합계 최대 3주까지 살 수 있습니다. 사지 않고 진행해도 됩니다.';
    if(state.phase==='DRAW_TILE') return '주식 거래가 끝났습니다. 뒤집혀 섞인 전체 남은 타일 더미에서 1장을 직접 고르세요.';
    if(state.phase==='END_TURN') return '턴 종료 처리 중입니다.';
    if(state.phase==='MERGER_BONUS') return '주주 보너스와 합병 내용을 4초 동안 확인한 뒤 플레이어 순서대로 주식 처리를 결정합니다.';
    if(state.phase==='MERGER_DECISION') return '합병 주식 처리를 완료해야 다음 단계로 진행됩니다.';
    return '화면의 선택 창에서 현재 단계를 완료하세요.';
  }

  function hotelMarketHtml(h) {
    const size=chainSize(h.id); const active=size>=2; const safe=isSafe(h.id); const n=state.pendingBuy[h.id];
    return `<div class="hotel ${active?'active-chain':''}" style="--hc:${h.color}"><div class="chain-logo ${h.id==='Tower'?'tower-chain-logo':''}">${chainMarkHtml(h.id)}</div><div><div class="hotel-name"><span style="color:${h.color}">●</span> ${h.name}</div><div class="hotel-sub">${active?`${size}칸${safe?' · SAFE':''}`:'미설립'} · 남은 주식 ${state.chainBank[h.id]} / 25</div><div class="hotel-sub">${active?`1주 ${money(stockPrice(h.id))}`:'거래 불가'}</div></div><div class="stock-step"><button type="button" data-buy-minus="${h.id}" ${state.phase!=='BUY_STOCK'||!active||n<=0?'disabled':''}>−</button><b data-buy-count="${h.id}">${n}</b><button type="button" data-buy-plus="${h.id}" ${state.phase!=='BUY_STOCK'||!active||state.chainBank[h.id]<=n?'disabled':''}>＋</button></div></div>`;
  }

  function isMergerModal(m=state.modal) {
    return !!m && ['chooseSurvivor','chooseDefunct','mergerDecision'].includes(m.type);
  }

  function mergerBoardPeekHtml() {
    if(!ui.mergerBoardPeek || !state.merger || !isMergerModal()) return '';
    const tile=state.merger.tile || '';
    return `<div class="merger-peek-bar"><div><b>👀 합병 보드 보기</b><span>${tile?`${escapeHtml(tile)} 타일에서 합병 발생 · `:''}보드를 확인한 뒤 결정 화면으로 돌아가세요.</span></div><button type="button" class="btn primary" id="returnMergerDecision">합병 결정으로 돌아가기</button></div>`;
  }

  function renderEmoteModal() {
    if(!ui.emoteMenu || state.screen!=='game' || myPlayerIndex()<0) return '';
    const selected=EMOTE_CATEGORIES.find(cat=>cat.id===ui.emoteCategory) || null;
    if(!selected) {
      return `<div class="modal-back local-modal-back emote-modal-back"><div class="modal card emote-modal"><button type="button" class="modal-close" data-close-emotes aria-label="닫기">×</button><span class="entry-kicker">QUICK CHAT</span><h2>💬 이모티콘 보내기</h2><p>대항목을 먼저 고르세요. 선택한 말풍선은 모든 플레이어에게 약 3초간 보여요.</p><div class="emote-main-categories">${EMOTE_CATEGORIES.map(cat=>`<button type="button" class="emote-main-category" data-emote-category="${cat.id}"><span>${cat.icon}</span><b>${cat.label}</b><small>문구 ${cat.items.length}개</small></button>`).join('')}</div><div class="emote-footer"><button type="button" class="btn" data-close-emotes>취소</button></div></div></div>`;
    }
    return `<div class="modal-back local-modal-back emote-modal-back"><div class="modal card emote-modal"><button type="button" class="modal-close" data-close-emotes aria-label="닫기">×</button><span class="entry-kicker">QUICK CHAT · ${escapeHtml(selected.label)}</span><div class="emote-sub-head"><button type="button" class="emote-back-btn" data-emote-back>← 대항목</button><h2><span>${selected.icon}</span> ${escapeHtml(selected.label)}</h2></div><p>보낼 문구를 하나 선택하세요.</p><div class="emote-sub-options">${selected.items.map(item=>`<button type="button" data-send-emote data-emoji="${escapeHtml(item.emoji)}" data-text="${escapeHtml(item.text)}"><span>${escapeHtml(item.emoji)}</span><b>${escapeHtml(item.text)}</b></button>`).join('')}</div><div class="emote-footer"><button type="button" class="btn" data-close-emotes>취소</button></div></div></div>`;
  }

  function renderModal() {
    const m=state.modal; if(!m) return '';
    if(ui.mergerBoardPeek && isMergerModal(m)) return '';
    if(m.type==='setupPick') {
      const mine=state.players.find(p=>p.clientId===net.clientId);
      const picked=mine?state.setupPicks[mine.clientId]:null;
      const picker=state.players[state.setupPickerIndex];
      const pickerMember=picker?memberStatus(picker.clientId):null;
      const done=Object.keys(state.setupPicks||{}).length;
      if(!mine) return `<div class="modal-back"><div class="modal card"><h2>🎲 순서 결정 중</h2><p>플레이어들의 타일 뽑기를 기다리고 있습니다.</p></div></div>`;
      if(picked) return `<div class="modal-back"><div class="modal card tile-pick-modal deck-modal"><span class="entry-kicker">TURN ORDER</span><h2>✅ 내가 뽑은 타일: ${escapeHtml(picked)}</h2><p>${picker?`${escapeHtml(picker.name)}님이 타일을 고르는 중입니다.`:'모든 선택이 끝났습니다.'} (${done}/${state.players.length})</p><div class="picked-order-hint">모두 뽑은 뒤 한꺼번에 공개하고 순서를 정합니다.</div></div></div>`;
      if(!picker || picker.clientId!==net.clientId) {
        const reconnecting=pickerMember && !pickerMember.connected && !pickerMember.autoPlay && pickerMember.disconnectDeadline;
        return `<div class="modal-back"><div class="modal card tile-pick-modal deck-modal"><span class="entry-kicker">TURN ORDER</span><h2>${reconnecting?'📡':'⏳'} ${escapeHtml(picker?.name||'다른 플레이어')} ${reconnecting?'재접속 대기':'타일 뽑기'}</h2><p>${reconnecting?`연결이 끊겼습니다. <b data-disconnect-deadline="${Number(pickerMember.disconnectDeadline)}">${disconnectSeconds(pickerMember)}초</b> 안에 돌아오지 않으면 순서 결정에서 제외됩니다.`:`전체 타일은 뒤집혀 있으며 현재 플레이어만 한 장을 고를 수 있습니다. (${done}/${state.players.length})`}</p></div></div>`;
      }
      return `<div class="modal-back"><div class="modal card tile-pick-modal deck-modal"><span class="entry-kicker">TURN ORDER</span><h2>🎲 뒤집힌 타일 1장을 고르세요</h2><p>전체 타일 더미가 무작위로 섞여 있습니다. 좌표는 고르기 전까지 보이지 않습니다.</p><div class="deck-meta"><span>남은 타일 <b>${state.remainingDeck.length}</b>장</span><span>선택 ${done+1}/${state.players.length}</span></div><div class="face-down-deck">${state.remainingDeck.map((_,i)=>`<button class="tile-back" data-setup-pick-index="${i}" aria-label="뒤집힌 순서 타일 ${i+1}"><i></i><span>◆</span></button>`).join('')}</div><div class="picked-order-hint">모두 선택 후 공개 · 우선순위 1A → 1B → … → 12I</div></div></div>`;
    }
    if(m.type==='setupReveal') {
      return `<div class="modal-back"><div class="modal card tile-pick-modal setup-reveal-modal"><span class="entry-kicker">TURN ORDER RESULT</span><h2>🎉 플레이 순서가 정해졌습니다</h2><p>숫자가 낮을수록 먼저, 같은 숫자에서는 A에 가까울수록 먼저입니다.</p><div class="order-reveal-list">${state.setupSeeds.map((x,i)=>`<div class="order-reveal-row"><b>${i+1}</b><span>${escapeHtml(x.name)}</span><strong>${escapeHtml(x.tile)}</strong></div>`).join('')}</div><div class="picked-order-hint">모두 선택하면 자동으로 게임을 시작합니다.</div></div></div>`;
    }
    if(m.type==='drawTile') {
      if(!canControlCurrent()) return `<div class="modal-back"><div class="modal card tile-pick-modal deck-modal"><h2>⏳ ${escapeHtml(currentPlayer().name)} 타일 뽑기 대기</h2><p>현재 플레이어가 뒤집힌 전체 타일 더미에서 보충 타일을 고르고 있습니다.</p><div class="deck-meta"><span>남은 타일 <b>${state.remainingDeck.length}</b>장</span></div></div></div>`;
      return `<div class="modal-back"><div class="modal card tile-pick-modal deck-modal"><span class="entry-kicker">DRAW TILE</span><h2>🧩 보충 타일을 뽑으세요</h2><p>남아 있는 타일 전체가 무작위로 섞여 있습니다. 뒷면 하나를 고르면 그때 좌표가 공개됩니다.</p><div class="deck-meta"><span>남은 타일 <b>${state.remainingDeck.length}</b>장</span><span>내 손패 ${state.hands[state.currentPlayer].length}/6장</span></div><div class="face-down-deck">${state.remainingDeck.map((_,i)=>`<button class="tile-back" data-draw-pick-index="${i}" aria-label="뒤집힌 보충 타일 ${i+1}"><i></i><span>◆</span></button>`).join('')}</div></div></div>`;
    }
    if(m.type==='mergerBrief') {
      const left=Math.max(0,Math.ceil((Number(m.endsAt)-Date.now())/1000));
      const survivorName=chainName(m.survivor);
      const defunctName=chainName(m.chainId);
      const payouts=m.payouts||[];
      const payoutRows=payouts.length?payouts.map(p=>`<div class="merger-brief-payout"><div><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.label)}</span></div><strong>+${money(p.amount)}</strong></div>`).join(''):'<div class="merger-brief-none">보유 주주가 없어 주주 보너스 지급이 없습니다.</div>';
      return `<div class="modal-back merger-brief-back"><div class="modal card merger-brief-modal" style="--mbc:${chainColor(m.chainId)};--msc:${chainColor(m.survivor)}">
        <div class="merger-brief-top"><span class="entry-kicker">MERGER SETTLEMENT</span><span class="merger-brief-count" data-merger-brief-left>약 ${left}초</span></div>
        <h2>🤝 ${escapeHtml(defunctName)} → ${escapeHtml(survivorName)} 합병</h2>
        <p class="merger-brief-explain"><b>${escapeHtml(survivorName)}</b>이 더 큰 체인이라 존속하고, <b>${escapeHtml(defunctName)}</b>은 소멸합니다. 소멸 체인 주주는 보너스를 받은 뒤 자신의 차례에 <b>매도 · 2:1 교환 · 보유</b>를 결정합니다.</p>
        <div class="merger-flow-mini"><div><span style="--dot:${chainColor(m.chainId)}"></span><b>${escapeHtml(defunctName)}</b><small>${m.defunctSize}칸 · 소멸</small></div><i>→</i><div><span style="--dot:${chainColor(m.survivor)}"></span><b>${escapeHtml(survivorName)}</b><small>${m.survivorSize}칸 · 존속</small></div></div>
        <div class="merger-bonus-levels"><div><small>👑 최대주주 기본 보너스</small><strong>${money(m.major)}</strong></div><div><small>🥈 2대주주 기본 보너스</small><strong>${money(m.minor)}</strong></div></div>
        <div class="merger-brief-payouts"><h3>💰 이번 지급</h3>${payoutRows}</div>
        <div class="merger-brief-foot"><span>보너스 지급 + 합병 요약</span><b>총 4초 후 자동 진행</b></div>
        <div class="merger-brief-progress"><i></i></div>
      </div></div>`;
    }
    if(m.type==='chooseChain') {
      if(!canControlCurrent()) return '';
      return `<div class="modal-back"><div class="modal card"><h2>🏗️ 새 체인 창립</h2><p>설립할 호텔 체인을 선택하세요. 은행에 주식이 남아 있으면 창립자 주식 1주를 무료로 받습니다.</p><div class="choice-grid">${inactiveChains().map(id=>`<button class="chain-choice" data-found="${id}" style="--c:${chainColor(id)}"><b>${chainName(id)}</b><small>기준가 ${money(CHAIN[id].base)}</small></button>`).join('')}</div></div></div>`;
    }
    if(m.type==='chooseSurvivor') {
      if(!canControlCurrent()) return `<div class="modal-back"><div class="modal card"><h2>⏳ ${escapeHtml(currentPlayer().name)} 선택 대기</h2><p>${escapeHtml(currentPlayer().name)}님이 동률 합병의 존속 체인을 고르는 중입니다.</p><button type="button" class="btn merger-board-btn" data-merger-board-view>🗺️ 보드 보기</button></div></div>`;
      return `<div class="modal-back"><div class="modal card"><h2>🤝 동률 합병</h2><p>가장 큰 체인들이 같은 크기입니다. 합병을 만든 플레이어가 존속 체인을 선택합니다.</p><div class="choice-grid">${m.candidates.map(id=>`<button class="chain-choice" data-survivor="${id}" style="--c:${chainColor(id)}"><b>${chainName(id)}</b><small>${state.merger.sizes[id]}칸</small></button>`).join('')}</div><button type="button" class="btn merger-board-btn" data-merger-board-view>🗺️ 보드 보기</button></div></div>`;
    }
    if(m.type==='chooseDefunct') {
      if(!canControlCurrent()) return `<div class="modal-back"><div class="modal card"><h2>⏳ ${escapeHtml(currentPlayer().name)} 선택 대기</h2><p>${escapeHtml(currentPlayer().name)}님이 같은 크기의 소멸 체인 처리 순서를 정하는 중입니다.</p><button type="button" class="btn merger-board-btn" data-merger-board-view>🗺️ 보드 보기</button></div></div>`;
      return `<div class="modal-back"><div class="modal card"><h2>🔀 소멸 체인 처리 순서</h2><p>같은 크기의 소멸 체인이 있습니다. 합병을 만든 플레이어가 먼저 처리할 체인을 선택합니다.</p><div class="choice-grid">${m.candidates.map(id=>`<button class="chain-choice" data-defunct="${id}" style="--c:${chainColor(id)}"><b>${chainName(id)}</b><small>${state.merger.sizes[id]}칸</small></button>`).join('')}</div><button type="button" class="btn merger-board-btn" data-merger-board-view>🗺️ 보드 보기</button></div></div>`;
    }
    if(m.type==='mergerDecision') {
      const p=state.players[m.playerIndex]; const price=stockPrice(m.defunct,state.merger.sizes[m.defunct]); const used=m.sell+m.tradePairs*2; const held=m.total-used;
      if(p.clientId!==net.clientId) return `<div class="modal-back"><div class="modal card"><h2>⏳ ${escapeHtml(p.name)} 선택 대기</h2><p>${chainName(m.defunct)} 주식의 매도·교환·보유 결정을 기다리고 있습니다.</p><button type="button" class="btn merger-board-btn" data-merger-board-view>🗺️ 보드 보기</button></div></div>`;
      return `<div class="modal-back"><div class="modal card"><h2>💼 ${escapeHtml(p.name)} · 합병 주식 처리</h2><p><b style="color:${chainColor(m.defunct)}">${chainName(m.defunct)}</b> ${m.total}주를 어떻게 처리할까요? 매도와 교환을 섞을 수 있고 남은 주식은 보유합니다.</p>
        <div class="merger-info"><div><small>소멸 체인 주가</small><b>${money(price)}</b></div><div><small>존속 체인</small><b style="color:${chainColor(m.survivor)}">${chainName(m.survivor)}</b></div><div><small>존속 체인 은행 주식</small><b>${state.chainBank[m.survivor]}주</b></div></div>
        <div class="decision-row"><span>현금 매도</span><div class="counter"><button data-md="sell,-1">−</button><b>${m.sell}주</b><button data-md="sell,1">＋</button></div><strong>+${money(m.sell*price)}</strong></div>
        <div class="decision-row"><span>2:1 주식 교환</span><div class="counter"><button data-md="trade,-1">−</button><b>${m.tradePairs*2} → ${m.tradePairs}주</b><button data-md="trade,1">＋</button></div><strong>${chainName(m.survivor)}</strong></div>
        <div class="decision-row hold"><span>그대로 보유</span><strong>${held}주</strong><span class="muted-mini">나중에 같은 체인이 재창립될 수 있음</span></div>
        <div class="merger-action-buttons"><button type="button" class="btn merger-board-btn" data-merger-board-view>🗺️ 보드 보기</button><button class="btn primary" id="confirmMerger">처리 확정</button></div></div></div>`;
    }
    if(m.type==='results') {
      const top=state.results.slice(0,3);
      const podium=[top[1],top[0],top[2]].map((r,idx)=>r?`<div class="podium p${idx}"><div class="podium-avatar">${escapeHtml(r.name.slice(0,1).toUpperCase())}</div><b>${escapeHtml(r.name)}</b><strong>${money(r.cash)}</strong><span>${idx===1?'1st':idx===0?'2nd':'3rd'}</span></div>`:'').join('');
      const settlement=(m.settlement||[]).map((x,playerOrder)=>{
        const rankIndex=state.results.findIndex(r=>r.playerIndex===x.playerIndex);
        const bonusRows=x.bonuses.length?x.bonuses.map(b=>`<div class="settle-line"><span><i class="settle-dot" style="--sc:${chainColor(b.chainId)}"></i>${escapeHtml(b.chainName)} · ${escapeHtml(b.label)}</span><strong>+${money(b.amount)}</strong></div>`).join(''):'<div class="settle-empty">주주 보너스 없음</div>';
        const saleRows=x.stockSales.length?x.stockSales.map(v=>`<div class="settle-line"><span><i class="settle-dot" style="--sc:${chainColor(v.chainId)}"></i>${escapeHtml(v.chainName)} ${v.shares}주 × ${money(v.price)}</span><strong>+${money(v.amount)}</strong></div>`).join(''):'<div class="settle-empty">매도할 활성 호텔 주식 없음</div>';
        const worthlessRows=x.worthless?.length?`<div class="settle-worthless"><b>가치 $0 보유:</b> ${x.worthless.map(v=>`${escapeHtml(v.chainName)} ${v.shares}주`).join(' · ')}</div>`:'';
        return `<article class="settlement-player ${rankIndex===0?'winner':''}">
          <header><div><span class="settle-order">P${playerOrder+1}</span><b>${escapeHtml(x.name)}</b><small>${rankIndex>=0?`${rankIndex+1}위`:''}</small></div><strong>${money(x.finalCash)}</strong></header>
          <div class="settle-summary"><span>정산 전 ${money(x.startCash)}</span><span>보너스 +${money(x.bonusTotal)}</span><span>주식 매도 +${money(x.stockSaleTotal)}</span></div>
          <section><h4>👑 호텔별 주주 보너스</h4>${bonusRows}</section>
          <section><h4>💵 보유 주식 매도</h4>${saleRows}${worthlessRows}</section>
          <footer><span>최종 자산</span><b>${money(x.startCash)} + ${money(x.bonusTotal)} + ${money(x.stockSaleTotal)}</b><strong>= ${money(x.finalCash)}</strong></footer>
        </article>`;
      }).join('');
      return `<div class="modal-back results-back"><div class="modal card results-modal results-modal-wide"><div class="confetti" aria-hidden="true">${Array.from({length:18},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div><div class="results-layout"><section class="results-ranking"><span class="entry-kicker">FINAL RANKING</span><h2>🏆 ${escapeHtml(state.results[0]?.name||'승자')} 승리!</h2><p class="result-sub">최종 자산 기준으로 순위를 계산했습니다.</p><div class="podium-wrap">${podium}</div><div class="results-list">${state.results.map((r,i)=>`<div class="result-row ${i===0?'winner':''}"><span><b>${i+1}위</b> · ${escapeHtml(r.name)}</span><strong>${money(r.cash)}</strong></div>`).join('')}</div></section><section class="settlement-panel"><div class="settlement-title"><div><span class="entry-kicker">SETTLEMENT</span><h3>상세 정산 결과</h3></div><small>플레이어 순서대로 표시</small></div><div class="settlement-list">${settlement}</div></section></div><details class="bonus-details"><summary>호텔별 전체 주주 보너스 요약</summary>${m.bonusLog.map(x=>`<div class="log-line">${escapeHtml(x)}</div>`).join('')}</details><button class="btn primary" id="resultNew" style="width:100%;margin-top:14px">대기실로 돌아가기</button></div></div>`;
    }
    return '';
  }

  function bindModal() {
    document.querySelectorAll('[data-setup-pick-index]').forEach(el=>el.onclick=()=>localDo(()=>chooseSetupTile(el.dataset.setupPickIndex)));
    document.querySelectorAll('[data-draw-pick-index]').forEach(el=>el.onclick=()=>{if(canControlCurrent())localDo(()=>chooseDrawTile(el.dataset.drawPickIndex));});
    const csr=document.getElementById('confirmSetupReveal'); if(csr)csr.onclick=()=>localDo(confirmSetupReveal);
    document.querySelectorAll('[data-found]').forEach(el=>el.onclick=()=>{if(canControlCurrent())localDo(()=>foundChain(el.dataset.found));});
    document.querySelectorAll('[data-survivor]').forEach(el=>el.onclick=()=>{if(canControlCurrent())localDo(()=>chooseSurvivor(el.dataset.survivor));});
    document.querySelectorAll('[data-defunct]').forEach(el=>el.onclick=()=>{if(canControlCurrent())localDo(()=>chooseDefunct(el.dataset.defunct));});
    document.querySelectorAll('[data-md]').forEach(el=>el.onclick=()=>{const [k,d]=el.dataset.md.split(',');localDo(()=>adjustMergerDecision(k,Number(d)));});
    const cm=document.getElementById('confirmMerger'); if(cm)cm.onclick=()=>localDo(confirmMergerDecision);
    document.querySelectorAll('[data-merger-board-view]').forEach(el=>el.onclick=()=>{ui.mergerBoardPeek=true;render();});
    const back=document.getElementById('returnMergerDecision'); if(back)back.onclick=()=>{ui.mergerBoardPeek=false;render();};
    const rn=document.getElementById('resultNew'); if(rn)rn.onclick=newGame;
  }

  function headerHtml(inGame=false) {
    const bgmControl=inGame?`<div class="bgm-control"><button type="button" id="bgmToggle" class="header-text-btn bgm-toggle" aria-pressed="${bgm.enabled?'true':'false'}">${bgm.enabled?'🔊 BGM':'🔇 BGM'}</button><label class="bgm-volume" title="BGM 볼륨"><span>♪</span><input id="bgmVolume" type="range" min="0" max="100" step="1" value="${Math.round(bgm.volume*100)}" aria-label="BGM 볼륨"><small id="bgmVolumeValue">${Math.round(bgm.volume*100)}%</small></label></div>`:'';
    return `<header class="header"><div class="brand"><div class="logo"><span>◆</span></div><div><div class="brand-title">ACQUIRE <span class="classic-tag">CLASSIC</span></div><div class="brand-sub">HOTEL EMPIRE · ONLINE BOARD GAME</div></div></div><div class="top-actions"><span class="connection-dot ${net.connected?'online':''}"><i></i>${net.connected?'ONLINE':'CONNECTING'}</span>${net.roomCode?`<span class="badge room-badge">ROOM ${escapeHtml(net.roomCode)}</span>`:''}${inGame?`<span class="badge gold">ROUND ${state.round}</span>`:''}${bgmControl}<button type="button" class="header-text-btn" data-open-info="prices" aria-label="주가표 보기">📊 주가표</button>${inGame?'<button type="button" class="header-text-btn" data-open-info="history" aria-label="게임 이력 보기">☷ 기록</button>':''}<button type="button" class="header-icon-btn" data-open-info="rules" aria-label="규칙 보기">?</button><button type="button" class="header-icon-btn" data-open-info="settings" aria-label="설정">⚙</button>${inGame?'<button type="button" class="header-icon-btn more-menu-btn" data-open-info="more" aria-label="더보기">⋯</button>':''}</div></header>`;
  }

  function renderInfoModal(){
    if(!ui.modal) return '';
    if(ui.modal==='prices') {
      const rows=[
        ['$200','2','–','–','$2,000','$1,000'],['$300','3','2','–','$3,000','$1,500'],['$400','4','3','2','$4,000','$2,000'],['$500','5','4','3','$5,000','$2,500'],['$600','6–10','5','4','$6,000','$3,000'],['$700','11–20','6–10','5','$7,000','$3,500'],['$800','21–30','11–20','6–10','$8,000','$4,000'],['$900','31–40','21–30','11–20','$9,000','$4,500'],['$1,000','41 이상','31–40','21–30','$10,000','$5,000'],['$1,100','–','41 이상','31–40','$11,000','$5,500'],['$1,200','–','–','41 이상','$12,000','$6,000']
      ];
      return `<div class="modal-back local-modal-back"><div class="modal card info-modal price-modal"><button class="modal-close" data-close-info aria-label="닫기">×</button><span class="entry-kicker">CLASSIC STOCK TABLE</span><h2>📊 클래식 주가표</h2><p>호텔 체인의 현재 크기에 따라 주식 1장 가격과 최대/2대 주주 보너스가 결정됩니다.</p><div class="price-tier-legend"><span><b style="--pc:#e84e5f">●</b> 색슨 · 타워</span><span><b style="--pc:#5b78d4">●</b> 아메리칸 · 페스티벌 · 월드와이드</span><span><b style="--pc:#28a6ca">●</b> 콘티넨탈 · 임페리얼</span></div><div class="price-table-wrap"><table class="price-table"><thead><tr><th>1주 가격</th><th>색슨/타워<br>체인 크기</th><th>중간 3체인<br>체인 크기</th><th>콘티넨탈/임페리얼<br>체인 크기</th><th>최대 주주</th><th>2대 주주</th></tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${i===0?'price-cell':i>=4?'bonus-cell':''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="rule-note">주주 보너스는 주가의 10배 / 5배입니다. 단독 주주는 두 보너스를 모두 받고, 최대주주 동률은 두 보너스를 합쳐 나눕니다. 2대주주만 동률이면 2대주주 보너스만 나누며, 분배액은 $100 단위로 올림합니다.</div><button class="btn primary" data-close-info style="width:100%;margin-top:14px">확인</button></div></div>`;
    }
    if(ui.modal==='history') return `<div class="modal-back local-modal-back"><div class="modal card info-modal history-modal"><button class="modal-close" data-close-info aria-label="닫기">×</button><span class="entry-kicker">MATCH HISTORY</span><h2>☷ 게임 이력</h2><p>공개 행동만 기록됩니다. 새로 뽑은 비공개 타일 좌표는 다른 플레이어에게 기록되지 않습니다.</p><div class="history-list">${state.logs.map((x,i)=>`<div class="history-row"><span>${state.logs.length-i}</span><p>${escapeHtml(x)}</p></div>`).join('')||'<div class="history-empty">아직 기록이 없습니다.</div>'}</div><button class="btn primary" data-close-info style="width:100%;margin-top:14px">닫기</button></div></div>`;
    if(ui.modal==='more') return `<div class="modal-back local-modal-back"><div class="modal card info-modal more-menu-modal"><button class="modal-close" data-close-info aria-label="닫기">×</button><span class="entry-kicker">GAME MENU</span><h2>⋯ 더보기</h2><div class="more-menu-list"><button type="button" class="more-menu-item" data-open-info="history"><span>☷</span><div><b>게임 기록</b><small>지금까지의 공개 행동 확인</small></div></button><button type="button" class="more-menu-item" data-open-info="rules"><span>?</span><div><b>게임 규칙</b><small>규칙과 진행 방법 확인</small></div></button><button type="button" class="more-menu-item" data-open-info="settings"><span>⚙</span><div><b>화면 설정</b><small>보드 크기와 애니메이션 설정</small></div></button><button type="button" class="more-menu-item danger" id="leaveGameFromMenu"><span>↗</span><div><b>방 나가기</b><small>현재 게임에서 나갑니다</small></div></button></div><button class="btn" data-close-info style="width:100%;margin-top:14px">취소</button></div></div>`;
    if(ui.modal==='rules') return `<div class="modal-back local-modal-back"><div class="modal card info-modal"><button class="modal-close" data-close-info aria-label="닫기">×</button><span class="entry-kicker">HOW TO PLAY</span><h2>게임 규칙</h2><div class="rules-grid"><section><b>① 순서·타일 배치</b><p>게임 시작 시 뒤집힌 전체 타일 더미에서 1장씩 뽑습니다. 모두 뽑은 뒤 숫자가 낮고 같은 숫자면 A에 가까운 순서로 턴을 정하고 즉시 자동으로 게임을 시작합니다. 게임 중에는 내 타일 1장을 같은 좌표에 놓습니다.</p></section><section><b>② 체인과 안전 체인</b><p>연결된 타일이 2개 이상이면 호텔 체인이 됩니다. 11칸 이상인 체인은 안전 체인이며 다른 안전 체인과 합병되지 않습니다.</p></section><section><b>③ 합병</b><p>더 큰 체인이 존속합니다. 동률이면 합병을 만든 플레이어가 존속 체인을 고릅니다. 소멸 체인의 주주가 1명뿐이면 최대+2대 보너스를 모두 받고, 최대주주가 동률이면 두 보너스를 합쳐 나눕니다. 소멸 체인 주식은 매도·2:1 교환·보유를 선택합니다.</p></section><section><b>④ 주식 매수·타일 보충</b><p>타일 처리 후 활성 체인의 주식을 합계 최대 3주까지 살 수 있습니다. 방장은 시작 전에 턴 제한을 무제한 또는 30초 단위(최대 3분)로 정할 수 있습니다. 제한 시간이 있는 경우 시간이 끝나면 현재 단계에 따라 자동 진행됩니다: 타일 단계는 배치 가능한 손패 타일을 무작위 배치하고 주식은 사지 않으며, 주식 단계는 매수 없이, 타일 뽑기 단계는 자동으로 1장을 뽑고 턴을 마칩니다.</p></section><section><b>⑤ 영구 불가 타일</b><p>안전 체인끼리 합병시키는 등 영구적으로 놓을 수 없는 손패 타일은 자신의 턴에 폐기할 수 있고, 폐기 좌표는 보드에 ✕로 공개됩니다.</p></section><section><b>승리 조건</b><p>종료 시 활성 체인의 주주 보너스와 보유 주식을 현금화한 뒤 최종 자산이 가장 많은 플레이어가 승리합니다.</p></section></div><button class="btn primary" data-close-info style="width:100%;margin-top:16px">확인</button></div></div>`;
    return `<div class="modal-back local-modal-back"><div class="modal card info-modal"><button class="modal-close" data-close-info aria-label="닫기">×</button><span class="entry-kicker">DISPLAY</span><h2>화면 설정</h2><div class="settings-list"><label><span><b>보드 크기</b><small>PC에서 보드 칸 크기를 조절합니다.</small></span><select id="boardScaleSetting"><option value="90" ${ui.settings.boardScale===90?'selected':''}>90%</option><option value="100" ${ui.settings.boardScale===100?'selected':''}>100%</option><option value="110" ${ui.settings.boardScale===110?'selected':''}>110%</option></select></label><label><span><b>진행 도움말</b><small>내 타일 아래 단계 설명을 표시합니다.</small></span><input id="hintSetting" type="checkbox" ${ui.settings.showHints?'checked':''}></label><label><span><b>애니메이션 줄이기</b><small>게임 시작과 결과 화면의 움직임을 줄입니다.</small></span><input id="motionSetting" type="checkbox" ${ui.settings.reducedMotion?'checked':''}></label></div><button class="btn primary" data-save-settings style="width:100%;margin-top:16px">설정 저장</button></div></div>`;
  }

  function localPlacementModalHtml(){
    const tile=ui.pendingPlacementTile;
    if(!tile || state.phase!=='PLACE_TILE' || !canControlCurrent()) return '';
    const a=analyzePlacement(tile);
    const desc=({SINGLE:'독립 타일로 배치됩니다.',GROW:`${chainName(a.chain)} 체인을 성장시킵니다.`,FOUND:'새 호텔 체인을 창립하게 됩니다.',MERGER:'호텔 체인 합병이 발생합니다.'})[a.type]||'이 위치에 배치합니다.';
    return `<div class="modal-back local-placement-back"><div class="modal card placement-confirm"><span class="entry-kicker">PRIVATE PREVIEW</span><h2>📍 ${tile}에 타일을 놓을까요?</h2><p>${desc}<br><b>배치 확정</b> 전까지 이 선택은 다른 플레이어 화면에 표시되지 않습니다.</p><div class="placement-actions"><button class="btn" id="cancelPlacement">다시 선택</button><button class="btn primary" id="confirmPlacement">배치 확정</button></div></div></div>`;
  }

  function localDiscardModalHtml(){
    const tile=ui.pendingDiscardTile;
    if(!tile || state.phase!=='PLACE_TILE' || !canControlCurrent()) return '';
    const p=playability(tile);
    if(p.kind!=='permanent') return '';
    return `<div class="modal-back local-placement-back"><div class="modal card placement-confirm discard-confirm"><span class="entry-kicker">PERMANENT DISCARD</span><h2>🗑️ ${tile} 타일을 폐기할까요?</h2><p>${escapeHtml(p.reason)}<br>폐기하면 이번 턴의 타일 행동이 끝나고 <b>주식 매수 단계</b>로 이동합니다. 폐기된 ${tile} 좌표는 보드에 ✕ 표시로 공개됩니다.</p><div class="placement-actions"><button class="btn" id="cancelDiscard">취소</button><button class="btn danger" id="confirmDiscard">폐기 확정</button></div></div></div>`;
  }

  function modalUtilityHtml(){
    if(state.screen!=='game' || (!state.modal && !ui.pendingPlacementTile && !ui.pendingDiscardTile)) return '';
    if(state.modal?.type==='chooseChain' && !canControlCurrent()) return '';
    return `<button type="button" class="modal-price-shortcut" data-open-info="prices">📊 주가표</button>`;
  }

  function bonusEffectHtml(){
    const e=ui.bonusEffect; if(!e) return '';
    return `<div class="bonus-effect" aria-live="polite"><div class="bonus-card" style="--bc:${chainColor(e.chainId)}"><span>SHAREHOLDER BONUS</span><h3>💰 ${escapeHtml(chainName(e.chainId))} 주주 보너스!</h3>${e.payouts.map(p=>`<div class="bonus-payout"><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.label)}</span><strong>+${money(p.amount)}</strong></div>`).join('')}</div></div>`;
  }
  function drawRevealHtml(){
    if(!ui.drawReveal) return '';
    return `<div class="draw-reveal" aria-live="polite"><div class="reveal-tile"><small>내가 뽑은 타일</small><strong>${escapeHtml(ui.drawReveal.tile)}</strong><span>손패에 추가되었습니다</span></div></div>`;
  }

  function startIntroHtml(){
    if(!ui.startIntro || state.screen!=='game') return '';
    return `<div class="start-intro" aria-live="polite"><div class="start-city"><i></i><i></i><i></i><i></i><i></i></div><span>ACQUIRE</span><strong>게임 시작</strong><p>${escapeHtml(state.players[0]?.name||'첫 플레이어')}부터 시작합니다</p></div>`;
  }

  function bindGlobalUi(){
    document.querySelectorAll('[data-open-info]').forEach(el=>el.onclick=()=>{ui.modal=el.dataset.openInfo;render();});
    document.querySelectorAll('[data-close-info]').forEach(el=>el.onclick=()=>{ui.modal=null;render();});
    const leaveGameFromMenu=document.getElementById('leaveGameFromMenu');
    if(leaveGameFromMenu) leaveGameFromMenu.onclick=()=>{if(confirm('방에서 나갈까요?')){sendNet({type:'leave'});net.roomCode='';localStorage.removeItem('acquireRoomCode');state.screen='lobby';ui.modal=null;render();}};
    const save=document.querySelector('[data-save-settings]');
    if(save) save.onclick=()=>{
      ui.settings.boardScale=Number(document.getElementById('boardScaleSetting').value)||100;
      ui.settings.showHints=document.getElementById('hintSetting').checked;
      ui.settings.reducedMotion=document.getElementById('motionSetting').checked;
      saveUiSettings(); ui.modal=null; render(); toast('화면 설정을 저장했습니다.');
    };
    const bgmToggle=document.getElementById('bgmToggle');
    if(bgmToggle) bgmToggle.onclick=toggleBgm;
    const bgmVolume=document.getElementById('bgmVolume');
    if(bgmVolume){
      bgmVolume.oninput=()=>setBgmVolume(Number(bgmVolume.value)/100);
      bgmVolume.onchange=()=>setBgmVolume(Number(bgmVolume.value)/100);
    }
    updateBgmControls();
  }

  const _renderLobby=renderLobby, _renderGame=renderGame;
  renderLobby=function(){ _renderLobby(); app.insertAdjacentHTML('beforeend', modalUtilityHtml()+renderInfoModal()+startIntroHtml()+bonusEffectHtml()+drawRevealHtml()); bindGlobalUi(); };
  renderGame=function(){
    _renderGame();
    app.insertAdjacentHTML('beforeend', modalUtilityHtml()+renderInfoModal()+renderEmoteModal()+startIntroHtml()+localPlacementModalHtml()+localDiscardModalHtml()+bonusEffectHtml()+drawRevealHtml());
    bindGlobalUi();
    document.querySelectorAll('[data-close-emotes]').forEach(el=>el.onclick=()=>{ui.emoteMenu=false;ui.emoteCategory=null;render();});
    document.querySelectorAll('[data-emote-category]').forEach(el=>el.onclick=()=>{ui.emoteCategory=el.dataset.emoteCategory;render();});
    document.querySelectorAll('[data-emote-back]').forEach(el=>el.onclick=()=>{ui.emoteCategory=null;render();});
    document.querySelectorAll('[data-send-emote]').forEach(el=>el.onclick=()=>postEmote(el.dataset.emoji,el.dataset.text,'basic'));
    const ok=document.getElementById('confirmPlacement');
    if(ok) ok.onclick=()=>{ const tile=ui.pendingPlacementTile; ui.pendingPlacementTile=null; localDo(()=>placeTile(tile)); };
    const cancel=document.getElementById('cancelPlacement');
    if(cancel) cancel.onclick=()=>{ ui.pendingPlacementTile=null; render(); };
    const discardOk=document.getElementById('confirmDiscard');
    if(discardOk) discardOk.onclick=()=>{ const tile=ui.pendingDiscardTile; ui.pendingDiscardTile=null; localDo(()=>discardPermanentTile(tile)); };
    const discardCancel=document.getElementById('cancelDiscard');
    if(discardCancel) discardCancel.onclick=()=>{ ui.pendingDiscardTile=null; render(); };
  };

  function render() { state.screen==='lobby'?renderLobby():renderGame(); syncBgmForScreen(); }
  applyUiSettings();
  initBgm();
  document.addEventListener('pointerdown',unlockBgm,{passive:true});
  document.addEventListener('keydown',unlockBgm,{passive:true});
  render();
  connectNetwork();
  setInterval(tickTurnTimer,250);
  setInterval(tickNetworkRecovery,250);
  let _socialSignature='';
  setInterval(()=>{
    if(state.screen!=='game') return;
    const now=Date.now();
    const emotes=Object.values(state.playerEmotes||{}).filter(e=>Number(e.expiresAt)>now).map(e=>e.id).sort();
    const prompts=Object.values(state.reactionPrompts||{}).filter(q=>Number(q.expiresAt)>now && now>=Number(q.startsAt||0) && !ui.dismissedReactionIds?.[q.id]).map(q=>q.id).sort();
    const sig=[...emotes,...prompts].join('|');
    if(sig!==_socialSignature){ _socialSignature=sig; render(); }
  },250);
})();
