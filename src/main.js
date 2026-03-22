import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
// --- CONFIGURATION ---
const CHUNK_SIZE = 16;
let renderDistance = 1;
let fov = 75;
let sensitivity = 1.0;
const PLAYER_HEIGHT = 1.8;
let playerSpeed = 0.12;
const JUMP_FORCE = 0.15;
const GRAVITY = 0.006;
// --- ASSETS ---
function createTexture(color) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        for (let i = 0; i < 8; i++)
            ctx.fillRect(Math.random() * 16, Math.random() * 16, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    return tex;
}
const textures = {
    grassSide: createTexture('#567d46'),
    grassTop: createTexture('#6a8c54'),
    dirt: createTexture('#5d4037'),
    stone: createTexture('#757575'),
    wood: createTexture('#8d6e63'),
    leaves: createTexture('#388e3c')
};
const materials = {
    grass: [
        new THREE.MeshStandardMaterial({ map: textures.grassSide }),
        new THREE.MeshStandardMaterial({ map: textures.grassSide }),
        new THREE.MeshStandardMaterial({ map: textures.grassTop }),
        new THREE.MeshStandardMaterial({ map: textures.dirt }),
        new THREE.MeshStandardMaterial({ map: textures.grassSide }),
        new THREE.MeshStandardMaterial({ map: textures.grassSide })
    ],
    dirt: new THREE.MeshStandardMaterial({ map: textures.dirt }),
    stone: new THREE.MeshStandardMaterial({ map: textures.stone }),
    wood: new THREE.MeshStandardMaterial({ map: textures.wood }),
    leaves: new THREE.MeshStandardMaterial({ map: textures.leaves, transparent: true, opacity: 0.8 })
};
// --- SCENE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 5, 30);
const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.DirectionalLight(0xffffff, 0.4);
sun.position.set(5, 15, 5);
scene.add(sun);
// --- WORLD LOGIC ---
const blocks = new Map();
const chunks = new Set();
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function getHeight(x, z) {
    return Math.floor(Math.sin(x * 0.15) * 2 + Math.cos(z * 0.15) * 2) + 3;
}
function addBlock(x, y, z, type) {
    const key = `${x},${y},${z}`;
    if (blocks.has(key))
        return;
    const mat = materials[type] || materials.grass;
    const mesh = new THREE.Mesh(boxGeo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    blocks.set(key, mesh);
}
function generateChunk(cx, cz) {
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
        for (let z = cz * CHUNK_SIZE; z < (cz + 1) * CHUNK_SIZE; z++) {
            const h = getHeight(x, z);
            for (let y = h - 1; y <= h; y++) {
                if (y < 0)
                    continue;
                addBlock(x, y, z, y === h ? 'grass' : 'dirt');
            }
        }
    }
}
// --- CONTROLS ---
const controls = new PointerLockControls(camera, document.body);
document.addEventListener('click', () => { if (!settingsVisible)
    controls.lock(); });
const keys = {};
document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);
let velY = 0;
let canJump = false;
camera.position.set(0, 10, 0);
// --- INTERACTION ---
const raycaster = new THREE.Raycaster();
const inventory = ['grass', 'dirt', 'stone', 'wood'];
let selectedSlot = 0;
window.addEventListener('mousedown', (e) => {
    if (!controls.isLocked)
        return;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(Array.from(blocks.values()));
    const intersect = intersects[0];
    if (intersect && intersect.distance < 6) {
        const obj = intersect.object;
        if (e.button === 0) {
            scene.remove(obj);
            blocks.delete(`${obj.position.x},${obj.position.y},${obj.position.z}`);
        }
        else if (e.button === 2 && intersect.face) {
            const pos = obj.position.clone().add(intersect.face.normal);
            const blockType = inventory[selectedSlot] || 'grass';
            addBlock(pos.x, pos.y, pos.z, blockType);
        }
    }
});
// --- UI & SETTINGS SYSTEM ---
const fpsDisplay = document.createElement('div');
fpsDisplay.style.cssText = 'position:fixed; top:10px; left:10px; color:#0f0; font-family:monospace; font-size:14px; text-shadow:1px 1px #000;';
document.body.appendChild(fpsDisplay);
const settingsMenu = document.createElement('div');
settingsMenu.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); padding:25px; background:rgba(0,0,0,0.9); border-radius:15px; color:white; font-family:sans-serif; display:none; border:2px solid #555; width:300px; box-shadow:0 0 20px rgba(0,0,0,0.5);';
settingsMenu.innerHTML = `
    <h2 style="margin:0 0 20px 0; text-align:center; color:#fff; border-bottom:1px solid #444; padding-bottom:10px;">PAUSE MENU</h2>
    
    <div style="margin-bottom:15px;">
        <label>Render Distance: <span id="rd-val">1</span></label>
        <input type="range" id="rd-range" min="0.5" max="4" step="0.5" value="1" style="width:100%">
    </div>

    <div style="margin-bottom:15px;">
        <label>Field of View (FOV): <span id="fov-val">75</span></label>
        <input type="range" id="fov-range" min="30" max="110" value="75" style="width:100%">
    </div>

    <div style="margin-bottom:15px;">
        <label>Mouse Sensitivity: <span id="sens-val">1.0</span></label>
        <input type="range" id="sens-range" min="0.1" max="2.0" step="0.1" value="1.0" style="width:100%">
    </div>

    <button id="btn-fs" style="width:100%; padding:10px; margin-bottom:10px; cursor:pointer; background:#444; color:white; border:1px solid #666; border-radius:5px;">FULLSCREEN</button>
    <button id="btn-resume" style="width:100%; padding:10px; cursor:pointer; background:#2e7d32; color:white; border:none; border-radius:5px; font-weight:bold;">RESUME (Tekan 0)</button>
`;
document.body.appendChild(settingsMenu);
let settingsVisible = false;
document.addEventListener('keydown', (e) => {
    if (e.key === '0') {
        settingsVisible = !settingsVisible;
        settingsMenu.style.display = settingsVisible ? 'block' : 'none';
        if (settingsVisible)
            controls.unlock();
        else
            controls.lock();
    }
    if (e.key >= '1' && e.key <= '4') {
        selectedSlot = parseInt(e.key) - 1;
        updateUI();
    }
});
// Event Listeners for Settings
const rdRange = document.getElementById('rd-range');
rdRange?.addEventListener('input', (e) => {
    renderDistance = parseFloat(e.target.value);
    const rdVal = document.getElementById('rd-val');
    if (rdVal)
        rdVal.innerText = e.target.value;
    if (scene.fog instanceof THREE.Fog) {
        scene.fog.far = 20 + renderDistance * 10;
    }
});
const fovRange = document.getElementById('fov-range');
fovRange?.addEventListener('input', (e) => {
    fov = parseInt(e.target.value);
    const fovVal = document.getElementById('fov-val');
    if (fovVal)
        fovVal.innerText = e.target.value;
    camera.fov = fov;
    camera.updateProjectionMatrix();
});
const sensRange = document.getElementById('sens-range');
sensRange?.addEventListener('input', (e) => {
    sensitivity = parseFloat(e.target.value);
    const sensVal = document.getElementById('sens-val');
    if (sensVal)
        sensVal.innerText = sensitivity.toFixed(1);
});
document.getElementById('btn-fs')?.addEventListener('click', () => {
    if (!document.fullscreenElement)
        document.documentElement.requestFullscreen();
    else
        document.exitFullscreen();
});
document.getElementById('btn-resume')?.addEventListener('click', () => {
    settingsVisible = false;
    settingsMenu.style.display = 'none';
    controls.lock();
});
// --- INVENTORY UI ---
const ui = document.createElement('div');
ui.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:10px; padding:10px; background:rgba(0,0,0,0.7); border-radius:10px; color:white; font-family:sans-serif; pointer-events:none; border:2px solid #555;';
document.body.appendChild(ui);
function updateUI() {
    ui.innerHTML = inventory.map((item, i) => `
        <div style="padding:10px 15px; border-radius:5px; background:${i === selectedSlot ? '#fff' : 'transparent'}; color:${i === selectedSlot ? '#000' : '#fff'}; font-weight:bold; border:1px solid #888;">
            ${i + 1}: ${item.toUpperCase()}
        </div>
    `).join('');
}
updateUI();
const crosshair = document.createElement('div');
crosshair.style.cssText = 'position:fixed; top:50%; left:50%; width:10px; height:10px; border:2px solid white; border-radius:50%; transform:translate(-50%,-50%); pointer-events:none; mix-blend-mode:difference;';
document.body.appendChild(crosshair);
// --- GAME LOOP ---
let lastTime = performance.now();
let frames = 0;
function animate() {
    requestAnimationFrame(animate);
    // FPS Counter
    frames++;
    const time = performance.now();
    if (time >= lastTime + 1000) {
        fpsDisplay.innerText = `FPS: ${frames}`;
        frames = 0;
        lastTime = time;
    }
    if (controls.isLocked) {
        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);
        const d = Math.floor(renderDistance);
        for (let x = -d; x <= d; x++) {
            for (let z = -d; z <= d; z++) {
                const key = `${cx + x},${cz + z}`;
                if (!chunks.has(key)) {
                    generateChunk(cx + x, cz + z);
                    chunks.add(key);
                }
            }
        }
        velY -= GRAVITY;
        camera.position.y += velY;
        const bx = Math.round(camera.position.x);
        const by = Math.round(camera.position.y - PLAYER_HEIGHT);
        const bz = Math.round(camera.position.z);
        if (blocks.has(`${bx},${by},${bz}`)) {
            camera.position.y = by + PLAYER_HEIGHT;
            velY = 0;
            canJump = true;
        }
        // Movement with Sprinting (Shift)
        const speed = keys['ShiftLeft'] ? playerSpeed * 1.5 : playerSpeed;
        if (keys['KeyW'])
            controls.moveForward(speed);
        if (keys['KeyS'])
            controls.moveForward(-speed);
        if (keys['KeyA'])
            controls.moveRight(-speed);
        if (keys['KeyD'])
            controls.moveRight(speed);
        if (keys['Space'] && canJump) {
            velY = JUMP_FORCE;
            canJump = false;
        }
    }
    renderer.render(scene, camera);
}
animate();
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
window.addEventListener('contextmenu', e => e.preventDefault());
//# sourceMappingURL=main.js.map