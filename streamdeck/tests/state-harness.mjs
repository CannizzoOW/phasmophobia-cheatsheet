import {spawn} from 'node:child_process';
import {WebSocketServer} from 'ws';
const port=17992,wss=new WebSocketServer({port,host:'127.0.0.1'}),seen=new Map();
const info={application:{font:'Arial',language:'en',platform:'windows',platformVersion:'10',version:'7.0.0'},plugin:{uuid:'com.cannizzo.phasmo-journal',version:'2.1.1.0'},devicePixelRatio:1,devices:[{id:'virtual-test',name:'Virtual Stream Deck',size:{columns:8,rows:4},type:11}]};
const child=spawn(process.execPath,['bin/plugin.js','-port',String(port),'-pluginUUID','com.cannizzo.phasmo-journal','-registerEvent','registerPlugin','-info',JSON.stringify(info)],{cwd:new URL('../com.cannizzo.phasmo-journal.sdPlugin/',import.meta.url),stdio:'ignore'});
const ids=['emf','fingerprints','dots','orbs','writing','freezing','spirit','result','reset'];
const base=id=>({action:`com.cannizzo.phasmo-journal.${id}`,context:`ctx-${id}`,device:'virtual-test'});
const payload={controller:'Keypad',coordinates:{column:0,row:0},isInMultiAction:false,settings:{},state:0,userDesiredState:0};
const sendEvent=(socket,id,event)=>socket.send(JSON.stringify({...base(id),event,payload}));
const timeout=setTimeout(()=>finish(1,'FAIL: timeout'),9000);
function finish(code,message){clearTimeout(timeout);console.log(message);child.kill();wss.close();process.exitCode=code}
wss.on('connection',socket=>socket.on('message',raw=>{
  const msg=JSON.parse(raw.toString());
  if(msg.event==='registerPlugin')return;
  if(msg.event==='getGlobalSettings'){
    socket.send(JSON.stringify({event:'didReceiveGlobalSettings',payload:{settings:{selected:[]}}}));
    setTimeout(()=>{ids.forEach(id=>sendEvent(socket,id,'willAppear'));},100);
    setTimeout(()=>{sendEvent(socket,'emf','keyDown');sendEvent(socket,'dots','keyDown');sendEvent(socket,'orbs','keyDown');},400);
    setTimeout(()=>{
      if(seen.get('ctx-result')?.title!=='RAIJU')return finish(1,`FAIL: expected RAIJU, got ${seen.get('ctx-result')?.title}`);
      if(!['ctx-emf','ctx-dots','ctx-orbs'].every(id=>seen.get(id)?.state===1))return finish(1,'FAIL: evidence state was not retained');
      sendEvent(socket,'reset','keyDown');
    },1400);
    setTimeout(()=>{
      if(seen.get('ctx-result')?.title!=='—')return finish(1,`FAIL: reset result is ${seen.get('ctx-result')?.title}`);
      if(!['ctx-emf','ctx-dots','ctx-orbs'].every(id=>seen.get(id)?.state===0))return finish(1,'FAIL: reset did not clear evidence');
      finish(0,'PASS: retained 3 evidence choices, showed RAIJU, and reset to empty.');
    },2200);
  }
  if(msg.event==='setState')seen.set(msg.context,{...(seen.get(msg.context)||{}),state:msg.payload.state});
  if(msg.event==='setTitle')seen.set(msg.context,{...(seen.get(msg.context)||{}),title:msg.payload.title});
}));
