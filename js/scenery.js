/* APEX//RUN scenery — CC0 Poly Haven mesh adapter (pine saplings, modular apartment facades).
   Buffers, UVs and textures are embedded in assets/scenery-data.js with attribution in ASSET-CREDITS-POLYHAVEN.txt. */
window.APEX = window.APEX || {};
APEX.Scenery=(()=>{
  const T=THREE;
  function decode(text,Type){const s=atob(text),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return new Type(b.buffer);}
  class Environment {
    constructor(renderer,pack){this.owner=renderer;this.pack=pack;this.library={};this.objects=[];this.quality='balanced';this.status='loading';}
    async prepare(){
      const textureCache=new Map(),wait=[];
      const texture=(uri,color)=>{
        if(!uri)return null;const key=(color?'color:':'linear:')+uri;
        if(textureCache.has(key))return textureCache.get(key);
        let tex;const p=new Promise((resolve,reject)=>{tex=new T.TextureLoader().load(uri,resolve,undefined,reject);});wait.push(p);
        tex.colorSpace=color?T.SRGBColorSpace:T.NoColorSpace;tex.flipY=false;
        tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.anisotropy=Math.min(4,this.owner.engine.renderer.capabilities.getMaxAnisotropy());
        textureCache.set(key,tex);return tex;
      };
      for(const model of this.pack.models){
        const mats={},meshes={};
        for(const [key,m] of Object.entries(model.materials)){
          const glass=m.name.includes('glass');
          const mat=new T.MeshStandardMaterial({
            color:glass?'#8fa5a8':'#ffffff',map:texture(m.map,true),
            normalMap:texture(m.normalMap,false),roughnessMap:texture(m.roughnessMap,false),
            metalnessMap:glass?null:texture(m.roughnessMap,false),
            roughness:glass?.23:1,metalness:glass?.35:m.metalness,
            side:m.doubleSided?T.DoubleSide:T.FrontSide,
            alphaTest:m.alphaMode==='MASK'?.45:0
          });
          if(mat.normalMap)mat.normalScale.set(.65,.65);
          mat.name=model.id+'/'+m.name;mats[key]=mat;
        }
        for(const [name,data] of Object.entries(model.meshes)){
          const group=new T.Group();group.name=name;
          for(const p of data.primitives){
            const geo=new T.BufferGeometry();
            for(const [semantic,a] of Object.entries(p.attributes)){
              geo.setAttribute({POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv'}[semantic],new T.BufferAttribute(decode(a.data,Float32Array),a.width));
            }
            geo.setIndex(new T.BufferAttribute(decode(p.index,Uint32Array),1));geo.computeBoundingSphere();
            const mesh=new T.Mesh(geo,mats[p.material]);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
          }
          meshes[name]=group;
        }
        this.library[model.id]={meshes,mats};
      }
      await Promise.all(wait);this.populate();this.status='ready';this.pack=null;
    }
    ground(d,lane){
      const p=this.owner.track.at(d,lane);
      // Imported objects stand on the sloping road bank or island, never on the asphalt.
      p.y=Math.abs(lane)<31?APEX.core.lerp(p.y-.06,-2.2,(Math.abs(lane)-11.5)/19.5):-1.2;
      return p;
    }
    merge(group){
      group.updateMatrixWorld(true);
      const buckets=new Map();
      group.traverse(mesh=>{
        if(!mesh.isMesh)return;
        let b=buckets.get(mesh.material);if(!b){b={p:[],n:[],uv:[],idx:[],vertices:0};buckets.set(mesh.material,b);}
        const geo=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        const pos=geo.getAttribute('position'),normal=geo.getAttribute('normal'),uv=geo.getAttribute('uv'),ix=geo.index;
        b.p.push(pos.array.slice());b.n.push(normal.array.slice());b.uv.push(uv.array.slice());
        const shifted=new Uint32Array(ix?ix.count:pos.count);
        for(let i=0;i<shifted.length;i++)shifted[i]=(ix?ix.getX(i):i)+b.vertices;
        b.idx.push(shifted);b.vertices+=pos.count;geo.dispose();
      });
      const concatenate=(arrays,Type)=>{const out=new Type(arrays.reduce((n,a)=>n+a.length,0));let at=0;for(const a of arrays){out.set(a,at);at+=a.length;}return out;};
      const result=new T.Group();
      for(const [mat,b] of buckets){
        const g=new T.BufferGeometry();
        g.setAttribute('position',new T.BufferAttribute(concatenate(b.p,Float32Array),3));
        g.setAttribute('normal',new T.BufferAttribute(concatenate(b.n,Float32Array),3));
        g.setAttribute('uv',new T.BufferAttribute(concatenate(b.uv,Float32Array),2));
        g.setIndex(new T.BufferAttribute(concatenate(b.idx,Uint32Array),1));g.computeBoundingSphere();
        const mesh=new T.Mesh(g,mat);mesh.castShadow=true;mesh.receiveShadow=true;result.add(mesh);
      }
      return result;
    }
    building(columns,floors){
      const source=this.library.modular_urban_apartments_facade.meshes,group=new T.Group(),width=columns*3,depth=6;
      const put=(parent,name,x,y,z=0)=>{const m=source[name].clone(true);m.position.set(x,y,z);parent.add(m);};
      // Four full facades assembled from actual authored wall, window, door and trim meshes.
      for(let side=0;side<4;side++){
        const facade=new T.Group(),cols=side%2?2:columns,w=cols*3;
        facade.rotation.y=side*Math.PI/2;
        facade.position.set(side===1?width/2:side===3?-width/2:0,0,side===0?depth/2:side===2?-depth/2:0);
        for(let c=0;c<cols;c++){
          const x=-w/2+(c+1)*3;
          put(facade,'base_standard_01',x,-.7);
          for(let floor=0;floor<floors;floor++){
            const y=floor*3,door=side===0&&floor===0&&c===Math.floor(cols/2);
            put(facade,door?'wall_door_centered_small_01':'wall_window_centered_small_01',x,y);
            put(facade,door?'door_centered_small_01':'window_centered_small_01',x,y);
            put(facade,'cornice_standard_standard_01',x,y+2.8);
            if(floor===0)put(facade,'dado_standard_standard_01',x,y);
          }
          put(facade,'crown_standard_standard_01',x,floors*3);
        }
        group.add(facade);
      }
      const building=this.merge(group);
      // Plain roof/base close the modular shell; the visible facade uses imported assets.
      const roof=new T.Mesh(new T.BoxGeometry(width+.15,.16,depth+.15),new T.MeshStandardMaterial({color:'#5c5950',roughness:.94}));
      roof.position.y=floors*3+.05;roof.receiveShadow=true;building.add(roof);
      const pad=new T.Mesh(new T.BoxGeometry(width+2,.6,depth+2),new T.MeshStandardMaterial({color:'#948f80',roughness:1}));
      pad.position.y=-.75;pad.receiveShadow=true;building.add(pad);
      return building;
    }
    populate(){
      const track=this.owner.track,s=this.owner.scene;
      let seed=418;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
      const variants=[this.building(3,2),this.building(4,3)];
      // A coherent coastal village district, then isolated buildings along the drive.
      for(let i=0;i<16;i++){
        const d=80+i*92,lane=-25-(i%3)*1.5,p=this.ground(d,lane);
        const home=variants[i%2].clone(true);home.position.set(p.x,p.y+1,p.z);
        // Local +Z facade faces outward toward the road.
        home.rotation.y=p.heading+Math.PI/2;home.scale.setScalar(1.06+(i%3)*.055);s.add(home);
        this.objects.push({object:home,x:p.x,z:p.z,kind:'building'});
      }
      const trees=Object.values(this.library.pine_sapling_small.meshes);
      for(let i=0;i<138;i++){
        const d=(i*19.1+rand()*7)%track.length,lane=-17.5-rand()*12;
        if(d<1540&&Math.abs(lane+26)<6)continue;
        const p=this.ground(d,lane),tree=trees[i%trees.length].clone(true),scale=4.5+rand()*3.5;
        tree.scale.setScalar(scale);tree.position.set(p.x,p.y,p.z);tree.rotation.y=rand()*Math.PI*2;
        tree.traverse(m=>{if(m.isMesh)m.castShadow=false;});s.add(tree);
        this.objects.push({object:tree,x:p.x,z:p.z,kind:'tree'});
      }
      this.update(420,0);
    }
    update(x,z){
      const treeDistance=this.quality==='low'?95:this.quality==='high'?195:145;
      const buildingDistance=this.quality==='low'?175:300;
      for(const item of this.objects){
        const max=item.kind==='tree'?treeDistance:buildingDistance;
        item.object.visible=(item.x-x)**2+(item.z-z)**2<max*max;
      }
    }
  }
  return {Environment};
})();