import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Cubie from './cubie.js';
import { normalizePieceId } from './puzzles.js';

const COLOR_STYLES = {
    U: 'rgb(255, 255, 255)',
    L: 'rgb(245, 146, 29)',
    F: 'rgb(77, 228, 50)',
    R: 'rgb(234, 32, 3)',
    B: 'rgb(98, 179, 225)',
    D: 'rgb(246, 237, 53)',
    X: 'rgb(68, 68, 68)',
};

export default class Cube3D {
    constructor(model, answerAssignments, getStorageKey) {
        this.model = model;
        this.answerAssignments = answerAssignments;
        this.getStorageKey = getStorageKey;
        this.assignments = { ...model.solvedAssignments };
        this.cubiesById = new Map();
        this.savedCubies = [];
        this.throttle = true;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(6, 6, 6);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);

        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.enablePan = false;
        controls.enableZoom = false;

        this.selection = new THREE.Mesh(
            new THREE.BoxGeometry(1.02, 1.02, 1.02),
            new THREE.MeshBasicMaterial({ color: 'black', transparent: true, opacity: 0.5 })
        );
        this.selection.visible = false;
        this.scene.add(this.selection);

        document.body.appendChild(this.renderer.domElement);
        this.buildCubies();
        this.animate();

        this.renderer.domElement.addEventListener('pointerdown', (event) => {
            this.throttle = false;
            this.cursorPos = [event.clientX, event.clientY];
        });

        this.renderer.domElement.addEventListener('pointerup', (event) => {
            this.throttle = true;
            if (document.getElementById('actions').dataset.locked === 'true') return;
            if (Math.hypot(event.clientX - this.cursorPos[0], event.clientY - this.cursorPos[1]) > 1) return;
            const clicked = this.findClickedCubie(event);
            if (clicked) {
                this.initPicker(clicked.object);
            }
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    buildCubies() {
        for (const slot of this.model.slots) {
            const cubie = new Cubie(slot.position[0], slot.position[2], slot.position[1], slot.faces.join(''), slot.id);
            cubie.userData.slot = slot;
            this.savedCubies.push(cubie);
            this.cubiesById.set(slot.id, cubie);
            this.scene.add(cubie);
        }
    }

    getAssignments() {
        return { ...this.assignments };
    }

    setAssignment(slotId, colors) {
        this.assignments[slotId] = colors;
        this.cubiesById.get(slotId)?.setColors(colors);
    }

    currentSlot() {
        if (!this.selection.visible) return null;
        return this.savedCubies.find((cubie) => cubie.position.equals(this.selection.position))?.userData.slot || null;
    }

    initPicker(target, keepSelection = false) {
        const slot = target?.userData?.slot || target;
        if (!slot) return;

        const picker = document.getElementById('picker');
        const erase = document.getElementById('erase');
        const rotate = document.getElementById('rotate');
        const current = this.currentSlot();
        picker.replaceChildren();

        const cubie = this.cubiesById.get(slot.id);
        this.selection.position.copy(cubie.position);
        this.selection.visible = true;

        if (!keepSelection && slot.id === current?.id) {
            this.selection.visible = false;
            erase.disabled = true;
            rotate.disabled = true;
            return;
        }

        if (!slot.editable) {
            this.selection.material.opacity = 0.25;
            erase.disabled = true;
            rotate.disabled = true;
            return;
        }

        if (this.correct(slot.id)) {
            this.selection.material.opacity = 0.25;
            erase.disabled = true;
            rotate.disabled = true;
            return;
        }

        this.selection.material.opacity = 0.5;
        const currentId = normalizePieceId(this.assignments[slot.id]);
        const usage = this.getUsageCounts(slot.group);
        const entries = this.model.catalog[slot.group] || [];
        const buttonsPerRow = slot.faces.length === 3 ? 4 : 6;

        for (const entry of entries) {
            const button = picker.appendChild(document.createElement('button'));
            button.classList.add('cubie');
            button.style.width = `${(picker.offsetWidth - 10 * buttonsPerRow) / buttonsPerRow}px`;

            const canvas = button.appendChild(document.createElement('canvas'));
            canvas.width = button.clientWidth;
            canvas.height = button.clientHeight;
            const ctx = canvas.getContext('2d');
            for (let index = 0; index < entry.colors.length; index++) {
                const width = canvas.width / entry.colors.length;
                ctx.fillStyle = COLOR_STYLES[entry.colors.charAt(index)] || COLOR_STYLES.X;
                ctx.fillRect(width * index, 0, width, canvas.height);
            }

            button.disabled = (usage[entry.id] || 0) >= entry.count;
            button.onclick = () => {
                this.setAssignment(slot.id, entry.colors);
                this.initPicker(slot, true);
                window.updateCubeStatus?.();
                window.updateStatisticsDisplay?.();
            };
        }

        erase.disabled = false;
        erase.onclick = () => {
            this.setAssignment(slot.id, 'X'.repeat(slot.faces.length));
            this.initPicker(slot, true);
            window.updateCubeStatus?.();
            window.updateStatisticsDisplay?.();
        };

        rotate.disabled = slot.faces.length <= 1;
        rotate.onclick = () => {
            const colors = this.assignments[slot.id];
            this.setAssignment(slot.id, colors.substring(1) + colors.charAt(0));
            this.initPicker(slot, true);
            window.updateCubeStatus?.();
            window.updateStatisticsDisplay?.();
        };
    }

    getUsageCounts(group) {
        const counts = {};
        for (const slot of this.model.slots) {
            if (!slot.editable || slot.group !== group) continue;
            const colors = this.assignments[slot.id];
            if (!colors || colors.includes('X')) continue;
            const id = normalizePieceId(colors);
            counts[id] = (counts[id] || 0) + 1;
        }
        return counts;
    }

    correct(slotId) {
        const savedAssignments = JSON.parse(localStorage.getItem(this.getStorageKey('assignments')) || 'null');
        if (!savedAssignments) return false;
        return savedAssignments[slotId] === this.answerAssignments[slotId];
    }

    save() {
        localStorage.setItem(this.getStorageKey('assignments'), JSON.stringify(this.assignments));
    }

    load() {
        const savedAssignments = JSON.parse(localStorage.getItem(this.getStorageKey('assignments')) || 'null');
        if (savedAssignments) {
            for (const slot of this.model.slots) {
                this.setAssignment(slot.id, savedAssignments[slot.id] || slot.defaultColors);
            }
            return;
        }

        if (this.model.size === 3) {
            let foundLegacy = false;
            for (const slot of this.model.slots) {
                const legacyValue = localStorage.getItem(this.getStorageKey(slot.defaultColors));
                if (legacyValue) {
                    this.setAssignment(slot.id, legacyValue);
                    foundLegacy = true;
                } else {
                    this.setAssignment(slot.id, slot.defaultColors);
                }
            }
            if (foundLegacy) return;
        }

        for (const slot of this.model.slots) {
            this.setAssignment(slot.id, slot.defaultColors);
        }
    }

    navigateWASD(direction) {
        const current = this.currentSlot();
        if (!current) return;

        const currentCubie = this.cubiesById.get(current.id);
        const currentScreen = currentCubie.position.clone().project(this.camera);
        const vertical = direction === 'w' || direction === 's';
        const sign = direction === 'w' || direction === 'a' ? -1 : 1;

        let best = null;
        let bestScore = Infinity;
        for (const cubie of this.savedCubies) {
            const slot = cubie.userData.slot;
            if (!slot.editable || slot.id === current.id) continue;

            const projected = cubie.position.clone().project(this.camera);
            const dx = projected.x - currentScreen.x;
            const dy = projected.y - currentScreen.y;
            const primary = vertical ? dy : dx;
            const secondary = vertical ? Math.abs(dx) : Math.abs(dy);

            if (primary * sign <= 0) continue;

            const score = Math.abs(primary) * 10 + secondary;
            if (score < bestScore) {
                bestScore = score;
                best = cubie;
            }
        }

        if (best) {
            this.initPicker(best);
        }
    }

    findClickedCubie(event) {
        const pointer = new THREE.Vector2();
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this.camera);
        return raycaster.intersectObjects(this.savedCubies)[0];
    }

    animate() {
        if (this.throttle) {
            setTimeout(() => requestAnimationFrame(() => this.animate()), 1000 / 10);
        } else {
            requestAnimationFrame(() => this.animate());
        }
        this.renderer.render(this.scene, this.camera);
    }
}
