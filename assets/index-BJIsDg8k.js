(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const r of s)if(r.type==="childList")for(const i of r.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&n(i)}).observe(document,{childList:!0,subtree:!0});function o(s){const r={};return s.integrity&&(r.integrity=s.integrity),s.referrerPolicy&&(r.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?r.credentials="include":s.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function n(s){if(s.ep)return;s.ep=!0;const r=o(s);fetch(s.href,r)}})();const we=`// shader.wgsl

// Useful WGSL built-ins:
//   normalize(v) — returns unit vector
//   dot(a, b) — scalar dot product
//   reflect(I, N) — reflects incident vector I around normal N
//   max(a, b) — component-wise max
//   pow(base, exp) — power function
//   dpdx(v), dpdy(v) — screen-space partial derivatives (fragment stage only)
//   cross(a, b)— cross product

struct Uniforms {
  mvp        : mat4x4<f32>,  // Model-View-Projection matrix
  model      : mat4x4<f32>,  // Model matrix (object -> world space)
  normalMat  : mat4x4<f32>,  // transpose(inverse(model)) — keeps normals correct under scale

  lightPos   : vec3<f32>,    // Light position in world space
  _p0        : f32,

  lightColor : vec3<f32>,    // RGB light colour
  _p1        : f32,

  ambient    : f32,          // Ka — ambient coefficient
  diffuse    : f32,          // Kd — diffuse coefficient
  specular   : f32,          // Ks — specular coefficient
  shininess  : f32,          // n  — specular exponent 

  camPos     : vec3<f32>,    // Camera position in world space
  model_id   : u32,          // Which lighting model to use (0–3)

  objectColor : vec3<f32>,   // Base colour of the object
  time        : f32,         // Elapsed seconds
};

@group(0) @binding(0) var<uniform> u : Uniforms;
@group(0) @binding(1) var texSampler : sampler;
@group(0) @binding(2) var tex : texture_2d<f32>;

// ── Vertex shader I/O 
struct VSIn {
  @location(0) position : vec3<f32>,
  @location(1) normal   : vec3<f32>,
  @location(2) uv       : vec2<f32>,
  @location(3) barycentric: vec3<f32>,
};

struct VSOut {
  @builtin(position) clipPos : vec4<f32>,
  @location(0) worldPos      : vec3<f32>,   // fragment position in world space
  @location(1) worldNormal   : vec3<f32>,   // interpolated world-space normal
  @location(2) uv            : vec2<f32>,
  // TODO (Gouraud): compute and store the light colour here in vs_main,
  // then read it back in fs_main instead of re-computing lighting per fragment
  @location(3) gouraudColor  : vec3<f32>,
  @location(4) barycentric: vec3<f32>,
};


//Flat shading
// Flat shading uses ONE normal per triangle face instead of per-vertex normals.
// We derive it in the fragment shader using screen-space derivatives:
//   dpdx(p) = how much world-position changes horizontally across one pixel
//   dpdy(p) = how much world-position changes vertically
//   cross(dpdx, dpdy) gives the face normal pointing toward the camera.

fn flatShading(fragWorldPos: vec3<f32>) -> vec3<f32> {
  // Derive the face normal from position derivatives
  let dx    = dpdx(fragWorldPos);
  let dy    = dpdy(fragWorldPos);
  let faceN = normalize(cross(dx, dy));

  // ── Standard lighting terms
  let L = normalize(u.lightPos - fragWorldPos);  // direction TO the light
  let V = normalize(u.camPos   - fragWorldPos);  // direction TO the camera

  // Ambient: constant low-level light so dark side isn't pure black
  let ambientC = u.ambient * u.lightColor;

  // Diffuse: Lambertian — cos(angle between N and L), clamped to [0,1]
  let NdotL    = max(dot(faceN, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  // Specular: Phong reflection — angle between reflected light and view direction
  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, faceN);                              // perfect mirror direction
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── TODO 1 of 3: Gouraud shading
// Called ONCE PER VERTEX in vs_main, not per fragment.

fn gouraudLighting(N: vec3<f32>, vertWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - vertWorldPos);  
  let V = normalize(u.camPos   - vertWorldPos);  

  let ambientC = u.ambient * u.lightColor;

  let NdotL    = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, N);                             
    let RdotV = max(dot(R, V), 0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}


// ── TODO 2 of 3: Phong shading 
// Called ONCE PER FRAGMENT in fs_main.
fn phongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - fragWorldPos); 
  let V = normalize(u.camPos   - fragWorldPos); 

  let ambientC = u.ambient * u.lightColor;

  let NdotL    = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let R = reflect(-L, N); 
    let RdotV = max(dot(R,V),0.0);
    specularC = u.specular * pow(RdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;
}

// ── TODO 3 of 3: Blinn-Phong shading 
// Called ONCE PER FRAGMENT in fs_main.
fn blinnPhongLighting(N: vec3<f32>, fragWorldPos: vec3<f32>) -> vec3<f32> {
  let L = normalize(u.lightPos - fragWorldPos); 
  let V = normalize(u.camPos   - fragWorldPos); 

  let H = normalize(L+V); // bisector between light and view directions

  let ambientC = u.ambient * u.lightColor;

  let NdotL    = max(dot(N, L), 0.0);
  let diffuseC = u.diffuse * NdotL * u.lightColor;

  var specularC = vec3<f32>(0.0);
  if NdotL > 0.0 {
    let NdotV = max(dot(N,H),0.0);
    specularC = u.specular * pow(NdotV, u.shininess) * u.lightColor;
  }

  return (ambientC + diffuseC + specularC) * u.objectColor;  
}

// ── Vertex shader
// Transforms geometry to clip space and prepares interpolated data for the fragment shader.
@vertex
fn vs_main(input: VSIn) -> VSOut {
  var out: VSOut;

  let worldPos4    = u.model    * vec4<f32>(input.position, 1.0);
  let worldNormal4 = u.normalMat * vec4<f32>(input.normal, 0.0);

  out.clipPos     = u.mvp * vec4<f32>(input.position, 1.0);
  out.worldPos    = worldPos4.xyz;
  out.worldNormal = normalize(worldNormal4.xyz);
  out.uv          = input.uv;
  out.barycentric = input.barycentric;

  // TODO (Gouraud): call gouraudLighting() here and store the result.
  // When model_id == 1u, compute lighting per vertex so the fragment shader can just read out.gouraudColor directly without any extra work.
  if u.model_id == 1u {
    out.gouraudColor = gouraudLighting(out.worldNormal, out.worldPos);
  } else {
    out.gouraudColor = vec3<f32>(0.0);
  }

  return out;
}

// ── Fragment shader
// Dispatches to the correct lighting function based on model_id
// Do NOT need to modify the switch
@fragment
fn fs_main(input: VSOut) -> @location(0) vec4<f32> {
  var color: vec3<f32>;
  let N = normalize(input.worldNormal);  // smooth interpolated normal

  switch u.model_id {
    case 0u: {
      // Flat — already done, use as reference
      color = flatShading(input.worldPos);
    }
    case 1u: {
      // Gouraud — colour was computed per-vertex and interpolated by GPU
      color = input.gouraudColor;
    }
    case 2u: {
      // Phong — implement phongLighting() above
      color = phongLighting(N, input.worldPos);
    }
    case 3u: {
      // Blinn-Phong — implement blinnPhongLighting() above
      color = blinnPhongLighting(N, input.worldPos);
    }
    case 4u: {
      // Normals
      return vec4<f32>(N * 0.5 + 0.5, 1.0);
    }
    case 5u:{
      // Wireframe
      let linea = 0.01;

      let edges_distance = min(min(input.barycentric.x,input.barycentric.y),input.barycentric.z);

      if(edges_distance < linea){
        return vec4<f32>(0.0,0.0,0.0,1.0);
      }else{
        return vec4<f32>(1.0,1.0,1.0,1.0);
      }
    }
    case 6u: {
      // Depth
      let depth = input.clipPos.z / input.clipPos.w;
      return vec4<f32>(vec3<f32>(depth),1.0);
    }
    case 7u:{
      // Texture
      return textureSample(tex, texSampler, input.uv);
    }
    case 8u:{
      // UV coordinates
      return vec4<f32>(input.uv,0.0,1.0);
    }
    default: {
      // Blinn-Phong — implement blinnPhongLighting() above
      color = blinnPhongLighting(N, input.worldPos);
    }
  }

  return vec4<f32>(color, 1.0);
}
`,m={add(t,e){return[t[0]+e[0],t[1]+e[1],t[2]+e[2]]},sub(t,e){return[t[0]-e[0],t[1]-e[1],t[2]-e[2]]},scale(t,e){return[t[0]*e,t[1]*e,t[2]*e]},dot(t,e){return t[0]*e[0]+t[1]*e[1]+t[2]*e[2]},cross(t,e){return[t[1]*e[2]-t[2]*e[1],t[2]*e[0]-t[0]*e[2],t[0]*e[1]-t[1]*e[0]]},normalize(t){const e=Math.hypot(t[0],t[1],t[2])||1;return[t[0]/e,t[1]/e,t[2]/e]}},g={identity(){const t=new Float32Array(16);return t[0]=1,t[5]=1,t[10]=1,t[15]=1,t},multiply(t,e){const o=new Float32Array(16);for(let n=0;n<4;n++)for(let s=0;s<4;s++)o[n*4+s]=t[0+s]*e[n*4+0]+t[4+s]*e[n*4+1]+t[8+s]*e[n*4+2]+t[12+s]*e[n*4+3];return o},transpose(t){const e=new Float32Array(16);for(let o=0;o<4;o++)for(let n=0;n<4;n++)e[n*4+o]=t[o*4+n];return e},invert(t){const e=new Float32Array(16),o=t[0],n=t[1],s=t[2],r=t[3],i=t[4],a=t[5],l=t[6],d=t[7],p=t[8],C=t[9],P=t[10],E=t[11],y=t[12],M=t[13],L=t[14],v=t[15],b=o*a-n*i,u=o*l-s*i,T=o*d-r*i,_=n*l-s*a,I=n*d-r*a,S=s*d-r*l,U=p*M-C*y,O=p*L-P*y,q=p*v-E*y,F=C*L-P*M,V=C*v-E*M,j=P*v-E*L;let x=b*j-u*V+T*F+_*q-I*O+S*U;return x?(x=1/x,e[0]=(a*j-l*V+d*F)*x,e[1]=(l*q-i*j-d*O)*x,e[2]=(i*V-a*q+d*U)*x,e[3]=(a*O-i*F-l*U)*x,e[4]=(s*V-n*j-r*F)*x,e[5]=(o*j-s*q+r*O)*x,e[6]=(n*q-o*V-r*U)*x,e[7]=(o*F-n*O+s*U)*x,e[8]=(M*S-L*I+v*_)*x,e[9]=(L*T-y*S-v*u)*x,e[10]=(y*I-M*T+v*b)*x,e[11]=(M*u-y*_-L*b)*x,e[12]=(P*I-C*S-E*_)*x,e[13]=(p*S-P*T+E*u)*x,e[14]=(C*T-p*I-E*b)*x,e[15]=(p*_-C*u+P*b)*x,e):g.identity()},normalMatrix(t){return g.transpose(g.invert(t))},translation(t,e,o){const n=g.identity();return n[12]=t,n[13]=e,n[14]=o,n},scaling(t,e,o){const n=g.identity();return n[0]=t,n[5]=e,n[10]=o,n},rotationX(t){const e=Math.cos(t),o=Math.sin(t),n=g.identity();return n[5]=e,n[6]=o,n[9]=-o,n[10]=e,n},rotationY(t){const e=Math.cos(t),o=Math.sin(t),n=g.identity();return n[0]=e,n[2]=-o,n[8]=o,n[10]=e,n},rotationZ(t){const e=Math.cos(t),o=Math.sin(t),n=g.identity();return n[0]=e,n[1]=o,n[4]=-o,n[5]=e,n},perspective(t,e,o,n){const s=1/Math.tan(t/2),r=new Float32Array(16);return r[0]=s/e,r[5]=s,r[10]=n/(o-n),r[11]=-1,r[14]=n*o/(o-n),r},lookAt(t,e,o){const n=m.normalize(m.sub(t,e)),s=m.normalize(m.cross(o,n)),r=m.cross(n,s),i=new Float32Array(16);return i[0]=s[0],i[4]=s[1],i[8]=s[2],i[12]=-m.dot(s,t),i[1]=r[0],i[5]=r[1],i[9]=r[2],i[13]=-m.dot(r,t),i[2]=n[0],i[6]=n[1],i[10]=n[2],i[14]=-m.dot(n,t),i[3]=0,i[7]=0,i[11]=0,i[15]=1,i}};class ye{position=[0,.8,6];yaw=-Math.PI/2;pitch=0;moveSpeed=3.5;turnSpeed=1.9;clampPitch(){const e=Math.PI/2-.01;this.pitch>e&&(this.pitch=e),this.pitch<-e&&(this.pitch=-e)}getForward(){const e=Math.cos(this.pitch);return m.normalize([Math.cos(this.yaw)*e,Math.sin(this.pitch),Math.sin(this.yaw)*e])}getViewMatrix(){const e=this.getForward(),o=m.add(this.position,e);return g.lookAt(this.position,o,[0,1,0])}update(e,o){e.has("ArrowLeft")&&(this.yaw-=this.turnSpeed*o),e.has("ArrowRight")&&(this.yaw+=this.turnSpeed*o),e.has("ArrowUp")&&(this.pitch+=this.turnSpeed*o),e.has("ArrowDown")&&(this.pitch-=this.turnSpeed*o),this.clampPitch();const n=this.getForward(),s=m.normalize(m.cross(n,[0,1,0])),r=[0,1,0],i=this.moveSpeed*o;e.has("w")&&(this.position=m.add(this.position,m.scale(n,i))),e.has("s")&&(this.position=m.add(this.position,m.scale(n,-i))),e.has("a")&&(this.position=m.add(this.position,m.scale(s,-i))),e.has("d")&&(this.position=m.add(this.position,m.scale(s,i))),e.has("q")&&(this.position=m.add(this.position,m.scale(r,-i))),e.has("e")&&(this.position=m.add(this.position,m.scale(r,i)))}}const c={modelId:0,ambient:.12,diffuse:.75,specular:.6,shininess:32,translateX:3,translateY:4,translateZ:3,lightX:3,lightY:4,lightZ:3,autoRotLight:!1,rotateX:1,rotateY:1,rotateZ:1,scaleX:1,scaleY:1,scaleZ:1,listIndex:-1,useText:!1,objectColor:"#4a9eff",lightColor:"#ffffff"};function ne(t){const e=parseInt(t.slice(1),16);return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}const Ce={0:"Flat: face normal derived from dpdx/dpdy — one colour per triangle, hard faceted edges.",1:"Gouraud: lighting computed per vertex in vs_main, interpolated across the face. Implement gouraudLighting() in shader.wgsl.",2:"Phong: smooth normals interpolated per pixel, full lighting in fs_main. Implement phongLighting() in shader.wgsl.",3:"Blinn-Phong: like Phong but uses half-vector H=normalize(L+V) for specular. Implement blinnPhongLighting() in shader.wgsl."};function Pe(t,e){document.getElementById("lightX").value=t.toFixed(1),document.getElementById("lightX-val").textContent=t.toFixed(1),document.getElementById("lightZ").value=e.toFixed(1),document.getElementById("lightZ-val").textContent=e.toFixed(1)}function B(t,e,o,n,s,r){return`
  <div class="slider-row">
    <span class="slider-label">${e}</span>
    <input type="range" id="${t}" min="${o}" max="${n}" step="${s}" value="${r}">
    <span class="slider-val" id="${t}-val">${r}</span>
  </div>`}function Le(t){const e=document.createElement("div");e.id="gui",e.innerHTML=`
<div class="gui-panel">
  <div class="gui-title">Scene</div>

  <div class="gui-section" id="list_objects">
    
  </div>

  <div class="gui-section" id="options">
    <div class="model-btns">
      <button class="shape-btn">Deselect</button>
      <button class="shape-btn-delete" id="btn-delete">Delete</button>
    </div>
    <div class="model-desc" id="options-desc">Select an object</div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Transform</div>
    ${B("translateX","Translate X",-12,12,.05,c.translateX)}
    ${B("translateY","Translate Y",-12,12,.05,c.translateY)}
    ${B("translateZ","Translate Z",-12,12,.05,c.translateZ)}
    ${B("rotateX","Rotate X",-3.15,3.15,.01,c.rotateX)}
    ${B("rotateY","Rotate Y",-3.15,3.15,.01,c.rotateY)}
    ${B("rotateZ","Rotate Z",-3.15,3.15,.01,c.rotateZ)}
    ${B("scaleX","Scale X",.5,6,.05,c.scaleX)}
    ${B("scaleY","Scale Y",.5,6,.05,c.scaleY)}
    ${B("scaleZ","Scale Z",.5,6,.05,c.scaleZ)}
    <div class="color-row"><span>Object</span><input type="color" id="objectColor" value="${c.objectColor}"></div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Material</div>
    ${B("ambient","Ambient (Ka)",0,1,.01,c.ambient)}
    ${B("diffuse","Diffuse (Kd)",0,1,.01,c.diffuse)}
    ${B("specular","Specular (Ks)",0,1,.01,c.specular)}
    ${B("shininess","Shininess (n)",1,256,1,c.shininess)}
    <div class="color-row"><span>Object</span><input type="color" id="objectColor" value="${c.objectColor}"></div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Texture (Spherical UV)</div>
    <input type="file" accept=".jgp, .png, .jpeg" id="texture_upload" name="texture_upload">
    <label class="checkbox-row">
      <input type="checkbox" id="useText">
      Use texture
    </label>    
  </div>

</div>

<div class = "gui-panel-left">
  <div class="gui-title">Pipeline</div>

  <div class="gui-section">
    <div class="gui-label">Add object</div>
    <div class="model-btns">
      <button class="shape-btn active" data-shape="cube">Cube</button>
      <button class="shape-btn" data-shape="sphere">Sphere</button>
    </div>
    <div class="model-desc" id="shape-desc">Cube is provided. Implement generateSphere() in main.ts.</div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Add model</div>
    <div class="model-btns">
      <input type="file" accept=".obj" id="file_upload" name="file_upload" />
    </div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Render Model (Global)</div>
    <div class="model-btns">
      <button class="model-btn active" data-id="0">Flat</button>
      <button class="model-btn" data-id="1">Gouraud</button>
      <button class="model-btn" data-id="2">Phong</button>
      <button class="model-btn" data-id="3">Blinn-Phong</button>
      <button class="model-btn" data-id="4">Normals</button>
      <button class="model-btn" data-id="5">Wireframe</button>
      <button class="model-btn" data-id="6">Depth</button>
      <button class="model-btn" data-id="7">Texture</button>
      <button class="model-btn" data-id="8">UV Coords</button>
    </div>
    <div class="model-desc" id="model-desc"></div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Light color</div>
    <div class="color-row"><span>Light</span><input type="color" id="lightColor"  value="${c.lightColor}"></div>
  </div>

</div>`,document.body.appendChild(e);function o(){document.getElementById("model-desc").textContent=Ce[c.modelId]}o(),document.querySelectorAll(".model-btn").forEach(l=>{l.addEventListener("click",()=>{c.modelId=Number(l.dataset.id),document.querySelectorAll(".model-btn").forEach(d=>d.classList.remove("active")),l.classList.add("active"),o()})}),document.querySelectorAll(".shape-btn").forEach(l=>{l.addEventListener("click",()=>{const d=l.dataset.shape;document.querySelectorAll(".shape-btn").forEach(p=>p.classList.remove("active")),l.classList.add("active"),document.getElementById("shape-desc").textContent=d==="sphere"?"Implement generateSphere() in main.ts to see the sphere.":"Cube is provided as a reference.",t(d)})}),["ambient","diffuse","specular","shininess","translateX","translateY","translateZ","rotateX","rotateY","rotateZ","scaleX","scaleY","scaleZ"].forEach(l=>{const d=document.getElementById(l),p=document.getElementById(`${l}-val`);d.addEventListener("input",()=>{c[l]=parseFloat(d.value),p.textContent=d.value})}),document.getElementById("objectColor").addEventListener("input",l=>{c.objectColor=l.target.value}),document.getElementById("lightColor").addEventListener("input",l=>{c.lightColor=l.target.value}),document.getElementById("file_upload").addEventListener("change",async l=>{const d=l.target.files?.[0];if(!d)return;const p=await d.text(),C=new CustomEvent("modelLoaded",{detail:p});window.dispatchEvent(C)}),document.getElementById("texture_upload").addEventListener("change",async l=>{const d=l.target.files?.[0];if(!d)return;console.log(d);const p=new CustomEvent("textureLoaded",{detail:d.name});window.dispatchEvent(p)}),e.querySelector(".shape-btn:not([data-shape])")?.addEventListener("click",()=>{window.dispatchEvent(new CustomEvent("deselectObject"))}),document.getElementById("useText")?.addEventListener("click",()=>{console.log("si"),c.useText?c.useText=!1:c.useText=!0}),document.getElementById("btn-delete")?.addEventListener("click",()=>{if(c.listIndex!==-1)window.dispatchEvent(new CustomEvent("deleteObject",{detail:c.listIndex})),c.listIndex=-1;else{const l=document.getElementById("options-desc");l.innerHTML="Select an object first, to delete it"}})}class Q{device;tag;tx=0;ty=0;tz=0;rx=0;ry=0;rz=0;sx=1;sy=1;sz=1;quaternion=[1,0,0,0];ambient=.12;diffuse=.75;specular=.6;shininess=32;vertexBuffer;vertexCount;texture;uniformBuffer;bindGroup;constructor(e,o,n,s,r,i){this.device=e,this.tag=n,this.vertexCount=o.length/11,this.texture=i,this.vertexBuffer=this.device.createBuffer({size:o.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST}),this.uniformBuffer=this.device.createBuffer({size:288,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST}),this.bindGroup=this.device.createBindGroup({layout:s.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:r},{binding:2,resource:this.texture.createView()}]}),this.device.queue.writeBuffer(this.vertexBuffer,0,o)}update(e,o,n){this.texture=o,this.bindGroup=this.device.createBindGroup({layout:n.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:e},{binding:2,resource:this.texture.createView()}]})}draw(e,o){this.device.queue.writeBuffer(this.uniformBuffer,0,o),e.setBindGroup(0,this.bindGroup),e.setVertexBuffer(0,this.vertexBuffer),e.draw(this.vertexCount)}}let D=[1,0,0,0],A=[1,0,0,0],z=[0,0,0];function re(t,e){let o=t*t+e*e,n=0;if(o<=1)n=Math.sqrt(1-o);else{let s=1/Math.sqrt(o);t*=s,e*=s,n=0}return[t,e,n]}function X(t,e){const[o,n,s,r]=t,[i,a,l,d]=e;return[o*i-n*a-s*l-r*d,o*a+n*i+s*d-r*l,o*l-n*d+s*i+r*a,o*d+n*l-s*a+r*i]}function Ee(t,e){z=re(t,e)}function Me(t,e){let o=re(t,e),n=[z[1]*o[2]-z[2]*o[1],z[2]*o[0]-z[0]*o[2],z[0]*o[1]-z[1]*o[0]],s=z[0]*o[0]+z[1]*o[1]+z[2]*o[2];s=Math.max(-1,Math.min(1,s)),s=Math.acos(s);let r=Math.cos(s/2),i=Math.sin(s/2),a=Math.sqrt(n[0]**2+n[1]**2+n[2]**2);a>0?A=[r,n[0]/a*i,n[1]/a*i,n[2]/a*i]:A=[1,0,0,0]}function Ie(){D=X(A,D),A=[1,0,0,0]}function ae(t,e,o){const n=Math.cos(t*.5),s=Math.sin(t*.5),r=Math.cos(e*.5),i=Math.sin(e*.5),a=Math.cos(o*.5),l=Math.sin(o*.5);return[n*r*a+s*i*l,s*r*a-n*i*l,n*i*a+s*r*l,n*r*l-s*i*a]}function oe(t,e,o){const n=ae(t,e,o),s=X(A,D);return X(s,n)}function Te(t,e,o){const n=ae(t,e,o),s=X(A,D),r=X(s,n),[i,a,l,d]=r;return new Float32Array([1-2*l*l-2*d*d,2*(a*l-d*i),2*(a*d+l*i),0,2*(a*l+d*i),1-2*a*a-2*d*d,2*(l*d-a*i),0,2*(a*d-l*i),2*(l*d+a*i),1-2*(a*a+l*l),0,0,0,0,1])}function se(t){const[e,o,n,s]=t;return new Float32Array([1-2*n*n-2*s*s,2*(o*n-s*e),2*(o*s+n*e),0,2*(o*n+s*e),1-2*o*o-2*s*s,2*(n*s-o*e),0,2*(o*s-n*e),2*(n*s+o*e),1-2*(o*o+n*n),0,0,0,0,1])}function J(t){D=[...t],A=[1,0,0,0]}if(!navigator.gpu)throw new Error("WebGPU not supported");const N=document.querySelector("#gfx-main");if(!N)throw new Error("Canvas #gfx-main not found");const le=await navigator.gpu.requestAdapter();if(!le)throw new Error("No GPU adapter found");const w=await le.requestDevice(),ce=N.getContext("webgpu"),de=navigator.gpu.getPreferredCanvasFormat();let H=null;function ue(){N.width=Math.max(1,Math.floor(window.innerWidth*devicePixelRatio)),N.height=Math.max(1,Math.floor(window.innerHeight*devicePixelRatio)),ce.configure({device:w,format:de,alphaMode:"premultiplied"}),H?.destroy(),H=w.createTexture({size:[N.width,N.height],format:"depth24plus",usage:GPUTextureUsage.RENDER_ATTACHMENT})}ue();window.addEventListener("resize",ue);let W=!1;function fe(t,e){const o=N.getBoundingClientRect(),n=(t-o.left)/o.width*2-1,s=1-(e-o.top)/o.width*2;return{x:n,y:s}}N.addEventListener("mousedown",t=>{W=!0;const e=fe(t.clientX,t.clientY);Ee(e.x,e.y)});window.addEventListener("mouseup",()=>{W&&(Ie(),W=!1)});N.addEventListener("mousemove",t=>{if(!W)return;const e=fe(t.clientX,t.clientY);Me(e.x,e.y)});function pe(){const t=[{n:[0,0,1],verts:[[-1,-1,1,0,1],[1,-1,1,1,1],[1,1,1,1,0],[-1,-1,1,0,1],[1,1,1,1,0],[-1,1,1,0,0]]},{n:[0,0,-1],verts:[[1,-1,-1,0,1],[-1,-1,-1,1,1],[-1,1,-1,1,0],[1,-1,-1,0,1],[-1,1,-1,1,0],[1,1,-1,0,0]]},{n:[-1,0,0],verts:[[-1,-1,-1,0,1],[-1,-1,1,1,1],[-1,1,1,1,0],[-1,-1,-1,0,1],[-1,1,1,1,0],[-1,1,-1,0,0]]},{n:[1,0,0],verts:[[1,-1,1,0,1],[1,-1,-1,1,1],[1,1,-1,1,0],[1,-1,1,0,1],[1,1,-1,1,0],[1,1,1,0,0]]},{n:[0,1,0],verts:[[-1,1,1,0,1],[1,1,1,1,1],[1,1,-1,1,0],[-1,1,1,0,1],[1,1,-1,1,0],[-1,1,-1,0,0]]},{n:[0,-1,0],verts:[[-1,-1,-1,0,1],[1,-1,-1,1,1],[1,-1,1,1,0],[-1,-1,-1,0,1],[1,-1,1,1,0],[-1,-1,1,0,0]]}],e=[];for(const o of t){let n=0;for(const s of o.verts)e.push(s[0],s[1],s[2]),e.push(...o.n),e.push(s[3],s[4]),n%3===0?e.push(1,0,0):n%3===1?e.push(0,1,0):e.push(0,0,1),n++}return new Float32Array(e)}function he(t,e){const o=[];for(let n=0;n<t;n++)for(let s=0;s<e;s++){const i=[[n,s],[n+1,s],[n,s+1],[n+1,s+1]].map(([C,P])=>{let E=Math.PI*C/t,y=2*Math.PI*P/e,M=Math.sin(E)*Math.cos(y),L=Math.cos(E),v=Math.sin(E)*Math.sin(y),b=P/e,u=C/t;return[M,L,v,M,L,v,b,u]}),[a,l,d,p]=i;o.push(...a,1,0,0),o.push(...l,0,1,0),o.push(...d,0,0,1),o.push(...d,1,0,0),o.push(...l,0,1,0),o.push(...p,0,0,1)}return new Float32Array(o)}const f=[];function Be(){const t=pe(),e=new Q(w,t,"Cube",G,Y,$);e.tx=f.length*3,f.push(e)}function Ne(){const t=he(64,64),e=new Q(w,t,"Sphere",G,Y,$);e.tx=f.length*3,f.push(e)}function me(t){const e=t==="cube"?pe():he(64,64),o=w.createBuffer({size:e.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});return w.queue.writeBuffer(o,0,e),{buf:o,count:e.length/11}}me("cube");me("sphere");const ge=288;w.createBuffer({size:ge,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});const ee=new ArrayBuffer(ge),h=new Float32Array(ee),Se=new Uint32Array(ee),ie=w.createShaderModule({label:"Lighting Shader",code:we}),G=w.createRenderPipeline({label:"Lighting Pipeline",layout:"auto",vertex:{module:ie,entryPoint:"vs_main",buffers:[{arrayStride:44,attributes:[{shaderLocation:0,offset:0,format:"float32x3"},{shaderLocation:1,offset:12,format:"float32x3"},{shaderLocation:2,offset:24,format:"float32x2"},{shaderLocation:3,offset:32,format:"float32x3"}]}]},fragment:{module:ie,entryPoint:"fs_main",targets:[{format:de}]},primitive:{topology:"triangle-list",cullMode:"back"},depthStencil:{format:"depth24plus",depthWriteEnabled:!0,depthCompare:"less"}});function te(){const t=document.getElementById("list_objects");if(t){t.innerHTML='<div class="gui-label">Objects</div>';for(let e=0;e<f.length;e++){const o=`${e+1}. ${f[e].tag}`,n=document.createElement("div");n.className="model-btns",n.innerHTML=`<button class="shape-btn-options" data-shape="cube">${o}</button>`,n.id=`btn-${e}`,n.onclick=()=>{for(let s=0;s<f.length;s++){const r=`btn-${s}`,i=document.getElementById(r);i&&(i.className="model-btns")}c.listIndex=e,n.className="model-btns-active",R.position=[f[e].tx,f[e].ty,f[e].tz],console.log("id: ",c.listIndex),c.ambient=f[e].ambient,c.diffuse=f[e].diffuse,c.specular=f[e].specular,c.shininess=f[e].shininess,c.translateX=f[e].tx,c.translateY=f[e].ty,c.translateZ=f[e].tz,c.rotateX=f[e].rx,c.rotateY=f[e].ry,c.rotateZ=f[e].rz,c.scaleX=f[e].sx,c.scaleY=f[e].sy,c.scaleZ=f[e].sz,J(f[e].quaternion)},t.appendChild(n)}}}let K;function ze(t){const e=[],o=[],n=[],s=[],r=t.split(`
`);for(let i of r){i=i.trim();const a=i.split(/\s+/),l=a[0];if(l==="v")e.push([parseFloat(a[1]),parseFloat(a[2]),parseFloat(a[3])]);else if(l==="o")K=a[1];else if(l==="vn")o.push([parseFloat(a[1]),parseFloat(a[2]),parseFloat(a[3])]);else if(l==="vt")n.push([parseFloat(a[1]),parseFloat(a[2]),parseFloat(a[3])]);else if(l==="f")for(let d=1;d<=3;d++){const p=a[d].split("/"),C=parseInt(p[0])-1,P=p[1]?parseInt(p[1])-1:-1,E=p[2]?parseInt(p[2])-1:-1,y=e[parseInt(a[1].split("/")[0])-1],M=e[parseInt(a[2].split("/")[0])-1],L=e[parseInt(a[3].split("/")[0])-1],v=[M[0]-y[0],M[1]-y[1],M[2]-y[2]],b=[L[0]-y[0],L[1]-y[1],L[2]-y[2]],u=[v[1]*b[2]-v[2]*b[1],v[2]*b[0]-v[0]*b[2],v[0]*b[1]-v[1]*b[0]],T=Math.sqrt(u[0]**2+u[1]**2+u[2]**2),_=[u[0]/T,u[1]/T,u[2]/T];if(s.push(...e[C]),E>=0?s.push(...o[E]):s.push(..._),P>=0&&n[P])s.push(n[P][0],1-n[P][1]);else{const I=e[C],S=Math.sqrt(I[0]**2+I[1]**2+I[2]**2),U=Math.atan2(I[2],I[0]),O=Math.acos(I[1]/S),q=(U+Math.PI)/(2*Math.PI),F=O/Math.PI;s.push(q,F)}d===1?s.push(1,0,0):d===2?s.push(0,1,0):d===3&&s.push(0,0,1)}}return _e(new Float32Array(s),K)}function _e(t,e){let o,n,s,r;const i=e.toLowerCase();if(i.includes("beacon"))o=125,n=125,s=125,r=1/125;else if(i.includes("teapot")){o=.217,n=1.575,s=0;const a=3.434+3,l=3.15-0;r=1/Math.max(a,l,4)}else return t;for(let a=0;a<t.length;a+=11)t[a+0]=(t[a+0]-o)*r,t[a+1]=(t[a+1]-n)*r,t[a+2]=(t[a+2]-s)*r;return t}const Y=w.createSampler({magFilter:"linear",minFilter:"linear",addressModeU:"repeat",addressModeV:"repeat"});async function Ue(t){try{const e=await fetch(t);if(!e.ok)throw new Error(`HTTP ${e.status} for ${t}`);const o=await e.blob(),n=await createImageBitmap(o,{colorSpaceConversion:"none"}),s=w.createTexture({size:[n.width,n.height,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});return w.queue.copyExternalImageToTexture({source:n},{texture:s},[n.width,n.height]),console.log("primero"),s}catch(e){console.warn("Texture load failed, using checkerboard fallback:",e);const o=128,n=128,s=new Uint8Array(o*n*4);for(let i=0;i<n;i++)for(let a=0;a<o;a++){const l=(i*o+a)*4,p=a>>4&1^i>>4&1?230:35;s[l+0]=p,s[l+1]=p,s[l+2]=p,s[l+3]=255}const r=w.createTexture({size:[o,n,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return w.queue.writeTexture({texture:r},s,{bytesPerRow:o*4,rowsPerImage:n},[o,n,1]),console.log("segundo"),r}}function ve(){const o=new Uint8Array(65536);for(let s=0;s<128;s++)for(let r=0;r<128;r++){const i=(s*128+r)*4,l=r>>4&1^s>>4&1?230:35;o[i+0]=l,o[i+1]=l,o[i+2]=l,o[i+3]=255}const n=w.createTexture({size:[128,128,1],format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});return w.queue.writeTexture({texture:n},o,{bytesPerRow:512,rowsPerImage:128},[128,128,1]),console.log("segundo"),n}let $=ve(),Oe=ve();window.addEventListener("textureLoaded",async t=>{const o="./textures/"+t.detail;console.log(o),$=await Ue(o)});window.addEventListener("modelLoaded",t=>{const e=t.detail;console.log(t);const o=ze(e),n=new Q(w,o,K,G,Y,$);n.tx=f.length*3,f.push(n),te()});window.addEventListener("deleteObject",t=>{const e=t.detail;e>=0&&e<f.length&&(f.splice(e,1),te(),console.log("deleted"),J(k))});window.addEventListener("deselectObject",t=>{const e=`btn-${c.listIndex}`,o=document.getElementById(e);o&&(o.className="model-btns"),c.listIndex=-1,R.position=[0,0,10],J(k)});Le(t=>{t==="cube"?Be():t==="sphere"&&Ne(),te()});const R=new ye;R.position=[0,0,10];const be=new Set;window.addEventListener("keydown",t=>be.add(t.key));window.addEventListener("keyup",t=>be.delete(t.key));let k=[1,0,0,0];performance.now();const Re=performance.now();let Z=10;const qe=1,Fe=100;N.addEventListener("wheel",t=>{t.preventDefault(),Z+=t.deltaY*.01,Z=Math.max(qe,Math.min(Fe,Z))});function xe(t){console.log(f.length);const e=(t-Re)/1e3;R.position[2]=Z;const o=N.width/N.height,n=g.perspective(60*Math.PI/180,o,.1,100);let s=R.getViewMatrix();c.listIndex===-1&&(k=oe(0,0,0));const r=se(k);s=g.multiply(s,r);const i=g.identity();g.normalMatrix(i),g.multiply(g.multiply(n,s),i);let a=c.lightX,l=c.lightY,d=c.lightZ;c.autoRotLight&&(a=Math.cos(e*.8)*4.5,d=Math.sin(e*.8)*4.5,Pe(a,d));const[p,C,P]=ne(c.objectColor),[E,y,M]=ne(c.lightColor),L=w.createCommandEncoder(),v=L.beginRenderPass({colorAttachments:[{view:ce.getCurrentTexture().createView(),clearValue:{r:.08,g:.08,b:.12,a:1},loadOp:"clear",storeOp:"store"}],depthStencilAttachment:{view:H.createView(),depthClearValue:1,depthLoadOp:"clear",depthStoreOp:"store"}});v.setPipeline(G);for(let b=0;b<f.length;b++){const u=f[b];let T;c.useText?u.update(Y,$,G):u.update(Y,Oe,G),b==c.listIndex?(h[56]=c.ambient,h[57]=c.diffuse,h[58]=c.specular,h[59]=c.shininess,u.ambient=c.ambient,u.diffuse=c.diffuse,u.specular=c.specular,u.shininess=c.shininess,u.tx=c.translateX,u.ty=c.translateY,u.tz=c.translateZ,u.sx=c.scaleX,u.sy=c.scaleY,u.sz=c.scaleZ,u.rx=c.rotateX,u.ry=c.rotateY,u.rz=c.rotateZ,T=Te(u.rx,u.ry,u.rz),u.quaternion=oe(u.rx,u.ry,u.rz)):(h[56]=u.ambient,h[57]=u.diffuse,h[58]=u.specular,h[59]=u.shininess,T=se(u.quaternion));const _=g.translation(u.tx,u.ty,u.tz),I=g.scaling(u.sx,u.sy,u.sz),S=g.multiply(_,g.multiply(T,I)),U=g.normalMatrix(S),O=g.multiply(g.multiply(n,s),S);h.set(O,0),h.set(S,16),h.set(U,32),h[48]=a,h[49]=l,h[50]=d,h[51]=0,h[52]=E,h[53]=y,h[54]=M,h[55]=0,h[60]=R.position[0],h[61]=R.position[1],h[62]=R.position[2],Se[63]=c.modelId,h[64]=p,h[65]=C,h[66]=P,h[67]=e,u.draw(v,ee)}v.end(),w.queue.submit([L.finish()]),requestAnimationFrame(xe)}requestAnimationFrame(xe);
