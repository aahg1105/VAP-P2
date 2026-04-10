// Shared GUI state  (read by the render loop in main.ts)
export const gui = {
  modelId:      0,
  ambient:      0.12,
  diffuse:      0.75,
  specular:     0.60,
  shininess:    32,
  translateX:       3.0,
  translateY:       4.0,
  translateZ:       3.0,
  lightX:       3.0,
  lightY:       4.0,
  lightZ:       3.0,
  autoRotLight: false,
  rotateX:       1.0,
  rotateY:       1.0,
  rotateZ:       1.0,
  scaleX:       1.0,
  scaleY:       1.0,
  scaleZ:       1.0,
  listIndex: -1,
  useText: false,
  objectColor:  "#4a9eff",
  lightColor:   "#ffffff",
};

// Colour utility
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

// Model metadata
const MODEL_DESCS: Record<number, string> = {
  0: "Flat: face normal derived from dpdx/dpdy — one colour per triangle, hard faceted edges.",
  1: "Gouraud: lighting computed per vertex in vs_main, interpolated across the face. Implement gouraudLighting() in shader.wgsl.",
  2: "Phong: smooth normals interpolated per pixel, full lighting in fs_main. Implement phongLighting() in shader.wgsl.",
  3: "Blinn-Phong: like Phong but uses half-vector H=normalize(L+V) for specular. Implement blinnPhongLighting() in shader.wgsl.",
};

// Update the auto-rotating light display
export function updateLightDisplay(lx: number, lz: number) {
  (document.getElementById("lightX") as HTMLInputElement).value = lx.toFixed(1);
  document.getElementById("lightX-val")!.textContent = lx.toFixed(1);
  (document.getElementById("lightZ") as HTMLInputElement).value = lz.toFixed(1);
  document.getElementById("lightZ-val")!.textContent = lz.toFixed(1);
}

// HTML helpers
function slider(id: string, label: string, min: number, max: number, step: number, val: number) {
  return `
  <div class="slider-row">
    <span class="slider-label">${label}</span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
    <span class="slider-val" id="${id}-val">${val}</span>
  </div>`;
}

// initGUI — build the overlay and wire up all events
// onShapeChange is called with the new shape whenever the user switches
export function initGUI(onShapeChange: (shape: "cube" | "sphere") => void) {
  const overlay = document.createElement("div");
  overlay.id = "gui";
  overlay.innerHTML = `
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
    ${slider("translateX",   "Translate X",  -12,   12,   0.05, gui.translateX)}
    ${slider("translateY",   "Translate Y",  -12,   12,   0.05, gui.translateY)}
    ${slider("translateZ",  "Translate Z", -12,   12,   0.05, gui.translateZ)}
    ${slider("rotateX",   "Rotate X",  -3.15,   3.15,   0.01, gui.rotateX)}
    ${slider("rotateY",   "Rotate Y",  -3.15,   3.15,   0.01, gui.rotateY)}
    ${slider("rotateZ",  "Rotate Z", -3.15,   3.15,   0.01, gui.rotateZ)}
    ${slider("scaleX",   "Scale X",  0.5,   6,   0.05, gui.scaleX)}
    ${slider("scaleY",   "Scale Y",  0.5,   6,   0.05, gui.scaleY)}
    ${slider("scaleZ",  "Scale Z", 0.5,   6,   0.05, gui.scaleZ)}
    <div class="color-row"><span>Object</span><input type="color" id="objectColor" value="${gui.objectColor}"></div>
  </div>

  <div class="gui-section">
    <div class="gui-label">Material</div>
    ${slider("ambient",   "Ambient (Ka)",  0,   1,   0.01, gui.ambient)}
    ${slider("diffuse",   "Diffuse (Kd)",  0,   1,   0.01, gui.diffuse)}
    ${slider("specular",  "Specular (Ks)", 0,   1,   0.01, gui.specular)}
    ${slider("shininess", "Shininess (n)", 1,   256, 1,    gui.shininess)}
    <div class="color-row"><span>Object</span><input type="color" id="objectColor" value="${gui.objectColor}"></div>
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
    <div class="color-row"><span>Light</span><input type="color" id="lightColor"  value="${gui.lightColor}"></div>
  </div>

</div>`;
  document.body.appendChild(overlay);

  // Model description
  function updateDesc() {
    document.getElementById("model-desc")!.textContent = MODEL_DESCS[gui.modelId];
  }
  updateDesc();

  // Shading model buttons
  document.querySelectorAll<HTMLButtonElement>(".model-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      gui.modelId = Number(btn.dataset.id);
      document.querySelectorAll(".model-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateDesc();
    });
  });

  // Shape buttons
  document.querySelectorAll<HTMLButtonElement>(".shape-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const shape = btn.dataset.shape as "cube" | "sphere";
      document.querySelectorAll(".shape-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("shape-desc")!.textContent =
        shape === "sphere"
          ? "Implement generateSphere() in main.ts to see the sphere."
          : "Cube is provided as a reference.";
      onShapeChange(shape);
    });
  });

  // Sliders
  (["ambient", "diffuse", "specular", "shininess", "translateX", "translateY", "translateZ", "rotateX", "rotateY", "rotateZ", "scaleX", "scaleY", "scaleZ"] as const).forEach(id => {
    const el    = document.getElementById(id) as HTMLInputElement;
    const valEl = document.getElementById(`${id}-val`)!;
    el.addEventListener("input", () => {
      (gui as Record<string, number>)[id] = parseFloat(el.value);
      valEl.textContent = el.value;
    });
  });

  // Checkboxes & colour pickers  
  (document.getElementById("objectColor") as HTMLInputElement)
    .addEventListener("input", e => { gui.objectColor = (e.target as HTMLInputElement).value; });

  (document.getElementById("lightColor") as HTMLInputElement)
    .addEventListener("input", e => { gui.lightColor = (e.target as HTMLInputElement).value; });

  const objInput = document.getElementById("file_upload") as HTMLInputElement;
  
  objInput.addEventListener("change",async (e)=>{
      const file = (e.target as HTMLInputElement).files?.[0];
      if(!file) return;

      const text = await file.text();

      // console.log(text);

      const event = new CustomEvent('modelLoaded',{detail: text});
      window.dispatchEvent(event);
  });

  const texInput = document.getElementById("texture_upload") as HTMLInputElement;
  
  texInput.addEventListener("change",async (e)=>{
      const file = (e.target as HTMLInputElement).files?.[0];
      if(!file) return;
      console.log(file);

      const event = new CustomEvent('textureLoaded',{detail: file.name});
      window.dispatchEvent(event);
  });

  const deselectBtn = overlay.querySelector(".shape-btn:not([data-shape])") as HTMLButtonElement;
  deselectBtn?.addEventListener("click", () =>{
    window.dispatchEvent(new CustomEvent("deselectObject"));
  });

  const use_texture = document.getElementById("useText");
  use_texture?.addEventListener("click", () =>{
    console.log("si");
    if(gui.useText) gui.useText = false;
    else gui.useText = true;
  });

  const deleteBtn = document.getElementById("btn-delete") as HTMLButtonElement;
  deleteBtn?.addEventListener("click", () => {
    if(gui.listIndex !== -1){
      window.dispatchEvent(new CustomEvent("deleteObject",{detail:gui.listIndex}));
      gui.listIndex = -1;
    }else{
      const optionsDesc = document.getElementById("options-desc") as HTMLButtonElement;
      optionsDesc.innerHTML = "Select an object first, to delete it";
    }
  });
}
