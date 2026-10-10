/* APEX//RUN audio — layered real-time synthesis (from Velocity Atelier): combustion banks, intake, transmission, road, rain and tyres.
   Authored procedural sounds, not recordings of real manufacturers. */
window.APEX = window.APEX || {};
APEX.Audio = class {
  constructor(){this.ctx=null;this.muted=false;this.volume=.25;this.ready=false;this.profile=null;this.lastGear=1;this.lastThrottle=0;this.lastContacts=0;this.shiftUntil=0;}
  async start(){
    if(!this.ctx){
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
      const c=this.ctx=new Audio();
      this.master=c.createGain();this.master.gain.value=0;
      const limiter=c.createDynamicsCompressor();limiter.threshold.value=-14;limiter.knee.value=12;limiter.ratio.value=5;limiter.attack.value=.005;limiter.release.value=.15;
      const hi=c.createBiquadFilter();hi.type='highpass';hi.frequency.value=32;
      this.master.connect(hi);hi.connect(limiter);limiter.connect(c.destination);
      this.exhaust=c.createBiquadFilter();this.exhaust.type='lowpass';this.exhaust.frequency.value=1200;this.exhaust.Q.value=.65;this.exhaust.connect(this.master);
      this.banks=[0,1].map(()=>{
        const oscillator=c.createOscillator(),gain=c.createGain();gain.gain.value=0;
        oscillator.connect(gain);gain.connect(this.exhaust);oscillator.start();return {oscillator,gain};
      });
      this.sub=c.createOscillator();this.sub.type='sine';this.subGain=c.createGain();this.subGain.gain.value=0;this.sub.connect(this.subGain);this.subGain.connect(this.master);this.sub.start();
      this.motor=c.createOscillator();this.motor.type='sine';this.motorGain=c.createGain();this.motorGain.gain.value=0;this.motor.connect(this.motorGain);this.motorGain.connect(this.master);this.motor.start();
      const length=c.sampleRate*3,thisNoise=c.createBuffer(1,length,c.sampleRate),data=thisNoise.getChannelData(0);
      let brown=0;
      for(let i=0;i<length;i++){const white=Math.random()*2-1;brown=(brown+.025*white)/1.025;data[i]=white*.72+brown*2;}
      this.noiseBuffer=thisNoise;
      const noise=c.createBufferSource();noise.buffer=thisNoise;noise.loop=true;noise.start();
      const band=(type,freq,q=1)=>{
        const filter=c.createBiquadFilter(),gain=c.createGain();filter.type=type;filter.frequency.value=freq;filter.Q.value=q;gain.gain.value=0;
        noise.connect(filter);filter.connect(gain);gain.connect(this.master);return {filter,gain};
      };
      this.intake=band('bandpass',520,.7);
      this.road=band('lowpass',650,.7);
      this.wind=band('bandpass',1500,.55);
      this.tires=band('bandpass',1900,3.5);
      this.rain=band('highpass',2400,.7);
      this.ready=true;
    }
    this.lastGear=1;this.lastContacts=0;this.lastThrottle=0;
    await this.ctx.resume();
  }
  pulseWave(cylinders,bank){
    const c=this.ctx,n=48,real=new Float32Array(n),imag=new Float32Array(n);
    // Smooth exhaust pulses with bank asymmetry rather than a harsh sawtooth.
    for(let h=1;h<n;h++){
      const envelope=Math.exp(-h/(cylinders===10?7.8:5.3))/Math.pow(h,.42);
      const amplitude=envelope*(cylinders===8?(h%2?.9:1.3):1);
      const phase=h*(bank?.16:0)+(cylinders===8?Math.sin(h*1.8)*.25:0);
      real[h]=amplitude*Math.cos(phase);imag[h]=amplitude*Math.sin(phase);
    }
    return c.createPeriodicWave(real,imag,{disableNormalization:false});
  }
  setProfile(spec){
    this.profile=spec.id;
    this.banks.forEach((b,i)=>b.oscillator.setPeriodicWave(this.pulseWave(spec.sound||8,i)));
  }
  transient(kind){
    if(!this.ready)return;
    const c=this.ctx,t=c.currentTime,src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    const duration=kind==='impact'?.15:kind==='shift'?.055:.18;
    src.buffer=this.noiseBuffer;src.connect(filter);filter.connect(gain);gain.connect(this.master);
    filter.type=kind==='lift'?'highpass':'lowpass';filter.frequency.value=kind==='impact'?180:kind==='shift'?420:1800;
    const level=kind==='impact'?.35:kind==='shift'?.10:.07;
    gain.gain.setValueAtTime(level,t);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    src.start(t,.35);src.stop(t+duration);
    src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};
  }
  update(player,spec,active){
    if(!this.ready)return;
    const c=this.ctx,t=c.currentTime,set=(param,v,tau=.07)=>param.setTargetAtTime(v,t,tau);
    set(this.master.gain,active&&!this.muted?this.volume*.80:0,.06);
    if(!active||!player)return;
    if(this.profile!==spec.id)this.setProfile(spec);
    const load=player.throttle||0,speed=Math.abs(player.v),rpm=Math.max(850,player.rpm);
    if(spec.sound&&player.gear!==this.lastGear){
      this.shiftUntil=t+.11;this.transient('shift');
    }
    if(spec.sound===8&&this.lastThrottle>.65&&load<.15&&rpm>3500)this.transient('lift');
    if(player.collisions>this.lastContacts)this.transient('impact');
    this.lastContacts=player.collisions;this.lastGear=player.gear;this.lastThrottle=load;
    const shift=t<this.shiftUntil?.4:1;
    if(spec.sound){
      const firing=rpm/60*(spec.sound/2),deep=spec.sound===8;
      for(let i=0;i<2;i++){
        set(this.banks[i].oscillator.frequency,firing*(i===0?1:deep?.997:1.002),.05);
        set(this.banks[i].gain.gain,(deep?.31:.26)*(.25+load*.75)*shift,.045);
      }
      set(this.exhaust.frequency,(deep?480:650)+rpm*(deep?.21:.3)+load*900);
      set(this.sub.frequency,rpm/60*(deep?1:1.5),.055);
      set(this.subGain.gain,(deep?.11:.055)*(.35+load*.65)*shift);
      set(this.motorGain.gain,.007+speed*.00015);
      set(this.motor.frequency,300+speed*17,.12);
      set(this.intake.filter.frequency,380+rpm*.1+load*450);
      set(this.intake.gain.gain,(.01+load*.065)*shift);
    }else{
      this.banks.forEach(b=>set(b.gain.gain,0));set(this.subGain.gain,0);
      set(this.motor.frequency,160+speed*12,.09);
      set(this.motorGain.gain,.018+load*.055);
      set(this.intake.gain.gain,0);
    }
    set(this.road.gain.gain,Math.min(.09,speed*.00115)*(player.wet?1.3:1));
    set(this.road.filter.frequency,220+speed*6);
    set(this.wind.gain.gain,Math.min(.13,Math.pow(speed/90,2)*.11),.2);
    set(this.tires.gain.gain,player.handbraking&&speed>10?Math.min(.20,Math.abs(player.slip)*1.15):0,.06);
    set(this.tires.filter.frequency,1400+speed*9);
    set(this.rain.gain.gain,player.wet?.015+Math.min(.04,speed*.0005):0,.2);
  }
  silence(){if(!this.ready)return;this.master.gain.setTargetAtTime(0,this.ctx.currentTime,.05);}
  beep(freq=800,duration=.09){
    if(!this.ready||this.muted)return;const c=this.ctx,t=c.currentTime,o=c.createOscillator(),g=c.createGain();o.frequency.value=freq;o.connect(g);g.connect(c.destination);
    g.gain.setValueAtTime(this.volume*.09,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.start();o.stop(t+duration);
    o.onended=()=>{o.disconnect();g.disconnect();};
  }
};