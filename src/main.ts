import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// --- CONFIG ---
const CHUNK_SIZE = 14;
let renderDist = 2;
let spawnAnimals = true;
let isDev = false;
let time = 1000; // Mula pada pukul 10:00 AM

// --- 12H TIME SYSTEM ---
const getTimeStr = () => {
    let h = Math.floor(time / 100);
    const m = Math.floor((time % 100) * 0.6);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // Jam 0 jadi 12
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
};

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 0.6);
sun.position.set(10, 50, 10);
scene.add(sun);

// --- FPS COUNTER ---
const fpsDisplay = document.createElement('div');
fpsDisplay.style.cssText = 'position:fixed; top:15px; left:15px; color:lime; font-family:monospace; font-size:12px; background:rgba(0,0,0,0.4); padding:4px 8px; border-radius:4px;';
document.body.appendChild(fpsDisplay);

const clock = document.createElement('div');
clock.style.cssText = 'position:fixed; top:15px; right:15px; color:white; font-family:monospace; font-size:22px; font-weight:bold; text-shadow:2px 2px 4px rgba(0,0,0,0.5);';
document.body.appendChild(clock);

// --- MATERIALS ---
const tex = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0,0,16,16);
    for(let i=0; i<32; i++){ ctx.fillStyle=`rgba(0,0,0,0.1)`; ctx.fillRect(Math.random()*16, Math.random()*16, 1,1); }
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; return t;
})();

const mats: any = {
    grass: new THREE.MeshLambertMaterial({ map: tex, color: 0x567d46 }),
    dirt: new THREE.MeshLambertMaterial({ map: tex, color: 0x5d4037 }),
    stone: new THREE.MeshLambertMaterial({ map: tex, color: 0x757575 }),
    wood: new THREE.MeshLambertMaterial({ map: tex, color: 0x8d6e63 }),
    leaves: new THREE.MeshLambertMaterial({ map: tex, color: 0x388e3c, transparent:true, opacity:0.8 }),
    sand: new THREE.MeshLambertMaterial({ map: tex, color: 0xe3c07d }),
    water: new THREE.MeshLambertMaterial({ color: 0x00aaff, transparent:true, opacity:0.6 }),
    cow: new THREE.MeshLambertMaterial({ color: 0x4b3621 }),
    sheep: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    bird: new THREE.MeshLambertMaterial({ color: 0xcccccc })
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

const genTree = (x:number, y:number, z:number) => {
    for(let i=1; i<=3; i++) addB(x, y+i, z, 'wood');
    for(let lx=-1; lx<=1; lx++) for(let lz=-1; lz<=1; lz++) for(let ly=3; ly<=4; ly++) addB(x+lx, y+ly, z+lz, 'leaves');
};

const genChunk = (cx:number, cz:number) => {
    for(let x=cx*CHUNK_SIZE; x<(cx+1)*CHUNK_SIZE; x++) {
        for(let z=cz*CHUNK_SIZE; z<(cz+1)*CHUNK_SIZE; z++) {
            const h = Math.floor(Math.sin(x*0.1)*3 + Math.cos(z*0.1)*3) + 4;
            for(let y=h-1; y<=h; y++) addB(x, y, z, y===h ? (h<3?'sand':'grass') : 'dirt');
            if (h<3) addB(x, 3, z, 'water');
            if (h>=3 && Math.random() < 0.01) genTree(x, h, z);
            if (spawnAnimals && Math.random() < 0.002) spawnA(x, h+1, z);
        }
    }
};

// --- ANIMALS ---
const animals: any[] = [];
const spawnA = (x:number, y:number, z:number) => {
    const type = ['cow', 'sheep', 'bird'][Math.floor(Math.random()*3)];
    const s = type==='bird'?0.3:0.6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(s,s,s), mats[type]);
    m.position.set(x, y, z);
    scene.add(m);
    animals.push({ m, v: new THREE.Vector3(), t: 0 });
};

// --- UI & CONTROLS ---
const inv = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand'];
let slot = 0;
const ui = document.createElement('div');
ui.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; padding:10px; background:rgba(0,0,0,0.6); border-radius:15px; backdrop-filter:blur(10px);';
document.body.appendChild(ui);

const drawUI = () => {
    ui.innerHTML = inv.map((item, i) => `
        <div style="width:50px; height:50px; background:${i===slot?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.2)'}; border:2px solid ${i===slot?'#fff':'transparent'}; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="width:22px; height:22px; background:#${mats[item].color.getHexString()}; border-radius:4px;"></div>
            <span style="font-size:10px; color:white; font-weight:bold; margin-top:2px;">${i+1}</span>
        </div>`).join('');
};
drawUI();

const ctrl = new PointerLockControls(camera, document.body);
const keys: any = {};
document.addEventListener('keydown', e => { 
    keys[e.code] = true; 
    if (e.key === '0') (window as any).toggleSet();
    if (e.key >= '1' && e.key <= '6') { slot = parseInt(e.key)-1; drawUI(); }
});
document.addEventListener('keyup', e => keys[e.code] = false);
document.addEventListener('click', () => { if(settingsMenu.style.display!=='block') ctrl.lock(); });

// --- SETTINGS ---
const settingsMenu = document.createElement('div');
settingsMenu.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); padding:25px; background:rgba(15,15,15,0.9); border-radius:20px; color:white; display:none; width:280px; font-family:sans-serif; text-align:center; z-index:100;';
settingsMenu.innerHTML = `
    <h3 style="margin-top:0">SETTINGS</h3>
    <button id="dev-btn" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:none; background:#444; color:white; font-weight:bold; cursor:pointer;">DEV MODE: OFF</button>
    <div id="dev-opts" style="display:none; margin-bottom:10px; background:rgba(255,255,255,0.05); padding:10px; border-radius:10px;">
        <div style="font-size:10px; opacity:0.5; margin-bottom:5px;">TIME CONTROL</div>
        <input type="range" id="t-range" style="width:100%" min="0" max="2400" value="1000">
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-bottom:15px;">
        ${[1,2,3,4].map(n => `<button onclick="window.saveG(${n})" style="background:#4CAF50; color:white; padding:8px; border:none; border-radius:5px; font-size:10px; cursor:pointer;">SAVE ${n}</button><button onclick="window.loadG(${n})" style="background:#666; color:white; padding:8px; border:none; border-radius:5px; font-size:10px; cursor:pointer;">LOAD ${n}</button>`).join('')}
    </div>
    <button onclick="window.toggleSet()" style="width:100%; padding:10px; background:#4CAF50; border:none; color:white; border-radius:8px; cursor:pointer; font-weight:bold;">RESUME GAME</button>
`;
document.body.appendChild(settingsMenu);

(window as any).toggleSet = () => {
    const isVisible = settingsMenu.style.display === 'block';
    settingsMenu.style.display = isVisible ? 'none' : 'block';
    if(!isVisible) ctrl.unlock(); else ctrl.lock();
};

document.getElementById('dev-btn')?.addEventListener('click', (e:any) => {
    isDev = !isDev;
    e.target.innerText = `DEV MODE: ${isDev?'ON':'OFF'}`;
    e.target.style.background = isDev ? '#4CAF50' : '#444';
    document.getElementById('dev-opts')!.style.display = isDev?'block':'none';
});

document.getElementById('t-range')?.addEventListener('input', (e:any) => { time = parseInt(e.target.value); });

(window as any).saveG = (s:number) => {
    const data = { p:camera.position.toArray(), b:Array.from(blocks.values()).map(m => ({p:m.position.toArray(), t:m.userData.type})), t:time };
    localStorage.setItem('mc_lite_'+s, JSON.stringify(data));
    alert('Game Saved to Slot '+s);
};

(window as any).loadG = (s:number) => {
    const raw = localStorage.getItem('mc_lite_'+s);
    if (!raw) return alert('Slot Empty!');
    const d = JSON.parse(raw);
    blocks.forEach(m => scene.remove(m)); blocks.clear(); chunks.clear();
    d.b.forEach((b:any) => addB(b.p[0], b.p[1], b.p[2], b.t));
    camera.position.fromArray(d.p); time = d.t;
    (window as any).toggleSet();
};

// --- GAME LOOP ---
let velY = 0, lastF = performance.now(), frames = 0;
camera.position.set(0, 10, 0);

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    frames++;
    if (now > lastF + 1000) { fpsDisplay.innerText = `FPS: ${frames}`; frames = 0; lastF = now; }

    if (ctrl.isLocked) {
        time = (time + 0.003) % 2400; // ~12-14 min per hour
        clock.innerText = getTimeStr();

        // Update Sky & Sun
        const dayInt = Math.max(0.1, Math.sin((time / 2400) * Math.PI) * 1.2);
        scene.background = new THREE.Color().setHSL(0.6, 0.5, dayInt * 0.5);
        ambient.intensity = dayInt * 0.7;
        sun.intensity = dayInt * 0.8;

        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);
        for(let x=-renderDist; x<=renderDist; x++) {
            for(let z=-renderDist; z<=renderDist; z++) {
                const k = `${cx+x},${cz+z}`;
                if(!chunks.has(k)) { genChunk(cx+x, cz+z); chunks.add(k); }
            }
        }

        // Physics
        velY -= 0.01; camera.position.y += velY;
        const ground = `${Math.round(camera.position.x)},${Math.round(camera.position.y-1.8)},${Math.round(camera.position.z)}`;
        if (blocks.has(ground)) { camera.position.y = Math.round(camera.position.y-1.8)+1.8; velY=0; if(keys['Space']) velY=0.2; }

        const speed = keys['ShiftLeft'] ? 0.22 : 0.12;
        if(keys['KeyW']) ctrl.moveForward(speed);
        if(keys['KeyS']) ctrl.moveForward(-speed);
        if(keys['KeyA']) ctrl.moveRight(-speed);
        if(keys['KeyD']) ctrl.moveRight(speed);

        // Update Animals
        animals.forEach(a => {
            if (a.t-- <= 0) { a.t = 100+Math.random()*100; a.v.set((Math.random()-0.5)*0.02, 0, (Math.random()-0.5)*0.02); }
            a.m.position.add(a.v);
        });
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
