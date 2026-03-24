import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { PerlinNoise } from './noise.js';

// --- CONFIG ---
let CHUNK_SIZE = 14;
let CHUNK_HEIGHT = 32;
let renderDist = 2;
let useTextures = true;
let isDev = false;
let time = 1000; 

const resetWorld = () => {
    world.clear();
    chunkGroups.forEach(g => scene.remove(g));
    chunkGroups.clear();
    const cx = Math.floor(camera.position.x / CHUNK_SIZE);
    const cz = Math.floor(camera.position.z / CHUNK_SIZE);
    for(let x=-renderDist; x<=renderDist; x++) {
        for(let z=-renderDist; z<=renderDist; z++) {
            genChunk(cx+x, cz+z);
        }
    }
};

enum BlockType {
    AIR = 0,
    GRASS = 1,
    DIRT = 2,
    STONE = 3,
    WOOD = 4,
    LEAVES = 5,
    SAND = 6,
    WATER = 7
}

const idToName: Record<number, string> = {
    [BlockType.GRASS]: 'grass',
    [BlockType.DIRT]: 'dirt',
    [BlockType.STONE]: 'stone',
    [BlockType.WOOD]: 'wood',
    [BlockType.LEAVES]: 'leaves',
    [BlockType.SAND]: 'sand',
    [BlockType.WATER]: 'water'
};

const mats: Record<string, THREE.MeshLambertMaterial> = {}; // Initialized later

// --- GLOBAL STATE ---
let isGameStarted = false;
let isSettingsOpen = false;
let isFlying = false;
let spaceTimer: any = null;
const world = new Map<string, Uint8Array>();
const chunkGroups = new Map<string, THREE.Group>();
const box = new THREE.BoxGeometry(1, 1, 1);
const noise = new PerlinNoise();
const tempMatrix = new THREE.Matrix4();
const homeScreen = document.createElement('div');
const settingsScreen = document.createElement('div');

// --- 12H TIME SYSTEM ---
const getTimeStr = () => {
    let h = Math.floor(time / 100);
    const m = Math.floor((time % 100) * 0.6);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; h = h ? h : 12;
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

// --- MATERIALS & TEXTURE ---
const tex = (() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16;
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0,0,16,16);
    for(let i=0; i<32; i++){ ctx.fillStyle=`rgba(0,0,0,0.1)`; ctx.fillRect(Math.random()*16, Math.random()*16, 1,1); }
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; return t;
})();

mats['grass'] = new THREE.MeshLambertMaterial({ map: tex, color: 0x567d46 });
mats['dirt'] = new THREE.MeshLambertMaterial({ map: tex, color: 0x5d4037 });
mats['stone'] = new THREE.MeshLambertMaterial({ map: tex, color: 0x757575 });
mats['wood'] = new THREE.MeshLambertMaterial({ map: tex, color: 0x8d6e63 });
mats['leaves'] = new THREE.MeshLambertMaterial({ map: tex, color: 0x388e3c, transparent:true, opacity:0.8 });
mats['sand'] = new THREE.MeshLambertMaterial({ map: tex, color: 0xe3c07d });
mats['water'] = new THREE.MeshLambertMaterial({ color: 0x00aaff, transparent:true, opacity:0.6 });

// --- WORLD LOGIC ---
const getChunkCoord = (x: number, z: number) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    return {
        cx: Math.floor(ix / CHUNK_SIZE),
        cz: Math.floor(iz / CHUNK_SIZE),
        rx: ((ix % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        rz: ((iz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    };
};

const getBlock = (x: number, y: number, z: number): number => {
    const iy = Math.floor(y);
    if (iy < 0 || iy >= CHUNK_HEIGHT) return BlockType.AIR;
    const { cx, cz, rx, rz } = getChunkCoord(x, z);
    const chunk = world.get(`${cx},${cz}`);
    if (!chunk) return BlockType.AIR;
    return chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + iy] || BlockType.AIR;
};

const meshChunk = (cx: number, cz: number) => {
    const key = `${cx},${cz}`;
    const chunk = world.get(key);
    if (!chunk) return;

    let group = chunkGroups.get(key);
    if (group) { group.clear(); } 
    else {
        group = new THREE.Group();
        group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        scene.add(group);
        chunkGroups.set(key, group);
    }

    const typeCounts: Record<number, number> = {};
    for (let i = 0; i < chunk.length; i++) {
        const type = chunk[i]!;
        if (type !== BlockType.AIR) typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    for (const [typeStr, count] of Object.entries(typeCounts)) {
        const type = parseInt(typeStr);
        const name = idToName[type]!;
        const mesh = new THREE.InstancedMesh(box, mats[name]!, count);
        let idx = 0;
        for (let rx = 0; rx < CHUNK_SIZE; rx++) {
            for (let rz = 0; rz < CHUNK_SIZE; rz++) {
                for (let ry = 0; ry < CHUNK_HEIGHT; ry++) {
                    if (chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + ry] === type) {
                        tempMatrix.setPosition(rx, ry, rz);
                        mesh.setMatrixAt(idx++, tempMatrix);
                    }
                }
            }
        }
        group.add(mesh);
    }
};

const genChunk = (cx: number, cz: number) => {
    const key = `${cx},${cz}`;
    if (world.has(key)) return;
    const chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    world.set(key, chunk);

    for (let rx = 0; rx < CHUNK_SIZE; rx++) {
        for (let rz = 0; rz < CHUNK_SIZE; rz++) {
            const x = cx * CHUNK_SIZE + rx;
            const z = cz * CHUNK_SIZE + rz;
            const n = noise.noise(x * 0.05, z * 0.05, 0) * 6 + noise.noise(x * 0.1, z * 0.1, 100) * 3;
            const h = Math.floor(n + 6);

            for (let y = 0; y <= h && y < CHUNK_HEIGHT; y++) {
                let type = BlockType.STONE;
                if (y === h) type = h < 4 ? BlockType.SAND : BlockType.GRASS;
                else if (y > h - 3) type = BlockType.DIRT;
                chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] = type;
            }

            if (h < 4) {
                for (let y = h + 1; y <= 3; y++) {
                    chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] = BlockType.WATER;
                }
            }

            if (h >= 4 && Math.random() < 0.015) {
                const th = 4 + Math.floor(Math.random() * 2);
                for(let ty=1; ty<=th; ty++) {
                    const tyy = h + ty;
                    if (tyy < CHUNK_HEIGHT) chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + tyy] = BlockType.WOOD;
                }
                for(let lx=-2; lx<=2; lx++) {
                    for(let lz=-2; lz<=2; lz++) {
                        for(let ly=th-1; ly<=th+1; ly++) {
                            const tyy = h + ly;
                            if (tyy >= CHUNK_HEIGHT) continue;
                            const rrx = rx + lx; const rrz = rz + lz;
                            if (rrx >= 0 && rrx < CHUNK_SIZE && rrz >= 0 && rrz < CHUNK_SIZE) {
                                if (Math.abs(lx) + Math.abs(lz) < 3 && !(lx===0 && lz===0 && ly<th+1)) {
                                    if (chunk[rrx * CHUNK_SIZE * CHUNK_HEIGHT + rrz * CHUNK_HEIGHT + tyy] === BlockType.AIR) {
                                        chunk[rrx * CHUNK_SIZE * CHUNK_HEIGHT + rrz * CHUNK_HEIGHT + tyy] = BlockType.LEAVES;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    meshChunk(cx, cz);
};

const setBlock = (x: number, y: number, z: number, type: number) => {
    const { cx, cz, rx, rz } = getChunkCoord(x, z);
    const key = `${cx},${cz}`;
    let chunk = world.get(key);
    if (!chunk) {
        chunk = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
        world.set(key, chunk);
    }
    chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] = type;
    meshChunk(cx, cz);
};

const generateHouse = (x: number, y: number, z: number, style: number = 1) => {
    const px = Math.round(x);
    const py = Math.round(y);
    const pz = Math.round(z);

    if (style === 1) { // Small Hut
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                for (let dy = -1; dy < 4; dy++) {
                    const bx = px + dx; const by = py + dy; const bz = pz + dz;
                    if (by < 0 || by >= CHUNK_HEIGHT) continue;
                    
                    if (dy === -1) setBlock(bx, by, bz, BlockType.WOOD); // Floor
                    else if (dy === 3) { // Roof
                        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) setBlock(bx, by, bz, BlockType.WOOD);
                    }
                    else if (dx === -2 || dx === 2 || dz === -2 || dz === 2) {
                        if (!(dx === 0 && dz === -2 && (dy === 0 || dy === 1))) {
                            setBlock(bx, by, bz, BlockType.STONE);
                        }
                    }
                }
            }
        }
    } else if (style === 2) { // Tower
        for (let dy = -1; dy < 8; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                for (let dz = -2; dz <= 2; dz++) {
                    const bx = px + dx; const by = py + dy; const bz = pz + dz;
                    if (by < 0 || by >= CHUNK_HEIGHT) continue;
                    const dist = Math.abs(dx) + Math.abs(dz);
                    if (dist <= 2 && dist > 1) setBlock(bx, by, bz, BlockType.STONE);
                    if (dy === -1 || dy === 3 || dy === 7) {
                        if (dist <= 1) setBlock(bx, by, bz, BlockType.WOOD);
                    }
                }
            }
        }
    } else { // Garden House
        for (let dx = -3; dx <= 3; dx++) {
            for (let dz = -3; dz <= 3; dz++) {
                const bx = px + dx; const by = py - 1; const bz = pz + dz;
                setBlock(bx, by, bz, BlockType.GRASS);
                if (Math.abs(dx) === 3 || Math.abs(dz) === 3) {
                    setBlock(bx, py, bz, BlockType.LEAVES);
                }
            }
        }
        setBlock(px, py, pz, BlockType.WOOD);
        setBlock(px, py+1, pz, BlockType.WOOD);
        setBlock(px, py+2, pz, BlockType.LEAVES);
    }
};

// --- HOME SCREEN UI ---
homeScreen.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:linear-gradient(rgba(0,0,0,0.7), rgba(0,0,0,0.7)), url("https://wallpaperaccess.com/full/466645.jpg"); background-size:cover; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:1000; color:white; font-family:sans-serif; transition: opacity 0.5s ease-out;';
document.body.appendChild(homeScreen);

const title = document.createElement('h1');
title.innerText = 'MINECRAFT WEB';
title.style.cssText = 'font-size:60px; margin-bottom:40px; letter-spacing:10px; text-shadow:4px 4px 0px #333;';
homeScreen.appendChild(title);

const btnRow = document.createElement('div');
btnRow.style.cssText = 'display:flex; gap:20px; margin-bottom:30px;';
homeScreen.appendChild(btnRow);

const playBtn = document.createElement('button');
playBtn.innerText = 'PLAY GAME';
playBtn.style.cssText = 'padding:15px 60px; font-size:20px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; transition: 0.2s; box-shadow: 0 4px #2e7d32;';
btnRow.appendChild(playBtn);

const settingsBtn = document.createElement('button');
settingsBtn.innerText = 'SETTINGS';
settingsBtn.style.cssText = 'padding:15px 40px; font-size:20px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; transition: 0.2s; box-shadow: 0 4px #444;';
btnRow.appendChild(settingsBtn);

const slotsContainer = document.createElement('div');
slotsContainer.style.cssText = 'display:grid; grid-template-columns: 1fr 1fr 1fr; gap:15px; width:80%; max-width:600px;';
homeScreen.appendChild(slotsContainer);

// --- SETTINGS UI ---
settingsScreen.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); display:none; flex-direction:column; align-items:center; justify-content:center; z-index:2000; color:white; font-family:sans-serif;';
document.body.appendChild(settingsScreen);

const sTitle = document.createElement('h2');
sTitle.innerText = 'SETTINGS (Press 0 to close)';
sTitle.style.marginBottom = '30px';
settingsScreen.appendChild(sTitle);

const createSetting = (label: string, min: number, max: number, val: number, onChange: (v: number)=>void) => {
    const row = document.createElement('div');
    row.style.cssText = 'width:300px; display:flex; flex-direction:column; gap:10px; margin-bottom:20px;';
    const l = document.createElement('label');
    l.innerText = `${label}: ${val}`;
    const s = document.createElement('input');
    s.type = 'range'; s.min = min.toString(); s.max = max.toString(); s.value = val.toString();
    s.oninput = () => { l.innerText = `${label}: ${s.value}`; onChange(parseInt(s.value)); };
    row.appendChild(l); row.appendChild(s);
    settingsScreen.appendChild(row);
};

createSetting('Render Distance', 1, 6, renderDist, (v) => { renderDist = v; });
createSetting('FOV', 60, 110, camera.fov, (v) => { camera.fov = v; camera.updateProjectionMatrix(); });
createSetting('Quality', 1, 2, renderer.getPixelRatio(), (v) => { renderer.setPixelRatio(v); });
createSetting('Brightness', 0, 100, 60, (v) => { ambient.intensity = (v / 100); });
createSetting('Chunk Width', 8, 24, CHUNK_SIZE, (v) => { CHUNK_SIZE = v; resetWorld(); });
createSetting('Chunk Height', 16, 64, CHUNK_HEIGHT, (v) => { CHUNK_HEIGHT = v; resetWorld(); });

const houseTitle = document.createElement('h3');
houseTitle.innerText = 'AUTO GENERATE HOUSE';
houseTitle.style.marginTop = '20px';
settingsScreen.appendChild(houseTitle);

const houseRow = document.createElement('div');
houseRow.style.cssText = 'display:flex; gap:10px; margin-bottom:20px;';
settingsScreen.appendChild(houseRow);

const createHouseBtn = (label: string, style: number) => {
    const b = document.createElement('button');
    b.innerText = label;
    b.style.cssText = 'padding:10px; background:#673AB7; color:white; border:none; border-radius:5px; cursor:pointer;';
    b.onclick = () => {
        if (!isGameStarted) return;
        generateHouse(camera.position.x, camera.position.y - 1.8, camera.position.z, style);
        toggleSettings();
    };
    houseRow.appendChild(b);
};

createHouseBtn('SLOT 1 (HUT)', 1);
createHouseBtn('SLOT 2 (TOWER)', 2);
createHouseBtn('SLOT 3 (GARDEN)', 3);

const closeSBtn = document.createElement('button');
closeSBtn.innerText = 'CLOSE & RESUME';
closeSBtn.style.cssText = 'margin-top:20px; padding:10px 40px; background:#4CAF50; color:white; border:none; border-radius:5px; cursor:pointer;';
closeSBtn.onclick = () => toggleSettings();
settingsScreen.appendChild(closeSBtn);

const backToMenuBtn = document.createElement('button');
backToMenuBtn.innerText = 'BACK TO MENU';
backToMenuBtn.style.cssText = 'margin-top:10px; padding:10px 40px; background:#f44336; color:white; border:none; border-radius:5px; cursor:pointer;';
backToMenuBtn.onclick = () => { toggleSettings(); isGameStarted = false; homeScreen.style.display = 'flex'; homeScreen.style.opacity = '1'; homeScreen.style.pointerEvents = 'all'; ctrl.unlock(); };
settingsScreen.appendChild(backToMenuBtn);

const toggleSettings = () => {
    isSettingsOpen = !isSettingsOpen;
    settingsScreen.style.display = isSettingsOpen ? 'flex' : 'none';
    if (isSettingsOpen) { ctrl.unlock(); }
    else if (isGameStarted) { ctrl.lock(); }
};

settingsBtn.onclick = () => toggleSettings();

const updateSlots = () => {
    slotsContainer.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
        const slotData = localStorage.getItem('mc_save_' + i);
        const slot = document.createElement('div');
        slot.style.cssText = 'background:rgba(255,255,255,0.1); padding:20px; border-radius:10px; border:2px solid rgba(255,255,255,0.2); text-align:center; display:flex; flex-direction:column; gap:10px; backdrop-filter: blur(5px);';
        
        const slotTitle = document.createElement('div');
        slotTitle.innerText = 'SLOT ' + i;
        slotTitle.style.fontWeight = 'bold';
        slot.appendChild(slotTitle);

        const slotStatus = document.createElement('div');
        slotStatus.innerText = slotData ? 'SAVED GAME' : 'EMPTY';
        slotStatus.style.fontSize = '12px';
        slotStatus.style.color = slotData ? '#4CAF50' : '#888';
        slot.appendChild(slotStatus);

        if (slotData) {
            const loadBtn = document.createElement('button');
            loadBtn.innerText = 'LOAD';
            loadBtn.style.cssText = 'padding:8px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;';
            loadBtn.onclick = (e) => { e.stopPropagation(); loadGame(i); };
            slot.appendChild(loadBtn);
        }

        const saveBtn = document.createElement('button');
        saveBtn.innerText = slotData ? 'OVERWRITE' : 'SAVE HERE';
        saveBtn.style.cssText = `padding:8px; background:${slotData ? '#f44336' : '#666'}; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;`;
        saveBtn.onclick = (e) => { e.stopPropagation(); saveGame(i); };
        slot.appendChild(saveBtn);

        slotsContainer.appendChild(slot);
    }
};

const saveGame = (s: number) => {
    const worldData: Record<string, string> = {};
    world.forEach((val, key) => {
        worldData[key] = btoa(String.fromCharCode(...val));
    });
    const data = { p: camera.position.toArray(), w: worldData, t: time };
    localStorage.setItem('mc_save_' + s, JSON.stringify(data));
    updateSlots();
    alert('Game Saved to Slot ' + s);
};

const loadGame = (s: number) => {
    const raw = localStorage.getItem('mc_save_' + s);
    if (!raw) return;
    const d = JSON.parse(raw);
    world.clear();
    chunkGroups.forEach(g => scene.remove(g));
    chunkGroups.clear();
    for (const key in d.w) {
        const binStr = atob(d.w[key]);
        const arr = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) arr[i] = binStr.charCodeAt(i);
        world.set(key, arr);
        const [cx, cz] = key.split(',').map(Number);
        meshChunk(cx!, cz!);
    }
    camera.position.fromArray(d.p);
    time = d.t;
    startGame();
};

const startGame = () => {
    isGameStarted = true;
    homeScreen.style.opacity = '0';
    homeScreen.style.pointerEvents = 'none';
    setTimeout(() => { homeScreen.style.display = 'none'; }, 500);
    ctrl.lock();
    renderer.render(scene, camera);
};

playBtn.onclick = startGame;
updateSlots();

// --- CONTROLS ---
const ctrl = new PointerLockControls(camera, document.body);
const keys: Record<string, boolean> = {};

document.addEventListener('keydown', e => { 
    keys[e.code] = true; 
    if (e.key >= '1' && e.key <= '6') { slot = parseInt(e.key)-1; drawUI(); }
    if (e.key === '0' || e.key === 'Escape') { toggleSettings(); }
    
    if (e.code === 'Space' && isGameStarted && !isSettingsOpen) {
        if (!spaceTimer) {
            spaceTimer = setTimeout(() => {
                isFlying = !isFlying;
                velY = 0;
                console.log(isFlying ? 'Flying Enabled' : 'Flying Disabled');
            }, 3000); // Changed to 3 seconds
        }
    }
});
document.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'Space') {
        clearTimeout(spaceTimer);
        spaceTimer = null;
    }
});
document.addEventListener('mousedown', () => { if(isGameStarted && !isSettingsOpen) ctrl.lock(); });

// --- GAME LOOP ---
let velY = 0, lastF = performance.now(), frames = 0;
camera.position.set(0, 15, 0);

// Initial chunks
for(let x=-renderDist; x<=renderDist; x++) {
    for(let z=-renderDist; z<=renderDist; z++) {
        genChunk(x, z);
    }
}

const clockDisplay = document.createElement('div');
clockDisplay.style.cssText = 'position:fixed; top:15px; right:15px; color:white; font-family:monospace; font-size:22px; font-weight:bold; z-index:20;';
document.body.appendChild(clockDisplay);

const fpsDisplay = document.createElement('div');
fpsDisplay.style.cssText = 'position:fixed; top:15px; left:15px; color:lime; font-family:monospace; font-size:12px; z-index:20;';
document.body.appendChild(fpsDisplay);

// --- CROSSHAIR ---
const crosshair = document.createElement('div');
crosshair.style.cssText = 'position:fixed; top:50%; left:50%; width:20px; height:20px; transform:translate(-50%, -50%); pointer-events:none; z-index:100;';
crosshair.innerHTML = `<div style="position:absolute; top:9px; left:0; width:20px; height:2px; background:white; opacity:0.8;"></div><div style="position:absolute; top:0; left:9px; width:2px; height:20px; background:white; opacity:0.8;"></div>`;
document.body.appendChild(crosshair);

// --- CHARACTER HAND ---
const hand = document.createElement('div');
hand.style.cssText = 'position:fixed; bottom:-20px; right:10%; width:250px; height:300px; background:#d2b48c; border:10px solid #bc8f8f; border-radius:40px 40px 0 0; transform: rotate(-10deg); z-index:50; transition: 0.1s;';
document.body.appendChild(hand);

const ui = document.createElement('div');
ui.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; padding:10px; background:rgba(0,0,0,0.6); border-radius:15px; z-index:10;';
document.body.appendChild(ui);

const inv = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand'];
let slot = 0;
const drawUI = () => {
    ui.innerHTML = inv.map((item, i) => `
        <div style="width:50px; height:50px; background:${i===slot?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.2)'}; border:2px solid ${i===slot?'#fff':'transparent'}; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="width:22px; height:22px; background:#${mats[item]!.color.getHexString()}; border-radius:4px;"></div>
            <span style="font-size:10px; color:white;">${i+1}</span>
        </div>`).join('');
    // Update hand color to match selected block
    hand.style.background = `#${mats[inv[slot]!]!.color.getHexString()}`;
};
drawUI();

function animate() {
    requestAnimationFrame(animate);
    
    if (isGameStarted) {
        const dayInt = Math.max(0.1, Math.sin((time / 2400) * Math.PI) * 1.2);
        scene.background = new THREE.Color().setHSL(0.6, 0.5, dayInt * 0.45);
        ambient.intensity = dayInt * 0.7;
        sun.intensity = dayInt * 0.8;

        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);
        for(let x=-renderDist; x<=renderDist; x++) {
            for(let z=-renderDist; z<=renderDist; z++) {
                genChunk(cx+x, cz+z);
            }
        }
    }

    if (!isGameStarted) {
        renderer.render(scene, camera);
        return;
    }

    const now = performance.now();
    frames++;
    if (now > lastF + 1000) { fpsDisplay.innerText = `FPS: ${frames}`; frames = 0; lastF = now; }

    if (ctrl.isLocked) {
        time = (time + 0.003) % 2400; 
        clockDisplay.innerText = getTimeStr();

        // 1. Vertical Movement (Gravity or Flight)
        const px = camera.position.x;
        const py = camera.position.y;
        const pz = camera.position.z;
        const footY = py - 1.7;

        const getCollision = (x: number, y: number, z: number) => {
            const b = getBlock(x, y, z);
            return b !== BlockType.AIR && b !== BlockType.WATER;
        };

        if (isFlying) {
            velY = 0;
            if (keys['Space']) camera.position.y += 0.15;
            if (keys['ArrowDown']) camera.position.y -= 0.15;
            
            hand.style.transform = `rotate(-10deg) translateY(${Math.sin(now * 0.005) * 10}px)`;
        } else {
            velY -= 0.008; 
            const nextY = camera.position.y + velY;
            const nextFootY = nextY - 1.7;

            let onGround = false;
            const checkPoints = [[px-0.2, nextFootY, pz-0.2], [px+0.2, nextFootY, pz-0.2], [px-0.2, nextFootY, pz+0.2], [px+0.2, nextFootY, pz+0.2]] as const;
            for (const p of checkPoints) {
                if (getCollision(p[0], p[1], p[2])) { onGround = true; break; }
            }
            
            if (onGround && velY < 0) {
                // Cari ketinggian lantai yang paling tinggi di bawah kaki
                let maxFloorY = -1;
                for (const p of checkPoints) {
                    if (getCollision(p[0], p[1], p[2])) {
                        maxFloorY = Math.max(maxFloorY, Math.floor(p[1]) + 1);
                    }
                }
                camera.position.y = maxFloorY + 1.7; // Kunci mata pada 1.7 unit atas lantai
                velY = 0; 
                if(keys['Space']) velY = 0.15; 
            } else {
                camera.position.y = nextY;
            }
            
            if (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']) {
                hand.style.transform = `rotate(-10deg) translateY(${Math.abs(Math.sin(now * 0.01)) * 20}px)`;
            } else {
                hand.style.transform = `rotate(-10deg) translateY(0px)`;
            }
        }

        // 2. Horizontal Movement
        const oldX = camera.position.x;
        const oldZ = camera.position.z;
        const speed = keys['ShiftLeft'] ? 0.2 : 0.12;

        if(keys['KeyW']) ctrl.moveForward(speed);
        if(keys['KeyS']) ctrl.moveForward(-speed);
        if(keys['KeyA']) ctrl.moveRight(-speed);
        if(keys['KeyD']) ctrl.moveRight(speed);

        const newX = camera.position.x;
        const newZ = camera.position.z;

        const isColliding = (nx: number, nz: number) => {
            return getCollision(nx, py - 1.2, nz) || getCollision(nx, py - 0.5, nz);
        };

        if (!isFlying && isColliding(newX, newZ)) {
            const canStep = !getCollision(newX, py, newZ) && !getCollision(newX, py + 0.5, newZ);
            if (canStep && getCollision(newX, py - 1.2, newZ)) {
                camera.position.y += 0.5;
            } else {
                camera.position.x = oldX;
                camera.position.z = oldZ;
            }
        }
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
