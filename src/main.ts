import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- LITE CONFIG ---
const CHUNK_SIZE = 12; // Kecilkan chunk untuk lebih laju
let renderDist = 2;
let useTextures = true;
let spawnAnimals = true;
let isDev = false;

// --- TIME SYSTEM (12-15 min per hour) ---
let time = 1200; 
const getTimeStr = () => {
    const h = Math.floor(time / 100);
    const m = Math.floor((time % 100) * 0.6);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

// --- RENDERER SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1); // Lock pixel ratio untuk performance
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

// --- SIMPLE TEXTURE ---
const tex = (() => {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,16,16);
    for(let i=0; i<32; i++){ ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.1})`; ctx.fillRect(Math.random()*16, Math.random()*16, 1,1); }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    return t;
})();

const mats: any = {
    grass: new THREE.MeshLambertMaterial({ map: tex, color: 0x567d46 }),
    dirt: new THREE.MeshLambertMaterial({ map: tex, color: 0x5d4037 }),
    stone: new THREE.MeshLambertMaterial({ map: tex, color: 0x757575 }),
    wood: new THREE.MeshLambertMaterial({ map: tex, color: 0x8d6e63 }),
    leaves: new THREE.MeshLambertMaterial({ map: tex, color: 0x388e3c, transparent:true, opacity:0.8 }),
    sand: new THREE.MeshLambertMaterial({ map: tex, color: 0xe3c07d }),
    water: new THREE.MeshLambertMaterial({ color: 0x00aaff, transparent:true, opacity:0.6 })
};

// --- WORLD GEN ---
const blocks = new Map();
const chunks = new Set();
const box = new THREE.BoxGeometry(1, 1, 1);

const addB = (x:number, y:number, z:number, type:string) => {
    const k = `${x},${y},${z}`;
    if (blocks.has(k)) return;
    const m = new THREE.Mesh(box, mats[type]);
    m.position.set(x,y,z);
    m.userData.type = type;
    scene.add(m);
    blocks.set(k, m);
};

const genChunk = (cx:number, cz:number) => {
    for(let x=cx*CHUNK_SIZE; x<(cx+1)*CHUNK_SIZE; x++) {
        for(let z=cz*CHUNK_SIZE; z<(cz+1)*CHUNK_SIZE; z++) {
            const h = Math.floor(Math.sin(x*0.1)*2 + Math.cos(z*0.1)*2) + 4;
            for(let y=0; y<=h; y++) addB(x, y, z, y===h ? (h<3?'sand':'grass') : 'dirt');
            if (h<3) addB(x, 3, z, 'water');
        }
    }
};

// --- UI & INVENTORY ---
const inv = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand'];
let slot = 0;
const ui = document.createElement('div');
ui.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; padding:10px; background:rgba(0,0,0,0.6); border-radius:15px; backdrop-filter:blur(10px);';
document.body.appendChild(ui);

const drawUI = () => {
    ui.innerHTML = inv.map((item, i) => `
        <div style="width:45px; height:45px; background:${i===slot?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.2)'}; border:2px solid ${i===slot?'#fff':'transparent'}; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="width:20px; height:20px; background:#${mats[item].color.getHexString()}; border-radius:3px;"></div>
            <span style="font-size:10px; color:white; font-weight:bold;">${i+1}</span>
        </div>`).join('');
};
drawUI();

const clock = document.createElement('div');
clock.style.cssText = 'position:fixed; top:20px; right:20px; color:white; font-family:monospace; font-size:22px; font-weight:bold;';
document.body.appendChild(clock);

// --- CONTROLS ---
const ctrl = new PointerLockControls(camera, document.body);
const keys: any = {};
document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.key === '0') toggleSet();
    if (e.key >= '1' && e.key <= '6') { slot = parseInt(e.key)-1; drawUI(); }
});
document.addEventListener('keyup', e => keys[e.code] = false);
document.addEventListener('click', () => { if(settingsMenu.style.display!=='block') ctrl.lock(); });

// --- SETTINGS & SAVE ---
const settingsMenu = document.createElement('div');
settingsMenu.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); padding:25px; background:rgba(15,15,15,0.9); border-radius:20px; color:white; display:none; width:280px; font-family:sans-serif; text-align:center;';
settingsMenu.innerHTML = `
    <h3 style="margin-top:0">SETTINGS</h3>
    <button id="dev-btn" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:none; background:#444; color:white;">DEV MODE: OFF</button>
    <div id="dev-opts" style="display:none; margin-bottom:10px; background:rgba(255,255,255,0.05); padding:10px; border-radius:10px;">
        <button id="rain-btn" style="width:100%; padding:8px; margin-bottom:5px;">RAIN: OFF</button>
        <input type="range" id="t-range" style="width:100%" min="0" max="2400" value="1200">
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:4px; margin-bottom:15px;">
        ${[1,2,3,4].map(n => `<button onclick="window.saveG(${n})" style="background:#4CAF50; color:white; padding:8px; border:none; border-radius:5px; font-size:10px;">S${n}</button><button onclick="window.loadG(${n})" style="background:#666; color:white; padding:8px; border:none; border-radius:5px; font-size:10px;">L${n}</button>`).join('')}
    </div>
    <button onclick="window.toggleSet()" style="width:100%; padding:10px; background:#4CAF50; border:none; color:white; border-radius:8px;">RESUME</button>
`;
document.body.appendChild(settingsMenu);

(window as any).toggleSet = () => {
    const s = settingsMenu.style.display === 'block';
    settingsMenu.style.display = s ? 'none' : 'block';
    if(!s) ctrl.unlock(); else ctrl.lock();
};

document.getElementById('dev-btn')?.addEventListener('click', (e:any) => {
    isDev = !isDev;
    e.target.innerText = `DEV MODE: ${isDev?'ON':'OFF'}`;
    document.getElementById('dev-opts')!.style.display = isDev?'block':'none';
});

(window as any).saveG = (s:number) => {
    const data = { p:camera.position.toArray(), b:Array.from(blocks.values()).map(m => ({p:m.position.toArray(), t:m.userData.type})), t:time };
    localStorage.setItem('mc_lite_'+s, JSON.stringify(data));
    alert('Saved to Slot '+s);
};

(window as any).loadG = (s:number) => {
    const raw = localStorage.getItem('mc_lite_'+s);
    if (!raw) return;
    const d = JSON.parse(raw);
    blocks.forEach(m => scene.remove(m)); blocks.clear(); chunks.clear();
    d.b.forEach((b:any) => addB(b.p[0], b.p[1], b.p[2], b.t));
    camera.position.fromArray(d.p); time = d.t;
    (window as any).toggleSet();
};

// --- GAME LOOP ---
let velY = 0;
camera.position.set(0, 10, 0);

function animate() {
    requestAnimationFrame(animate);
    if (ctrl.isLocked) {
        time = (time + 0.002) % 2400; // ~14 min per hour
        clock.innerText = getTimeStr();

        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);
        for(let x=-renderDist; x<=renderDist; x++) {
            for(let z=-renderDist; z<=renderDist; z++) {
                const k = `${cx+x},${cz+z}`;
                if(!chunks.has(k)) { genChunk(cx+x, cz+z); chunks.add(k); }
            }
        }

        velY -= 0.01;
        camera.position.y += velY;
        const ground = `${Math.round(camera.position.x)},${Math.round(camera.position.y-1.8)},${Math.round(camera.position.z)}`;
        if (blocks.has(ground)) { camera.position.y = Math.round(camera.position.y-1.8)+1.8; velY=0; if(keys['Space']) velY=0.2; }

        const s = keys['ShiftLeft'] ? 0.2 : 0.1;
        if(keys['KeyW']) ctrl.moveForward(s);
        if(keys['KeyS']) ctrl.moveForward(-s);
        if(keys['KeyA']) ctrl.moveRight(-s);
        if(keys['KeyD']) ctrl.moveRight(s);
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
