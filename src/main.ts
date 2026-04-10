/// <reference types="@webgpu/types" />

import "./style.css";
import shaderCode from "./shader.wgsl?raw";
import { Camera } from "./camera";
import { mat4 } from "./math";
import type { Vec3 } from "./math";
import { gui, hexToRgb, initGUI, updateLightDisplay } from "./gui";
import { objectGUI } from "./cube";
import {arcball,mouse_click,mouse_motion,mouse_release,get_current_rotation, set_last_rotation, last_quaternions, updateArcball, set_arcball_state} from "./temp"

//WebGPU init
if (!navigator.gpu) throw new Error("WebGPU not supported");

const canvas = document.querySelector("#gfx-main") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas #gfx-main not found");

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error("No GPU adapter found");

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu")!;
const format  = navigator.gpu.getPreferredCanvasFormat();

let depthTexture: GPUTexture | null = null;

function resize() {
  canvas.width  = Math.max(1, Math.floor(window.innerWidth  * devicePixelRatio));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * devicePixelRatio));
  context.configure({ device, format, alphaMode: "premultiplied" });
  depthTexture?.destroy();
  depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}
resize();
window.addEventListener("resize", resize);

// ─────────────────────────────────────────────────────────────────────────────
// Vertex format: [x, y, z,  nx, ny, nz,  u, v]
//                 position    normal       uv
// stride = 8 floats = 32 bytes
// ─────────────────────────────────────────────────────────────────────────────

// ── Cube geometry ───────────────────────────────────────────────
// Each face is 2 triangles
// Normals are constant per face so flat and smooth shading look identical on a cube.

let isDown = false;
let lastX = 0;
let lastY = 0;

function getNDC(clientX: number, clientY: number){
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / rect.width) * 2;
  return {x,y};
}

canvas.addEventListener("mousedown", (e) =>{
  isDown = true;
  const ndc = getNDC(e.clientX, e.clientY);
  mouse_click(ndc.x, ndc.y);
});

window.addEventListener("mouseup", () =>{
  if(isDown){
    mouse_release();
    isDown = false;
  }
});

canvas.addEventListener("mousemove", (e) => {
  if(!isDown) return;

  const ndc = getNDC(e.clientX, e.clientY);
  mouse_motion(ndc.x,ndc.y);
});

function generateCube(): Float32Array {
  const faces: Array<{ n: Vec3; verts: number[][] }> = [
    { n: [ 0,  0,  1], verts: [[-1,-1, 1,0,1],[1,-1, 1,1,1],[1, 1, 1,1,0],[-1,-1, 1,0,1],[1, 1, 1,1,0],[-1, 1, 1,0,0]] },
    { n: [ 0,  0, -1], verts: [[ 1,-1,-1,0,1],[-1,-1,-1,1,1],[-1, 1,-1,1,0],[1,-1,-1,0,1],[-1, 1,-1,1,0],[1, 1,-1,0,0]] },
    { n: [-1,  0,  0], verts: [[-1,-1,-1,0,1],[-1,-1, 1,1,1],[-1, 1, 1,1,0],[-1,-1,-1,0,1],[-1, 1, 1,1,0],[-1, 1,-1,0,0]] },
    { n: [ 1,  0,  0], verts: [[ 1,-1, 1,0,1],[ 1,-1,-1,1,1],[ 1, 1,-1,1,0],[1,-1, 1,0,1],[1, 1,-1,1,0],[1, 1, 1,0,0]] },
    { n: [ 0,  1,  0], verts: [[-1, 1, 1,0,1],[ 1, 1, 1,1,1],[ 1, 1,-1,1,0],[-1, 1, 1,0,1],[1, 1,-1,1,0],[-1, 1,-1,0,0]] },
    { n: [ 0, -1,  0], verts: [[-1,-1,-1,0,1],[ 1,-1,-1,1,1],[ 1,-1, 1,1,0],[-1,-1,-1,0,1],[1,-1, 1,1,0],[-1,-1, 1,0,0]] },
  ];

  const data: number[] = [];
  for (const face of faces) {
    let count = 0;
    for (const v of face.verts) {
      data.push(v[0], v[1], v[2]);// position
      data.push(...face.n); // normal (same for all verts on a face)
      data.push(v[3], v[4]);// uv

      if(count%3===0) data.push(1,0,0);
      else if(count%3===1) data.push(0,1,0);
      else data.push(0,0,1);

      count++;
    }
  }
  return new Float32Array(data);
}

function generateSphere(stacks: number, slices: number): Float32Array {

  const data: number[] = [];

  for (let i = 0; i < stacks; i++) {
    for (let j = 0; j < slices; j++) {

      const coords = [[i, j],[i+1, j],[i, j+1],[i+1, j+1]]; // 4 vertex necessary for each quad from the latitude / longitude grid

      const verts = coords.map(([ii, jj]) => {

        let phi = Math.PI * ii / stacks; // from the top to the botton
        let theta = 2 * Math.PI * jj / slices; // around y axis

        let x = Math.sin(phi) * Math.cos(theta);
        let y = Math.cos(phi);
        let z = Math.sin(phi) * Math.sin(theta);

        let u = jj / slices;
        let v = ii / stacks;

        return [x,y,z,x,y,z,u,v];
      });

      const [A,B,C,D] = verts;

      // push the two triangles needed for the quad
      // data.push(...A,...B,...C);
      // data.push(...C,...B,...D);

      data.push(...A,1,0,0);
      data.push(...B,0,1,0);
      data.push(...C,0,0,1);

      data.push(...C,1,0,0);
      data.push(...B,0,1,0);
      data.push(...D,0,0,1);
    }
  }

  return new Float32Array(data);
}

// /* yo
const objects: objectGUI[] = [];

function createCube(){
  const data = generateCube();
  const cube = new objectGUI(device,data,"Cube",pipeline,sampler,texture);

  cube.tx = objects.length * 3;
  objects.push(cube);
}

function createSphere(){
  const data = generateSphere(64,64);
  const sphere = new objectGUI(device,data,"Sphere",pipeline,sampler,texture);

  sphere.tx = objects.length * 3;
  objects.push(sphere);
}
// yo */

// Geometry buffers — rebuilt when the user switches shape
let activeShape: "cube" | "sphere" = "cube";

function buildVertexBuffer(shape: "cube" | "sphere"): { buf: GPUBuffer; count: number } {
  const data = shape === "cube" ? generateCube() : generateSphere(64, 64);
  const buf = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buf, 0, data as any);
  return { buf, count: data.length / 11 };
}

// let { buf: vertexBuffer, count: vertexCount } = buildVertexBuffer("cube");
const cubeBuffer = buildVertexBuffer("cube");
const sphereBuffer = buildVertexBuffer("sphere");


// Uniform buffer  structure
//
// Layout (byte offsets):
//   0   mvp        mat4   64 B
//   64  model      mat4   64 B
//   128 normalMat  mat4   64 B
//   192 lightPos   vec3   12 B  + 4 pad
//   208 lightColor vec3   12 B  + 4 pad
//   224 ambient    f32     4 B
//   228 diffuse    f32     4 B
//   232 specular   f32     4 B
//   236 shininess  f32     4 B
//   240 camPos     vec3   12 B
//   252 model_id   u32     4 B  ← packed with camPos pad
//   256 objectColor vec3  12 B
//   268 time       f32     4 B
// ─────────────────────────────────────────────────────────────────────────────
const UNIFORM_SIZE = 288;

const uniformBuffer = device.createBuffer({
  size: UNIFORM_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const uArrayBuf = new ArrayBuffer(UNIFORM_SIZE);
const uData     = new Float32Array(uArrayBuf);
const uData32   = new Uint32Array(uArrayBuf);

// Pipeline
const shader = device.createShaderModule({ label: "Lighting Shader", code: shaderCode });

const pipeline = device.createRenderPipeline({
  label: "Lighting Pipeline",
  layout: "auto",
  vertex: {
    module: shader,
    entryPoint: "vs_main",
    buffers: [{
      arrayStride: 11 * 4,
      attributes: [
        { shaderLocation: 0, offset: 0,     format: "float32x3" }, // position
        { shaderLocation: 1, offset: 3 * 4, format: "float32x3" }, // normal
        { shaderLocation: 2, offset: 6 * 4, format: "float32x2" }, // uv
        { shaderLocation: 3, offset: 8 * 4, format: "float32x3" }, // barycentric
      ],
    }],
  },
  fragment: { module: shader, entryPoint: "fs_main", targets: [{ format }] },
  primitive: { topology: "triangle-list", cullMode: "back" },
  depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
});

/*
const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
});*/

// let index: number;

// /* yo
function add_object(){
  const list = document.getElementById('list_objects');
  if(!list) return;

  list.innerHTML = `<div class="gui-label">Objects</div>`

  for(let i=0;i<objects.length;i++){
    const name = `${i+1}. ${objects[i].tag}`;;

    const element = document.createElement("div");
    element.className = "model-btns";
    element.innerHTML = `<button class="shape-btn-options" data-shape="cube">${name}</button>`;
    element.id = `btn-${i}`;

    element.onclick = () =>{
      for(let i=0;i<objects.length;i++){
        const tmp = `btn-${i}`;
        const prov = document.getElementById(tmp);
        if(prov){
          prov.className = "model-btns";
        }
      }
      gui.listIndex = i;
      element.className = "model-btns-active";
      camera.position = [objects[i].tx,objects[i].ty,objects[i].tz];
      console.log("id: ",gui.listIndex);
      
      gui.ambient = objects[i].ambient;
      gui.diffuse = objects[i].diffuse;
      gui.specular = objects[i].specular;
      gui.shininess = objects[i].shininess;

      gui.translateX = objects[i].tx;
      gui.translateY = objects[i].ty;
      gui.translateZ = objects[i].tz;

      gui.rotateX = objects[i].rx;
      gui.rotateY = objects[i].ry;
      gui.rotateZ = objects[i].rz;

      gui.scaleX = objects[i].sx;
      gui.scaleY = objects[i].sy;
      gui.scaleZ = objects[i].sz;

      // set_last_rotation([objects[i].rx,objects[i].ry,objects[i].rz]);
      set_arcball_state(objects[i].quaternion);
    };

    list.appendChild(element);
  }
}

let modelName: string;

function parseOBJ(text: string): Float32Array{
  const positions: number[][] = []; // x,y,z
  const normals: number[][] = []; // nx,ny,nz
  const uvs: number[][] = []; //u,v
  const final: number[] = [];

  const lines = text.split("\n"); // arreglo de lineas del .obj

  for(let line of lines){
    line = line.trim(); 
    const parts = line.split(/\s+/); // ?
    const type = parts[0];
    
    if(type === "v"){ // vertice normal
      positions.push([parseFloat(parts[1]),parseFloat(parts[2]),parseFloat(parts[3])]);
    }
    else if(type === "o"){
      modelName = parts[1];
    }
    else if(type === "vn"){ // normal
      normals.push([parseFloat(parts[1]),parseFloat(parts[2]),parseFloat(parts[3])]);
    }
    else if(type === "vt"){ // textura (u,v)
      uvs.push([parseFloat(parts[1]),parseFloat(parts[2]),parseFloat(parts[3])]);
    }
    else if(type === "f"){ // cara (triangulos)
      for(let i=1;i<=3;i++){
        const specs = parts[i].split("/");

        const vIdx = parseInt(specs[0]) - 1; // vertice
        const tIdx = specs[1] ? parseInt(specs[1])-1 : -1; // texture
        const nIdx = specs[2] ? parseInt(specs[2])-1 : -1; // normal

        const v1 = positions[parseInt(parts[1].split("/")[0])-1];
        const v2 = positions[parseInt(parts[2].split("/")[0])-1];
        const v3 = positions[parseInt(parts[3].split("/")[0])-1];

        const e1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
        const e2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];

        const dot = [e1[1] * e2[2] - e1[2] * e2[1],e1[2] * e2[0] - e1[0] * e2[2],e1[0]*e2[1] - e1[1]*e2[0]];
        
        const l = Math.sqrt(dot[0]**2 + dot[1]**2 + dot[2]**2);
        const normalized = [dot[0]/l, dot[1]/l, dot[2]/l];

        final.push(...positions[vIdx]);

        if(nIdx >= 0) final.push(...normals[nIdx]);
        else final.push(...normalized);

        if(tIdx >= 0 && uvs[tIdx]) final.push(uvs[tIdx][0], 1.0 - uvs[tIdx][1]);
        else{
          const pos = positions[vIdx];
          const r = Math.sqrt(pos[0]**2 + pos[1]**2 + pos[2]**2);

          const t = Math.atan2(pos[2],pos[0]);
          const p = Math.acos(pos[1] / r);

          const u = (t + Math.PI) / (2*Math.PI);
          const v = p/Math.PI;

          final.push(u,v);
        }

        if(i===1){
          final.push(1,0,0);
        }
        else if(i===2){
          final.push(0,1,0);
        }
        else if(i===3){
          final.push(0,0,1);
        }

      }
    }
  }

  return normalize(new Float32Array(final),modelName);
}

function normalize(data: Float32Array, name: string): Float32Array{
  let cx: number, cy: number, cz: number, scale: number;
  const n = name.toLowerCase();

  if(n.includes("beacon")){
    cx = 125; cy = 125; cz = 125;
    scale = 1 / 125;
  }
  else if(n.includes("teapot")){
    cx = 0.217; cy = 1.575; cz = 0.;
    const maxBoxX  = 3.434 + 3;
    const maxBoxY  = 3.15 - 0;
    const maxBoxZ  = 2.0 + 2;
    scale = 1 / Math.max(maxBoxX,maxBoxY,maxBoxZ);
  }
  /*
  else if(n.includes("teapotnormals")){
    cx = 0.217; cy = 1.575; cz = 0.;
    const maxBoxX  = 3.434 + 3;
    const maxBoxY  = 3.15 - 0;
    const maxBoxZ  = 2.0 + 2;
    scale = 1 / Math.max(maxBoxX,maxBoxY,maxBoxZ);
  }
    */

  else{
    return data;
  }

  for(let i=0;i<data.length;i+=11){
    data[i+0] = (data[i+0] - cx) * scale;
    data[i+1] = (data[i+1] - cy) * scale;
    data[i+2] = (data[i+2] - cz) * scale;
  }

  return data;
}

const sampler = device.createSampler({ // reglas para leer textura
  magFilter: "linear",
  minFilter: "linear",
  addressModeU: "repeat", 
  addressModeV: "repeat",
});

async function loadTextureOrCheckerboard(url: string): Promise<GPUTexture> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    const blob = await res.blob(); // ? blop
    const image = await createImageBitmap(blob, { colorSpaceConversion: "none" });

    const tex = device.createTexture({
      size: [image.width, image.height, 1], // 2-D coordinate
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT, // safe, avoids Dawn validation issues
    });


    device.queue.copyExternalImageToTexture(
      { source: image },
      { texture: tex },
      [image.width, image.height]
    );
    console.log("primero");

    return tex;
  } catch (err) {
    console.warn("Texture load failed, using checkerboard fallback:", err);

    const w = 128;
    const h = 128;
    // textura checkerboard
    const data = new Uint8Array(w * h * 4); // x4 por RGBA

    // ?
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const checker = ((x >> 4) & 1) ^ ((y >> 4) & 1);
        const c = checker ? 230 : 35; // ? porque entre 230 y 35
        // define pixel
        data[i + 0] = c;
        data[i + 1] = c;
        data[i + 2] = c;
        data[i + 3] = 255;
      }
    }

    const tex = device.createTexture({
      size: [w, h, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // 128 * 4 = 512 (multiple of 256, valid bytesPerRow)
    device.queue.writeTexture(
      { texture: tex },
      data,
      { bytesPerRow: w * 4, rowsPerImage: h },
      [w, h, 1]
    );

    console.log("segundo");

    return tex;
  }
}

function checkerBoard(){
  const w = 128;
    const h = 128;
    // textura checkerboard
    const data = new Uint8Array(w * h * 4); // x4 por RGBA

    // ?
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const checker = ((x >> 4) & 1) ^ ((y >> 4) & 1);
        const c = checker ? 230 : 35; // ? porque entre 230 y 35
        // define pixel
        data[i + 0] = c;
        data[i + 1] = c;
        data[i + 2] = c;
        data[i + 3] = 255;
      }
    }

    const tex = device.createTexture({
      size: [w, h, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // 128 * 4 = 512 (multiple of 256, valid bytesPerRow)
    device.queue.writeTexture(
      { texture: tex },
      data,
      { bytesPerRow: w * 4, rowsPerImage: h },
      [w, h, 1]
    );

    console.log("segundo");

    return tex;
}

let texture = checkerBoard();
let temp = checkerBoard();

async function load(url: string) {
  texture = await loadTextureOrCheckerboard(url);
}

window.addEventListener('textureLoaded', async (e: any) => {
  const address = e.detail;

  console.log(address);

  let fullname = address;

  texture = await loadTextureOrCheckerboard(fullname);
});

window.addEventListener('modelLoaded', (e: any) => {
  const objText = e.detail;
  console.log(objText);
  const data = parseOBJ(objText);

  const objModel = new objectGUI(device,data,modelName,pipeline,sampler,texture);

  objModel.tx = objects.length * 3;

  objects.push(objModel);
  add_object();
});

window.addEventListener('deleteObject', (e:any) => {
  const index = e.detail;

  if(index >=0 && index < objects.length){
    objects.splice(index,1);

    add_object();

    console.log("deleted");
    set_arcball_state(globalQuaternion);
  }
});

window.addEventListener('deselectObject', (e:any) => {
  const name = `btn-${gui.listIndex}`;
  const btnD = document.getElementById(name);
  if(btnD){
    btnD.className = "model-btns";
  }

  gui.listIndex = -1;
  camera.position = [0, 0, 10];
  set_arcball_state(globalQuaternion);
});

// yo */

// GUI
initGUI(shape => {
  // vertexBuffer.destroy();

  // ({ buf: vertexBuffer, count: vertexCount } = buildVertexBuffer(shape));
  if(shape === "cube") createCube();
  else if(shape === "sphere") createSphere();

  add_object();
});

// Camera
const camera = new Camera();
camera.position = [0, 0, 10];
const keys = new Set<string>();
window.addEventListener("keydown", e => keys.add(e.key));
window.addEventListener("keyup",   e => keys.delete(e.key));

let globalQuaternion: number[] = [1, 0, 0, 0];

// Render loop
let lastTime    = performance.now();
const startTime = performance.now();

let zoom = 10;
const minZoom = 1;
const maxZoom = 100;

canvas.addEventListener("wheel", (e) =>{
  e.preventDefault(); 
  const speed = 0.01;
  zoom += e.deltaY * speed;

  zoom = Math.max(minZoom,Math.min(maxZoom,zoom));
});

function frame(now: number) {
  console.log(objects.length);

  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  const t  = (now - startTime) / 1000;

  // camera.update(keys, dt);
  camera.position[2] = zoom;

  const aspect = canvas.width / canvas.height;
  const proj   = mat4.perspective((60 * Math.PI) / 180, aspect, 0.1, 100);
  let view   = camera.getViewMatrix();

  if(gui.listIndex === -1){
    globalQuaternion = last_quaternions(0,0,0);
  }

  const world = updateArcball(globalQuaternion);

  view = mat4.multiply(view,world);

  const model  = mat4.identity();
  const normM  = mat4.normalMatrix(model);
  const mvp    = mat4.multiply(mat4.multiply(proj, view), model);

  let lx = gui.lightX, ly = gui.lightY, lz = gui.lightZ;
  if (gui.autoRotLight) {
    lx = Math.cos(t * 0.8) * 4.5;
    lz = Math.sin(t * 0.8) * 4.5;
    updateLightDisplay(lx, lz);
  }

  const [or, og, ob] = hexToRgb(gui.objectColor);
  const [lr, lg, lb] = hexToRgb(gui.lightColor);

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      clearValue: { r: 0.08, g: 0.08, b: 0.12, a: 1 },
      loadOp: "clear", storeOp: "store",
    }],
    depthStencilAttachment: {
      view: depthTexture!.createView(),
      depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store",
    },
  });

  pass.setPipeline(pipeline);
  //pass.setBindGroup(0, bindGroup);
  // pass.setVertexBuffer(0, vertexBuffer);
  // pass.draw(vertexCount);

  for(let i=0;i<objects.length;i++){
    const obj = objects[i];
    let R: Float32Array;
    if(gui.useText) obj.update(sampler,texture,pipeline);
    else obj.update(sampler,temp,pipeline);

    // look At 
    // se comparten las cosas
    // subir en git hub

    if(i==gui.listIndex){
      uData[56] = gui.ambient; uData[57] = gui.diffuse;  uData[58] = gui.specular; uData[59] = gui.shininess;
      obj.ambient = gui.ambient;
      obj.diffuse = gui.diffuse;
      obj.specular = gui.specular;
      obj.shininess = gui.shininess;
      
      obj.tx = gui.translateX; obj.ty = gui.translateY; obj.tz = gui.translateZ;
      obj.sx = gui.scaleX; obj.sy = gui.scaleY; obj.sz = gui.scaleZ;
      obj.rx = gui.rotateX; obj.ry = gui.rotateY; obj.rz = gui.rotateZ;

      R = arcball(obj.rx,obj.ry,obj.rz);
      obj.quaternion = last_quaternions(obj.rx,obj.ry,obj.rz);
    }
    else{
      uData[56] = obj.ambient; uData[57] = obj.diffuse;  uData[58] = obj.specular; uData[59] = obj.shininess;

      R = updateArcball(obj.quaternion);
    }

    const T = mat4.translation(obj.tx, obj.ty, obj.tz);
    const S = mat4.scaling(obj.sx,obj.sy,obj.sz);

    /*
    const Rx = mat4.rotationX(obj.rx);
    const Ry = mat4.rotationY(obj.ry);
    const Rz = mat4.rotationZ(obj.rz);

    const R = mat4.multiply(Rz,mat4.multiply(Ry,Rx));
    */
    
    const model = mat4.multiply(T,mat4.multiply(R,S));

    const normM = mat4.normalMatrix(model);
    const mvp = mat4.multiply(mat4.multiply(proj,view),model);

    uData.set(mvp,   0);
    uData.set(model, 16);
    uData.set(normM, 32);

    uData[48] = lx;          uData[49] = ly;          uData[50] = lz; uData[51] = 0;
    uData[52] = lr;          uData[53] = lg;           uData[54] = lb; uData[55] = 0;

    uData[60] = camera.position[0]; uData[61] = camera.position[1]; uData[62] = camera.position[2];
    uData32[63] = gui.modelId;//<-must be u32 bits
    uData[64] = or; uData[65] = og; uData[66] = ob;
    uData[67] = t;

    obj.draw(pass,uArrayBuf);
  }

  pass.end();

  device.queue.submit([encoder.finish()]);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
