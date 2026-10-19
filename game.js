import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// ==================================================
// VOXEL REALMS — PART 1: ENGINE AND WORLD GENERATION
// ==================================================

const $ = id => document.getElementById(id);
const host = $("scene");

if (!host) {
  throw new Error('Cannot find the game canvas container: id="scene". Check index.html.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 25, 70);

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc9e8ff, 0x52603d, 2));

const sun = new THREE.DirectionalLight(0xfff0cb, 2.5);
sun.position.set(-15, 25, 12);
sun.castShadow = true;
scene.add(sun);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
raycaster.far = 7;

// Game state
let blocks = [];
let mobs = [];
let items = [];
let projectiles = [];
let portals = [];

let worldName = "overworld";
let started = false;
let paused = false;
let dead = false;
let locked = false;

let keys = {};
let yaw = 0;
let pitch = 0;
let jumpVelocity = 0;
let onGround = false;
let attackCooldown = 0;
let damageCooldown = 0;
let armorOn = false;
let health = 100;
let hunger = 100;
let armor = 0;
let xp = 0;
let day = 1;
let dayTime = 8;
let elapsed = 0;
let selectedSlot = 0;
let toastTimer;

const player = {
  position: new THREE.Vector3(0, 3, 5),
  speed: 6
};

const colors = {
  grass: 0x68ad52,
  dirt: 0x8c5b39,
  stone: 0x858c9a,
  wood: 0x90613b,
  leaves: 0x32804b,
  sand: 0xd9c27d,
  netherrack: 0x782d35,
  soul: 0x286d7d,
  endstone: 0xc9c18b,
  obsidian: 0x32254e,
  brick: 0xa95345
};

const worlds = {
  overworld: {
    label: "The Overworld",
    badge: "🌿 OVERWORLD",
    sky: 0x87ceeb,
    info: "Forests, villages and wildlife"
  },
  nether: {
    label: "The Nether",
    badge: "🔥 THE NETHER",
    sky: 0x45121c,
    info: "Lava, fire and hostile creatures"
  },
  end: {
    label: "The End",
    badge: "🌌 THE END",
    sky: 0x170d32,
    info: "Dark skies, Endermen and the dragon"
  }
};

const inventory = [
  { name: "Sword", icon: "⚔️", count: 1, type: "weapon" },
  { name: "Grass", icon: "🟩", count: 24, type: "block" },
  { name: "Apple", icon: "🍎", count: 3, type: "food", heal: 15 },
  { name: "Bread", icon: "🍞", count: 2, type: "food", heal: 25 },
  { name: "Steak", icon: "🥩", count: 1, type: "food", heal: 35 }
];

const itemInfo = {
  Apple: { icon: "🍎", heal: 15, color: 0xe94353 },
  Bread: { icon: "🍞", heal: 25, color: 0xd9aa56 },
  Steak: { icon: "🥩", heal: 35, color: 0xb94f46 },
  Carrot: { icon: "🥕", heal: 10, color: 0xf28c28 },
  Potato: { icon: "🥔", heal: 12, color: 0xc9a66b },
  Feather: { icon: "🪶", color: 0xf3f4f6 },
  Leather: { icon: "🟫", color: 0x9c6843 },
  Wool: { icon: "⬜", color: 0xe8e8e8 },
  RawMeat: { icon: "🥩", color: 0xb94f46 }
};

const mobColors = {
  Zombie: 0x438b60,
  Creeper: 0x54d35c,
  Skeleton: 0xe2dfd2,
  Blaze: 0xff9b28,
  Villager: 0xc58c62,
  Golem: 0xb9b9a5,
  Cow: 0x5a4137,
  Pig: 0xf29ab0,
  Sheep: 0xe9e9e9,
  Chicken: 0xfff2dc,
  Enderman: 0x30204c,
  Dragon: 0x32254e
};

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);

function material(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addPart(parent, x, y, z, sx, sy, sz, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    material(color)
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBlock(x, y, z, kind, unbreakable = false) {
  const block = new THREE.Mesh(
    cubeGeometry,
    material(colors[kind] ?? colors.stone)
  );

  block.position.set(x, y, z);
  block.castShadow = true;
  block.receiveShadow = true;
  block.userData = {
    block: true,
    kind,
    unbreakable
  };

  scene.add(block);
  blocks.push(block);
  return block;
}

function clearWorld() {
  for (const object of [
    ...blocks, ...mobs, ...items, ...projectiles, ...portals
  ]) {
    scene.remove(object);
  }

  blocks = [];
  mobs = [];
  items = [];
  projectiles = [];
  portals = [];
}

function createTree(x, z) {
  for (let y = 1; y <= 3; y++) {
    addBlock(x, y, z, "wood");
  }

  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      if (Math.abs(dx) + Math.abs(dz) < 4) {
        addBlock(x + dx, 4, z + dz, "leaves");
      }
    }
  }

  addBlock(x, 5, z, "leaves");
}

function createHouse(x, z) {
  // Floor
  for (let dx = 0; dx < 5; dx++) {
    for (let dz = 0; dz < 5; dz++) {
      addBlock(x + dx, 0, z + dz, "wood");
    }
  }

  // Walls, with a doorway
  for (let y = 1; y <= 3; y++) {
    for (let i = 0; i < 5; i++) {
      if (!(i === 2 && y <= 2)) {
        addBlock(x + i, y, z, "wood");
      }

      addBlock(x + i, y, z + 4, "wood");

      if (i !== 0 && i !== 4) {
        addBlock(x, y, z + i, "wood");
        addBlock(x + 4, y, z + i, "wood");
      }
    }
  }

  // Flat roof
  for (let dx = -1; dx <= 5; dx++) {
    for (let dz = -1; dz <= 5; dz++) {
      addBlock(x + dx, 4, z + dz, "brick");
    }
  }
}

function createVillage() {
  createHouse(5, -8);
  createHouse(-7, -8);
  createHouse(5, 3);

  spawnMob("Villager", 4, -4);
  spawnMob("Villager", 9, -5);
  spawnMob("Villager", -5, -3);
  spawnMob("Golem", 0, -3);
}

function spawnItem(kind, x, z) {
  const info = itemInfo[kind] ?? {
    icon: "📦",
    color: 0xffffff
  };

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.38, 0.38),
    material(info.color)
  );

  mesh.position.set(x, 0.7, z);
  mesh.userData = { item: true, kind };

  scene.add(mesh);
  items.push(mesh);
}

function createPortal(x, z, destination) {
  const group = new THREE.Group();
  group.position.set(x, 1, z);

  const frame = material(colors.obsidian);
  const glow = new THREE.MeshBasicMaterial({
    color: destination === "nether" ? 0xc15aff : 0x9b8aff,
    side: THREE.DoubleSide
  });

  // Portal frame
  for (const [dx, dy] of [
    [-1, 0], [-1, 1], [-1, 2],
    [1, 0], [1, 1], [1, 2],
    [0, 2], [0, -1]
  ]) {
    const part = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 1, 0.35),
      frame
    );

    part.position.set(dx, dy, 0);
    group.add(part);
  }

  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 2.6),
    glow
  );

  surface.position.z = -0.1;
  group.add(surface);

  group.userData.destination = destination;
  scene.add(group);
  portals.push(group);
}

// The world generation, creatures, controls and game loop
// will be added in Parts 2, 3 and 4.
function spawnMob(kind, x, z) {
  const group = new THREE.Group();

  const flying = kind === "Blaze" || kind === "Dragon";
  group.position.set(x, flying ? 2.5 : 1, z);

  const animal = [
    "Cow", "Pig", "Sheep", "Chicken"
  ].includes(kind);

  const friendly = [
    "Villager", "Golem", "Cow", "Pig", "Sheep", "Chicken"
  ].includes(kind);

  const maxHp = kind === "Dragon" ? 300 :
                kind === "Golem" ? 150 :
                kind === "Creeper" ? 30 : 40;

  group.userData = {
    mob: true,
    kind,
    hp: maxHp,
    maxHp,
    hostile: !friendly,
    speed: kind === "Creeper" ? 2.3 :
           kind === "Zombie" ? 1.5 :
           kind === "Enderman" ? 2.1 : 1.1,
    attack: kind === "Golem" ? 18 :
            kind === "Creeper" ? 28 : 8,
    cooldown: Math.random() * 2,
    phase: Math.random() * 10,
    animal,
    wander: new THREE.Vector3(x, 0, z)
  };

  const color = mobColors[kind] ?? 0x888888;

  if (kind === "Dragon") {
    addPart(group, 0, 0, 0, 2, 1.2, 3, color);
    addPart(group, 0, 0.5, -2, 0.8, 0.8, 1, 0x46356d);
    addPart(group, 0, 0.7, -2.7, 1.2, 0.35, 0.6, 0x8d7dff);

    // Wings
    addPart(group, -1.7, 0.1, 0, 2.8, 0.15, 2.4, 0x49376d);
    addPart(group, 1.7, 0.1, 0, 2.8, 0.15, 2.4, 0x49376d);

  } else if (kind === "Blaze") {
    addPart(group, 0, 0, 0, 0.65, 0.8, 0.65, 0xffc344);

    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      addPart(
        group,
        Math.cos(angle) * 0.7,
        Math.sin(angle) * 0.8,
        0,
        0.14, 0.38, 0.14,
        0xff7b20
      );
    }

  } else if (kind === "Enderman") {
    addPart(group, 0, 0.8, 0, 0.4, 1.4, 0.35, color);
    addPart(group, 0, 1.8, 0, 0.55, 0.55, 0.5, color);
    addPart(group, -0.35, 0.8, 0, 0.12, 1.4, 0.12, color);
    addPart(group, 0.35, 0.8, 0, 0.12, 1.4, 0.12, color);
    addPart(group, -0.13, 1.85, -0.26, 0.1, 0.07, 0.03, 0xff47dc);
    addPart(group, 0.13, 1.85, -0.26, 0.1, 0.07, 0.03, 0xff47dc);
    addPart(group, -0.14, -0.1, 0, 0.15, 0.7, 0.15, color);
    addPart(group, 0.14, -0.1, 0, 0.15, 0.7, 0.15, color);

  } else if (animal) {
    // Four-legged animal body and head
    addPart(group, 0, 0, 0, 0.85, 0.65, 1.1, color);
    addPart(group, 0, 0.25, -0.65, 0.48, 0.48, 0.48, color);

    for (const dx of [-0.27, 0.27]) {
      for (const dz of [-0.32, 0.32]) {
        addPart(group, dx, -0.48, dz, 0.17, 0.5, 0.17, color);
      }
    }

    if (kind === "Cow") {
      addPart(group, -0.2, 0.12, -0.05, 0.22, 0.22, 0.55, 0xe8e2d7);
      addPart(group, 0.2, 0.12, 0.15, 0.22, 0.22, 0.55, 0xe8e2d7);
    }

    if (kind === "Chicken") {
      addPart(group, 0, 0.53, -0.7, 0.16, 0.18, 0.15, 0xe84141);
      addPart(group, 0, 0.25, -0.93, 0.15, 0.12, 0.12, 0xffbb30);
    }

  } else {
    // Humanoid mobs, villagers, golems and skeletons
    const tall = kind === "Golem";
    const bodyHeight = tall ? 1.35 : 0.85;
    const bodyWidth = tall ? 0.85 : 0.65;

    addPart(
      group, 0, 0, 0,
      bodyWidth, bodyHeight, 0.45,
      color
    );

    addPart(
      group, 0, bodyHeight * 0.75 + 0.25, 0,
      0.5, 0.5, 0.5,
      color
    );

    for (const dx of [-0.4, 0.4]) {
      addPart(group, dx, 0.05, 0, 0.18, 0.7, 0.2, color);
    }

    for (const dx of [-0.19, 0.19]) {
      addPart(group, dx, -0.65, 0, 0.2, 0.55, 0.22, color);
    }

    if (kind === "Skeleton") {
      // Bow
      addPart(group, 0.5, 0.1, -0.12, 0.08, 0.75, 0.08, 0x82512d);
    }

    if (kind === "Villager") {
      addPart(group, 0, 0.85, -0.28, 0.35, 0.08, 0.04, 0x51352b);
    }

    if (kind === "Creeper") {
      // Dark pixel face
      addPart(group, -0.12, 0.9, -0.26, 0.1, 0.12, 0.04, 0x17351d);
      addPart(group, 0.12, 0.9, -0.26, 0.1, 0.12, 0.04, 0x17351d);
      addPart(group, 0, 0.7, -0.27, 0.12, 0.2, 0.04, 0x17351d);
    }
  }

  scene.add(group);
  mobs.push(group);
  return group;
}

function removeMob(mob) {
  const kind = mob.userData.kind;

  if (kind === "Cow" || kind === "Pig") {
    spawnItem("RawMeat", mob.position.x, mob.position.z);
  } else if (kind === "Sheep") {
    spawnItem("Wool", mob.position.x, mob.position.z);
  } else if (kind === "Chicken") {
    spawnItem("Feather", mob.position.x, mob.position.z);
    if (Math.random() < 0.5) {
      spawnItem("RawMeat", mob.position.x + 0.4, mob.position.z);
    }
  } else if (kind === "Dragon") {
    xp += 100;
    showToast("🐉 THE ENDER DRAGON IS DEFEATED!");
  } else if (kind === "Golem") {
    spawnItem("Leather", mob.position.x, mob.position.z);
  } else {
    xp += 5;

    if (Math.random() < 0.4) {
      spawnItem("Apple", mob.position.x, mob.position.z);
    }
  }

  scene.remove(mob);
  mobs = mobs.filter(other => other !== mob);
  updateHUD();
}

function createDragon() {
  return spawnMob("Dragon", 0, -10);
}

// ==================================================
// WORLD GENERATION
// ==================================================

function generateWorld(name) {
  if (!worlds[name]) return;

  clearWorld();
  worldName = name;

  const settings = worlds[name];
  scene.background = new THREE.Color(settings.sky);
  scene.fog = new THREE.Fog(settings.sky, 25, 70);

  sun.color.set(name === "nether" ? 0xff7777 : 0xfff0cb);
  sun.intensity = name === "nether" ? 1.1 : 2.5;

  if (name === "overworld") {
    for (let x = -18; x <= 18; x++) {
      for (let z = -18; z <= 18; z++) {
        const wave = Math.sin(x * 0.35) * Math.cos(z * 0.27);
        const height = Math.abs(x) > 13 || Math.abs(z) > 13
          ? (wave > 0.45 ? 1 : 0)
          : 0;

        for (let y = -2; y <= height; y++) {
          const kind = y === height ? "grass" :
                       y === height - 1 ? "dirt" : "stone";

          addBlock(x, y, z, kind, y === -2);
        }
      }
    }

    createTree(-11, -2);
    createTree(-14, 8);
    createTree(13, 9);
    createTree(12, -13);
    createTree(-8, 12);

    createVillage();

    for (const type of ["Zombie", "Creeper", "Skeleton"]) {
      for (let i = 0; i < 3; i++) {
        spawnMob(type, randomInt(-15, 15), randomInt(5, 15));
      }
    }

    spawnMob("Cow", -5, 4);
    spawnMob("Pig", 2, 7);
    spawnMob("Sheep", -10, 4);
    spawnMob("Chicken", 3, -2);

    spawnItem("Apple", -11, -2);
    spawnItem("Apple", -14, 8);
    spawnItem("Bread", 7, -5);
    spawnItem("Carrot", 1, -7);
    spawnItem("Steak", -5, 4);
    spawnItem("Potato", 3, -7);

    createPortal(15, -3, "nether");
    createPortal(-15, -3, "end");

  } else if (name === "nether") {
    for (let x = -18; x <= 18; x++) {
      for (let z = -18; z <= 18; z++) {
        addBlock(x, -1, z, "netherrack");

        if (Math.random() < 0.035) {
          addBlock(x, 0, z, "soul");
        }
      }
    }

    // Glowing lava pools
    for (const [cx, cz] of [[-7, -6], [8, 8], [-12, 10]]) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx * dx + dz * dz <= 5) {
            const lava = new THREE.Mesh(
              cubeGeometry,
              new THREE.MeshBasicMaterial({ color: 0xff541e })
            );

            lava.position.set(cx + dx, -0.42, cz + dz);
            lava.userData = {
              block: true,
              kind: "lava",
              lava: true
            };

            scene.add(lava);
            blocks.push(lava);
          }
        }
      }
    }

    for (let i = 0; i < 7; i++) {
      spawnMob(
        i % 2 ? "Blaze" : "Zombie",
        randomInt(-12, 12),
        randomInt(-12, 12)
      );
    }

    createPortal(-3, 5, "overworld");

  } else if (name === "end") {
    // Several End islands
    for (const [cx, cz, radius] of [
      [0, 0, 5],
      [12, 3, 3],
      [-12, 5, 4],
      [4, -13, 3]
    ]) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dz * dz <= radius * radius) {
            addBlock(cx + dx, -1, cz + dz, "endstone");
          }
        }
      }
    }

    createDragon();

    for (let i = 0; i < 6; i++) {
      spawnMob(
        "Enderman",
        randomInt(-13, 13),
        randomInt(-13, 13)
      );
    }

    createPortal(0, 5, "overworld");
  }

  player.position.set(0, 3, 5);
  jumpVelocity = 0;
  updateHUD();
  showToast("Entered " + settings.label);
}

// ==================================================
// END OF PART 2
// Part 3 adds inventory, food, combat and building.
// ==================================================
// ==================================================
// VOXEL REALMS — PART 3: SURVIVAL AND COMBAT
// ==================================================

function showToast(message) {
  const el = $("toast");

  if (el) {
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 2200);
  } else {
    console.log(message);
  }
}

function updateHUD() {
  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  const setBar = (id, value) => {
    const el = $(id);
    if (el) el.style.width = Math.max(0, Math.min(100, value)) + "%";
  };

  setText("health-value", Math.ceil(health));
  setText("hunger-value", Math.ceil(hunger));
  setText("armor-value", armor);
  setText("xp-value", xp);
  setText("day-value", day);
  setText("dimension-name", worlds[worldName].label);

  setBar("health-bar", health);
  setBar("hunger-bar", hunger);
  setBar("armor-bar", armor * 10);

  const badge = $("dimension-badge");
  if (badge) badge.textContent = worlds[worldName].badge;

  const hotbar = $("hotbar");
  if (hotbar) {
    hotbar.innerHTML = "";

    inventory.forEach((slot, i) => {
      const button = document.createElement("button");
      button.className = "hotbar-slot" +
        (i === selectedSlot ? " selected" : "");

      button.innerHTML = `
        <span class="slot-number">${i + 1}</span>
        <span class="slot-icon">${slot.icon}</span>
        <span class="slot-count">${slot.count || ""}</span>
      `;

      button.title = slot.name;
      button.addEventListener("click", () => {
        selectedSlot = i;
        updateHUD();
      });

      hotbar.appendChild(button);
    });
  }

  const inv = $("inventory-list");
  if (inv) {
    inv.innerHTML = "";

    inventory.forEach((slot, i) => {
      const button = document.createElement("button");
      button.className = "inventory-item";
      button.textContent =
        `${slot.icon} ${slot.name} ×${slot.count}`;
      button.addEventListener("click", () => {
        selectedSlot = i;
        updateHUD();
      });

      inv.appendChild(button);
    });
  }
}

function addToInventory(kind, count = 1) {
  const info = itemInfo[kind] ?? { icon: "📦" };

  let slot = inventory.find(item => item.name === kind);

  if (!slot) {
    slot = {
      name: kind,
      icon: info.icon,
      count: 0,
      type: info.heal ? "food" : "material",
      heal: info.heal || 0
    };
    inventory.push(slot);
  }

  slot.count += count;
  updateHUD();
}

function collectItems() {
  for (const item of [...items]) {
    if (item.position.distanceTo(player.position) < 1.5) {
      const kind = item.userData.kind;

      if (kind === "RawMeat") {
        addToInventory("Steak");
      } else {
        addToInventory(kind);
      }

      scene.remove(item);
      items = items.filter(other => other !== item);
      showToast(`Collected ${kind}!`);
    }
  }
}

function eatFood() {
  const slot = inventory[selectedSlot];

  if (!slot || slot.type !== "food" || slot.count <= 0) {
    showToast("Select food in your hotbar first!");
    return;
  }

  if (hunger >= 100 && health >= 100) {
    showToast("You're already fully fed and healthy!");
    return;
  }

  slot.count--;

  hunger = Math.min(100, hunger + 30);
  health = Math.min(100, health + (slot.heal || 10));

  showToast(`You ate ${slot.name}!`);
  updateHUD();
}

function equipArmor() {
  armorOn = !armorOn;
  armor = armorOn ? 5 : 0;

  showToast(armorOn
    ? "🛡️ Iron armour equipped!"
    : "Armour removed.");

  updateHUD();
}

function damagePlayer(amount) {
  if (dead || damageCooldown > 0) return;

  const reduced = Math.max(1, amount * (1 - armor * 0.08));
  health = Math.max(0, health - reduced);
  damageCooldown = 0.65;

  const flash = $("damage-flash");
  if (flash) {
    flash.classList.add("active");
    setTimeout(() => flash.classList.remove("active"), 150);
  }

  if (health <= 0) {
    dead = true;

    const screen = $("death-screen");
    if (screen) screen.classList.remove("hidden");

    document.exitPointerLock?.();
    showToast("You were defeated! Try again.");
  }

  updateHUD();
}

function attackTarget(target) {
  const kind = target.userData.kind;

  if (kind === "Villager") {
    showToast("Villagers are friendly!");
    return;
  }

  const slot = inventory[selectedSlot];
  const damage = slot?.type === "weapon" ? 20 : 7;

  target.userData.hp -= damage;
  showToast(`${kind}: ${Math.max(0, target.userData.hp)} HP`);

  // Knockback
  const direction = target.position.clone()
    .sub(player.position)
    .setY(0)
    .normalize();

  target.position.addScaledVector(direction, 0.5);

  if (target.userData.hp <= 0) {
    removeMob(target);
  }
}

function mineOrAttack() {
  if (!started || paused || dead) return;

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

  const mobHits = raycaster.intersectObjects(
    mobs.flatMap(m => m.children),
    true
  );

  if (mobHits.length) {
    let object = mobHits[0].object;

    while (object && !object.userData.mob) {
      object = object.parent;
    }

    if (object?.userData.mob) {
      attackTarget(object);
      return;
    }

    // Resolve the owning mob through its parent group.
    let group = mobHits[0].object.parent;
    while (group && !group.userData.mob) group = group.parent;

    if (group) {
      attackTarget(group);
      return;
    }
  }

  const blockHits = raycaster.intersectObjects(blocks, false);

  if (blockHits.length) {
    const block = blockHits[0].object;

    if (block.userData.unbreakable) {
      showToast("This block cannot be broken!");
      return;
    }

    if (block.userData.lava) {
      showToast("Careful! That's lava!");
      return;
    }

    const kind = block.userData.kind;

    scene.remove(block);
    blocks = blocks.filter(b => b !== block);

    if (kind === "grass") {
      addToInventory("Grass");
    } else if (kind === "wood") {
      addToInventory("Wood");
    } else {
      addToInventory(kind);
    }
  }
}

function placeBlock() {
  if (!started || paused || dead) return;

  const slot = inventory[selectedSlot];

  if (!slot || slot.type !== "block" || slot.count <= 0) {
    showToast("Select a building block first!");
    return;
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(blocks, false);

  if (!hits.length) return;

  const hit = hits[0];

  if (hit.object.userData.lava) return;

  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);

  const position = hit.object.position.clone()
    .add(normal);

  if (position.distanceTo(player.position) < 1.2) {
    showToast("You can't place a block inside yourself!");
    return;
  }

  const kind = slot.name === "Grass" ? "grass" :
               slot.name === "Wood" ? "wood" :
               slot.name === "Stone" ? "stone" : null;

  if (!kind) {
    showToast("Select grass, wood or stone to build!");
    return;
  }

  addBlock(
    Math.round(position.x),
    Math.round(position.y),
    Math.round(position.z),
    kind
  );

  slot.count--;
  updateHUD();
}

function fireProjectile(target, kind = "arrow") {
  const color = kind === "fireball" ? 0xff5c22 : 0xd5d5d5;

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(kind === "fireball" ? 0.22 : 0.09, 8, 8),
    new THREE.MeshBasicMaterial({ color })
  );

  mesh.position.copy(target.position);
  mesh.position.y += 1;

  const direction = player.position.clone()
    .add(new THREE.Vector3(0, 1, 0))
    .sub(mesh.position)
    .normalize();

  mesh.userData = {
    velocity: direction.multiplyScalar(kind === "fireball" ? 7 : 12),
    life: 4,
    kind
  };

  scene.add(mesh);
  projectiles.push(mesh);
}

function updateProjectiles(dt) {
  for (const p of [...projectiles]) {
    p.position.addScaledVector(p.userData.velocity, dt);
    p.userData.life -= dt;

    if (p.position.distanceTo(player.position) < 0.8) {
      damagePlayer(p.userData.kind === "fireball" ? 18 : 10);
      p.userData.life = 0;
    }

    if (p.userData.life <= 0) {
      scene.remove(p);
      projectiles = projectiles.filter(other => other !== p);
    }
  }
}

// ==================================================
// END OF PART 3
// Part 4 completes movement, mob AI, UI and game loop.
// ==================================================
// ==================================================
// VOXEL REALMS — PART 4: CONTROLS, AI AND GAME LOOP
// ==================================================

const GRAVITY = 22;
const JUMP_POWER = 8;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;

function resizeGame() {
  const width = host.clientWidth || window.innerWidth;
  const height = host.clientHeight || window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", resizeGame);
resizeGame();

function togglePause(force) {
  paused = typeof force === "boolean" ? force : !paused;

  const panel = $("pause-screen");
  if (panel) panel.classList.toggle("hidden", !paused);

  if (paused) {
    document.exitPointerLock?.();
  }
}

function startGame() {
  started = true;
  paused = false;
  dead = false;

  const startScreen = $("start-screen");
  const deathScreen = $("death-screen");
  const pauseScreen = $("pause-screen");

  if (startScreen) startScreen.classList.add("hidden");
  if (deathScreen) deathScreen.classList.add("hidden");
  if (pauseScreen) pauseScreen.classList.add("hidden");

  host.requestPointerLock?.();
}

function restartGame() {
  health = 100;
  hunger = 100;
  armor = 0;
  armorOn = false;
  xp = 0;
  day = 1;
  dayTime = 8;

  inventory.length = 0;
  inventory.push(
    { name: "Sword", icon: "⚔️", count: 1, type: "weapon" },
    { name: "Grass", icon: "🟩", count: 24, type: "block" },
    { name: "Apple", icon: "🍎", count: 3, type: "food", heal: 15 },
    { name: "Bread", icon: "🍞", count: 2, type: "food", heal: 25 },
    { name: "Steak", icon: "🥩", count: 1, type: "food", heal: 35 }
  );

  selectedSlot = 0;
  player.position.set(0, 3, 5);
  jumpVelocity = 0;
  damageCooldown = 0;
  dead = false;

  generateWorld("overworld");
  startGame();
}

function playerMove(dt) {
  const forward = new THREE.Vector3(
    -Math.sin(yaw), 0, -Math.cos(yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(yaw), 0, -Math.sin(yaw)
  );

  const move = new THREE.Vector3();

  if (keys.KeyW || keys.ArrowUp) move.add(forward);
  if (keys.KeyS || keys.ArrowDown) move.sub(forward);
  if (keys.KeyD || keys.ArrowRight) move.add(right);
  if (keys.KeyA || keys.ArrowLeft) move.sub(right);

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(player.speed * dt);
  }

  const oldX = player.position.x;
  const oldZ = player.position.z;

  player.position.x += move.x;
  player.position.z += move.z;

  // Prevent walking through solid blocks at body height.
  for (const block of blocks) {
    if (block.userData.lava) continue;

    const bx = block.position.x;
    const by = block.position.y;
    const bz = block.position.z;

    const overlapsX =
      Math.abs(player.position.x - bx) < 0.5 + PLAYER_RADIUS;
    const overlapsZ =
      Math.abs(player.position.z - bz) < 0.5 + PLAYER_RADIUS;

    const overlapsY =
      player.position.y < by + 0.5 &&
      player.position.y + PLAYER_HEIGHT >by - 0.5;

    if (overlapsX && overlapsZ && overlapsY) {
      player.position.x = oldX;
      player.position.z = oldZ;
      break;
    }
  }

  // Gravity and jumping
  jumpVelocity -= GRAVITY * dt;
  player.position.y += jumpVelocity * dt;
  onGround = false;

  for (const block of blocks) {
    if (block.userData.lava) continue;

    const overlapsX =
      Math.abs(player.position.x - block.position.x) < 0.5 + PLAYER_RADIUS;
    const overlapsZ =
      Math.abs(player.position.z - block.position.z) < 0.5 + PLAYER_RADIUS;

    if (!overlapsX || !overlapsZ) continue;

    const top = block.position.y + 0.5;

    if (
      jumpVelocity <= 0 &&
      player.position.y <= top &&
      player.position.y + PLAYER_HEIGHT > top - 0.1
    ) {
      player.position.y = top;
      jumpVelocity = 0;
      onGround = true;
    }
  }

  // Void protection
  if (player.position.y < -8) {
    damagePlayer(100);
    player.position.set(0, 3, 5);
  }

  // Lava damage
  for (const block of blocks) {
    if (!block.userData.lava) continue;

    if (
      Math.abs(player.position.x - block.position.x) < 0.6 &&
      Math.abs(player.position.z - block.position.z) < 0.6 &&
      player.position.y < 1
    ) {
      damagePlayer(20 * dt);
    }
  }

  camera.position.set(
    player.position.x,
    player.position.y + 1.5,
    player.position.z
  );

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

function updateMobs(dt) {
  for (const mob of [...mobs]) {
    const data = mob.userData;
    data.cooldown -= dt;
    data.phase += dt * 3;

    const dx = player.position.x - mob.position.x;
    const dz = player.position.z - mob.position.z;
    const distance = Math.hypot(dx, dz);

    if (data.kind === "Dragon") {
      mob.position.y = 3.5 + Math.sin(elapsed * 1.5) * 1.2;
      mob.position.x += Math.sin(elapsed * 0.4) * dt * 2;
      mob.position.z += Math.cos(elapsed * 0.4) * dt * 2;
      mob.rotation.y = Math.atan2(dx, dz);

      if (distance < 3 && data.cooldown <= 0) {
        damagePlayer(18);
        data.cooldown = 1.8;
      } else if (distance < 18 && data.cooldown <= 0) {
        fireProjectile(mob, "fireball");
        data.cooldown = 2.5;
      }

      continue;
    }

    if (data.kind === "Blaze") {
      mob.position.y = 2.5 + Math.sin(data.phase) * 0.45;

      if (distance < 18 && data.cooldown <= 0) {
        fireProjectile(mob, "fireball");
        data.cooldown = 2.8;
      }

      mob.rotation.y = Math.atan2(dx, dz);
      continue;
    }

    if (data.kind === "Skeleton") {
      if (distance < 12 && data.cooldown <= 0) {
        fireProjectile(mob, "arrow");
        data.cooldown = 2;
      }

      mob.rotation.y = Math.atan2(dx, dz);

      if (distance > 7 && distance < 20) {
        mob.position.x += dx / distance * data.speed * dt;
        mob.position.z += dz / distance * data.speed * dt;
      }

      continue;
    }

    if (data.kind === "Creeper") {
      if (distance < 1.5 && data.cooldown <= 0) {
        damagePlayer(28);

        for (const other of [...mobs]) {
          if (
            other.userData.hostile &&
            other.position.distanceTo(mob.position) < 3
          ) {
            other.userData.hp -= 25;
            if (other.userData.hp <= 0) removeMob(other);
          }
        }

        scene.remove(mob);
        mobs = mobs.filter(other => other !== mob);
        continue;
      }
    }

    if (data.hostile && distance < 15) {
      if (distance > 1.25) {
        mob.position.x += dx / Math.max(distance, 0.01) * data.speed * dt;
        mob.position.z += dz / Math.max(distance, 0.01) * data.speed * dt;
      } else if (data.cooldown <= 0) {
        damagePlayer(data.attack);
        data.cooldown = 1.3;
      }

      mob.rotation.y = Math.atan2(dx, dz);

    } else if (!data.hostile || distance > 15) {
      // Simple wandering for animals and friendly creatures.
      if (Math.random() < 0.01) {
        data.wander.set(
          mob.position.x + randomInt(-4, 4),
          0,
          mob.position.z + randomInt(-4, 4)
        );
      }

      const wx = data.wander.x - mob.position.x;
      const wz = data.wander.z - mob.position.z;
      const wd = Math.hypot(wx, wz);

      if (wd > 0.5) {
        mob.position.x += wx / wd * data.speed * dt * 0.4;
        mob.position.z += wz / wd * data.speed * dt * 0.4;
      }
    }

    // Keep land creatures on the ground.
    if (!data.animal) {
      mob.position.y = 1;
    } else {
      mob.position.y = 0.9;
    }
  }
}

function updatePortals() {
  for (const portal of portals) {
    const distance = player.position.distanceTo(portal.position);

    if (distance < 2.2 && keys.KeyE) {
      keys.KeyE = false;

      const destination = portal.userData.destination;
      generateWorld(destination);
      showToast("Travelled to " + worlds[destination].label);
      return;
    }
  }
}

function updateDayNight(dt) {
  dayTime += dt * 0.08;

  if (dayTime >= 24) {
    dayTime = 0;
    day++;
    showToast(`🌅 Day ${day} begins!`);
  }

  const night = dayTime < 6 || dayTime > 18;
  const darkness = night ? 0.7 : 0;

  if (worldName === "overworld") {
    const sky = new THREE.Color(0x87ceeb);
    sky.lerp(new THREE.Color(0x10162e), darkness);
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
    sun.intensity = night ? 0.35 : 2.5;
  }
}

function updateSurvival(dt) {
  hunger = Math.max(0, hunger - dt * 0.35);

  if (hunger <= 0) {
    health = Math.max(0, health - dt * 1.5);

    if (health <= 0 && !dead) {
      damagePlayer(100);
    }
  } else if (hunger > 80 && health < 100) {
    health = Math.min(100, health + dt * 0.5);
  }

  damageCooldown = Math.max(0, damageCooldown - dt);
  attackCooldown = Math.max(0, attackCooldown - dt);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (started && !paused && !dead) {
    playerMove(dt);
    updateMobs(dt);
    updateProjectiles(dt);
    collectItems();
    updatePortals();
    updateDayNight(dt);
    updateSurvival(dt);

    for (const item of items) {
      item.rotation.y += dt;
      item.position.y = 0.7 + Math.sin(elapsed * 2 + item.position.x) * 0.12;
    }

    updateHUD();
  }

  renderer.render(scene, camera);
}

// ==================================================
// KEYBOARD AND MOUSE CONTROLS
// ==================================================

document.addEventListener("keydown", event => {
  keys[event.code] = true;

  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
      .includes(event.code)
  ) {
    event.preventDefault();
  }

  if (event.code === "Space" && onGround && started && !paused) {
    jumpVelocity = JUMP_POWER;
    onGround = false;
  }

  if (event.code.startsWith("Digit")) {
    const number = Number(event.code.slice(5));

    if (number >= 1 && number <= inventory.length) {
      selectedSlot = number - 1;
      updateHUD();
    }
  }

  if (event.code === "KeyF") eatFood();
  if (event.code === "KeyR") equipArmor();

  if (event.code === "Escape" && started && !dead) {
    togglePause();
  }
});

document.addEventListener("keyup", event => {
  keys[event.code] = false;
});

document.addEventListener("mousemove", event => {
  if (!locked || paused || dead) return;

  yaw -= event.movementX * 0.002;
  pitch -= event.movementY * 0.002;
  pitch = Math.max(-1.5, Math.min(1.5, pitch));
});

document.addEventListener("pointerlockchange", () => {
  locked = document.pointerLockElement === renderer.domElement;
});

renderer.domElement.addEventListener("click", () => {
  if (started && !paused && !dead && !locked) {
    renderer.domElement.requestPointerLock?.();
  }
});

document.addEventListener("mousedown", event => {
  if (!started || paused || dead || !locked) return;

  if (event.button === 0 && attackCooldown <= 0) {
    mineOrAttack();
    attackCooldown = 0.25;
  }

  if (event.button === 2) {
    placeBlock();
  }
});

document.addEventListener("contextmenu", event => {
  if (host.contains(event.target)) event.preventDefault();
});

const bindClick = (id, callback) => {
  const element = $(id);
  if (element) element.addEventListener("click", callback);
};

bindClick("start-button", startGame);
bindClick("resume-button", () => {
  paused = false;
  $("pause-screen")?.classList.add("hidden");
  renderer.domElement.requestPointerLock?.();
});
bindClick("restart-button", restartGame);
bindClick("eat-button", eatFood);
bindClick("armor-button", equipArmor);

bindClick("nether-button", () => generateWorld("nether"));
bindClick("overworld-button", () => generateWorld("overworld"));
bindClick("end-button", () => generateWorld("end"));

bindClick("inventory-button", () => {
  const panel = $("inventory-panel");
  if (panel) panel.classList.toggle("hidden");
});

window.addEventListener("blur", () => {
  keys = {};
});

// ==================================================
// INITIALIZE GAME
// ==================================================

generateWorld("overworld");
updateHUD();
animate();

console.log("Voxel Realms loaded successfully!");
console.log("WASD = move | Space = jump | Left click = mine/attack");
console.log("Right click = place blocks | F = eat | R = armour");
console.log("E = use nearby portal | 1-9 = select hotbar slot");
