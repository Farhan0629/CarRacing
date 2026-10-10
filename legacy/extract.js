const fs=require('fs');
const p='c:/Users/FARHAN/OneDrive/Desktop/demo/game.legacy.js';
const s=fs.readFileSync(p,'utf8');
const idx=s.indexOf('_h="');
if(idx===-1){ console.log('not found _h=\"'); process.exit(0)}
let start=idx+4;
let end=s.indexOf('"', start);
let b64=s.slice(start, end);
console.log('b64 len', b64.length);
console.log('head', b64.slice(0,120));
fs.writeFileSync('c:/temp/b64.txt', b64);
try{
  const buf=Buffer.from(b64,'base64');
  console.log('buf len', buf.length);
  console.log('magic', buf.slice(0,4).toString());
  // GLB magic is 'glTF'
  fs.writeFileSync('c:/Users/FARHAN/OneDrive/Desktop/demo/car.glb', buf);
  console.log('wrote car.glb', buf.length);
}catch(e){ console.error(e)}
