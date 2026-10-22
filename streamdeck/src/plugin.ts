import streamDeck,{action,KeyDownEvent,SingletonAction,WillAppearEvent} from '@elgato/streamdeck';
import {WebSocket} from 'ws';
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
const journalUrl='https://cannizzo.online/phasmophobia-cheatsheet/';
function sendRelay(message:object){if(relay?.readyState===WebSocket.OPEN)relay.send(JSON.stringify(message))}
function connectRelay(){
  if(!room)return;
  relay=new WebSocket(relayUrl);
  relay.on('open',()=>{streamDeck.logger.info(`Connected to journal relay for room ${room}`);sendRelay({type:'join',room,role:'plugin'});sendRelay({type:'state',room,selected})});
  relay.on('message',raw=>{try{const message=JSON.parse(raw.toString());if(message.type==='set-state'&&Array.isArray(message.selected)){const next=(message.selected as unknown[]).filter((value):value is Evidence=>typeof value==='string'&&evidences.includes(value as Evidence));enqueue(async()=>{selected=[...new Set<Evidence>(next)];await refresh()})}else if(message.type==='request-state')sendRelay({type:'state',room,selected})}catch(error){streamDeck.logger.warn(`Ignored invalid relay message: ${String(error)}`)}});
  relay.on('close',()=>{relay=undefined;clearTimeout(relayRetry);relayRetry=setTimeout(connectRelay,5000)});
  relay.on('error',error=>streamDeck.logger.warn(`Relay connection error: ${error.message}`));
}
async function refresh(){
  const snapshot=[...selected];
  const names=snapshot.length?matches(snapshot):[];
  const resultOrder=[...visible.entries()].filter(([,item])=>item.kind==='result').sort((a,b)=>a[1].row-b[1].row||a[1].column-b[1].column).map(([id])=>id);
  await streamDeck.settings.setGlobalSettings<State>({selected,room});
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
      const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true});
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
