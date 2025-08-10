import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import RubiksCubeSolver from './lib/solver.js';
import Cubie from './cubie.js';
import COLORS from './colors.js';

export default class Cube3D {
    // Order used for permutation/orientation arrays (only edges + corners)
    static CUBIE_ORDER = [
        'UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL',
        'UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'
    ];

    // 3D grid coordinates (0..2) for every non-center cubie used by navigation.
    static CUBIE_COORDINATES = {
        // Edges
        'UF': [1, 2, 2], 'UR': [2, 1, 2], 'UB': [1, 0, 2], 'UL': [0, 1, 2],
        'DF': [1, 2, 0], 'DR': [2, 1, 0], 'DB': [1, 0, 0], 'DL': [0, 1, 0],
        'FR': [2, 2, 1], 'FL': [0, 2, 1], 'BR': [2, 0, 1], 'BL': [0, 0, 1],
        // Corners
        'UFR': [2, 2, 2], 'URB': [2, 0, 2], 'UBL': [0, 0, 2], 'ULF': [0, 2, 2],
        'DRF': [2, 2, 0], 'DFL': [0, 2, 0], 'DLB': [0, 0, 0], 'DBR': [2, 0, 0]
    };

    // Reverse map built from CUBIE_COORDINATES (only edges & corners)
    static COORDINATE_TO_CUBIE = {};
    static ADJACENCY_MAP = {
        'UFR': ['UF', 'FR', 'UR'],
        'URB': ['UR', 'BR', 'UB'],
        'UBL': ['UB', 'BL', 'UL'],
        'ULF': ['UL', 'FL', 'UF'],
        'DRF': ['DF', 'FR', 'DR'],
        'DFL': ['DF', 'FL', 'DL'],
        'DLB': ['DL', 'BL', 'DB'],
        'DBR': ['DB', 'BR', 'DR'],

        'UF': ['UFR', 'ULF'],
        'UR': ['UFR', 'URB'],
        'UB': ['URB', 'UBL'],
        'UL': ['UBL', 'ULF'],
        'DF': ['DRF', 'DFL'],
        'DR': ['DRF', 'DBR'],
        'DB': ['DBR', 'DLB'],
        'DL': ['DLB', 'DFL'],
        'FR': ['UFR', 'DRF'],
        'FL': ['ULF', 'DFL'],
        'BR': ['URB', 'DBR'],
        'BL': ['UBL', 'DLB']
    };

    static {
        // Build a fast lookup from coordinate triple string -> cubie name
        for (const [name, coords] of Object.entries(Cube3D.CUBIE_COORDINATES)) {
            Cube3D.COORDINATE_TO_CUBIE[coords.join(',')] = name;
        }
    }

    savedCubies = [];

    // Throttle the viewport to 10 FPS when not rotating to save power
    throttle = true;

    permutation = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    orientation = new Array(20).fill(0);

    constructor(answerState) {
        // Scene + camera + renderer
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            90,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(5, 5, 5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);

        const controls = new OrbitControls(this.camera, this.renderer.domElement);
        controls.enablePan = false;
        controls.enableZoom = false;

        // Selection highlight (moved to the selected cubie's position)
        this.selection = new THREE.Mesh(
            new THREE.BoxGeometry(),
            new THREE.MeshBasicMaterial({
                color: 'black', transparent: true, opacity: 0.5
            })
        );
        this.selection.visible = false;
        this.scene.add(this.selection);

        document.body.appendChild(this.renderer.domElement);
        this.animate();

        // Create 3x3x3 cubies. The CUBIES list contains center names
        // for rendering but those single-letter names are not used for
        // navigation/state mapping.
        const CUBIES = [
            'DLB', 'DL',  'DFL', 'BL', 'L',  'FL', 'UBL', 'UL', 'ULF',
            'DB',  'D',   'DF',  'B',  '',   'F',  'UB',  'U',  'UF',
            'DBR', 'DR',  'DRF', 'BR', 'R',  'FR', 'URB', 'UR', 'UFR'
        ];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                for (let k = 0; k < 3; k++) {
                    const cubie = new Cubie(i - 1, j - 1, k - 1, 
                        CUBIES[i * 9 + j * 3 + k]);
                    this.savedCubies.push(cubie);
                    this.scene.add(cubie);
                }
            }
        }

        // Pointer events: record press position to distinguish rotate vs click
        this.renderer.domElement.addEventListener('pointerdown', (ev) => {
            this.throttle = false;
            this.cursorPos = [ev.clientX, ev.clientY];
        });
        this.renderer.domElement.addEventListener('pointerup', (ev) => {
            this.throttle = true;
            // If UI shows final action button only, ignore input
            if (document.getElementById('actions').childElementCount === 1) return;
            // If pointer moved, this was a rotate, not a cubie click
            if (Math.hypot(ev.clientX - this.cursorPos[0],
                ev.clientY - this.cursorPos[1]) > 1) return;
            const clicked = this.findClickedCubie(ev);
            if (!clicked) return;
            this.initPicker(clicked.object);
        });

        // Answer for correctness checks
        this.answerPermutation = answerState.slice(0, 20);
        this.answerOrientation = answerState.slice(20);

        // Keep renderer sized to window
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    /***********************
     * Picker / UI helpers *
     ***********************/
    // Return true for centers / non-piece placeholders (single-letter names
    // or empty string). Only edges (len===2) and corners (len===3) are real pieces.
    isCenterName(name) {
        return typeof name !== 'string' || (name.length !== 2 && name.length !== 3);
    }

    initPicker(cubie, keepSelection) {
        // Manage picker UI and selection highlight.
        const picker = document.getElementById('picker');
        const erase = document.getElementById('erase');
        const rotate = document.getElementById('rotate');

        // If the cubie is a center (or placeholder), don't allow editing.
        if (this.isCenterName(cubie.name)) {
            // Move highlight but disable editing controls
            this.selection.position.copy(cubie.position);
            this.selection.visible = true;
            this.selection.material.opacity = 0.25;
            erase.disabled = true;
            rotate.disabled = true;
            picker.replaceChildren();
            return;
        }

        // Safe state index lookup (cubie's name is guaranteed to be an
        // edge/corner at this point, so getStateIndex will be valid).
        const stateIndex = Cube3D.getStateIndex(cubie.name);
        picker.replaceChildren();

        // Toggle highlight: clicking the already-selected cubie will
        // deselect it.
        if (!keepSelection && cubie.position.equals(this.selection.position)) {
            this.selection.position.set(0, 0, 0);
            this.selection.visible = false;
            erase.disabled = true;
            rotate.disabled = true;
            return;
        }

        this.selection.position.copy(cubie.position);
        this.selection.visible = true;
        this.selection.material.opacity = 0.5;

        // Do not allow modifying pieces that are already correct.
        if (this.correct(stateIndex)) {
            erase.disabled = true;
            rotate.disabled = true;
            this.selection.material.opacity = 0.25;
            return;
        }

        // Build the picker for edges or corners
        const CUBIES = [];
        if (cubie.name.length === 2) {
            CUBIES.push(
                'UB', 'UL', 'DB', 'DL', 'BL', 'FL',
                'UF', 'UR', 'DF', 'DR', 'BR', 'FR'
            );
        } else { // length === 3
            CUBIES.push('UBL', 'ULF', 'UFR', 'URB', 'DLB', 'DFL', 'DRF', 'DBR');
        }

        for (const piece of CUBIES) {
            // Create button + canvas preview
            const buttonsPerRow = (piece.length === 2) ? 6 : 4;
            const button = picker.appendChild(document.createElement('button'));
            button.classList.add('cubie');
            button.style.width = (picker.offsetWidth - 10 * buttonsPerRow) /
                buttonsPerRow + 'px';

            const canvas = button.appendChild(document.createElement('canvas'));
            canvas.width = button.clientWidth;
            canvas.height = button.clientHeight;
            const ctx = canvas.getContext('2d');

            for (let i = 0; i < piece.length; i++) {
                const color = COLORS[piece.charAt(i)];
                const perWidth = canvas.width / piece.length;
                ctx.fillStyle = `rgb(${color.r * 256}, ${color.g * 256}, ${color.b * 256})`;
                ctx.fillRect(perWidth * i, 0, perWidth, canvas.height);
            }

            button.disabled = this.permutation.includes(Cube3D.getStateIndex(piece));
            button.onclick = () => {
                cubie.setColors(piece);
                this.permutation[stateIndex] = Cube3D.getStateIndex(piece);
                this.orientation[stateIndex] = 0;
                this.initPicker(cubie, true);
                this.updateParity();
            };
        }

        erase.disabled = false;
        erase.onclick = () => {
            cubie.erase();
            this.permutation[stateIndex] = -1;
            this.initPicker(cubie, true);
            this.updateParity();
        };

        rotate.disabled = false;
        rotate.onclick = () => {
            cubie.rotate();
            this.orientation[stateIndex]--;
            if (this.orientation[stateIndex] < 0) {
                this.orientation[stateIndex] = cubie.name.length - 1;
            }
            this.updateParity();
        };
    }

    updateParity() {
        const solver = new RubiksCubeSolver();
        solver.currentState = [...this.permutation, ...this.orientation];
        const ep = solver.edgeParity();
        const cp = solver.cornerParity();
        const pp = solver.permutationParity();

        const parityEl = document.getElementById('parity');
        parityEl.innerText = `EP: ${ep}, CP: ${cp}, PP: ${pp}`;
        parityEl.style.color = (ep || cp || pp) ? 'red' : 'white';
    }

    correct(index) {
        const getStorageKey = window.getStorageKey || (k => k);
        const lastPermutationData = localStorage.getItem(getStorageKey('permutation'));
        const lastOrientationData = localStorage.getItem(getStorageKey('orientation'));

        if (!lastPermutationData || !lastOrientationData) {
            return false;
        }

        const lastPermutation = JSON.parse(lastPermutationData);
        const lastOrientation = JSON.parse(lastOrientationData);
        return lastPermutation[index] === this.answerPermutation[index] &&
            lastOrientation[index] === this.answerOrientation[index];
    }

    save() {
        const getStorageKey = window.getStorageKey || (k => k);
        for (const savedCubie of this.savedCubies) {
            localStorage.setItem(getStorageKey(savedCubie.name), savedCubie.colors);
        }
        localStorage.setItem(getStorageKey('permutation'), JSON.stringify(this.permutation));
        localStorage.setItem(getStorageKey('orientation'), JSON.stringify(this.orientation));
    }

    load() {
        const getStorageKey = window.getStorageKey || (k => k);
        for (const savedCubie of this.savedCubies) {
            const savedColors = localStorage.getItem(getStorageKey(savedCubie.name));
            savedCubie.setColors(savedColors || savedCubie.name);
        }

        const savedPermutation = localStorage.getItem(getStorageKey('permutation'));
        this.permutation = savedPermutation ? JSON.parse(savedPermutation) :
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

        const savedOrientation = localStorage.getItem(getStorageKey('orientation'));
        this.orientation = savedOrientation ? JSON.parse(savedOrientation) :
            new Array(20).fill(0);
    }

    static getStateIndex(cubie) {
        return Cube3D.CUBIE_ORDER.indexOf(cubie);
    }

    navigateWASD(direction) {
        if (!this.selection.visible) return;

        // Find the currently selected cubie object
        let currentCubie = null;
        for (const cubie of this.savedCubies) {
            if (cubie.position.equals(this.selection.position)) {
                currentCubie = cubie;
                break;
            }
        }
        if (!currentCubie || this.isCenterName(currentCubie.name)) return;

        // Use adjacency map (only edges & corners are present there)
        const adjacent = Cube3D.ADJACENCY_MAP[currentCubie.name];
        if (!adjacent || adjacent.length === 0) return;

        const target = this.getDirectionalTarget(currentCubie, direction, this.camera);
        if (!target) return;

        const targetCubie = this.savedCubies.find(c => c.name === target);
        if (targetCubie) this.initPicker(targetCubie);
    }

    /*
     * Pick the adjacent piece that best matches the requested screen
     * direction. Rules:
     * - 'w'/'s' are strictly vertical moves (screen up/down).
     * - 'a'/'d' are strictly horizontal moves (screen left/right).
     * - Only the immediate adjacent pieces from ADJACENCY_MAP are
     *   considered (edges↔corners).
     */
    getDirectionalTarget(currentCubie, direction, camera) {
        // Normalize direction safely
        direction = (typeof direction === 'string') ? direction.toLowerCase() : direction;
        const candidates = Cube3D.ADJACENCY_MAP[currentCubie.name];
        if (!candidates) return null;

        // Build camera-relative axes: forward, right, up (screen space)
        const camForward = new THREE.Vector3();
        camera.getWorldDirection(camForward);
        const camUp = camera.up.clone().normalize();
        let camRight = new THREE.Vector3().crossVectors(camForward, camUp).normalize();

        // If right vector is degenerate (rare), fallback to camera quaternion
        if (camRight.lengthSq() < 1e-4) {
            camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        }
        const screenUp = new THREE.Vector3().crossVectors(camRight, camForward).normalize();

        // Choose primary axis based on requested move
        const vertical = (direction === 'w' || direction === 's');
        let primary = null;
        if (vertical) {
            primary = (direction === 'w') ? screenUp.clone() : screenUp.clone().negate();
        } else {
            primary = (direction === 'd') ? camRight.clone() : camRight.clone().negate();
        }

        // Evaluate candidates: pick the candidate whose relative vector
        // projects most strongly onto the primary direction, AND is not
        // more aligned with the orthogonal axis.
        const currentPos = currentCubie.position;
        let best = null;
        let bestScore = -Infinity;

        const orthogonal = vertical ? camRight : screenUp;

        for (const name of candidates) {
            const adj = this.savedCubies.find(c => c.name === name);
            if (!adj) continue;

            const moveVec = new THREE.Vector3().subVectors(adj.position, currentPos).normalize();
            const scorePrimary = moveVec.dot(primary);
            const scoreOrtho = Math.abs(moveVec.dot(orthogonal));

            // Prefer high primary alignment and significantly larger than orthogonal
            if (scorePrimary > bestScore && scorePrimary > scoreOrtho) {
                bestScore = scorePrimary;
                best = name;
            }
        }

        // Require a confident match (prevents ambiguous diagonal picks)
        return (bestScore > 0.5) ? best : null;
    }

    findClickedCubie(event) {
        const pointer = new THREE.Vector2();
        pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, this.camera);
        return raycaster.intersectObjects(this.scene.children)[0];
    }

    animate() {
        if (this.throttle) {
            setTimeout(() => {
                requestAnimationFrame(() => this.animate());
            }, 1000 / 10);
        } else {
            requestAnimationFrame(() => this.animate());
        }
        this.renderer.render(this.scene, this.camera);
    }
}