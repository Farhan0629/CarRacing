/* Browser/Node regression suite. Pure core tests; no rendering dependency. */
window.APEX = window.APEX || {};
APEX.tests = function(){
  const VA = APEX.core;
  const results=[];
  const check=(name,fn)=>{try{fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}};
  const assert=(v,msg='Assertion failed')=>{if(!v)throw Error(msg);};
  const race=(options={})=>{const r=new VA.Race(VA.fresh(),{mode:'trial',...options});r.countdown=0;r.status='racing';return r;};
  check('Track is closed and 2.66 km long',()=>{
    const t=new VA.Track(),a=t.at(0),b=t.at(t.length);
    assert(t.length>2660&&t.length<2670);assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-5);
  });
  check('Track sampling wraps in either direction',()=>{
    const t=new VA.Track(),a=t.at(-10),b=t.at(t.length-10);assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-5);
  });
  check('Nearest-point calculation recovers road coordinates',()=>{
    const t=new VA.Track(),a=t.at(500,3),b=t.nearest(a.x,a.z);assert(Math.abs(b.s-500)<.1);assert(Math.abs(b.lane-3)<.03);
  });
  check('Throttle accelerates the vehicle',()=>{
    const r=race();for(let i=0;i<120;i++)r.step(1/120,{throttle:1,assist:false});assert(r.player.v>6&&r.player.v<12);
  });
  check('Brakes reduce speed',()=>{
    const r=race();r.player.v=20;r.step(.1,{brake:1,assist:false});assert(r.player.v<19);
  });
  check('Rain reduces braking effectiveness',()=>{
    const dry=race(),wet=race({weather:'rain'});dry.player.v=20;wet.player.v=20;
    dry.step(.1,{brake:1,assist:false});wet.step(.1,{brake:1,assist:false});assert(wet.player.v>dry.player.v);
  });
  check('D turns toward driver-right in the +Z-forward coordinate system',()=>{
    const r=race(),h=r.player.heading,x=r.player.x,z=r.player.z;r.player.v=10;r.step(.1,{steer:1,assist:false});
    assert(r.player.heading<h);
    const rightward=-(r.player.x-x)*Math.cos(h)+(r.player.z-z)*Math.sin(h);assert(rightward>0);
  });
  check('A turns toward driver-left, not driver-right',()=>{
    const r=race(),h=r.player.heading,x=r.player.x,z=r.player.z;r.player.v=10;r.step(.1,{steer:-1,assist:false});
    assert(r.player.heading>h);
    const leftward=(r.player.x-x)*Math.cos(h)-(r.player.z-z)*Math.sin(h);assert(leftward>0);
  });
  check('Ordinary steering moves exactly along the nose at every tested speed',()=>{
    for(const speed of [10,30,50,80]){
      for(const steer of [-1,1]){
        const r=race(),x=r.player.x,z=r.player.z;r.player.v=speed;r.step(1/120,{steer,assist:false});
        const motion=Math.atan2(r.player.x-x,r.player.z-z);
        assert(Math.abs(VA.wrap(motion-r.player.heading))<1e-7,'Motion diverged from the nose');
        assert(r.player.slip===0,'Ordinary steering introduced drift');
      }
    }
  });
  check('Wet-road steering does not manufacture sideways drift',()=>{
    const r=race({weather:'rain'});r.player.v=45;
    for(let i=0;i<12;i++)r.step(1/120,{steer:-1,assist:false});
    assert(r.player.slip===0);
  });
  check('Handbrake slip stays bounded and recovers quickly',()=>{
    const r=race();r.player.v=30;
    for(let i=0;i<20;i++)r.step(1/120,{steer:1,handbrake:true,assist:false});
    assert(Math.abs(r.player.slip)>0&&Math.abs(r.player.slip)<=.18);
    for(let i=0;i<60;i++)r.step(1/120,{steer:0,assist:false});
    assert(Math.abs(r.player.slip)<.001);
  });
  check('Steering release recenters rapidly without continuing a large turn',()=>{
    const r=race();r.player.v=20;
    for(let i=0;i<18;i++)r.step(1/120,{steer:1,assist:false});
    for(let i=0;i<72;i++)r.step(1/120,{steer:0,assist:false});
    assert(Math.abs(r.player.steer)<.0001&&Math.abs(r.player.yawRate)<.001);
  });
  check('Boost consumes energy',()=>{
    const r=race();r.player.v=20;r.step(.1,{throttle:1,boost:true});assert(r.player.boost<100);
  });
  check('Race countdown does not advance race timer',()=>{
    const r=new VA.Race(VA.fresh(),{});r.step(.2,{throttle:1});assert(r.elapsed===0&&r.player.v===0&&r.countdown<3);
  });
  check('Checkpoint and lap sequence yields one finish',()=>{
    const r=race(),gate=r.track.length/8;
    for(let i=1;i<=8;i++){r.elapsed=i*10;r.player.progress=i*gate+.01;r.advanceCheckpoints(r.player.progress);}
    assert(r.gatesPassed===8&&r.status==='finished');assert(r.profile.races===1&&r.lapTimes.length===1&&r.result.reward>0);
  });
  check('Rewards cannot be applied twice',()=>{
    const r=race();r.elapsed=80;r.player.progress=r.track.length;r.advanceCheckpoints(r.player.progress);
    const c=r.profile.credits;r.finish();assert(r.profile.credits===c&&r.profile.races===1);
  });
  check('Two-lap race does not finish after one lap',()=>{
    const r=race({mode:'circuit',laps:2});r.elapsed=80;r.player.progress=r.track.length;r.advanceCheckpoints(r.player.progress);
    assert(r.status!=='finished'&&r.lapTimes.length===1);
  });
  check('Reverse progress cannot award checkpoints',()=>{
    const r=race();r.advanceCheckpoints(-10);assert(r.nextGate===1&&r.gatesPassed===0);
  });
  check('Recovery preserves last valid checkpoint',()=>{
    const r=race();r.nextGate=4;r.reset();assert(r.player.v===0&&r.player.progress<3*r.track.length/8&&r.nextGate===4);
  });
  check('Free drive never awards race credits',()=>{
    const r=race({mode:'free'});r.advanceCheckpoints(r.track.length*3);assert(r.status!=='finished'&&r.profile.credits===2500);
  });
  check('Upgrade increases acceleration, grip and braking',()=>{
    const p=VA.fresh(),base=VA.spec(p);p.upgrades.concept={engine:1,tires:1,brakes:1};const up=VA.spec(p);
    assert(up.accel>base.accel&&up.grip>base.grip&&up.brake>base.brake);
  });
  check('Profile validation rejects unknown versions',()=>{
    let failed=false;try{VA.validateProfile({version:99,owned:[]});}catch{failed=true;}assert(failed);
  });
  check('Profile validation clamps currency and unknown cars',()=>{
    const p=VA.validateProfile({...VA.fresh(),credits:-55,owned:['unknown'],selected:'unknown'});assert(p.credits===0&&p.owned.length===2&&p.selected==='concept');
  });
  check('Progress round-trip retains owned cars, upgrades and best time',()=>{
    const p=VA.fresh();p.owned.push('nexo');p.selected='nexo';p.upgrades.nexo={tires:2};p.best['clear:day:nexo:1']=90;
    const q=VA.validateProfile(JSON.parse(JSON.stringify(p)));assert(q.selected==='nexo'&&q.upgrades.nexo.tires===2&&q.best['clear:day:nexo:1']===90);
  });
  check('AI moves independently of the player',()=>{
    const r=race({mode:'circuit'}),s=r.ai[0].s;r.step(.1,{});assert(r.ai[0].s>s&&r.ai[0].v>0);
  });
  const rush=(o={},rng)=>{let n=0;const r=new VA.RushRun(VA.fresh(),o,rng||(()=>{n=(n*9301+49297)%233280;return n/233280;}));r.countdown=0;r.status='running';return r;};
  check('Rush: speed climbs toward the pace cap and no further',()=>{
    const r=rush();r.traffic.forEach(t=>{t.z=-9999;});for(let i=0;i<1200;i++){r.step(1/120,{});r.traffic.forEach(t=>{t.z=-9999;});}
    assert(r.speed>85&&r.speed<=r.pace+.001,'speed '+r.speed);
  });
  check('Rush: nitro raises speed and drains the bar',()=>{
    const r=rush();r.speed=100;r.traffic.forEach(t=>{t.z=-9999;});for(let i=0;i<120;i++){r.step(1/120,{nitro:true});}
    assert(r.nitro<100&&r.speed>r.pace);
  });
  check('Rush: steering moves right/left and stays inside the road',()=>{
    const r=rush();r.traffic.forEach(t=>{t.z=-9999;});for(let i=0;i<240;i++){r.step(1/120,{steer:1});r.traffic.forEach(t=>{t.z=-9999;});}
    assert(r.x>0&&r.x<=4.55);for(let i=0;i<1200;i++){r.step(1/120,{steer:-1});r.traffic.forEach(t=>{t.z=-9999;});}assert(r.x<0&&r.x>=-4.55);
  });
  check('Rush: head-on contact ends the run once and pays out once',()=>{
    const r=rush();r.elapsed=5;r.traffic[0].x=r.x;r.traffic[0].z=4;const c=r.profile.credits;r.score=3000;r.step(1/120,{});
    assert(r.status==='over'&&r.result&&r.profile.rushRuns===1&&r.profile.credits===c+r.result.reward);r.finalize();assert(r.profile.rushRuns===1);
  });
  check('Rush: first two seconds are collision-free',()=>{
    const r=rush();r.traffic[0].x=r.x;r.traffic[0].z=4;r.step(1/120,{});assert(r.status==='running');
  });
  check('Rush: near miss builds combo and score',()=>{
    const r=rush();r.elapsed=5;r.speed=90;const t=r.traffic[0];t.x=r.x+2;t.z=3.99;t.near=false;const s=r.score;r.step(1/120,{});
    assert(r.combo===2&&r.score>s+900&&r.events[0].type==='near');
  });
  check('Rush: respawned traffic avoids occupied lanes',()=>{
    const r=rush();r.traffic.forEach((t,i)=>{t.lane=i%3;t.x=VA.RUSH.lanes[t.lane];t.z=-100-i*40;});
    for(let k=0;k<40;k++){const t=r.traffic[0];r.respawn(t);
      for(const o of r.traffic)if(o!==t&&o.lane===t.lane)assert(Math.abs(o.z-t.z)>=30,'stacked');}
  });
  check('Rush: rain reduces braking, upgrades and car stats scale Rush physics',()=>{
    const d=rush(),w=rush({weather:'rain'});d.speed=w.speed=100;d.traffic.forEach(t=>{t.z=-9999;});w.traffic.forEach(t=>{t.z=-9999;});
    d.step(.1,{brake:true});w.step(.1,{brake:true});assert(w.speed>d.speed);
    const p=VA.fresh();p.upgrades.concept={engine:3,tires:3,brakes:3};const up=new VA.RushRun(p);assert(up.k.accel>1.1&&up.k.grip>1.1&&up.k.brake>1.2);
  });
  check('Rush: replay frames interpolate recorded states',()=>{
    const r=rush();r.traffic.forEach(t=>{t.z=-9999;});for(let i=0;i<240;i++){r.step(1/120,{steer:1});r.traffic.forEach(t=>{t.z=-9999;});}
    assert(r.record.length>=2);const f=VA.RushRun.frameAt(r.record,r.record[1].t*.5+r.record[0].t*.5);assert(f&&f.traffic.length===8&&Number.isFinite(f.x));
  });
  check('Profile: V2 save files import (global paint, V2 car ids)',()=>{
    const v2={version:1,credits:900,xp:10,wins:1,races:2,selected:'nexo',owned:['aerion','nexo'],paint:'#9daf9c',upgrades:{nexo:{tires:2}},best:{'clear:day:nexo:1':95},ghost:null};
    const p=VA.validateProfile(v2);assert(p.selected==='nexo'&&p.paint.nexo==='#9daf9c'&&p.upgrades.nexo.tires===2&&p.owned.includes('concept')&&p.credits===900);
  });
  check('Profile: per-car paint round-trips and rejects unknown colours',()=>{
    const p=VA.fresh();p.paint.concept='#f06a25';p.paint.aerion='#123456';const q=VA.validateProfile(JSON.parse(JSON.stringify(p)));assert(q.paint.concept==='#f06a25'&&q.paint.aerion===VA.defaultPaint.aerion);
  });
  check('Circuit and trial records have independent keys',()=>{
    const p=VA.fresh(),a=new VA.Race(p,{mode:'circuit'}),b=new VA.Race(p,{mode:'trial'});
    assert(a.key!==b.key&&a.key.startsWith('circuit:')&&b.key.startsWith('trial:'));
  });
  check('A faster circuit record cannot suppress the first trial ghost',()=>{
    const p=VA.fresh(),a=new VA.Race(p,{mode:'circuit'});a.elapsed=80;a.finish();
    const b=new VA.Race(p,{mode:'trial'});b.elapsed=90;b.record=[{t:1,p:[0,0,0,0]},{t:90,p:[1,1,0,0]}];b.finish();
    assert(b.result.newBest&&p.ghost?.key===b.key&&p.best[a.key]===80&&p.best[b.key]===90);
  });
  check('Legacy records migrate without inventing a trial record',()=>{
    const p=VA.fresh();p.best['clear:day:concept:1']=80;const q=VA.validateProfile(p);
    assert(q.best['circuit:clear:day:concept:1']===80&&!q.best['trial:clear:day:concept:1']);
  });
  check('Legacy trial ghost survives migration and save round-trip',()=>{
    const p=VA.fresh();p.best['clear:day:concept:1']=80;
    p.ghost={key:'clear:day:concept:1',frames:[[1,0,0,0,0],[90,1,1,0,0]]};
    const q=VA.validateProfile(p),r=VA.validateProfile(JSON.parse(JSON.stringify(q)));
    assert(r.ghost.key==='trial:clear:day:concept:1'&&r.best[r.ghost.key]===90);
  });
  check('Rush: cars already behind the player cannot award near misses',()=>{
    const r=rush();r.elapsed=5;r.speed=90;r.traffic.forEach(t=>t.z=-9999);
    const t=r.traffic[0];t.z=20;t.x=2;r.step(1/120,{});
    assert(r.nearMisses===0&&r.events.length===0);
  });
  check('Rush: a pass awards at most one bonus',()=>{
    const r=rush();r.elapsed=5;r.speed=90;r.traffic.forEach(t=>t.z=-9999);
    const t=r.traffic[0];t.z=3.99;t.x=2;for(let i=0;i<20;i++)r.step(1/120,{});
    assert(r.nearMisses===1&&r.events.filter(e=>e.type==='near').length===1);
  });
  return results;
};
