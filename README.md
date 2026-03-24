# ⛏️ Minecraft-1 (Iota Version)

A high-performance Minecraft clone built with **TypeScript** and **Three.js**, designed to run smoothly in modern web browsers. This project demonstrates advanced 3D voxel rendering and interactive world-building mechanics.

🌐 **Live Demo:** [https://minecraft-1-iota.vercel.app/](https://minecraft-1-iota.vercel.app/)

---

## 🚀 Overview
This project is a 1:1 scale voxel engine implementation. Unlike standard JavaScript clones, this version is built with a **97.9% TypeScript** codebase, ensuring better memory management and performance for 3D environments.

### Key Features:
- **Fast Chunk Rendering:** Optimized voxel chunks for high FPS.
- **Dynamic Interaction:** Real-time block placement and destruction.
- **Web-Native:** Powered by WebGL via Three.js—no downloads required.
- **Vercel Optimized:** Pre-configured for seamless cloud deployment.

---

## 🎮 How to Play
Once the world loads, click anywhere on the screen to lock your mouse and start playing.

| Key | Action |
| :--- | :--- |
| **W, A, S, D** | Move Character (Forward, Left, Backward, Right) |
| **Space** | Jump |
| **Left Click** | Mine / Destroy Block |
| **Right Click** | Build / Place Block |
| **1 - 9** | Select Hotbar Items |
| **0 (Zero)** | **Open Interface & Settings Menu** ⚙️ |
| **ESC** | Unlock Mouse Cursor / Pause |

> **Pro Tip:** Use the **"0"** key to toggle the UI overlay where you can adjust game settings and interface options.

---

## 🛠️ Technical Stack
- **Language:** TypeScript (Strict Typing)
- **Engine:** Three.js (WebGL)
- **Bundler:** Vite / Webpack (via `package.json` scripts)
- **Hosting:** Vercel

---

## 📂 Project Structure
Based on the repository layout:
- `/src`: Contains all TypeScript source logic, textures, and voxel engines.
- `/dist`: Production-ready compiled files.
- `index.html`: The main entry point for the browser.
- `vercel.json`: Deployment configuration for Vercel.

---

## 🔧 Local Setup & Development
To run this project on your local machine:

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Mirai-lab07/Minecraft-1.git](https://github.com/Mirai-lab07/Minecraft-1.git)

2. Navigate to the folder:
   **cd Minecraft-1**

3. Install dependencies:
   **npm install**

4. Start development server:
   **npm run dev**
