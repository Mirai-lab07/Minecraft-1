import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PerlinNoise } from './noise.js';

// --- CONFIG ---
let CHUNK_SIZE = 14;
let CHUNK_HEIGHT = 32;
let renderDist = 2;
let useTextures = true;
let isDev = false;
let time = 1000; 

// Hunger System
let hunger = 100;
const hungerDecreaseRate = 0.05; // per frame/second
let lastHungerUpdate = performance.now();

const foodModels = [
    'apple.glb', 'banana.glb', 'burger.glb', 'cheese.glb', 'hot-dog.glb', 'pizza.glb'
];
const characterModels = [
    'character-a.glb', 'character-b.glb', 'character-c.glb'
];

const modelCache: Record<string, THREE.Group> = {};
const loader = new GLTFLoader();
interface Entity {
    id: string;
    type: 'food' | 'character';
    modelName: string;
    mesh: THREE.Object3D;
    chunkKey: string;
    // Movement & Physics
    targetPos?: THREE.Vector3;
    moveTimer?: number;
    velY: number;
    onGround: boolean;
    job?: 'farming' | 'mining' | 'building' | 'pathmaking' | 'idle' | undefined;
}
const entities = new Map<string, Entity[]>();
const playerInventory = new Map<string, number>();
let isInventoryOpen = false;

// Block Breaking State
let breakingBlock: { x: number, y: number, z: number, startTime: number } | null = null;
const breakDuration = 1000; // 1 second

const breakProgressCircle = document.createElement('div');
breakProgressCircle.style.cssText = 'position:fixed; top:50%; left:50%; width:40px; height:40px; transform:translate(-50%, -50%); border:4px solid rgba(255,255,255,0.3); border-top:4px solid #fff; border-radius:50%; display:none; z-index:1000; pointer-events:none;';
document.body.appendChild(breakProgressCircle);

const inventoryScreen = document.createElement('div');
inventoryScreen.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:600px; height:500px; background:rgba(0,0,0,0.7); backdrop-filter:blur(10px); border:2px solid rgba(255,255,255,0.2); border-radius:20px; display:none; flex-direction:column; z-index:2500; color:white; font-family:monospace; padding:20px; box-shadow: 0 0 30px rgba(0,0,0,0.5);';
document.body.appendChild(inventoryScreen);

// Top Section: Character & Crafting
const topSection = document.createElement('div');
topSection.style.cssText = 'display:flex; justify-content:space-between; width:100%; height:200px; margin-bottom:20px;';
inventoryScreen.appendChild(topSection);

// Character Preview Canvas
const charCanvas = document.createElement('canvas');
charCanvas.width = 200; charCanvas.height = 200;
charCanvas.style.cssText = 'background:rgba(255,255,255,0.05); border-radius:15px; border:1px solid rgba(255,255,255,0.1);';
topSection.appendChild(charCanvas);

// Crafting Section
const craftingSection = document.createElement('div');
craftingSection.style.cssText = 'display:flex; align-items:center; gap:20px; padding:20px; background:rgba(0,0,0,0.3); border-radius:15px;';
topSection.appendChild(craftingSection);

const craftingGrid = document.createElement('div');
craftingGrid.style.cssText = 'display:grid; grid-template-columns: repeat(2, 1fr); gap:8px;';
for(let i=0; i<4; i++) {
    const slot = document.createElement('div');
    slot.style.cssText = 'width:50px; height:50px; background:rgba(255,255,255,0.1); border:1px solid #555; border-radius:5px;';
    craftingGrid.appendChild(slot);
}
craftingSection.appendChild(craftingGrid);

const arrow = document.createElement('div');
arrow.innerText = '➡'; arrow.style.fontSize = '30px';
craftingSection.appendChild(arrow);

const resultSlot = document.createElement('div');
resultSlot.style.cssText = 'width:65px; height:65px; background:rgba(255,255,255,0.15); border:2px solid #4CAF50; border-radius:8px;';
craftingSection.appendChild(resultSlot);

// Bottom Section: 3x8 Inventory
const invGrid = document.createElement('div');
invGrid.style.cssText = 'display:grid; grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(3, 1fr); gap:10px; width:100%; flex-grow:1; background:rgba(0,0,0,0.2); padding:15px; border-radius:15px;';
inventoryScreen.appendChild(invGrid);

// Character Preview Renderer
const charRenderer = new THREE.WebGLRenderer({ canvas: charCanvas, alpha: true, antialias: true });
const charScene = new THREE.Scene();
const charCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
charCam.position.set(0, 1.2, 3);
charCam.lookAt(0, 1, 0);
const charLight = new THREE.PointLight(0xffffff, 2);
charLight.position.set(2, 2, 5);
charScene.add(charLight);
charScene.add(new THREE.AmbientLight(0xffffff, 0.8));

let charPreviewMesh: THREE.Object3D | null = null;

const toggleInventory = () => {
    isInventoryOpen = !isInventoryOpen;
    inventoryScreen.style.display = isInventoryOpen ? 'flex' : 'none';
    if (isInventoryOpen) {
        ctrl.unlock();
        if (!charPreviewMesh && modelCache['character-a.glb']) {
            charPreviewMesh = modelCache['character-a.glb'].clone();
            charScene.add(charPreviewMesh);
        }
        drawInventory();
        animateCharPreview();
    } else if (isGameStarted) {
        ctrl.lock();
    }
};

const animateCharPreview = () => {
    if (!isInventoryOpen) return;
    requestAnimationFrame(animateCharPreview);
    if (charPreviewMesh) charPreviewMesh.rotation.y += 0.02;
    charRenderer.render(charScene, charCam);
};

const drawInventory = () => {
    invGrid.innerHTML = '';
    const items = Array.from(playerInventory.entries());
    // Total 24 slots (3x8)
    for (let i = 0; i < 24; i++) {
        const [itemName, count] = items[i] || [null, 0];
        const slotDiv = document.createElement('div');
        slotDiv.style.cssText = 'aspect-ratio:1/1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; font-size:10px; transition:0.1s; position:relative; color:white; overflow:hidden; text-align:center;';
        
        if (itemName) {
            const isFood = itemName.endsWith('.glb');
            if (isFood) {
                let icon = '🍎';
                if (itemName.includes('apple')) icon = '🍎';
                else if (itemName.includes('banana')) icon = '🍌';
                else if (itemName.includes('burger')) icon = '🍔';
                else if (itemName.includes('cheese')) icon = '🧀';
                else if (itemName.includes('hot-dog')) icon = '🌭';
                else if (itemName.includes('pizza')) icon = '🍕';
                slotDiv.innerHTML = `<div style="font-size:24px;">${icon}</div><div>${itemName.replace('.glb','')}</div>`;
                
                slotDiv.onclick = () => {
                    updateHunger(25);
                    const current = playerInventory.get(itemName) || 0;
                    if (current > 1) playerInventory.set(itemName, current - 1);
                    else playerInventory.delete(itemName);
                    drawInventory();
                };
            } else {
                // It's a block
                slotDiv.innerHTML = `<div style="width:24px; height:24px; background:#${mats[itemName]?.color.getHexString() || 'fff'}; border-radius:4px; margin-bottom:4px;"></div><div>${itemName}</div>`;
            }

            // Count Badge
            const badge = document.createElement('div');
            badge.style.cssText = 'position:absolute; bottom:2px; right:5px; background:rgba(0,0,0,0.6); padding:1px 4px; border-radius:4px; font-size:10px; font-weight:bold;';
            badge.innerText = count.toString();
            slotDiv.appendChild(badge);

            slotDiv.onmouseover = () => { slotDiv.style.background = 'rgba(255,255,255,0.15)'; slotDiv.style.borderColor = '#4CAF50'; };
            slotDiv.onmouseout = () => { slotDiv.style.background = 'rgba(255,255,255,0.05)'; slotDiv.style.borderColor = 'rgba(255,255,255,0.1)'; };
        }
        invGrid.appendChild(slotDiv);
    }
};

const loadModel = (url: string, name: string): Promise<THREE.Group> => {
    return new Promise((resolve) => {
        loader.load(url, (gltf) => {
            modelCache[name] = gltf.scene;
            resolve(gltf.scene);
        });
    });
};

const initAssets = async () => {
    const promises = [];
    for (const m of foodModels) {
        promises.push(loadModel(`asset/kenney_food-kit/Models/GLB format/${m}`, m));
    }
    for (const m of characterModels) {
        promises.push(loadModel(`asset/kenney_blocky-characters_20/Models/GLB format/${m}`, m));
    }
    await Promise.all(promises);
    console.log('All assets loaded');
};
initAssets();

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
    WATER = 7,
    SILVER = 8,
    DIAMOND = 9
}

const idToName: Record<number, string> = {
    [BlockType.GRASS]: 'grass',
    [BlockType.DIRT]: 'dirt',
    [BlockType.STONE]: 'stone',
    [BlockType.WOOD]: 'wood',
    [BlockType.LEAVES]: 'leaves',
    [BlockType.SAND]: 'sand',
    [BlockType.WATER]: 'water',
    [BlockType.SILVER]: 'silver',
    [BlockType.DIAMOND]: 'diamond'
};

const mats: Record<string, THREE.MeshLambertMaterial> = {}; // Initialized later

// --- GLOBAL STATE ---
let isGameStarted = false;
let isSettingsOpen = false;
let isFlying = false;
let useGyro = false;
let spaceTimer: any = null;
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let gyroOffset = { x: 0, y: 0 };
let joystickPos = { x: 0, y: 0 };
let joystickActive = false;
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
mats['silver'] = new THREE.MeshLambertMaterial({ map: tex, color: 0xc0c0c0 });
mats['diamond'] = new THREE.MeshLambertMaterial({ map: tex, color: 0x00ffff });

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

const spawnEntities = (cx: number, cz: number, chunk: Uint8Array) => {
    const key = `${cx},${cz}`;
    if (entities.has(key)) return;
    
    const chunkEntities: Entity[] = [];
    const jobs: ('farming' | 'mining' | 'building' | 'pathmaking' | 'idle')[] = ['farming', 'mining', 'building', 'pathmaking', 'idle'];

    for (let i = 0; i < 3; i++) { 
        if (Math.random() < 0.4) {
            const rx = Math.floor(Math.random() * CHUNK_SIZE);
            const rz = Math.floor(Math.random() * CHUNK_SIZE);
            
            let h = -1;
            for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
                const type = chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y];
                if (type !== BlockType.AIR && type !== BlockType.WATER && type !== BlockType.LEAVES) {
                    h = y;
                    break;
                }
            }
            
            if (h !== -1) {
                const isCharacter = Math.random() < 0.4;
                const type = isCharacter ? 'character' : 'food';
                const modelList = isCharacter ? characterModels : foodModels;
                const modelName = modelList[Math.floor(Math.random() * modelList.length)]!;
                
                const originalModel = modelCache[modelName];
                if (originalModel) {
                    const mesh = originalModel.clone();
                    // Spawn at h but let physics handle the rest
                    mesh.position.set(cx * CHUNK_SIZE + rx + 0.5, h + 5, cz * CHUNK_SIZE + rz + 0.5);
                    if (isCharacter) mesh.scale.set(0.5, 0.5, 0.5);
                    else mesh.scale.set(0.4, 0.4, 0.4);
                    
                    scene.add(mesh);
                    chunkEntities.push({
                        id: Math.random().toString(36).substr(2, 9),
                        type,
                        modelName,
                        mesh,
                        chunkKey: key,
                        velY: 0,
                        onGround: false,
                        job: isCharacter ? jobs[Math.floor(Math.random() * jobs.length)] : undefined
                    });
                }
            }
        }
    }
    
    entities.set(key, chunkEntities);
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
            
            // Biome noise
            const biomeNoise = noise.noise(x * 0.01, z * 0.01, 500);
            const isDesert = biomeNoise > 0.3;

            const n = noise.noise(x * 0.05, z * 0.05, 0) * 6 + noise.noise(x * 0.1, z * 0.1, 100) * 3;
            const h = Math.floor(n + 6);

            for (let y = 0; y <= h && y < CHUNK_HEIGHT; y++) {
                let type = BlockType.STONE;
                if (y === h) {
                    type = (h < 4 || isDesert) ? BlockType.SAND : BlockType.GRASS;
                } else if (y > h - 3) {
                    type = isDesert ? BlockType.SAND : BlockType.DIRT;
                } else {
                    // Deep layer ores
                    const oreNoise = Math.random();
                    if (y < 4 && oreNoise < 0.05) type = BlockType.DIAMOND;
                    else if (y < 8 && oreNoise < 0.1) type = BlockType.SILVER;
                }
                chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] = type;
            }

            if (h < 4 && !isDesert) {
                for (let y = h + 1; y <= 3; y++) {
                    chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + y] = BlockType.WATER;
                }
            }
            
            // Trees only in non-desert
            if (!isDesert && h >= 4 && Math.random() < 0.02) {
                const treeType = Math.random();
                let th = 4 + Math.floor(Math.random() * 2);
                let leafRadius = 2;
                let leafHeight = 3;

                if (treeType < 0.3) { // Tall Pine
                    th = 6 + Math.floor(Math.random() * 3);
                    leafRadius = 1;
                    leafHeight = 5;
                } else if (treeType < 0.6) { // Wide Oak
                    th = 3 + Math.floor(Math.random() * 2);
                    leafRadius = 3;
                    leafHeight = 3;
                }

                for(let ty=1; ty<=th; ty++) {
                    const tyy = h + ty;
                    if (tyy < CHUNK_HEIGHT) chunk[rx * CHUNK_SIZE * CHUNK_HEIGHT + rz * CHUNK_HEIGHT + tyy] = BlockType.WOOD;
                }
                
                for(let lx=-leafRadius; lx<=leafRadius; lx++) {
                    for(let lz=-leafRadius; lz<=leafRadius; lz++) {
                        for(let ly=th-Math.floor(leafHeight/2); ly<=th+Math.floor(leafHeight/2); ly++) {
                            const tyy = h + ly;
                            if (tyy >= CHUNK_HEIGHT || tyy < 0) continue;
                            const rrx = rx + lx; const rrz = rz + lz;
                            if (rrx >= 0 && rrx < CHUNK_SIZE && rrz >= 0 && rrz < CHUNK_SIZE) {
                                const d = Math.sqrt(lx*lx + lz*lz);
                                if (d <= leafRadius && !(lx===0 && lz===0 && ly<=th)) {
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
    spawnEntities(cx, cz, chunk);
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
settingsScreen.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); display:none; flex-direction:column; align-items:center; z-index:2000; color:white; font-family:sans-serif; overflow-y:auto; padding:20px 0;';
document.body.appendChild(settingsScreen);

const settingsContent = document.createElement('div');
settingsContent.style.cssText = 'width:90%; max-width:400px; display:flex; flex-direction:column; align-items:center; gap:10px; padding-bottom:40px;';
settingsScreen.appendChild(settingsContent);

const sTitle = document.createElement('h2');
sTitle.innerText = 'SETTINGS';
sTitle.style.marginBottom = '20px';
settingsContent.appendChild(sTitle);

const createSetting = (label: string, min: number, max: number, val: number, onChange: (v: number)=>void) => {
    const row = document.createElement('div');
    row.style.cssText = 'width:100%; display:flex; flex-direction:column; gap:5px; margin-bottom:15px;';
    const l = document.createElement('label');
    l.innerText = `${label}: ${val}`;
    l.style.fontSize = '14px';
    const s = document.createElement('input');
    s.type = 'range'; s.min = min.toString(); s.max = max.toString(); s.value = val.toString();
    s.style.width = '100%';
    s.oninput = () => { l.innerText = `${label}: ${s.value}`; onChange(parseInt(s.value)); };
    row.appendChild(l); row.appendChild(s);
    settingsContent.appendChild(row);
};

createSetting('Render Distance', 1, 6, renderDist, (v) => { renderDist = v; });
createSetting('FOV', 60, 110, camera.fov, (v) => { camera.fov = v; camera.updateProjectionMatrix(); });
createSetting('Quality', 1, 2, renderer.getPixelRatio(), (v) => { renderer.setPixelRatio(v); });
createSetting('Brightness', 0, 100, 60, (v) => { ambient.intensity = (v / 100); });
createSetting('Chunk Width', 8, 24, CHUNK_SIZE, (v) => { CHUNK_SIZE = v; resetWorld(); });
createSetting('Chunk Height', 16, 64, CHUNK_HEIGHT, (v) => { CHUNK_HEIGHT = v; resetWorld(); });

const gyroRow = document.createElement('div');
gyroRow.style.cssText = 'width:300px; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;';
const gyroLabel = document.createElement('label');
gyroLabel.innerText = 'Gyroscope Control: OFF';
const gyroBtn = document.createElement('button');
gyroBtn.innerText = 'ENABLE';
gyroBtn.style.cssText = 'padding:5px 15px; background:#444; color:white; border:none; border-radius:5px; cursor:pointer;';
gyroBtn.onclick = async () => {
    if (!useGyro) {
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            const res = await (DeviceOrientationEvent as any).requestPermission();
            if (res !== 'granted') return alert('Gyro permission denied');
        }
        useGyro = true;
        gyroBtn.innerText = 'DISABLE';
        gyroBtn.style.background = '#4CAF50';
        gyroLabel.innerText = 'Gyroscope Control: ON';
    } else {
        useGyro = false;
        gyroBtn.innerText = 'ENABLE';
        gyroBtn.style.background = '#444';
        gyroLabel.innerText = 'Gyroscope Control: OFF';
    }
};
gyroRow.appendChild(gyroLabel); gyroRow.appendChild(gyroBtn);
settingsScreen.appendChild(gyroRow);

window.addEventListener('deviceorientation', (e) => {
    if (!useGyro || !isGameStarted || isSettingsOpen) return;
    // Map beta (X) and gamma (Y) to camera rotation
    // Beta is tilt front/back (-180 to 180), Gamma is tilt left/right (-90 to 90)
    const beta = e.beta || 0; 
    const gamma = e.gamma || 0;
    
    // Smooth gyro input
    const targetX = (beta - 45) * 0.02; // Offset 45deg for comfortable holding
    const targetY = -gamma * 0.02;
    
    camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, targetX, 0.1);
    camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, targetY, 0.1);
    camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
});

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
    if (e.key === '0' || e.key === 'Escape') { 
        if (isInventoryOpen) toggleInventory();
        else toggleSettings(); 
    }
    if (e.code === 'KeyI') { toggleInventory(); }
    
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
const addToInventory = (item: string) => {
    const current = playerInventory.get(item) || 0;
    playerInventory.set(item, current + 1);
};

const raycaster = new THREE.Raycaster();
document.addEventListener('mousedown', (e) => { 
    if(isGameStarted && !isSettingsOpen && !isInventoryOpen) {
        if (e.button === 0) { // Left click
            // 1. Check for entities first (food collection)
            raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
            const allMeshes: THREE.Object3D[] = [];
            const entMap = new Map<THREE.Object3D, {ent: Entity, chunk: string}>();
            
            entities.forEach((chunkEnts, key) => {
                chunkEnts.forEach(ent => {
                    allMeshes.push(ent.mesh);
                    entMap.set(ent.mesh, {ent, chunk: key});
                });
            });
            
            const intersects = raycaster.intersectObjects(allMeshes, true);
            if (intersects.length > 0) {
                let obj = intersects[0]!.object;
                while(obj.parent && !entMap.has(obj)) obj = obj.parent;
                
                const data = entMap.get(obj);
                if (data && data.ent.type === 'food') {
                    const dist = camera.position.distanceTo(data.ent.mesh.position);
                    if (dist < 4) {
                        addToInventory(data.ent.modelName);
                        scene.remove(data.ent.mesh);
                        const chunkEnts = entities.get(data.chunk)!;
                        chunkEnts.splice(chunkEnts.indexOf(data.ent), 1);
                        return;
                    }
                }
            }

            // 2. Check for blocks
            const ray = new THREE.Raycaster(camera.position, camera.getWorldDirection(new THREE.Vector3()), 0, 5);
            const worldMeshes = Array.from(chunkGroups.values()).flatMap(g => g.children);
            const blockIntersects = ray.intersectObjects(worldMeshes);

            if (blockIntersects.length > 0) {
                const inter = blockIntersects[0]!;
                const p = inter.point.clone().add(inter.face!.normal.clone().multiplyScalar(-0.5));
                const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
                
                breakingBlock = { x: bx, y: by, z: bz, startTime: performance.now() };
                breakProgressCircle.style.display = 'block';
            }
        }
        ctrl.lock(); 
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        breakingBlock = null;
        breakProgressCircle.style.display = 'none';
        breakProgressCircle.style.borderTopColor = '#fff';
    }
});

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
clockDisplay.style.cssText = 'position:fixed; top:15px; right:60px; color:white; font-family:monospace; font-size:22px; font-weight:bold; z-index:20;';
document.body.appendChild(clockDisplay);

const settingsIcon = document.createElement('div');
settingsIcon.style.cssText = 'position:fixed; top:12px; right:15px; width:35px; height:35px; background:rgba(0,0,0,0.5); border-radius:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:20; color:white; font-size:20px; border:1px solid rgba(255,255,255,0.3);';
settingsIcon.innerHTML = '⚙️';
settingsIcon.onclick = (e) => { e.stopPropagation(); toggleSettings(); };
document.body.appendChild(settingsIcon);

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

// --- JOYSTICK & TOUCH UI ---
if (isTouchDevice) {
    const joyContainer = document.createElement('div');
    joyContainer.style.cssText = 'position:fixed; bottom:50px; left:50px; width:120px; height:120px; background:rgba(255,255,255,0.2); border-radius:50%; z-index:100; touch-action:none;';
    document.body.appendChild(joyContainer);

    const joyKnob = document.createElement('div');
    joyKnob.style.cssText = 'position:absolute; top:35px; left:35px; width:50px; height:50px; background:white; border-radius:50%; opacity:0.5; pointer-events:none; transition: 0.1s;';
    joyContainer.appendChild(joyKnob);

    const jumpBtn = document.createElement('div');
    jumpBtn.style.cssText = 'position:fixed; bottom:50px; right:50px; width:80px; height:80px; background:rgba(255,255,255,0.3); border-radius:50%; z-index:100; display:flex; align-items:center; justify-content:center; font-weight:bold; color:white; touch-action:none;';
    jumpBtn.innerText = 'JUMP';
    document.body.appendChild(jumpBtn);

    const settingsBtnTouch = document.createElement('div');
    settingsBtnTouch.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); padding:10px 20px; background:rgba(0,0,0,0.5); color:white; border-radius:10px; z-index:100;';
    settingsBtnTouch.innerText = 'SETTINGS';
    document.body.appendChild(settingsBtnTouch);
    settingsBtnTouch.onclick = () => toggleSettings();

    const handleTouch = (e: TouchEvent) => {
        const touch = e.targetTouches[0]!; // Use targetTouches for joystick context
        const rect = joyContainer.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = touch.clientX - centerX;
        const dy = touch.clientY - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = 60;
        const ratio = Math.min(dist, maxDist) / maxDist;
        const angle = Math.atan2(dy, dx);
        
        joystickPos.x = Math.cos(angle) * ratio;
        joystickPos.y = Math.sin(angle) * ratio;
        joyKnob.style.transform = `translate(${joystickPos.x * 40}px, ${joystickPos.y * 40}px)`;
        joystickActive = true;
    };

    joyContainer.addEventListener('touchstart', (e) => { e.stopPropagation(); handleTouch(e); });
    joyContainer.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); handleTouch(e); });
    joyContainer.addEventListener('touchend', (e) => {
        e.stopPropagation();
        joystickPos = { x: 0, y: 0 };
        joyKnob.style.transform = 'translate(0,0)';
        joystickActive = false;
    });

    jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); keys['Space'] = true; });
    jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); keys['Space'] = false; });

    // Touch View Control (Improved Multi-Touch)
    let lookTouchId: number | null = null;
    let lastTouchX = 0, lastTouchY = 0;

    renderer.domElement.addEventListener('touchstart', (e) => {
        if (lookTouchId === null) {
            const touch = e.changedTouches[0]!;
            lookTouchId = touch.identifier;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchmove', (e) => {
        if (isGameStarted && !isSettingsOpen) {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i]!;
                if (touch.identifier === lookTouchId) {
                    const dx = touch.clientX - lastTouchX;
                    const dy = touch.clientY - lastTouchY;
                    camera.rotation.y -= dx * 0.005;
                    camera.rotation.x -= dy * 0.005;
                    camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, camera.rotation.x));
                    lastTouchX = touch.clientX;
                    lastTouchY = touch.clientY;
                    e.preventDefault();
                }
            }
        }
    }, { passive: false });

    renderer.domElement.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i]!.identifier === lookTouchId) {
                lookTouchId = null;
            }
        }
    });
}

const ui = document.createElement('div');
ui.style.cssText = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); display:flex; gap:8px; padding:10px; background:rgba(0,0,0,0.6); border-radius:15px; z-index:100; pointer-events:auto;';
document.body.appendChild(ui);

const hungerBarContainer = document.createElement('div');
hungerBarContainer.style.cssText = 'position:fixed; bottom:95px; left:50%; transform:translateX(-50%); width:200px; height:15px; background:rgba(0,0,0,0.5); border-radius:10px; overflow:hidden; border:2px solid rgba(255,255,255,0.2); z-index:100;';
document.body.appendChild(hungerBarContainer);

const hungerBar = document.createElement('div');
hungerBar.style.cssText = 'width:100%; height:100%; background:#ff5722; transition: width 0.3s;';
hungerBarContainer.appendChild(hungerBar);

const hungerLabel = document.createElement('div');
hungerLabel.style.cssText = 'position:fixed; bottom:115px; left:50%; transform:translateX(-50%); color:white; font-family:monospace; font-size:12px; font-weight:bold; z-index:100; text-shadow:1px 1px 2px black;';
hungerLabel.innerText = 'HUNGER';
document.body.appendChild(hungerLabel);

const updateHunger = (delta: number) => {
    hunger = Math.max(0, Math.min(100, hunger + delta));
    hungerBar.style.width = `${hunger}%`;
    if (hunger < 30) hungerBar.style.background = '#f44336';
    else if (hunger < 60) hungerBar.style.background = '#ff9800';
    else hungerBar.style.background = '#4CAF50';
};

const inv = ['grass', 'dirt', 'stone', 'wood', 'leaves', 'sand'];
let slot = 0;
const drawUI = () => {
    ui.innerHTML = '';
    inv.forEach((item, i) => {
        const s = document.createElement('div');
        s.style.cssText = `width:50px; height:50px; background:${i===slot?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.2)'}; border:2px solid ${i===slot?'#fff':'transparent'}; border-radius:10px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;`;
        s.innerHTML = `<div style="width:22px; height:22px; background:#${mats[item]!.color.getHexString()}; border-radius:4px; pointer-events:none;"></div><span style="font-size:10px; color:white; pointer-events:none;">${i+1}</span>`;
        s.onclick = (e) => { e.stopPropagation(); slot = i; drawUI(); };
        ui.appendChild(s);
    });
    // Update hand color to match selected block
    hand.style.background = `#${mats[inv[slot]!]!.color.getHexString()}`;
};
drawUI();

function animate() {
    requestAnimationFrame(animate);
    
    const now = performance.now();

    // 0. Block Breaking Logic
    if (breakingBlock && !isInventoryOpen && !isSettingsOpen) {
        const elapsed = now - breakingBlock.startTime;
        const progress = Math.min(1, elapsed / breakDuration);
        
        // Update circle UI
        breakProgressCircle.style.display = 'block';
        breakProgressCircle.style.borderTopColor = `hsl(${progress * 120}, 100%, 50%)`;
        breakProgressCircle.style.transform = `translate(-50%, -50%) rotate(${progress * 360}deg)`;
        
        if (elapsed >= breakDuration) {
            const blockType = getBlock(breakingBlock.x, breakingBlock.y, breakingBlock.z);
            if (blockType !== BlockType.AIR) {
                const blockName = idToName[blockType];
                if (blockName) {
                    addToInventory(blockName);
                    setBlock(breakingBlock.x, breakingBlock.y, breakingBlock.z, BlockType.AIR);
                    console.log('Broke and picked up ' + blockName);
                }
            }
            breakingBlock = null;
            breakProgressCircle.style.display = 'none';
        }
    }

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

    frames++;
    if (now > lastF + 1000) { fpsDisplay.innerText = `FPS: ${frames}`; frames = 0; lastF = now; }

    if (ctrl.isLocked || isTouchDevice) {
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
            
            if (joystickActive) {
                const spd = 0.15;
                ctrl.moveForward(-joystickPos.y * spd);
                ctrl.moveRight(joystickPos.x * spd);
            }

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
            
            if (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD'] || joystickActive) {
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

        if (joystickActive && !isFlying) {
            ctrl.moveForward(-joystickPos.y * speed);
            ctrl.moveRight(joystickPos.x * speed);
        }

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

        // 3. Hunger & Collection Logic
        if (now > lastHungerUpdate + 1000) {
            updateHunger(-hungerDecreaseRate * (isFlying ? 2 : 1));
            lastHungerUpdate = now;
        }

        entities.forEach((chunkEntities, chunkKey) => {
            for (let i = chunkEntities.length - 1; i >= 0; i--) {
                const ent = chunkEntities[i]!;
                
                if (ent.type === 'character') {
                    // 1. Character Gravity
                    ent.velY -= 0.01;
                    const nextY = ent.mesh.position.y + ent.velY;
                    const blockBelow = getBlock(ent.mesh.position.x, nextY, ent.mesh.position.z);
                    
                    if (blockBelow !== BlockType.AIR && blockBelow !== BlockType.WATER) {
                        ent.mesh.position.y = Math.floor(nextY) + 1;
                        ent.velY = 0;
                        ent.onGround = true;
                    } else {
                        ent.mesh.position.y = nextY;
                        ent.onGround = false;
                    }

                    // 2. Job-Specific AI
                    if (ent.onGround) {
                        if (!ent.targetPos || (ent.moveTimer && now > ent.moveTimer)) {
                            const angle = Math.random() * Math.PI * 2;
                            let dist = 2 + Math.random() * 4;
                            
                            // Adjust behavior based on job
                            if (ent.job === 'mining') dist = 1; // Stay near current spot
                            else if (ent.job === 'idle') dist = 0.5;

                            ent.targetPos = new THREE.Vector3(
                                ent.mesh.position.x + Math.cos(angle) * dist,
                                ent.mesh.position.y,
                                ent.mesh.position.z + Math.sin(angle) * dist
                            );
                            ent.moveTimer = now + 3000 + Math.random() * 5000;
                        }

                        const distToTarget = ent.mesh.position.distanceTo(ent.targetPos);
                        if (distToTarget > 0.2) {
                            const dir = ent.targetPos.clone().sub(ent.mesh.position).normalize();
                            ent.mesh.position.add(dir.multiplyScalar(0.02));
                            ent.mesh.lookAt(ent.targetPos.x, ent.mesh.position.y, ent.targetPos.z);
                            
                            // Visual indication of job
                            if (ent.job === 'farming' && Math.random() < 0.01) {
                                // Simulate "planting" by checking if block is grass and changing color slightly
                                const bx = Math.floor(ent.mesh.position.x), by = Math.floor(ent.mesh.position.y)-1, bz = Math.floor(ent.mesh.position.z);
                                if (getBlock(bx, by, bz) === BlockType.GRASS && Math.random() < 0.1) {
                                    // Could spawn a tiny plant mesh here
                                }
                            }
                        } else {
                            // Look at player if idle and close
                            const distToPlayer = camera.position.distanceTo(ent.mesh.position);
                            if (distToPlayer < 8) {
                                ent.mesh.lookAt(camera.position.x, ent.mesh.position.y, camera.position.z);
                            }
                        }
                    }
                }
            }
        });
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
