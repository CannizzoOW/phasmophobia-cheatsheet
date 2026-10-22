import streamDeck,{action,KeyDownEvent,SingletonAction,WillAppearEvent} from '@elgato/streamdeck';
import {WebSocket,WebSocketServer} from 'ws';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname,join,normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {Evidence,evidenceLabels,evidences,matches} from './data.js';

type State={selected?:Evidence[],room?:string};
const visible=new Map<string,{action:any,kind:'evidence'|'result',evidence?:Evidence,row:number,column:number}>();
let selected:Evidence[]=[];
let room='';
let operationQueue:Promise<void>=Promise.resolve();
let relay:WebSocket|undefined;
let relayRetry:NodeJS.Timeout|undefined;
const relayUrl='wss://phasmophobia-journal-relay-cannizzo.onrender.com';
const journalUrl='https://phasmophobia-journal-relay-cannizzo.onrender.com/';
const clients=new Set<WebSocket>();
const siteRoot=fileURLToPath(new URL('../site/',import.meta.url));
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
const httpServer=createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url||'/', 'http://localhost').pathname);
  const requested=normalize(join(siteRoot,pathname));
  let file=requested.startsWith(siteRoot)&&existsSync(requested)&&statSync(requested).isFile()?requested:join(siteRoot,'index.html');
  response.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
  createReadStream(file).pipe(response);
});
const server=new WebSocketServer({noServer:true});
httpServer.on('upgrade',(request,socket,head)=>{
  if(request.url!=='/bridge'){socket.destroy();return}
  server.handleUpgrade(request,socket,head,client=>server.emit('connection',client,request));
});
httpServer.listen(17891,'127.0.0.1');

function send(message:object){
  const payload=JSON.stringify(message);
  for(const client of clients) if(client.readyState===WebSocket.OPEN) client.send(payload);
}

function sendRelay(message:object){if(relay?.readyState===WebSocket.OPEN)relay.send(JSON.stringify(message))}
function connectRelay(){
  if(!room)return;
  relay=new WebSocket(relayUrl);
  relay.on('open',()=>{streamDeck.logger.info(`Connected to journal relay for room ${room}`);sendRelay({type:'join',room,role:'plugin'});sendRelay({type:'state',room,selected})});
  relay.on('message',raw=>{try{const message=JSON.parse(raw.toString());if(message.type==='set-state'&&Array.isArray(message.selected)){const next=(message.selected as unknown[]).filter((value):value is Evidence=>typeof value==='string'&&evidences.includes(value as Evidence));enqueue(async()=>{selected=[...new Set<Evidence>(next)];await refresh()})}else if(message.type==='request-state')sendRelay({type:'state',room,selected})}catch(error){streamDeck.logger.warn(`Ignored invalid relay message: ${String(error)}`)}});
  relay.on('close',()=>{relay=undefined;clearTimeout(relayRetry);relayRetry=setTimeout(connectRelay,5000)});
  relay.on('error',error=>streamDeck.logger.warn(`Relay connection error: ${error.message}`));
}
server.on('connection',client=>{
  clients.add(client);
  client.on('close',()=>clients.delete(client));
  client.on('message',raw=>{
    try{const message=JSON.parse(raw.toString());if(message.type==='bridge-ready'||message.type==='request-state')send({type:'state',selected})}catch{}
  });
});
setInterval(()=>send({type:'ping'}),20000);

async function refresh(){
  const snapshot=[...selected];
  const names=snapshot.length?matches(snapshot):[];
  const resultOrder=[...visible.entries()].filter(([,item])=>item.kind==='result').sort((a,b)=>a[1].row-b[1].row||a[1].column-b[1].column).map(([id])=>id);
  await streamDeck.settings.setGlobalSettings<State>({selected,room});
  send({type:'state',selected:snapshot});
  sendRelay({type:'state',room,selected:snapshot});
  await Promise.all([...visible.values()].map(async item=>{
    if(item.kind==='evidence'&&item.evidence){
      await item.action.setState(snapshot.includes(item.evidence)?1:0);
      await item.action.setTitle(evidenceLabels[item.evidence]);
    }else if(item.kind==='result'){
      const name=names[resultOrder.indexOf(item.action.id)];
      await item.action.setTitle(name?name.toUpperCase().replace('THE ','THE\n').replace(' ','\n'):'—');
    }
  }));
}
function remember(ev:any,kind:'evidence'|'result',evidence?:Evidence){
  const coordinates=ev.payload.coordinates||{row:0,column:0};
  visible.set(ev.action.id,{action:ev.action,kind,evidence,row:coordinates.row,column:coordinates.column});
}

function enqueue(operation:()=>Promise<void>){operationQueue=operationQueue.then(operation,operation);return operationQueue}

async function evidenceAppear(ev:WillAppearEvent,id:Evidence){remember(ev,'evidence',id);await refresh()}
function evidencePress(id:Evidence){return enqueue(async()=>{selected=selected.includes(id)?selected.filter(x=>x!==id):[...selected,id];await refresh()})}
function evidenceDisappear(ev:any){visible.delete(ev.action.id)}

@action({UUID:'com.cannizzo.phasmo-journal.emf'}) class EmfAction extends SingletonAction{override onWillAppear(ev:WillAppearEvent){return evidenceAppear(ev,'emf')}override onKeyDown(){return evidencePress('emf')}override onWillDisappear(ev:any){evidenceDisappear(ev)}}
@action({UUID:'com.cannizzo.phasmo-journal.fingerprints'}) class FingerprintsAction extends SingletonAction{override onWillAppear(ev:WillAppearEvent){return evidenceAppear(ev,'fingerprints')}override onKeyDown(){return evidencePress('fingerprints')}override onWillDisappear(ev:any){evidenceDisappear(ev)}}
@action({UUID:'com.cannizzo.phasmo-journal.dots'}) class DotsAction extends SingletonAction{override onWillAppear(ev:WillAppearEvent){return evidenceAppear(ev,'dots')}override onKeyDown(){return evidencePress('dots')}override onWillDisappear(ev:any){evidenceDisappear(ev)}}
@action({UUID:'com.cannizzo.phasmo-journal.orbs'}) class OrbsAction extends SingletonAction{override onWillAppear(ev:WillAppearEvent){return evidenceAppear(ev,'orbs')}override onKeyDown(){return evidencePress('orbs')}override onWillDisappear(ev:any){evidenceDisappear(ev)}}
@action({UUID:'com.cannizzo.phasmo-journal.writing'}) class WritingAction extends SingletonAction{override onWillAppear(ev:WillAppearEvent){return evidenceAppear(ev,'writing')}override onKeyDown(){return evidencePress('writing')}override onWillDisappear(ev:any){evidenceDisappear(ev)}}
@action({UUID:'com.cannizzo.phasmo-journal.freezing'}) class FreezingAction extends SingletonAction{override onWillAppear(ev:WillAppearEvent){return evidenceAppear(ev,'freezing')}override onKeyDown(){return evidencePress('freezing')}override onWillDisappear(ev:any){evidenceDisappear(ev)}}
@action({UUID:'com.cannizzo.phasmo-journal.spirit'}) class SpiritBoxAction extends SingletonAction{override onWillAppear(ev:WillAppearEvent){return evidenceAppear(ev,'spirit')}override onKeyDown(){return evidencePress('spirit')}override onWillDisappear(ev:any){evidenceDisappear(ev)}}

@action({UUID:'com.cannizzo.phasmo-journal.result'})
class ResultAction extends SingletonAction{
  override async onWillAppear(ev:WillAppearEvent){remember(ev,'result');await refresh()}
  override async onWillDisappear(ev:any){visible.delete(ev.action.id);await refresh()}
}

@action({UUID:'com.cannizzo.phasmo-journal.open'})
class OpenJournalAction extends SingletonAction{
  override async onKeyDown(ev:KeyDownEvent){
    const url=`${journalUrl}?room=${encodeURIComponent(room)}`;
    await ev.action.showOk();
    streamDeck.logger.info(`Opening hosted journal: ${url}`);
    if(process.platform==='win32'){
      const child=spawn('explorer.exe',[url],{detached:true,stdio:'ignore',windowsHide:true});
      child.on('error',error=>streamDeck.logger.error(`Failed to open journal: ${error.message}`));
      child.unref();
    }else{
      await streamDeck.system.openUrl(url);
    }
  }
}

@action({UUID:'com.cannizzo.phasmo-journal.reset'})
class ResetJournalAction extends SingletonAction{override onKeyDown(_ev:KeyDownEvent){return enqueue(async()=>{selected=[];await refresh()})}}

console.log('Registering Phasmo Journal actions');
streamDeck.actions.registerAction(new EmfAction());
streamDeck.actions.registerAction(new FingerprintsAction());
streamDeck.actions.registerAction(new DotsAction());
streamDeck.actions.registerAction(new OrbsAction());
streamDeck.actions.registerAction(new WritingAction());
streamDeck.actions.registerAction(new FreezingAction());
streamDeck.actions.registerAction(new SpiritBoxAction());
streamDeck.actions.registerAction(new ResultAction());
streamDeck.actions.registerAction(new OpenJournalAction());
streamDeck.actions.registerAction(new ResetJournalAction());
console.log('Connecting Phasmo Journal plugin');

streamDeck.settings.getGlobalSettings<State>().then(async s=>{selected=(s.selected||[]).filter(x=>evidences.includes(x));room=s.room||randomBytes(9).toString('base64url');await streamDeck.settings.setGlobalSettings<State>({selected,room});connectRelay();return refresh()});
streamDeck.connect();
