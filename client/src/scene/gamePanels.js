import * as THREE from 'three';
import { ROOM } from './cinema.js';

// Tranh game treo ở hai bên tường. Đứng trong `reach` (m) trước tranh thì nhấn E mở game (giao diện ở client/src/games/).
// Thêm game mới: thêm một dòng ở đây, một file ở client/src/games/ (đăng ký trong games/index.js) và một game ở server/games.js.
// y = độ cao sàn chỗ đó + 1.1 (ngang tầm mắt); sàn cao 0 ở z < -1, rồi tăng 0.4 mỗi 2 m.
const WALL_X = ROOM.maxX - 0.06;
export const GAME_PANELS = [
  { id: 'caro', title: 'CỜ CARO', icon: '❌⭕', color: '#ff7a59', x: -WALL_X, y: 1.1, z: -3.5, ry: Math.PI / 2 },
  { id: 'whack', title: 'ĐẬP CHUỘT', icon: '🔨', color: '#ffd36b', x: -WALL_X, y: 1.5, z: 0, ry: Math.PI / 2 },
  { id: 'snake', title: 'RẮN SĂN MỒI', icon: '🐍', color: '#6bff9d', x: WALL_X, y: 1.1, z: -3.5, ry: -Math.PI / 2 },
  { id: 'g2048', title: '2048', icon: '🔢', color: '#6bd1ff', x: WALL_X, y: 1.5, z: 0, ry: -Math.PI / 2 },
  { id: 'dice', title: 'BẦU CUA · TÀI XỈU', icon: '🎲🦀', color: '#ff5d7a', x: -WALL_X, y: 1.9, z: 2, ry: Math.PI / 2 },
  { id: 'connect4', title: 'NỐI 4', icon: '🔴🟡', color: '#ffe14d', x: WALL_X, y: 1.9, z: 2, ry: -Math.PI / 2 },
  { id: 'werewolf', title: 'MA SÓI', icon: '🐺🌙', color: '#ff5d5d', x: -4.5, y: 2.3, z: ROOM.maxZ - 0.06, ry: Math.PI }, // tường sau, bên kia bảng mic
  { id: 'vote', title: 'BÌNH CHỌN PHIM', icon: '🗳️🎬', color: '#c58bff', x: 4.5, y: 2.3, z: ROOM.maxZ - 0.06, ry: Math.PI }, // tường sau, cạnh bảng mic
].map((p) => ({ ...p, width: 1.7, height: 1.0, reach: 2.2 }));

const CANVAS_W = 680;
const CANVAS_H = 400;

function drawPanel(g, panel, brief) {
  g.fillStyle = '#14161c';
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  g.strokeStyle = panel.color;
  g.lineWidth = 8;
  g.strokeRect(4, 4, CANVAS_W - 8, CANVAS_H - 8);
  g.textAlign = 'center';
  g.fillStyle = panel.color;
  let size = 50;
  g.font = `bold ${size}px sans-serif`;
  while (g.measureText(panel.title).width > CANVAS_W - 40 && size > 24) g.font = `bold ${--size}px sans-serif`; // tên dài thì thu nhỏ cho vừa tranh
  g.fillText(panel.title, CANVAS_W / 2, 78);
  g.fillStyle = '#ffffff';
  g.font = '120px sans-serif';
  g.fillText(panel.icon, CANVAS_W / 2, 238);
  g.fillStyle = '#ffd36b';
  let briefSize = 30;
  g.font = `bold ${briefSize}px sans-serif`;
  while (g.measureText(brief || '').width > CANVAS_W - 40 && briefSize > 16) g.font = `bold ${--briefSize}px sans-serif`;
  g.fillText(brief || '', CANVAS_W / 2, 300);
  g.fillStyle = '#9aa3b5';
  g.font = '24px sans-serif';
  g.fillText('Đứng gần và nhấn E để chơi', CANVAS_W / 2, 360);
}

// Dựng các tranh vào scene; trả về setBrief(id, text) để đổi dòng tóm tắt (ai đang chơi, kỷ lục...)
export function buildGamePanels(scene) {
  const faces = new Map();
  for (const panel of GAME_PANELS) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const g = canvas.getContext('2d');
    drawPanel(g, panel, '');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const dir = new THREE.Vector3(Math.sin(panel.ry), 0, Math.cos(panel.ry)); // pháp tuyến: hướng vào phòng
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(panel.width, panel.height),
      new THREE.MeshBasicMaterial({ map: texture, color: 0xdddddd })
    );
    face.position.set(panel.x, panel.y, panel.z);
    face.rotation.y = panel.ry;
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(panel.width + 0.1, panel.height + 0.1, 0.04),
      new THREE.MeshLambertMaterial({ color: 0x23262e })
    );
    frame.position.set(panel.x - dir.x * 0.03, panel.y, panel.z - dir.z * 0.03);
    frame.rotation.y = panel.ry;
    scene.add(frame, face);
    faces.set(panel.id, { panel, g, texture });
  }
  return {
    setBrief(id, text) {
      const f = faces.get(id);
      if (!f) return;
      drawPanel(f.g, f.panel, text);
      f.texture.needsUpdate = true;
    },
  };
}
