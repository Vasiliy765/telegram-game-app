/* ==== Морський бій 10×10 ==== */
window.Battleship = (() => {
  const N = 10;
  const SHIPS = [4,3,3,2,2,2,1,1,1,1];
  const LETTERS = ['А','Б','В','Г','Д','Е','Ж','З','И','К'];
  const root = () => document.getElementById('screen-battleship') || document.getElementById('battleship-game');
  let state = {};
  let publicRoomsUnmount = null;

  const emptyGrid = () => Array(N*N).fill(0);
  const idx = (r,c) => r*N+c;
  const rc = i => ({r:Math.floor(i/N),c:i%N});
  const coord = i => LETTERS[i%N]+(Math.floor(i/N)+1);

  function canPlace(grid, cells) {
    return cells.every(i => {
      if (i < 0 || i >= N*N) return false;
      const {r,c}=rc(i);
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        const rr=r+dr,cc=c+dc;
        if(rr>=0&&rr<N&&cc>=0&&cc<N&&grid[idx(rr,cc)]!==0) return false;
      }
      return true;
    });
  }

  function randomFleet() {
    const grid=emptyGrid(), ships=[];
    SHIPS.forEach((len,n)=>{
      for(let tries=0;tries<3000;tries++){
        const dir=Math.random()<.5?'h':'v';
        const r=Math.floor(Math.random()*N), c=Math.floor(Math.random()*N);
        const cells=[];
        for(let k=0;k<len;k++){
          const rr=r+(dir==='v'?k:0),cc=c+(dir==='h'?k:0);
          if(rr<N&&cc<N) cells.push(idx(rr,cc));
        }
        if(cells.length===len&&canPlace(grid,cells)){
          const ship={id:n+1,len,cells,hits:new Set(),dir};
          cells.forEach(i=>grid[i]=ship.id); ships.push(ship); break;
        }
      }
    });
    return {grid,ships};
  }

  function init() {
    const gameRoot = root();
    if (!gameRoot) {
      console.error('Battleship container is missing from the page');
      return;
    }
    const view = document.getElementById('view-battleship');
    const screen = document.getElementById('screen-battleship');
    if (view) {
      view.classList.add('active');
      view.style.display = 'block';
    }
    if (screen) screen.style.display = 'block';
    document.body.classList.add('battleship-active');
    state={screen:'menu',mode:'bot',stake:10,playerGrid:emptyGrid(),enemyGrid:emptyGrid(),
      enemyResults:{},playerResults:{},playerShips:[],enemyShips:[],selected:null,
      selLen:4,selDir:'h',target:null,turn:'player',timerSeconds:28,botTargets:[],
      playerStats:{shots:0,hits:0,sunk:0},enemyStats:{shots:0,hits:0,sunk:0},sound:true,online:null,
      matchId:`battleship-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,wagerStarted:false};
    render();
    const invite = window.consumeIncomingRoomInvite?.('battleship');
    const roomCode = invite?.roomCode || new URLSearchParams(location.search).get('battleshipRoom');
    if (roomCode) void joinOnlineRoom(roomCode);
  }

  function leave() {
    clearInterval(state.interval);
    if(state.online?.db&&state.online.unsubscribe){
      state.online.db.ref(`battleshipRooms/${state.online.roomCode}`).off('value',state.online.unsubscribe);
    }
    state.online=null;
    const url=new URL(location.href);
    url.searchParams.delete('battleshipRoom');
    url.searchParams.delete('room');
    history.replaceState({},'',url);
    document.body.classList.remove('battleship-active');
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id==='view-home'));
    const view = document.getElementById('view-battleship');
    const screen = document.getElementById('screen-battleship');
    if (view) view.style.removeProperty('display');
    if (screen) screen.style.removeProperty('display');
  }

  function render(){
    if(state.screen==='menu') renderMenu();
    if(state.screen==='place') renderPlace();
    if(state.screen==='battle') renderBattle();
    if(state.screen==='final') renderFinal();
  }

  function renderMenu(){
    publicRoomsUnmount?.();
    root().innerHTML=`<div class="bs-screen bs-menu">
      <header class="bs-menu-header"><button class="bs-back" id="bs-back" type="button">← Назад</button></header>
      <div class="bs-menu-title"><h1>Морський бій</h1><p>Класика 10×10 — потопи ворожий флот</p></div>
      <div class="bs-mode-title">РЕЖИМИ ГРИ</div>
      <div class="bs-mode-list">
        <button class="bs-mode-card" data-mode="online" type="button"><span class="bs-mode-icon">♟</span><span><strong>Онлайн 1 на 1</strong><small>Створи стіл і запроси друга</small></span><b>›</b></button>
        <button class="bs-mode-card active" data-mode="bot" type="button"><span class="bs-mode-icon">⌘</span><span><strong>Бій проти бота</strong><small>Швидка гра проти розумного ШІ</small></span><b>›</b></button>
        <button class="bs-mode-card" data-mode="local" type="button"><span class="bs-mode-icon">▦</span><span><strong>Локальна дуель</strong><small>Двоє гравців на одному пристрої</small></span><b>›</b></button>
      </div>
      <section class="public-rooms-section"><h2>Відкриті столи</h2><div class="public-room-list" id="bs-open-room-list"><p class="public-room-empty">Завантаження відкритих столів…</p></div></section>
      <div class="bs-drawer-overlay" id="bs-stake-overlay"></div>
      <aside class="bs-stake-drawer" id="bs-stake-drawer">
        <div class="bs-drawer-head"><strong>Онлайн 1 на 1</strong><button id="bs-drawer-close" type="button">×</button></div>
        <div class="bs-stake-label">Ставка</div>
        <div class="bs-stakes">${[10,50,100,500].map((v,i)=>`<button data-stake="${v}" class="${i===0?'active':''}" type="button">🪙 ${v}</button>`).join('')}</div>
        <button class="bs-create-room" id="bs-create-room" type="button">Створити стіл</button>
      </aside>
    </div>`;
    publicRoomsUnmount=window.PublicRooms?.mount(
      root().querySelector('#bs-open-room-list'),
      (game,roomCode)=>window.openPublicRoom(game,roomCode)
    )||null;
    document.getElementById('bs-back').onclick=leave;
    root().querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
      state.mode=b.dataset.mode;
      if(state.mode==='online') openDrawer(); else startPlacement();
    });
  }

  function openDrawer(){
    const overlay=document.getElementById('bs-stake-overlay'),drawer=document.getElementById('bs-stake-drawer');
    overlay.classList.add('open');drawer.classList.add('open');
    overlay.onclick=closeDrawer;
    document.getElementById('bs-drawer-close').onclick=closeDrawer;
    root().querySelectorAll('[data-stake]').forEach(b=>b.onclick=()=>{
      root().querySelectorAll('[data-stake]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');state.stake=+b.dataset.stake;
    });
    document.getElementById('bs-create-room').onclick=()=>{void createOnlineRoom();};
  }
  function closeDrawer(){
    document.getElementById('bs-stake-overlay').classList.remove('open');
    document.getElementById('bs-stake-drawer').classList.remove('open');
  }
  function firebaseReady(){
    const config=window.FIREBASE_CONFIG;
    return Boolean(window.firebase?.firestore&&window.firebase?.auth&&window.FirebaseRoomStore&&config&&
      ['apiKey','authDomain','projectId','appId'].every(key=>
        typeof config[key]==='string'&&config[key].trim()&&!config[key].includes('YOUR_')));
  }

  async function connectFirebase(){
    if(!firebaseReady())return null;
    if(!window.firebase.apps.length)window.firebase.initializeApp(window.FIREBASE_CONFIG);
    const user=await window.getFirebaseUser();
    return {db:window.FirebaseRoomStore,uid:user.uid};
  }

  function makeRoomCode(){return `BS-${Math.random().toString(36).slice(2,8).toUpperCase()}`;}
  function playerIdentity(){
    return window.getCurrentPlayerProfile?.()||{
      id:'local-player',telegramId:'',username:'',name:window.Telegram?.WebApp?.initDataUnsafe?.user?.first_name||'Гравець',photoUrl:''
    };
  }
  function playerName(){return playerIdentity().name;}
  function playerProfileFields(){
    const profile=playerIdentity();
    return {telegramId:profile.telegramId,username:profile.username,photoUrl:profile.photoUrl};
  }
  function roomLink(){
    return window.createRoomInviteUrl(state.online.roomCode);
  }
  function notify(message){
    if(window.TWA?.toast)window.TWA.toast(message);
    else window.alert(message);
  }
  async function copyRoomLink(){
    try{
      await navigator.clipboard.writeText(roomLink());
      notify('Посилання скопійовано');
    }catch(error){
      console.error('Unable to copy Battleship room link',error);
      notify('Не вдалося скопіювати посилання');
    }
  }
  function shareRoomLink(){
    const link=roomLink();
    const share=`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Приєднуйся до дуелі в Морський бій!')}`;
    if(window.Telegram?.WebApp?.openTelegramLink)window.Telegram.WebApp.openTelegramLink(share);
    else window.open(share,'_blank','noopener,noreferrer');
  }

  async function createOnlineRoom(){
    closeDrawer();
    const roomCode=makeRoomCode();
    let backend=null;
    try{backend=await connectFirebase();}
    catch(error){console.error('Unable to connect to Firebase for Battleship',error);notify('Не вдалося підключитися до Firebase. Створюємо локальне тестове лобі.');}

    state.online={roomCode,isHost:true,uid:backend?.uid||'local-host',db:backend?.db||null,
      localTest:!backend,unsubscribe:null,roomData:null};
    state.mode='online';
    const host={id:state.online.uid,name:playerName(),...playerProfileFields(),avatar:(playerName()[0]||'Г').toUpperCase(),ready:true,fleet:serializeFleet(randomFleet().ships)};
    const room={meta:{stake:state.stake,bank:state.stake,status:'waiting',hostId:String(host.id),
      creatorId:String(host.telegramId||host.id),hostName:host.name,isPublic:true,createdAt:Date.now(),version:1,round:1},
      players:{[host.id]:host},turn:host.id,shots:{}};
    state.online.roomData=room;
    if(backend){
      try{
        const ref=backend.db.ref(`battleshipRooms/${roomCode}`);
        await ref.set(room);
        state.online.unsubscribe=ref.on('value',snapshot=>onOnlineRoom(snapshot.val()),error=>{
          console.error('Battleship room listener failed',error);
          notify('Не вдалося отримати оновлення кімнати Firebase.');
        });
      }catch(error){
        console.error('Unable to create Battleship room',error);
        state.online.db=null;state.online.localTest=true;
        notify('Не вдалося створити онлайн-кімнату. Доступне локальне тестове лобі.');
      }
    }
    renderLobby();
  }

  async function joinOnlineRoom(code){
    const roomCode=String(code||'').trim().toUpperCase();
    if(!/^BS-[A-Z0-9]{6}$/.test(roomCode)){notify('Посилання на кімнату Морського бою некоректне.');return;}
    let backend;
    try{backend=await connectFirebase();}
    catch(error){console.error('Unable to connect to Battleship room',error);notify('Не вдалося підключитися до онлайн-кімнати.');return;}
    if(!backend){notify('Для приєднання друга потрібна налаштована Firebase-конфігурація.');return;}
    try{
      const ref=backend.db.ref(`battleshipRooms/${roomCode}`);
      const snapshot=await ref.once('value');
      const room=snapshot.val();
      if(!room||room.meta?.status==='finished')throw new Error('Кімнату не знайдено або гра завершена.');
      const profile=window.getCurrentPlayerProfile?.()||{};
      const existing=Object.values(room.players||{}).find(player=>String(player.id)===String(backend.uid)||
        (profile.telegramId&&player.telegramId===profile.telegramId));
      if(!existing){
        if(room.meta?.status!=='waiting')throw new Error('Бій уже розпочався.');
      }
      const uid=existing?.id||backend.uid;
      state.online={roomCode,isHost:String(room.meta?.hostId)===String(uid),uid,joinPending:!existing,db:backend.db,
        localTest:false,unsubscribe:null,roomData:room};
      state.mode='online';state.stake=Number(room.meta?.stake)||10;
      state.screen='lobby';
      state.online.unsubscribe=ref.on('value',next=>onOnlineRoom(next.val()),error=>{
        console.error('Battleship room listener failed',error);notify('Не вдалося синхронізувати кімнату.');
      });
      onOnlineRoom(room);
    }catch(error){
      console.error('Unable to join Battleship room',error);
      notify(error.message||'Не вдалося приєднатися до кімнати.');
    }
  }

  function onOnlineRoom(room){
    if(!room||!state.online)return;
    if(state.screen==='final'&&room.meta?.status==='finished')return;
    if(state.screen==='final'&&room.meta?.status==='waiting'){
      state.screen='lobby';state.wagerStarted=false;state.wagerId=null;state.payout=0;
    }
    state.online.roomData=room;
    if(room.meta?.status==='playing'||room.meta?.status==='battle'||room.meta?.status==='finished'){
      startOnlineBattle(room);
      if(room.meta?.status==='playing'||room.meta?.status==='battle')scheduleOnlineBotTurn(room);
      return;
    }
    if(state.screen==='lobby')renderLobby();
  }

  function renderLobby(){
    state.screen='lobby';
    const room=state.online.roomData||{};
    const players=Object.values(room.players||{});
    const mine=players.find(player=>String(player.id)===String(state.online.uid));
    const hostPlayer=players.find(player=>String(player.id)===String(room.meta?.hostId));
    const guestPlayer=players.find(player=>String(player.id)!==String(room.meta?.hostId));
    const inviteUrl=roomLink();
    const telegramUser=window.Telegram?.WebApp?.initDataUnsafe?.user;
    const currentUserId=telegramUser?.id==null?state.online.uid:telegramUser.id;
    const creatorId=room.meta?.creatorId??(telegramUser?.id==null?room.meta?.hostId:hostPlayer?.telegramId);
    const isHost=creatorId!=null&&String(currentUserId)===String(creatorId);
    const isJoined=players.some(player=>telegramUser?.id==null
      ?String(player.id)===String(state.online.uid)
      :String(player.telegramId)===String(telegramUser.id));
    const isJoinPending=!isHost&&!isJoined;
    const joinAvailable=players.length<2&&room.meta?.status==='waiting';
    const canStart=isHost&&canStartBattle(room);
    state.online.isHost=isHost;
    state.online.joinPending=isJoinPending;
    root().innerHTML=`<div class="bs-screen bs-lobby">
      <header class="bs-lobby-head"><button class="bs-back" id="bs-lobby-back">← Назад</button><span>Онлайн 1 на 1</span></header>
      <div class="bs-lobby-content">
        <div class="bs-lobby-stake">Ставка <b>🪙 ${Number(room.meta?.stake)||state.stake}</b> · Банк <b>🪙 ${Number(room.meta?.bank)||players.length*state.stake}</b></div>
        <div class="bs-lobby-slots">
          <div class="bs-lobby-player"><span class="bs-lobby-avatar${isHost||hostPlayer?.ready?' ready':''}">${escapeHtml(hostPlayer?.isBot?'🤖':hostPlayer?.avatar||'👑')}</span><strong>${escapeHtml(hostPlayer?.name||room.meta?.hostName||'Господар')}</strong><small>${isHost||hostPlayer?.ready?'✅ Готовий':'Очікує'}</small></div>
          <span class="bs-vs">VS</span>
          <div class="bs-lobby-player${isJoinPending&&joinAvailable?' bs-open-seat':''}" ${isJoinPending&&joinAvailable?'id="bs-open-seat" role="button" tabindex="0"':''}><span class="bs-lobby-avatar${guestPlayer?.ready?' ready':''}">${escapeHtml(guestPlayer?.isBot?'🤖':guestPlayer?.avatar||'＋')}</span><strong>${escapeHtml(guestPlayer?.name||'＋ Вільне місце')}</strong><small>${guestPlayer?.ready?'✅ Готовий':'Очікуємо друга'}</small></div>
        </div>
        <div class="bs-room-code">Код кімнати <strong>${state.online.roomCode}</strong></div>
        ${isHost?'<button class="bs-lobby-action primary" id="bs-invite">Надіслати запрошення в чат</button><button class="bs-lobby-action" id="bs-copy">Скопіювати посилання</button>':''}
        ${isHost&&players.length<2?'<button class="bs-lobby-action" id="bs-add-ai">🤖 + Додати ШІ-бота</button>':''}
        ${isJoinPending?(joinAvailable?`<button class="bs-lobby-action primary" id="bs-join">Приєднатися до столу (ставка: ${Number(room.meta?.stake)||state.stake} 🪙)</button>`:'<div class="bs-online-status">У кімнаті немає вільного місця.</div>'):''}
        ${!isHost&&isJoined?`<button class="bs-lobby-action primary" id="bs-ready">${mine?.ready?'Не готовий ❌':'Готово ✅'}</button>`:''}
        ${isHost?`<button class="bs-lobby-action${canStart?' primary':''}" id="bs-start" ${canStart?'':'disabled'}>Почати гру</button>`:''}
        <p class="bs-lobby-hint">${isHost&&inviteUrl?'Поділися посиланням і дочекайся готовності суперника.':''}</p>
        ${isJoinPending?'':`<div class="bs-online-status">${room.meta?.status==='playing'||room.meta?.status==='battle'?'Гра починається…':`Готові: ${players.filter(player=>String(player.id)===String(room.meta?.hostId)||player.ready||player.isBot).length}/2`}</div>`}
        <button class="bs-lobby-action" id="bs-lobby-back">${isJoinPending||isHost?'← Назад':'Вийти зі столу'}</button>
      </div>
    </div>`;
    const avatars=root().querySelectorAll('.bs-lobby-avatar');
    window.renderPlayerAvatar?.(avatars[0],hostPlayer||{name:'Господар'},hostPlayer?.isBot?'🤖':'👑');
    window.renderPlayerAvatar?.(avatars[1],guestPlayer||{name:'Вільне місце'},guestPlayer?.isBot?'🤖':'＋');
    document.getElementById('bs-lobby-back').onclick=()=>{void leaveLobby();};
    document.getElementById('bs-invite')?.addEventListener('click',shareRoomLink);
    document.getElementById('bs-copy')?.addEventListener('click',()=>{void copyRoomLink();});
    document.getElementById('bs-add-ai')?.addEventListener('click',()=>{void addAiOpponent();});
    document.getElementById('bs-join')?.addEventListener('click',()=>{void acceptRoomInvite();});
    const openSeat=document.getElementById('bs-open-seat');
    openSeat?.addEventListener('click',()=>{void acceptRoomInvite();});
    openSeat?.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();void acceptRoomInvite();}
    });
    document.getElementById('bs-ready')?.addEventListener('click',()=>{void toggleOnlineReady();});
    document.getElementById('bs-start')?.addEventListener('click',()=>{void startOnlineGame();});
  }

  async function acceptRoomInvite(){
    const online=state.online;
    if(!online||online.localTest||!online.joinPending)return;
    const profile=window.getCurrentPlayerProfile?.()||{};
    const player={
      id:online.uid,name:playerName(),...playerProfileFields(),avatar:(playerName()[0]||'Г').toUpperCase(),
      ready:false,fleet:serializeFleet(randomFleet().ships)
    };
    try{
      const result=await window.joinRoomWithStake(`battleshipRooms/${online.roomCode}`,online.roomCode,
        Number(online.roomData.meta?.stake)||state.stake,current=>{
          if(!current||current.meta?.status!=='waiting')return {error:'Бій уже розпочався.'};
          current.players||={};
          const existing=Object.values(current.players).find(item=>String(item.id)===String(online.uid)||
            (profile.telegramId&&item.telegramId===profile.telegramId));
          if(existing)return {alreadyJoined:true};
          if(Object.keys(current.players).length>=2)return {error:'У кімнаті вже є два гравці.'};
          current.players[online.uid]=player;
          current.meta.bank=(Number(current.meta.bank)||Number(current.meta.stake)||state.stake)+(Number(current.meta.stake)||state.stake);
          return {room:current};
        });
      const joinedPlayer=Object.values(result.room.players||{}).find(item=>String(item.id)===String(online.uid)||
        (profile.telegramId&&item.telegramId===profile.telegramId));
      if(!joinedPlayer)throw new Error('Не вдалося знайти ваше місце за столом.');
      online.uid=joinedPlayer.id;
      online.joinPending=false;
      online.isHost=String(result.room.meta?.hostId)===String(online.uid);
      onOnlineRoom(result.room);
    }catch(error){
      console.error('Unable to join the invited Battleship room',error);
      notify(error.message||'Не вдалося приєднатися до кімнати.');
    }
  }

  function canStartBattle(room){
    const players=Object.values(room.players||{});
    return players.length>=2&&players.every(player=>
      String(player.id)===String(room.meta?.hostId)||player.ready||player.isBot);
  }

  async function toggleOnlineReady(){
    const online=state.online;
    const mine=online?.roomData?.players?.[online.uid];
    if(!online||!mine||mine.isBot)return;
    const ready=!mine.ready;
    const fleet=mine.fleet||serializeFleet(randomFleet().ships);
    if(online.localTest){
      Object.assign(mine,{ready,fleet});
      onOnlineRoom(online.roomData);
      return;
    }
    try{
      await online.db.ref(`battleshipRooms/${online.roomCode}`).transaction(room=>{
        if(!room||room.meta?.status!=='waiting'||!room.players?.[online.uid])return;
        room.players[online.uid].ready=ready;
        room.players[online.uid].fleet=fleet;
        return room;
      });
    }catch(error){
      console.error('Unable to update Battleship readiness',error);
      notify('Не вдалося змінити готовність.');
    }
  }

  async function editFleet(){
    const online=state.online;
    const mine=online?.roomData?.players?.[online.uid];
    if(!online||!mine||mine.isBot)return;
    if(mine.ready)await toggleOnlineReady();
    startPlacement();
  }

  async function startOnlineGame(){
    const online=state.online;
    if(!online||String(online.uid)!==String(online.roomData.meta?.hostId))return;
    if(Number(window.APP_STATE?.balance)<state.stake){
      notify('Недостатньо монет для ставки 🪙');
      return;
    }
    if(online.localTest){
      if(!canStartBattle(online.roomData)){notify('Усі гравці мають натиснути «Готово».');return;}
      online.roomData.meta.status='playing';
      online.roomData.turn=online.roomData.meta.hostId;
      onOnlineRoom(online.roomData);
      return;
    }
    try{
      const result=await online.db.ref(`battleshipRooms/${online.roomCode}`).transaction(room=>{
        if(!room||String(room.meta?.hostId)!==String(online.uid)||room.meta?.status!=='waiting'||
            !canStartBattle(room))return;
        room.meta.status='playing';
        room.turn=String(room.meta.hostId);
        room.startedAt=Date.now();
        return room;
      });
      if(!result.committed)notify('Почати можна, коли всі гравці готові.');
    }catch(error){
      console.error('Unable to start Battleship room',error);
      notify('Не вдалося почати гру.');
    }
  }

  async function leaveLobby(){
    const online=state.online;
    if(!online)return;
    if(!online.localTest&&online.isHost&&online.roomData.meta?.status==='waiting'){
      try{
        await online.db.ref(`battleshipRooms/${online.roomCode}`).remove();
      }catch(error){
        console.error('Unable to close Battleship room',error);notify('Не вдалося закрити стіл.');return;
      }
    }else if(!online.localTest&&!online.isHost&&!online.joinPending&&online.roomData.meta?.status==='waiting'){
      try{
        await window.leaveRoomWithRefund(`battleshipRooms/${online.roomCode}`,online.roomCode,
          Number(online.roomData.meta?.stake)||state.stake,current=>{
            if(!current?.players?.[online.uid])return;
            delete current.players[online.uid];
            current.meta.bank=Math.max(0,(Number(current.meta.bank)||0)-(Number(current.meta.stake)||state.stake));
            return {room:current};
          });
      }catch(error){
        console.error('Unable to leave the Battleship room',error);
        notify('Не вдалося вийти зі столу.');
        return;
      }
    }
    if(online.unsubscribe)online.db.ref(`battleshipRooms/${online.roomCode}`).off('value',online.unsubscribe);
    state.online=null;
    renderMenu();
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  async function addAiOpponent(){
    const online=state.online;
    if(!online||String(online.uid)!==String(online.roomData.meta?.hostId)||Object.keys(online.roomData.players||{}).length>=2)return;
    const fleet=randomFleet();
    const id=`bot-${Date.now()}`;
    const opponent={id,name:'ШІ-бот',avatar:'🤖',ready:true,isBot:true,fleet:serializeFleet(fleet.ships)};
    if(online.localTest){
      online.roomData.players[id]=opponent;
      online.testFleet=fleet;
      onOnlineRoom(online.roomData);
      notify('ШІ-бот приєднався');
      return;
    }
    try{
      const result=await online.db.ref(`battleshipRooms/${online.roomCode}`).transaction(room=>{
        if(!room||String(room.meta?.hostId)!==String(online.uid)||room.meta?.status!=='waiting'||
            Object.keys(room.players||{}).length>=2)return;
        room.players[id]=opponent;
        room.meta.bank=(Number(room.meta.bank)||Number(room.meta.stake)||state.stake)
          +(Number(room.meta.stake)||state.stake);
        return room;
      });
      if(!result.committed)notify('У кімнаті немає вільного місця.');
    }catch(error){
      console.error('Unable to add a Battleship AI opponent',error);
      notify('Не вдалося додати ШІ-бота.');
    }
  }

  function serializeFleet(ships){
    return ships.map(ship=>({id:ship.id,len:ship.len,cells:ship.cells,dir:ship.dir}));
  }

  function deserializeFleet(records){
    return (records||[]).map(ship=>({...ship,hits:new Set()}));
  }

  function startOnlineBattle(room){
    const players=Object.values(room.players||{});
    const own=room.players?.[state.online.uid];
    const opponent=players.find(player=>String(player.id)!==String(state.online.uid));
    if(!own?.fleet||!opponent?.fleet)return;
    const wagerId=`battleship-${state.online.roomCode}-${room.meta?.round||1}`;
    if(!state.wagerStarted){
      if(window.beginUserWager&&!window.beginUserWager(wagerId,state.stake)){
        notify('Недостатньо монет для ставки 🪙');
        return;
      }
      state.wagerId=wagerId;state.wagerStarted=true;
    }
    state.playerShips=deserializeFleet(own.fleet);
    state.playerGrid=emptyGrid();
    state.playerShips.forEach(ship=>ship.cells.forEach(i=>state.playerGrid[i]=ship.id));
    state.enemyShips=deserializeFleet(opponent.fleet);
    state.enemyGrid=emptyGrid();
    state.enemyShips.forEach(ship=>ship.cells.forEach(i=>state.enemyGrid[i]=ship.id));
    state.enemyResults={};state.playerResults={};
    state.playerStats={shots:0,hits:0,sunk:0};state.enemyStats={shots:0,hits:0,sunk:0};
    state.turn=String(room.turn)===String(state.online.uid)?'player':'bot';
    state.screen='battle';
    syncOnlineShots(room);
    if(room.meta?.status==='finished')return;
    renderBattle();
    startTimer();
  }

  function syncOnlineShots(room){
    if(!state.online||!room.shots)return;
    const outgoing=Object.values(room.shots[state.online.uid]||{});
    const incoming=Object.entries(room.shots||{})
      .filter(([playerId])=>String(playerId)!==String(state.online.uid))
      .flatMap(([,shots])=>Object.values(shots||{}));
    state.enemyResults={};state.playerResults={};
    state.playerStats={shots:outgoing.length,hits:0,sunk:0};
    state.enemyStats={shots:incoming.length,hits:0,sunk:0};
    outgoing.forEach(shot=>{
      if(shot.hit){state.enemyResults[shot.index]='hit';state.playerStats.hits++;}
      else state.enemyResults[shot.index]='miss';
    });
    incoming.forEach(shot=>{
      if(shot.hit){state.playerResults[shot.index]='hit';state.enemyStats.hits++;}
      else state.playerResults[shot.index]='miss';
    });
    [state.enemyShips,state.playerShips].forEach((ships,side)=>{
      const results=side===0?state.enemyResults:state.playerResults;
      const stat=side===0?state.playerStats:state.enemyStats;
      ships.forEach(ship=>{
        ship.hits=new Set(ship.cells.filter(i=>results[i]==='hit'));
        if(ship.hits.size===ship.len){
          ship.cells.forEach(i=>results[i]='sunk');
          markSunkPerimeter(results,ship);
          stat.sunk++;
        }
      });
    });
    state.turn=String(room.turn)===String(state.online.uid)?'player':'bot';
    if(room.meta?.status==='finished'){
      finish(room.winner===state.online.uid);
    }
  }

  function scheduleOnlineBotTurn(room){
    const online=state.online;
    const bot=Object.values(room.players||{}).find(player=>player.isBot&&String(player.id)===String(room.turn));
    if(!online?.db||!online.isHost||!bot||room.meta?.status!=='playing')return;
    const shots=room.shots?.[bot.id]||{};
    const key=`${room.meta.round||1}:${Object.keys(shots).length}`;
    if(online.botTurnKey===key)return;
    online.botTurnKey=key;
    setTimeout(async()=>{
      try{
        const result=await online.db.ref(`battleshipRooms/${online.roomCode}`).transaction(current=>{
          const currentBot=current?.players?.[bot.id];
          const own=current?.players?.[online.uid];
          if(!current||current.meta?.status!=='playing'||String(current.turn)!==String(bot.id)||
              !currentBot?.isBot||!own?.fleet)return;
          const botShots=current.shots?.[bot.id]||{};
          const available=Array.from({length:N*N},(_,index)=>index)
            .filter(index=>!Object.prototype.hasOwnProperty.call(botShots,index));
          if(!available.length)return;
          const index=available[Math.floor(Math.random()*available.length)];
          const hit=own.fleet.some(ship=>ship.cells.includes(index));
          const hitCells=new Set(Object.values(botShots).filter(shot=>shot.hit).map(shot=>shot.index));
          if(hit)hitCells.add(index);
          const won=hit&&own.fleet.every(ship=>ship.cells.every(cell=>hitCells.has(cell)));
          current.shots||={};
          current.shots[bot.id]||={};
          current.shots[bot.id][index]={index,hit,at:Date.now()};
          if(won){
            current.meta.status='finished';
            current.winner=bot.id;
          }else if(!hit){
            current.turn=online.uid;
          }
          return current;
        });
        if(!result.committed)online.botTurnKey=null;
      }catch(error){
        online.botTurnKey=null;
        console.error('Unable to submit a Battleship AI shot',error);
        notify('ШІ-бот не зміг зробити постріл.');
      }
    },650);
  }

  async function fireOnline(i){
    if(!state.online?.db)return;
    const room=state.online.roomData;
    const players=Object.values(room?.players||{});
    const opponent=players.find(player=>String(player.id)!==String(state.online.uid));
    if(!opponent||String(room.turn)!==String(state.online.uid))return;
    const ship=state.enemyShips.find(item=>item.cells.includes(i));
    const myShots=Object.values(room.shots?.[state.online.uid]||{});
    const previousHits=new Set(myShots.filter(shot=>shot.hit).map(shot=>shot.index));
    const isHit=Boolean(ship);
    const sunk=isHit&&ship.cells.every(cell=>cell===i||previousHits.has(cell));
    const isWin=sunk&&state.enemyShips.every(item=>item.id===ship.id||item.cells.every(cell=>previousHits.has(cell)));
    const updates={};
    updates[`shots/${state.online.uid}/${i}`]={index:i,hit:isHit,at:Date.now()};
    if(isWin){
      updates['meta/status']='finished';
      updates.winner=state.online.uid;
    }else if(!isHit){
      updates.turn=opponent.id;
    }
    try{
      await state.online.db.ref(`battleshipRooms/${state.online.roomCode}`).update(updates);
      state.target=null;
      state.turn=isHit?'player':'bot';
      if(isWin)finish(true);
    }catch(error){
      console.error('Unable to submit Battleship shot',error);
      notify('Не вдалося надіслати постріл. Спробуй ще раз.');
    }
  }

  async function confirmOnlineReady(){
    const online=state.online;
    if(!online)return;
    const fleet=serializeFleet(state.playerShips);
    const room=online.roomData;
    if(online.db){
      try{
        const result=await online.db.ref(`battleshipRooms/${online.roomCode}`).transaction(current=>{
          if(!current||current.meta?.status!=='waiting'||!current.players?.[online.uid])return;
          current.players[online.uid].ready=true;
          current.players[online.uid].fleet=fleet;
          return current;
        });
        if(result.snapshot.exists())online.roomData=result.snapshot.val();
      }catch(error){
        console.error('Unable to publish Battleship fleet readiness',error);
        notify('Не вдалося зберегти готовність у Firebase.');
      }
    }else{
      const player=room.players[online.uid];
      player.ready=true;
      player.fleet=fleet;
      onOnlineRoom(room);
    }
    state.screen='lobby';
    renderLobby();
  }

  function startPlacement(){
    state.screen='place';state.playerGrid=emptyGrid();state.playerShips=[];state.enemyResults={};state.playerResults={};
    state.playerStats={shots:0,hits:0,sunk:0};state.enemyStats={shots:0,hits:0,sunk:0};
    state.target=null;state.selLen=4;state.selDir='h';state.localPhase='p1';
    renderPlace();
  }

  function placementGridHtml(id){
    let h=`<div class="bs-board-coords"><i></i>${LETTERS.map(x=>`<b>${x}</b>`).join('')}</div><div class="bs-board-rowhead">`;
    h+=`<div class="bs-rownums">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<b>${n}</b>`).join('')}</div>`;
    h+=`<div class="bs-grid bs-place-grid" id="${id}">${Array.from({length:N*N},(_,i)=>{
      const shipId=state.playerGrid[i];let cls='bs-cell';
      if(shipId){
        const ship=state.playerShips.find(item=>item.id===shipId);
        cls+=` bs-ship ${shipCellClass(ship,i)}`;
      }
      return `<button type="button" class="${cls}" data-i="${i}" aria-label="${coord(i)}"></button>`;
    }).join('')}</div></div>`;
    return h;
  }

  function renderPlace(){
    state.screen='place';
    const counts={4:1,3:2,2:3,1:4};
    const playerName=state.mode==='local'&&(state.localPhase==='p2')?'Гравець 2':'Твій флот';
    root().innerHTML=`<div class="bs-screen bs-place">
      <header class="bs-place-head"><button class="bs-back" id="bs-place-back">${state.online?'← Лобі':'← Назад'}</button></header>
      <div class="bs-place-title"><div><h1>Розстав свій флот</h1><p>${playerName} · 10 кораблів</p></div><div class="bs-place-meta"><span>2:58</span><b>${state.playerShips.length} / 10</b></div></div>
      <div class="bs-place-board">${placementGridHtml('bs-place-grid-el')}</div>
      <p class="bs-place-tip">Перетягни або обери корабель · тап по кораблю на полі — поворот</p>
      <div class="bs-dock">${[4,3,2,1].map(len=>{
        const remaining=counts[len]-state.playerShips.filter(ship=>ship.len===len).length;
        return `<button type="button" class="bs-dock-item ${state.selLen===len?'active':''}" data-dock="${len}" ${remaining===0?'disabled':''}><span class="bs-mini-ship len-${len}">${Array.from({length:len},()=>'<i></i>').join('')}</span><b>×${remaining}</b></button>`;
      }).join('')}</div>
      <div class="bs-place-actions"><button id="bs-random" type="button">Випадково</button><button id="bs-clear" type="button">Очистити</button></div>
      <button class="bs-go-battle ${state.playerShips.length===10?'ready':''}" id="bs-go-battle" ${state.playerShips.length===10?'':'disabled'} type="button">${state.online?'Готовий до бою':'В бій'}</button>
    </div>`;
    document.getElementById('bs-place-back').onclick=()=>state.online?renderLobby():renderMenu();
    root().querySelectorAll('[data-dock]').forEach(b=>b.onclick=()=>{state.selLen=+b.dataset.dock;renderPlace();});
    document.getElementById('bs-random').onclick=()=>{
      const fleet=randomFleet();state.playerGrid=fleet.grid;state.playerShips=fleet.ships;renderPlace();
    };
    document.getElementById('bs-clear').onclick=()=>{
      state.playerGrid=emptyGrid();state.playerShips=[];renderPlace();
    };
    document.getElementById('bs-go-battle').onclick=startBattle;
    document.getElementById('bs-place-grid-el').querySelectorAll('.bs-cell').forEach(c=>{
      c.onclick=()=>onPlaceClick(+c.dataset.i);
    });
  }

  function onPlaceClick(i){
    const shipId=state.playerGrid[i];
    if(shipId){
      const ship=state.playerShips.find(s=>s.id===shipId);
      if(!ship)return;
      ship.cells.forEach(x=>state.playerGrid[x]=0);
      const {r,c}=rc(ship.cells[0]);
      const dir=ship.dir==='h'?'v':'h';
      const cells=[];
      for(let k=0;k<ship.len;k++)cells.push(idx(r+(dir==='v'?k:0),c+(dir==='h'?k:0)));
      if(canPlace(state.playerGrid,cells)){
        ship.dir=dir;ship.cells=cells;cells.forEach(x=>state.playerGrid[x]=ship.id);
      }else{
        ship.cells.forEach(x=>state.playerGrid[x]=ship.id);
      }
      renderPlace();return;
    }
    const used=state.playerShips.filter(s=>s.len===state.selLen).length;
    const limit={4:1,3:2,2:3,1:4}[state.selLen];
    if(used>=limit){return;}
    const {r,c}=rc(i),cells=[];
    for(let k=0;k<state.selLen;k++)cells.push(idx(r+(state.selDir==='v'?k:0),c+(state.selDir==='h'?k:0)));
    if(!canPlace(state.playerGrid,cells))return;
    const ship={id:state.playerShips.length+1,len:state.selLen,cells,hits:new Set(),dir:state.selDir};
    cells.forEach(x=>state.playerGrid[x]=ship.id);state.playerShips.push(ship);
    state.selDir=state.selDir==='h'?'v':'h';
    renderPlace();
  }

  function startBattle(){
    if(state.playerShips.length!==10)return;
    if(state.online){void confirmOnlineReady();return;}
    if(state.mode==='local'&&state.localPhase==='p1'){
      state.localPlayerOne={grid:state.playerGrid,ships:state.playerShips};
      state.localPhase='p2';
      state.playerGrid=emptyGrid();state.playerShips=[];state.selLen=4;state.selDir='h';
      renderPlace();
      return;
    }
    if(!state.wagerStarted){
      const wagerId=state.matchId;
      if(window.beginUserWager&&!window.beginUserWager(wagerId,state.stake)){
        notify('Недостатньо монет для ставки 🪙');
        return;
      }
      state.wagerId=wagerId;state.wagerStarted=true;
    }
    if(state.mode==='local'){
      state.enemyGrid=state.localPlayerOne.grid;
      state.enemyShips=state.localPlayerOne.ships;
      state.enemyResults={};state.playerResults={};
      state.screen='battle';state.turn='player';state.timerSeconds=28;state.target=null;
      render();startTimer();return;
    }else{
      const fleet=randomFleet();state.enemyGrid=fleet.grid;state.enemyShips=fleet.ships;
    }
    state.screen='battle';state.turn='player';state.timerSeconds=28;state.target=null;
    state.enemyResults={};state.playerResults={};
    render();
    startTimer();
  }

  function startTimer(){
    clearInterval(state.interval);
    state.interval=setInterval(()=>{
      state.timerSeconds=Math.max(0,state.timerSeconds-1);
      const el=root().querySelector('#bs-turn-timer');
      if(el)el.textContent=state.timerSeconds+'s';
      if(state.timerSeconds===0){
        if(state.turn==='player'&&state.target!=null) fire(state.target);
        else if(state.turn==='bot'&&!state.online?.db) botTurn();
        state.timerSeconds=28;
      }
    },1000);
  }

  function markSunkPerimeter(gridResults, ship){
    ship.cells.forEach(i=>{
      const {r,c}=rc(i);
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        const rr=r+dr,cc=c+dc;
        if(rr>=0&&rr<N&&cc>=0&&cc<N){
          const k=idx(rr,cc);
          if(!ship.cells.includes(k)&&gridResults[k]==null)gridResults[k]='miss';
        }
      }
    });
  }

  function playTone(type){
    if(!state.sound||!window.AudioContext&&!window.webkitAudioContext)return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      state.audio=state.audio||new AC();
      const o=state.audio.createOscillator(),g=state.audio.createGain();
      o.type=type==='hit'?'sawtooth':'sine';
      o.frequency.value=type==='hit'?110:250;
      g.gain.setValueAtTime(.055,state.audio.currentTime);
      g.gain.exponentialRampToValueAtTime(.001,state.audio.currentTime+.12);
      o.connect(g);g.connect(state.audio.destination);o.start();o.stop(state.audio.currentTime+.13);
    }catch(e){}
  }

  function fire(i){
    if(i==null||state.turn!=='player'||state.screen!=='battle')return;
    if(state.enemyResults[i])return;
    if(state.online?.db){void fireOnline(i);return;}
    state.playerStats.shots++;
    const shipId=state.enemyGrid[i];
    if(shipId){
      state.enemyResults[i]='hit';state.playerStats.hits++;playTone('hit');
      const ship=state.enemyShips.find(s=>s.id===shipId);ship.hits.add(i);
      if(ship.hits.size===ship.len){
        state.playerStats.sunk++;ship.cells.forEach(k=>state.enemyResults[k]='sunk');
        markSunkPerimeter(state.enemyResults,ship);
      }
      state.target=null;state.timerSeconds=28;
      if(state.playerStats.sunk===10){finish(true);return;}
      renderBattle();
    }else{
      state.enemyResults[i]='miss';playTone('miss');
      state.turn='bot';state.target=null;state.timerSeconds=28;
      renderBattle();
      setTimeout(botTurn,650);
    }
  }

  function botPick(){
    while(state.botTargets.length){
      const i=state.botTargets.shift();
      if(!state.playerResults[i])return i;
    }
    const unknown=[];
    for(let i=0;i<N*N;i++)if(!state.playerResults[i])unknown.push(i);
    return unknown[Math.floor(Math.random()*unknown.length)];
  }
  function botAddTargets(i){
    const {r,c}=rc(i);
    [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{
      if(rr>=0&&rr<N&&cc>=0&&cc<N){
        const k=idx(rr,cc);
        if(!state.playerResults[k]&&!state.botTargets.includes(k))state.botTargets.push(k);
      }
    });
  }
  function botTurn(){
    if(state.screen!=='battle'||state.turn!=='bot')return;
    const i=botPick();
    if(i==null)return;
    state.enemyStats.shots++;
    const shipId=state.playerGrid[i];
    if(shipId){
      state.playerResults[i]='hit';state.enemyStats.hits++;playTone('hit');
      botAddTargets(i);
      const ship=state.playerShips.find(s=>s.id===shipId);ship.hits.add(i);
      if(ship.hits.size===ship.len){
        state.enemyStats.sunk++;ship.cells.forEach(k=>state.playerResults[k]='sunk');
        markSunkPerimeter(state.playerResults,ship);
        state.botTargets=[];
      }
      state.turn='bot';state.timerSeconds=28;
      if(state.enemyStats.sunk===10){finish(false);return;}
      renderBattle();setTimeout(botTurn,650);
    }else{
      state.playerResults[i]='miss';playTone('miss');
      state.turn='player';state.timerSeconds=28;
      renderBattle();
    }
  }

  function boardHtml(type){
    const enemy=type==='enemy';
    const grid=enemy?state.enemyGrid:state.playerGrid;
    const results=enemy?state.enemyResults:state.playerResults;
    const ships=enemy?state.enemyShips:state.playerShips;
    const cells=Array.from({length:N*N},(_,i)=>{
      let cls='bs-cell',content='';
      const ship=grid[i]?ships.find(item=>item.id===grid[i]):null;
      const sunk=Boolean(ship&&ship.hits.size===ship.len);
      if(results[i]==='sunk'||sunk){
        cls+=` bs-sunk ${shipCellClass(ship,i)}`;content='✕';
      }else if(results[i]==='hit'){
        cls+=' bs-wound';content='✕';
      }else if(results[i]==='miss'){
        cls+=' bs-miss';content='•';
      }else if(!enemy&&ship){
        cls+=` bs-ship ${shipCellClass(ship,i)}`;
      }
      if(enemy&&state.target===i)cls+=' bs-target';
      return `<button type="button" class="${cls}" data-target="${i}" ${enemy?'':'disabled'}>${content}</button>`;
    }).join('');
    if(!enemy)return cells;
    return `<div class="bs-battle-coords"><i></i>${LETTERS.map(x=>`<b>${x}</b>`).join('')}</div><div class="bs-battle-board-wrap"><div class="bs-rownums">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<b>${n}</b>`).join('')}</div><div class="bs-grid bs-enemy-grid">${cells}</div></div>`;
  }

  function shipCellClass(ship,index){
    if(!ship)return '';
    const position=ship.cells.indexOf(index);
    const part=ship.len===1?'single':position===0?'first':position===ship.len-1?'last':'middle';
    return `bs-ship-${ship.dir||'h'} bs-part-${part}`;
  }

  function renderBattle(){
    state.screen='battle';
    const enemyCount=10-state.playerStats.sunk;
    const accuracy=state.playerStats.shots?Math.round(state.playerStats.hits/state.playerStats.shots*100):0;
    const enemyPlayer=state.mode==='online'
      ? Object.values(state.online?.roomData?.players||{}).find(player=>String(player.id)!==String(state.online.uid))
      : null;
    const opponentName=state.mode==='bot'?'Abayazhka':state.mode==='local'?'Гравець 2':enemyPlayer?.name||'Суперник';
    root().innerHTML=`<div class="bs-screen bs-battle">
      <header class="bs-battle-head"><button class="bs-battle-close" id="bs-battle-close">×</button><button class="bs-turn-capsule ${state.turn==='player'?'':'enemy'}" type="button">${state.turn==='player'?'Твій хід':'Хід суперника'} <span id="bs-turn-timer">${state.timerSeconds}s</span></button><button class="bs-sound" id="bs-sound" type="button">${state.sound?'🔊':'♪'}</button></header>
      <div class="bs-opponent"><span class="bs-heart">♡</span><span class="bs-opponent-avatar" id="bs-opponent-avatar"></span><strong>${escapeHtml(opponentName)}</strong><b>Ворожих кораблів: ${enemyCount}</b></div>
      <div class="bs-enemy-board">${boardHtml('enemy')}</div>
      <button class="bs-fire ${state.target!=null?'ready':''}" id="bs-fire" ${state.target==null?'disabled':''} type="button">${state.target==null?'Обери ціль':'Вогонь · '+coord(state.target)}</button>
      <div class="bs-own-card"><div class="bs-own-identity"><span class="bs-own-avatar" id="bs-own-avatar"></span><b>ТВОЄ ПОЛЕ</b></div><div class="bs-mini-board">${boardHtml('own')}</div><div class="bs-stats"><div><span>Постріли</span><strong>${state.playerStats.shots}</strong></div><div><span>Влучання</span><strong class="red">${state.playerStats.hits}</strong></div><div><span>Точність</span><strong class="cyan">${accuracy}%</strong></div><div><span>Потоплено</span><strong>${state.playerStats.sunk}</strong></div></div></div>
    </div>`;
    window.renderPlayerAvatar?.(document.getElementById('bs-opponent-avatar'),enemyPlayer||{name:opponentName},opponentName[0]||'С');
    window.renderPlayerAvatar?.(document.getElementById('bs-own-avatar'),playerIdentity());
    root().querySelectorAll('[data-target]').forEach(c=>{
      c.onclick=()=>{
        if(state.turn!=='player'||state.enemyResults[+c.dataset.target])return;
        state.target=+c.dataset.target;renderBattle();
      };
    });
    document.getElementById('bs-fire').onclick=()=>fire(state.target);
    document.getElementById('bs-battle-close').onclick=()=>{
      if(confirm('Вийти з партії?'))leave();
    };
    document.getElementById('bs-sound').onclick=()=>{state.sound=!state.sound;renderBattle();};
  }

  function finish(win){
    clearInterval(state.interval);state.screen='final';
    const payout=win?state.stake*2:0;
    if(state.wagerId&&window.settleUserWager)window.settleUserWager(state.wagerId,payout);
    state.payout=payout;
    renderFinal(win);
  }
  function renderFinal(win){
    const shots=state.playerStats.shots,hits=state.playerStats.hits;
    const accuracy=shots?Math.round(hits/shots*100):0;
    const prize=state.payout||0;
    const change=win?`+${prize} 🪙`:`-${state.stake} 🪙`;
    root().innerHTML=`<div class="bs-screen bs-final">
      <div class="bs-final-card"><div class="bs-final-trophy">🏆</div><h1>${win?'Перемога':'Поразка'}</h1><p>${win?'Приз':'Ставка'} <span>${change}</span></p>
      <div class="bs-final-stats"><div><strong>${shots}</strong><span>Постріли</span></div><div><strong>${hits}</strong><span>Влучання</span></div><div><strong>${accuracy}%</strong><span>Точність</span></div><div><strong>${state.playerStats.sunk}</strong><span>Потоплено</span></div></div>
      <button class="bs-rematch" id="bs-rematch">Реванш</button><button class="bs-new-table" id="bs-new-table">Новий стіл</button></div>
    </div>`;
    document.getElementById('bs-rematch').onclick=()=>{
      if(state.online){
        void resetOnlineRoomForRematch();
        return;
      }
      state.matchId=`battleship-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
      state.wagerStarted=false;state.wagerId=null;state.payout=0;
      startPlacement();
    };
    document.getElementById('bs-new-table').onclick=()=>{
      if(state.online?.db&&state.online.unsubscribe){
        state.online.db.ref(`battleshipRooms/${state.online.roomCode}`).off('value',state.online.unsubscribe);
      }
      state.online=null;
      state.matchId=`battleship-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
      state.wagerId=null;state.wagerStarted=false;state.payout=0;
      state.screen='menu';render();
    };
  }

  async function resetOnlineRoomForRematch(){
    if(Number(window.APP_STATE?.balance)<state.stake){
      notify('Недостатньо монет для реваншу 🪙');
      return;
    }
    state.screen='lobby';
    state.wagerStarted=false;state.wagerId=null;state.payout=0;
    if(!state.online.db){
      const room=state.online.roomData;
      room.meta.round=(Number(room.meta.round)||1)+1;
      room.meta.status='waiting';
      room.players[state.online.uid].ready=false;
      room.players[state.online.uid].fleet=null;
      return startPlacement();
    }
    const reference=state.online.db.ref(`battleshipRooms/${state.online.roomCode}`);
    try{
      const result=await reference.transaction(room=>{
        if(!room||room.meta?.status!=='finished')return room;
        room.meta.round=(Number(room.meta.round)||1)+1;
        room.meta.status='waiting';
        room.winner=null;room.turn=room.meta.hostId;room.shots={};
        Object.values(room.players||{}).forEach(player=>{
          player.ready=false;player.fleet=null;
        });
        return room;
      });
      if(result.snapshot.exists())onOnlineRoom(result.snapshot.val());
    }catch(error){
      console.error('Unable to restart Battleship room',error);
      notify('Не вдалося створити реванш.');
    }
  }

  return {init,joinRoom:joinOnlineRoom};
})();
