const LABELS={emf:['EMF Level 5'],dots:['D.O.T.S Projector','D.O.T.S. Projector'],fingerprints:['Fingerprints','Ultraviolet'],orbs:['Ghost Orb','Ghost Orbs'],writing:['Ghost Writing'],freezing:['Freezing Temperatures'],spirit:['Spirit Box']};
const INPUT_INDEX={emf:0,dots:1,fingerprints:2,orbs:3,writing:4,spirit:5,freezing:6};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const normalize=value=>value.replace(/\s+/g,' ').trim().toLowerCase();
let socket;
let appliedSignature=null;

function removeInfoTab(){
  document.querySelectorAll('a[href="/info"],a[href$="/info"]').forEach(link=>link.remove());
}
const navigationObserver=new MutationObserver(removeInfoTab);
navigationObserver.observe(document.documentElement,{childList:true,subtree:true});
removeInfoTab();

function findControl(evidence){
  const inputs=[...document.querySelectorAll('input[type="checkbox"]')];
  if(inputs.length>=7&&INPUT_INDEX[evidence]!==undefined)return inputs[INPUT_INDEX[evidence]];
  const labels=LABELS[evidence]||[];
  const wanted=labels.map(normalize);
  const nodes=[...document.querySelectorAll('button,label,[role="button"],li,div,span')].filter(node=>wanted.includes(normalize(node.textContent||'')));
  const node=nodes.sort((a,b)=>a.children.length-b.children.length)[0];
  return node&&(node.matches('button,label,[role="button"]')?node:node.closest('button,label,[role="button"]')||node);
}
function click(element){
  const input=element.matches('input[type="checkbox"]')?element:element.querySelector?.('input[type="checkbox"]');
  (input||element).click();
}
async function apply(selected){
  const signature=JSON.stringify([...selected].sort());
  if(appliedSignature===signature)return;
  sessionStorage.setItem('phasmoDeckPending',JSON.stringify(selected));
  if(location.pathname!=='/')location.href='/';else location.reload();
}
async function applyPending(){
  const raw=sessionStorage.getItem('phasmoDeckPending');
  if(!raw)return;
  sessionStorage.removeItem('phasmoDeckPending');
  const selected=JSON.parse(raw);
  for(let i=0;i<40&&!findControl('emf');i++)await wait(100);
  for(const evidence of selected){const control=findControl(evidence);if(control){click(control);await wait(60)}}
  appliedSignature=JSON.stringify([...selected].sort());
}
function connect(){
  socket=new WebSocket(`ws://${location.host}/bridge`);
  socket.onopen=()=>socket.send(JSON.stringify({type:'bridge-ready'}));
  socket.onmessage=event=>{try{const message=JSON.parse(event.data);if(message.type==='state')apply(message.selected||[]);if(message.type==='ping')socket.send(JSON.stringify({type:'pong'}))}catch{}};
  socket.onclose=()=>setTimeout(connect,1500);
}
applyPending().then(connect);
