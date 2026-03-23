import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { PerlinNoise } from './noise.js';
// --- CONFIG ---
const CHUNK_SIZE = 14;
const CHUNK_HEIGHT = 32;
let renderDist = 2;
let useTextures = true;
let isDev = false;
let time = 1000;
var BlockType;
(function (BlockType) {
    BlockType[BlockType["AIR"] = 0] = "AIR";
    BlockType[BlockType["GRASS"] = 1] = "GRASS";
    BlockType[BlockType["DIRT"] = 2] = "DIRT";
    BlockType[BlockType["STONE"] = 3] = "STONE";
    BlockType[BlockType["WOOD"] = 4] = "WOOD";
    BlockType[BlockType["LEAVES"] = 5] = "LEAVES";
    BlockType[BlockType["SAND"] = 6] = "SAND";
    BlockType[BlockType["WATER"] = 7] = "WATER";
})(BlockType || (BlockType = {}));
const idToName = {
    [BlockType.GRASS]: 'grass',
    [BlockType.DIRT]: 'dirt',
    [BlockType.STONE]: 'stone',
    [BlockType.WOOD]: 'wood',
    [BlockType.LEAVES]: 'leaves',
    [BlockType.SAND]: 'sand',
    [BlockType.WATER]: 'water'
};
const nameToId = Object.fromEntries(Object.entries(idToName).map(([id, name]) => [name, parseInt(id)]));
// --- 12H TIME SYSTEM ---
const getTimeStr = () => {
    let h = Math.floor(time / 100);
    const m = Math.floor((time % 100) * 0.6);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
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
// --- UI ELEMENTS ---
const fpsDisplay = document.createElement('div');
fpsDisplay.style.cssText = 'position:fixed; top:15px; left:15px; color:lime; font-family:monospace; font-size:12px; background:rgba(0,0,0,0.4); padding:4px 8px; border-radius:4px; pointer-events:none; z-index:20;';
document.body.appendChild(fpsDisplay);
const clock = document.createElement('div');
clock.style.cssText = 'position:fixed; top:15px; right:15px; color:white; font-family:monospace; font-size:22px; font-weight:bold; text-shadow:2px 2px 4px rgba(0,0,0,0.5); pointer-events:none; z-index:20;';
document.body.appendChild(clock);
// --- MATERIALS & TEXTURE ---
const tex = (() => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 32; i++) {
        ctx.fillStyle = `rgba(0,0,0,0.1)`;
        ctx.fillRect(Math.random() * 16, Math.random() * 16, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    return t;
})();
const mats = {
    grass: new THREE.MeshLambertMaterial({ map: tex, color: 0x567d46 }),
    dirt: new THREE.MeshLambertMaterial({ map: tex, color: 0x5d4037 }),
    stone: new THREE.MeshLambertMaterial({ map: tex, color: 0x757575 }),
    wood: new THREE.MeshLambertMaterial({ map: tex, color: 0x8d6e63 }),
    leaves: new THREE.MeshLambertMaterial({ map: tex, color: 0x388e3c, transparent: true, opacity: 0.8 }),
    sand: new THREE.MeshLambertMaterial({ map: tex, color: 0xe3c07d }),
    water: new THREE.MeshLambertMaterial({ color: 0x00aaff, transparent: true, opacity: 0.6 })
};
// --- WORLD DATA ---
const world = new Map();
const chunkGroups = new Map();
const box = new THREE.BoxGeometry(1, 1, 1);
const noise = new PerlinNoise();
const tempMatrix = new THREE.Matrix4();
const getChunkCoord = (x, z) => {
    return {
        cx: Math.floor(x / CHUNK_SIZE),
        cz: Math.floor(z / CHUNK_SIZE),
        rx: ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
        rz: ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    };
};
const getBlock = (x, y, z) => {
    if (y < 0 || y >= CHUNK_HEIGHT)
        return BlockType.AIR;
    const { cx, cz, rx, rz } = getChunkCoord(x, z);
    const chunk = world.get(`${cx},${cz}`);
    if (!chunk)
        return BlockType.AIR;
    return chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] || BlockType.AIR;
};
const setBlock = (x, y, z, type) => {
    if (y < 0 || y >= CHUNK_HEIGHT)
        return;
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
const meshChunk = (cx, cz) => {
    const key = `${cx},${cz}`;
    const chunk = world.get(key);
    if (!chunk)
        return;
    let group = chunkGroups.get(key);
    if (group) {
        group.clear();
    }
    else {
        group = new THREE.Group();
        group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        scene.add(group);
        chunkGroups.set(key, group);
    }
    const typeCounts = {};
    for (let i = 0; i < chunk.length; i++) {
        const type = chunk[i];
        if (type !== BlockType.AIR) {
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        }
    }
    for (const [typeStr, count] of Object.entries(typeCounts)) {
        const type = parseInt(typeStr);
        const name = idToName[type];
        const mesh = new THREE.InstancedMesh(box, mats[name], count);
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
const genChunk = (cx, cz) => {
    const key = `${cx},${cz}`;
    if (world.has(key))
        return;
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
                if (y === h)
                    type = h < 4 ? BlockType.SAND : BlockType.GRASS;
                else if (y > h - 3)
                    type = BlockType.DIRT;
                chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] = type;
            }
            if (h < 4) {
                for (let y = h + 1; y <= 3; y++) {
                    chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] = BlockType.WATER;
                }
            }
            // Simple Tree Gen (probabilistic)
            if (h >= 4 && Math.random() < 0.015) {
                const th = 4 + Math.floor(Math.random() * 2);
                for (let ty = 1; ty <= th; ty++) {
                    const tyy = h + ty;
                    if (tyy < CHUNK_HEIGHT)
                        chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + tyy] = BlockType.WOOD;
                }
                // Leaves (simplified for now to stay within chunk boundaries easily)
                for (let lx = -2; lx <= 2; lx++) {
                    for (let lz = -2; lz <= 2; lz++) {
                        for (let ly = th - 1; ly <= th + 1; ly++) {
                            const tyy = h + ly;
                            if (tyy >= CHUNK_HEIGHT)
                                continue;
                            const rrx = rx + lx;
                            const rrz = rz + lz;
                            if (rrx >= 0 && rrx < CHUNK_SIZE && rrz >= 0 && rrz < CHUNK_SIZE) {
                                if (Math.abs(lx) + Math.abs(lz) < 3 && !(lx === 0 && lz === 0 && ly < th + 1)) {
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
// --- UI & INVENTORY ---
const inv = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand'];
let slot = 0;
const ui = document.createElement('div');
ui.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; padding:10px; background:rgba(0,0,0,0.6); border-radius:15px; backdrop-filter:blur(10px); z-index:10;';
document.body.appendChild(ui);
const drawUI = () => {
    ui.innerHTML = inv.map((item, i) => {
        const material = mats[item];
        const color = material ? `#${material.color.getHexString()}` : '#fff';
        return `
        <div style="width:50px; height:50px; background:${i === slot ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'}; border:2px solid ${i === slot ? '#fff' : 'transparent'}; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center;">
            <div style="width:22px; height:22px; background:${color}; border-radius:4px;"></div>
            <span style="font-size:10px; color:white; font-weight:bold; margin-top:2px;">${i + 1}</span>
        </div>`;
    }).join('');
};
drawUI();
// --- SETTINGS MENU ---
const settingsMenu = document.createElement('div');
settingsMenu.id = 'game-settings';
settingsMenu.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); padding:25px; background:rgba(15,15,15,0.95); border-radius:20px; color:white; display:none; width:300px; font-family:sans-serif; text-align:center; z-index:100; border:1px solid rgba(255,255,255,0.1);';
settingsMenu.innerHTML = `
    <h3 style="margin-top:0; letter-spacing:2px;">GAME SETTINGS</h3>
    <div style="margin-bottom:15px; text-align:left;">
        <div style="font-size:10px; opacity:0.5; margin-bottom:5px;">RENDER DISTANCE: <span id="rd-val">2</span></div>
        <input type="range" id="rd-range" style="width:100%" min="1" max="4" value="2">
    </div>
    <button id="tex-btn" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:none; background:#444; color:white; font-weight:bold; cursor:pointer;">TEXTURES: ON</button>
    <button id="dev-btn" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:none; background:#444; color:white; font-weight:bold; cursor:pointer;">DEV MODE: OFF</button>
    <div id="dev-opts" style="display:none; margin-bottom:15px; background:rgba(255,255,255,0.05); padding:10px; border-radius:10px;">
        <div style="font-size:10px; opacity:0.5; margin-bottom:5px;">TIME CONTROL</div>
        <input type="range" id="t-range" style="width:100%" min="0" max="2400" value="1000">
    </div>
    <button id="resume-btn" style="width:100%; padding:12px; background:#4CAF50; border:none; color:white; border-radius:8px; cursor:pointer; font-weight:bold;">RESUME GAME</button>
`;
document.body.appendChild(settingsMenu);
// --- CONTROLS & EVENTS ---
const ctrl = new PointerLockControls(camera, document.body);
const keys = {};
const toggleSettings = () => {
    const isVisible = settingsMenu.style.display === 'block';
    settingsMenu.style.display = isVisible ? 'none' : 'block';
    if (!isVisible)
        ctrl.unlock();
    else
        ctrl.lock();
};
document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.key === '0')
        toggleSettings();
    if (e.key >= '1' && e.key <= '6') {
        slot = parseInt(e.key) - 1;
        drawUI();
    }
});
document.addEventListener('keyup', e => keys[e.code] = false);
document.addEventListener('mousedown', (e) => {
    if (settingsMenu.style.display !== 'block') {
        ctrl.lock();
        if (ctrl.isLocked) {
            // Basic block break/place logic can be added here
            // For now just locking the pointer
        }
    }
});
// Event Listeners
document.getElementById('resume-btn')?.addEventListener('click', toggleSettings);
document.getElementById('rd-range')?.addEventListener('input', (e) => {
    const target = e.target;
    if (target) {
        renderDist = parseInt(target.value);
        const val = document.getElementById('rd-val');
        if (val)
            val.innerText = target.value;
    }
});
document.getElementById('tex-btn')?.addEventListener('click', () => {
    useTextures = !useTextures;
    const btn = document.getElementById('tex-btn');
    if (btn)
        btn.innerText = `TEXTURES: ${useTextures ? 'ON' : 'OFF'}`;
    for (const m in mats) {
        if (mats[m]) {
            mats[m].map = useTextures ? tex : null;
            mats[m].needsUpdate = true;
        }
    }
});
document.getElementById('dev-btn')?.addEventListener('click', () => {
    isDev = !isDev;
    const btn = document.getElementById('dev-btn');
    if (btn) {
        btn.innerText = `DEV MODE: ${isDev ? 'ON' : 'OFF'}`;
        btn.style.background = isDev ? '#4CAF50' : '#444';
    }
    const opts = document.getElementById('dev-opts');
    if (opts)
        opts.style.display = isDev ? 'block' : 'none';
});
document.getElementById('t-range')?.addEventListener('input', (e) => {
    const target = e.target;
    if (target)
        time = parseInt(target.value);
});
// --- GAME LOOP & PHYSICS ---
let velY = 0, lastF = performance.now(), frames = 0;
camera.position.set(0, 15, 0);
function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    frames++;
    if (now > lastF + 1000) {
        fpsDisplay.innerText = `FPS: ${frames}`;
        frames = 0;
        lastF = now;
    }
    if (ctrl.isLocked) {
        time = (time + 0.003) % 2400;
        clock.innerText = getTimeStr();
        const dayInt = Math.max(0.1, Math.sin((time / 2400) * Math.PI) * 1.2);
        scene.background = new THREE.Color().setHSL(0.6, 0.5, dayInt * 0.45);
        ambient.intensity = dayInt * 0.7;
        sun.intensity = dayInt * 0.8;
        const cx = Math.floor(camera.position.x / CHUNK_SIZE);
        const cz = Math.floor(camera.position.z / CHUNK_SIZE);
        for (let x = -renderDist; x <= renderDist; x++) {
            for (let z = -renderDist; z <= renderDist; z++) {
                genChunk(cx + x, cz + z);
            }
        }
        // Improved Physics
        velY -= 0.008;
        camera.position.y += velY;
        const px = camera.position.x;
        const py = camera.position.y;
        const pz = camera.position.z;
        // Bounding box check (simplified)
        const checkPoints = [
            [px - 0.3, py - 1.7, pz - 0.3], [px + 0.3, py - 1.7, pz - 0.3],
            [px - 0.3, py - 1.7, pz + 0.3], [px + 0.3, py - 1.7, pz + 0.3]
        ];
        let onGround = false;
        for (const p of checkPoints) {
            const b = getBlock(Math.round(p[0]), Math.floor(p[1]), Math.round(p[2]));
            if (b !== BlockType.AIR && b !== BlockType.WATER) {
                onGround = true;
                break;
            }
        }
        if (onGround) {
            if (velY < 0) {
                camera.position.y = Math.floor(py - 1.7) + 1.8;
                velY = 0;
                if (keys['Space'])
                    velY = 0.15;
            }
        }
        const speed = keys['ShiftLeft'] ? 0.2 : 0.12;
        if (keys['KeyW'])
            ctrl.moveForward(speed);
        if (keys['KeyS'])
            ctrl.moveForward(-speed);
        if (keys['KeyA'])
            ctrl.moveRight(-speed);
        if (keys['KeyD'])
            ctrl.moveRight(speed);
    }
    renderer.render(scene, camera);
}
animate();
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
//# sourceMappingURL=main.js.map