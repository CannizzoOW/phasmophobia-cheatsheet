import {spawn} from 'node:child_process';
import {WebSocketServer} from 'ws';

const port=17991;
const wss=new WebSocketServer({port,host:'127.0.0.1'});
const info={application:{font:'Arial',language:'en',platform:'windows',platformVersion:'10',version:'7.0.0'},plugin:{uuid:'com.cannizzo.phasmo-journal',version:'2.0.3.0'},devicePixelRatio:1,devices:[{id:'virtual-test',name:'Virtual Stream Deck',size:{columns:8,rows:4},type:11}]};
const child=spawn(process.execPath,['bin/plugin.js','-port',String(port),'-pluginUUID','com.cannizzo.phasmo-journal','-registerEvent','registerPlugin','-info',JSON.stringify(info)],{cwd:new URL('../com.cannizzo.phasmo-journal.sdPlugin/',import.meta.url),stdio:['ignore','pipe','pipe']});
child.stdout.on('data',data=>process.stdout.write(data));
child.stderr.on('data',data=>process.stderr.write(data));
child.on('exit',code=>console.log('PLUGIN EXIT:',code));

const timeout=setTimeout(()=>finish(1,'Timed out waiting for showOk.'),7000);
function finish(code,message){clearTimeout(timeout);console.log(message);child.kill();wss.close();process.exitCode=code}
wss.on('connection',socket=>socket.on('message',raw=>{
  const message=JSON.parse(raw.toString());
  console.log('PLUGIN EVENT:',message.event||message.type);
  if(message.event==='registerPlugin'){
    const base={action:'com.cannizzo.phasmo-journal.open',context:'open-test',device:'virtual-test'};
    globalThis.sendKey=()=>{
      socket.send(JSON.stringify({...base,event:'willAppear',payload:{controller:'Keypad',coordinates:{column:7,row:1},isInMultiAction:false,settings:{},state:0,userDesiredState:0}}));
      setTimeout(()=>socket.send(JSON.stringify({...base,event:'keyDown',payload:{controller:'Keypad',coordinates:{column:7,row:1},isInMultiAction:false,settings:{},state:0,userDesiredState:0}})),100);
    };
  }
  if(message.event==='getGlobalSettings'){
    socket.send(JSON.stringify({event:'didReceiveGlobalSettings',payload:{settings:{selected:[]}}}));
    setTimeout(()=>globalThis.sendKey(),100);
  }
  if(message.event==='showOk'&&message.context==='open-test')finish(0,'PASS: virtual Open Journal key produced showOk.');
}));
