import confetti from 'canvas-confetti';
import { registerSW } from 'virtual:pwa-register';
import Cube2D from './cube2d.js';
import Cube3D from './cube3d.js';
import Graph from './graph.js';
import {
    PUZZLES,
    getEffectiveAttemptLimit,
    getPuzzleConfig,
    getStatsBucketCount,
    getStatsLabel,
    PIECE_LABELS,
    normalizePieceId,
} from './puzzles.js';
import {
    applyScramble,
    assignmentsToFacelets,
    buildPuzzleModel,
    countSolvedPieces,
    countSolvedStickers,
    getAssignmentsFromCubies,
    validateAssignments,
} from './cube-model.js';

const GAME_MODES = {
    DAILY: 'daily',
    TRAINER: 'trainer',
};

const FACE_VECTORS = {
    U: [0, 0, 1],
    D: [0, 0, -1],
    F: [0, 1, 0],
    B: [0, -1, 0],
    R: [1, 0, 0],
    L: [-1, 0, 0],
};

const FACE_ROTATIONS = {
    U: { axis: 'z', angle: 1 },
    D: { axis: 'z', angle: -1 },
    R: { axis: 'x', angle: 1 },
    L: { axis: 'x', angle: -1 },
    F: { axis: 'y', angle: 1 },
    B: { axis: 'y', angle: -1 },
};

const WING_GENERATORS = ['U', 'D', 'L', 'R', 'F', 'B'].flatMap((face) => [[face, [1]], [face, [2]]]);

const PUZZLE_STORAGE_KEY = 'puzzleMode';
const GAME_RESULTS = {
    WON: 'won',
    LOST: 'lost',
};

let currentGameMode = localStorage.getItem('gameMode') || GAME_MODES.DAILY;
let currentPuzzleId = localStorage.getItem(PUZZLE_STORAGE_KEY) || '333';

let config;
let model;
let cube;
let answerAssignments;
let answerColors;
let guesses;
let score;
let stats;
let wingStateOwnerMap = null;
let currentScramble = '';

const feedback = new Cube2D(document.getElementById('feedback'));
const graph = new Graph(document.getElementById('graph'));
const example = new Cube2D(document.getElementById('example'), 3);
example.drawFace(0, 0, 'ULDRUFUBU', '.XXX.//XX');

let random333ScramblePromise;
let random444ScramblePromise;
let random555ScramblePromise;

function setGameMode(mode) {
    currentGameMode = mode;
    localStorage.setItem('gameMode', mode);
}

function setPuzzleMode(puzzleId) {
    if (!PUZZLES[puzzleId]) return;
    currentPuzzleId = puzzleId;
    localStorage.setItem(PUZZLE_STORAGE_KEY, puzzleId);
}

function isDailyMode() {
    return currentGameMode === GAME_MODES.DAILY;
}

function isTrainerMode() {
    return currentGameMode === GAME_MODES.TRAINER;
}

function getStorageKey(key) {
    const prefix = isDailyMode() ? 'daily_' : 'trainer_';
    if (currentPuzzleId === '333') {
        return `${prefix}${key}`;
    }
    return `${prefix}${currentPuzzleId}_${key}`;
}

window.getStorageKey = getStorageKey;

function toggleVisible(id) {
    const element = document.getElementById(id);
    element.style.display = element.style.display === 'none' ? 'block' : 'none';
}

function updateModeIndicator() {
    document.getElementById('mode-text').textContent = `${config.label} ${isDailyMode() ? 'DAILY MODE' : 'TRAINER MODE'}`;
    document.getElementById('mode-toggle').textContent = isDailyMode() ? 'Trainer Mode' : 'Daily Mode';
    document.getElementById('new-game').style.display = isTrainerMode() ? 'inline-block' : 'none';
    document.getElementById('puzzle-select').value = currentPuzzleId;
}

function switchGameMode() {
    setGameMode(isDailyMode() ? GAME_MODES.TRAINER : GAME_MODES.DAILY);
    window.location.reload();
}

function startNewTrainerGame() {
    if (!isTrainerMode()) return;
    localStorage.removeItem(getStorageKey('guesses'));
    localStorage.removeItem(getStorageKey('score'));
    localStorage.removeItem(getStorageKey('complete'));
    localStorage.removeItem(getStorageKey('outcome'));
    localStorage.removeItem(getStorageKey('assignments'));
    window.location.reload();
}

async function generateScramble() {
    if (isDailyMode()) {
        const today = new Date().toISOString().substring(0, 10);
        const cacheKey = getStorageKey(`daily_scramble_v2_${today}`);
        const cachedScramble = localStorage.getItem(cacheKey);
        if (cachedScramble) {
            return cachedScramble;
        }

        const seed = await digestHex(`${today}:${currentPuzzleId}:cuble`);
        const alg = await withSeededRandomness(seed, () => generateOfficialScramble(config.eventId));
        const scramble = alg.toString();
        localStorage.setItem(cacheKey, scramble);
        return scramble;
    }

    const alg = await generateOfficialScramble(config.eventId);
    return alg.toString();
}

async function generateOfficialScramble(eventId) {
    switch (eventId) {
        case '333':
            return (await getRandom333Scramble())();
        case '444':
            return (await getRandom444Scramble())();
        case '555':
            return (await getRandom555Scramble())('555');
        default:
            throw new Error(`Unsupported scramble event: ${eventId}`);
    }
}

async function getRandom333Scramble() {
    if (!random333ScramblePromise) {
        random333ScramblePromise = import('cubing-internal/chunks/chunk-V27EM5TJ.js').then((module) => {
            module.setIsInsideWorker(true);
            return module.random333Scramble;
        });
    }

    return random333ScramblePromise;
}

async function getRandom444Scramble() {
    if (!random444ScramblePromise) {
        random444ScramblePromise = Promise.all([
            import('cubing-internal/chunks/chunk-V27EM5TJ.js'),
            import('cubing-internal/chunks/search-dynamic-solve-4x4x4-E576AITS.js'),
        ]).then(([threeByThreeModule, fourByFourModule]) => {
            threeByThreeModule.setIsInsideWorker(true);
            return fourByFourModule.random444Scramble;
        });
    }

    return random444ScramblePromise;
}

async function getRandom555Scramble() {
    if (!random555ScramblePromise) {
        random555ScramblePromise = import('cubing-internal/chunks/twips-YHXBF55O.js').then((module) => module.wasmRandomScrambleForEvent);
    }

    return random555ScramblePromise;
}

function createSeededUInt32(seedHex) {
    let state = 0;
    for (let index = 0; index < seedHex.length; index += 8) {
        state = (state ^ parseInt(seedHex.slice(index, index + 8).padEnd(8, '0'), 16)) >>> 0;
    }
    if (state === 0) {
        state = 0x9e3779b9;
    }

    return () => {
        state = (state + 0x9e3779b9) >>> 0;
        let mixed = state;
        mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b) >>> 0;
        mixed = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35) >>> 0;
        return (mixed ^ (mixed >>> 16)) >>> 0;
    };
}

async function withSeededRandomness(seedHex, callback) {
    const nextUInt32 = createSeededUInt32(seedHex);
    const originalCrypto = globalThis.crypto;
    const originalMathRandom = Math.random;
    const seededCrypto = Object.create(originalCrypto);

    seededCrypto.getRandomValues = (typedArray) => {
        const bytes = new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
        for (let index = 0; index < bytes.length; index += 4) {
            const value = nextUInt32();
            bytes[index] = value & 0xff;
            if (index + 1 < bytes.length) bytes[index + 1] = (value >>> 8) & 0xff;
            if (index + 2 < bytes.length) bytes[index + 2] = (value >>> 16) & 0xff;
            if (index + 3 < bytes.length) bytes[index + 3] = (value >>> 24) & 0xff;
        }
        return typedArray;
    };

    Math.random = () => nextUInt32() / 0x100000000;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: seededCrypto });

    try {
        return await callback();
    } finally {
        Math.random = originalMathRandom;
        Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    }
}

async function digestHex(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function loadStats() {
    const key = `stats_${currentPuzzleId}`;
    let loaded = JSON.parse(localStorage.getItem(key));

    if (currentPuzzleId === '333' && loaded === null) {
        const legacy = JSON.parse(localStorage.getItem('stats'));
        if (legacy) {
            loaded = Array(getStatsBucketCount(config)).fill(0);
            for (let index = 0; index < legacy.length; index++) {
                loaded[Math.min(index, loaded.length - 1)] += legacy[index];
            }
            localStorage.setItem(key, JSON.stringify(loaded));
        }
    }

    if (!loaded || loaded.length !== getStatsBucketCount(config)) {
        loaded = Array(getStatsBucketCount(config)).fill(0);
        localStorage.setItem(key, JSON.stringify(loaded));
    }

    return loaded;
}

function saveStats() {
    localStorage.setItem(`stats_${currentPuzzleId}`, JSON.stringify(stats));
}

function getRecordedOutcome() {
    return localStorage.getItem(getStorageKey('outcome'));
}

function setRecordedOutcome(outcome) {
    localStorage.setItem(getStorageKey('outcome'), outcome);
}

function recordGameResult(outcome, guessCount = guesses) {
    if (getRecordedOutcome()) {
        return;
    }

    const lastBucketIndex = stats.length - 1;
    const exceededAttemptLimit = guessCount > config.maxAttempts;
    const bucketIndex = outcome === GAME_RESULTS.WON && !exceededAttemptLimit
        ? Math.min(Math.max(guessCount, 1) - 1, lastBucketIndex - 1)
        : lastBucketIndex;

    stats[bucketIndex]++;
    saveStats();
    setRecordedOutcome(outcome);

    if (outcome === GAME_RESULTS.WON) {
        localStorage.setItem(getStorageKey('complete'), true);
    }
}

function setActionsLocked(locked) {
    document.getElementById('actions').dataset.locked = locked ? 'true' : 'false';
}

function initializeStorage() {
    const today = new Date().toISOString().substring(0, 10);
    if (isDailyMode()) {
        if (localStorage.getItem(getStorageKey('today')) !== today) {
            localStorage.setItem(getStorageKey('today'), today);
            localStorage.setItem(getStorageKey('guesses'), -1);
            localStorage.setItem(getStorageKey('score'), JSON.stringify(Array(model.editableSlotIds.length).fill(-1)));
            localStorage.removeItem(getStorageKey('complete'));
            localStorage.removeItem(getStorageKey('outcome'));
            localStorage.removeItem(getStorageKey('assignments'));
        }
    } else if (!localStorage.getItem(getStorageKey('guesses'))) {
        localStorage.setItem(getStorageKey('guesses'), -1);
        localStorage.setItem(getStorageKey('score'), JSON.stringify(Array(model.editableSlotIds.length).fill(-1)));
        localStorage.removeItem(getStorageKey('complete'));
        localStorage.removeItem(getStorageKey('outcome'));
        localStorage.removeItem(getStorageKey('assignments'));
    }
}

function rotateColors(colors, offset) {
    return colors.slice(offset) + colors.slice(0, offset);
}

function rotatePoint(x, y, z, axis, angle) {
    if (axis === 'x') {
        return angle > 0 ? [x, -z, y] : [x, z, -y];
    }
    if (axis === 'y') {
        return angle > 0 ? [z, y, -x] : [-z, y, x];
    }
    return angle > 0 ? [-y, x, z] : [y, -x, z];
}

function vectorToFace(x, y, z) {
    if (x === 1) return 'R';
    if (x === -1) return 'L';
    if (y === 1) return 'F';
    if (y === -1) return 'B';
    if (z === 1) return 'U';
    return 'D';
}

function isAffectedLayer(piece, size, face, layers) {
    const depth = {
        U: size - 1 - piece.z,
        D: piece.z,
        F: size - 1 - piece.y,
        B: piece.y,
        R: size - 1 - piece.x,
        L: piece.x,
    }[face];
    return layers.includes(depth + 1);
}

function stepWingPiece(piece, size, face, layers) {
    if (!isAffectedLayer(piece, size, face, layers)) {
        return piece;
    }

    const center = (size - 1) / 2;
    const transform = FACE_ROTATIONS[face];
    const [nextX, nextY, nextZ] = rotatePoint(piece.x - center, piece.y - center, piece.z - center, transform.axis, transform.angle);
    const stickers = {};

    for (const [currentFace, color] of Object.entries(piece.stickers)) {
        const [x, y, z] = FACE_VECTORS[currentFace];
        const [rotatedX, rotatedY, rotatedZ] = rotatePoint(x, y, z, transform.axis, transform.angle);
        stickers[vectorToFace(rotatedX, rotatedY, rotatedZ)] = color;
    }

    return {
        x: Math.round(nextX + center),
        y: Math.round(nextY + center),
        z: Math.round(nextZ + center),
        stickers,
    };
}

function serializeWingPiece(piece) {
    return JSON.stringify({ x: piece.x, y: piece.y, z: piece.z, stickers: piece.stickers });
}

function buildWingStateOwnerMap() {
    if (model.size < 4) {
        return null;
    }

    const wingSlots = model.slots.filter((slot) => slot.group === 'edgeWing');
    const slotByCoord = Object.fromEntries(model.slots.map((slot) => [`${slot.x},${slot.y},${slot.z}`, slot]));
    const ownerByState = new Map();

    for (const slot of wingSlots) {
        const start = {
            x: slot.x,
            y: slot.y,
            z: slot.z,
            stickers: Object.fromEntries(slot.faces.map((face, index) => [face, slot.defaultColors.charAt(index)])),
        };
        const seen = new Set([serializeWingPiece(start)]);
        const queue = [start];

        while (queue.length > 0) {
            const current = queue.shift();
            const currentSlot = slotByCoord[`${current.x},${current.y},${current.z}`];
            const colors = currentSlot.faces.map((face) => current.stickers[face]).join('');
            ownerByState.set(`${currentSlot.id}=${colors}`, slot.id);

            for (const [face, layers] of WING_GENERATORS) {
                const next = stepWingPiece(current, model.size, face, layers);
                const key = serializeWingPiece(next);
                if (!seen.has(key)) {
                    seen.add(key);
                    queue.push(next);
                }
            }
        }
    }

    return ownerByState;
}

function hasReachableWingLayout(assignments) {
    if (!wingStateOwnerMap) {
        return true;
    }

    const owners = new Set();
    for (const slot of model.slots) {
        if (slot.group !== 'edgeWing') {
            continue;
        }

        const owner = wingStateOwnerMap.get(`${slot.id}=${assignments[slot.id]}`);
        if (!owner || owners.has(owner)) {
            return false;
        }
        owners.add(owner);
    }

    return owners.size === model.slots.filter((slot) => slot.group === 'edgeWing').length;
}

function countParity(indices) {
    let inversions = 0;
    for (let index = 0; index < indices.length; index++) {
        for (let compare = index + 1; compare < indices.length; compare++) {
            if (indices[index] > indices[compare]) {
                inversions++;
            }
        }
    }
    return inversions % 2;
}

function buildSlotLookup(group) {
    return Object.fromEntries(
        model.slots
            .filter((slot) => slot.editable && (!group || slot.group === group))
            .map((slot) => [slot.defaultColors, slot])
    );
}

function buildPieceLookup(labels) {
    return Object.fromEntries(labels.map((label, index) => [normalizePieceId(label), { index, label }]));
}

function getOrientation(colors, canonicalLabel) {
    for (let rotation = 0; rotation < colors.length; rotation++) {
        if (rotateColors(colors, rotation) === canonicalLabel) {
            return rotation;
        }
    }

    return null;
}

function getCornerMetrics(assignments) {
    const slotByLabel = buildSlotLookup('corner');
    const lookup = buildPieceLookup(PIECE_LABELS.corners);
    const permutation = [];
    let orientationSum = 0;

    for (const label of PIECE_LABELS.corners) {
        const colors = assignments[slotByLabel[label].id];
        const piece = lookup[normalizePieceId(colors)];
        const orientation = piece ? getOrientation(colors, piece.label) : null;
        if (!piece || orientation === null) {
            return null;
        }

        permutation.push(piece.index);
        orientationSum += orientation;
    }

    return {
        cp: orientationSum % 3,
        permutationParity: countParity(permutation),
    };
}

function getPartialCornerMetrics(assignments) {
    const slotByLabel = buildSlotLookup('corner');
    const lookup = buildPieceLookup(PIECE_LABELS.corners);
    let orientationSum = 0;

    for (const label of PIECE_LABELS.corners) {
        const colors = assignments[slotByLabel[label].id];
        if (!colors || colors.includes('X')) {
            continue;
        }

        const piece = lookup[normalizePieceId(colors)];
        const orientation = piece ? getOrientation(colors, piece.label) : null;
        if (!piece || orientation === null) {
            return null;
        }

        orientationSum += orientation;
    }

    return {
        cp: orientationSum % 3,
    };
}

function getUniqueEdgeMetrics(assignments, edgeAssignments) {
    const lookup = buildPieceLookup(PIECE_LABELS.edges);
    const permutation = [];
    let orientationSum = 0;

    for (const label of PIECE_LABELS.edges) {
        const colors = edgeAssignments[label];
        const piece = lookup[normalizePieceId(colors)];
        const orientation = piece ? getOrientation(colors, piece.label) : null;
        if (!piece || orientation === null) {
            return null;
        }

        permutation.push(piece.index);
        orientationSum += orientation;
    }

    return {
        ep: orientationSum % 2,
        permutationParity: countParity(permutation),
    };
}

function getPartialUniqueEdgeMetrics(edgeAssignments) {
    const lookup = buildPieceLookup(PIECE_LABELS.edges);
    let orientationSum = 0;

    for (const label of PIECE_LABELS.edges) {
        const colors = edgeAssignments[label];
        if (!colors || colors.includes('X')) {
            continue;
        }

        const piece = lookup[normalizePieceId(colors)];
        const orientation = piece ? getOrientation(colors, piece.label) : null;
        if (!piece || orientation === null) {
            return null;
        }

        orientationSum += orientation;
    }

    return {
        ep: orientationSum % 2,
    };
}

function getOrbitOrientationMetrics(assignments, group) {
    const slots = model.slots.filter((slot) => slot.editable && slot.group === group);
    const lookup = buildPieceLookup(PIECE_LABELS.edges);
    let orientationSum = 0;

    for (const slot of slots) {
        const colors = assignments[slot.id];
        if (!colors || colors.includes('X')) {
            continue;
        }

        const piece = lookup[normalizePieceId(colors)];
        const orientation = piece ? getOrientation(colors, piece.label) : null;
        if (!piece || orientation === null) {
            return null;
        }

        orientationSum += orientation;
    }

    return {
        ep: orientationSum % 2,
    };
}

function allEditableSlotsFilled(assignments) {
    return model.slots
        .filter((slot) => slot.editable)
        .every((slot) => {
            const colors = assignments[slot.id];
            return colors && !colors.includes('X');
        });
}

function formatStatusSummary(summary) {
    return `EP: ${summary.ep}, CP: ${summary.cp}, PP: ${summary.pp}`;
}

function validateCurrentAssignments(assignments) {
    const allFilled = allEditableSlotsFilled(assignments);
    const inventoryValid = allFilled && validateAssignments(model, assignments);
    const cornerMetrics = getPartialCornerMetrics(assignments);
    let ep = 'N/A';
    let cp = cornerMetrics?.cp ?? 'N/A';
    let pp = 'N/A';

    if (currentPuzzleId === '333') {
        const slotByLabel = buildSlotLookup('edge');
        const edgeAssignments = Object.fromEntries(PIECE_LABELS.edges.map((label) => [label, assignments[slotByLabel[label].id]]));
        const partialEdgeMetrics = getPartialUniqueEdgeMetrics(edgeAssignments);
        ep = partialEdgeMetrics?.ep ?? 'N/A';
        if (allFilled && inventoryValid) {
            const edgeMetrics = getUniqueEdgeMetrics(assignments, edgeAssignments);
            const fullCornerMetrics = getCornerMetrics(assignments);
            if (edgeMetrics && fullCornerMetrics) {
                pp = (fullCornerMetrics.permutationParity + edgeMetrics.permutationParity) % 2;
            }
        }
    } else {
        const wingMetrics = getOrbitOrientationMetrics(assignments, 'edgeWing');
        ep = wingMetrics?.ep ?? 'N/A';

        if (currentPuzzleId === '444') {
            if (allFilled && inventoryValid) {
                pp = 0;
            }
        } else {
            const slotByLabel = buildSlotLookup('edgeMiddle');
            const middleEdgeAssignments = Object.fromEntries(PIECE_LABELS.edges.map((label) => [label, assignments[slotByLabel[label].id]]));
            const partialMiddleEdgeMetrics = getPartialUniqueEdgeMetrics(middleEdgeAssignments);
            if (ep !== 'N/A' && partialMiddleEdgeMetrics) {
                ep = ep + partialMiddleEdgeMetrics.ep;
            } else if (partialMiddleEdgeMetrics) {
                ep = partialMiddleEdgeMetrics.ep;
            }

            if (allFilled && inventoryValid) {
                const fullCornerMetrics = getCornerMetrics(assignments);
                const middleEdgeMetrics = getUniqueEdgeMetrics(assignments, middleEdgeAssignments);
                if (fullCornerMetrics && middleEdgeMetrics) {
                    pp = (fullCornerMetrics.permutationParity + middleEdgeMetrics.permutationParity) % 2;
                }
            }
        }
    }

    const summary = {
        ep,
        cp,
        pp,
    };

    if (allFilled && inventoryValid && model.size >= 4 && !hasReachableWingLayout(assignments)) {
        summary.ep = summary.ep === 'N/A' ? 1 : Math.max(1, summary.ep);
    }

    const parityClear = summary.ep === 0 && summary.cp === 0 && (summary.pp === 'N/A' || summary.pp === 0);
    const allMetricsKnown = summary.ep !== 'N/A' && summary.cp !== 'N/A' && summary.pp !== 'N/A';

    return {
        valid: allFilled && inventoryValid && allMetricsKnown && parityClear,
        message: formatStatusSummary(summary),
        color: allFilled && inventoryValid && allMetricsKnown && parityClear ? 'white' : 'red',
    };
}

function updateCubeStatus() {
    if (!cube) return false;
    const result = validateCurrentAssignments(cube.getAssignments());
    const parity = document.getElementById('parity');
    parity.textContent = result.message;
    parity.style.color = result.color || (result.valid ? 'white' : 'red');
    return result.valid;
}

window.updateCubeStatus = updateCubeStatus;

function updateScoreDisplay() {
    if (!cube) return;
    const assignments = cube.getAssignments();
    const facelets = assignmentsToFacelets(model, assignments);
    const solvedPieces = countSolvedPieces(
        { ...model, slots: model.slots.filter((slot) => slot.editable) },
        assignments,
        answerAssignments,
    );
    const solvedStickers = countSolvedStickers(facelets, answerColors);

    document.getElementById('solved-pieces').textContent = `Pieces: ${solvedPieces}/${model.editableSlotIds.length}`;
    document.getElementById('solved-stickers').textContent = `Stickers: ${solvedStickers}/${answerColors.length}`;
}

window.updateStatisticsDisplay = updateScoreDisplay;

function updateScore() {
    const assignments = cube.getAssignments();
    for (let index = 0; index < model.editableSlotIds.length; index++) {
        const slotId = model.editableSlotIds[index];
        if (assignments[slotId] === answerAssignments[slotId] && score[index] === -1) {
            score[index] = guesses;
        }
    }
    localStorage.setItem(getStorageKey('score'), JSON.stringify(score));
}

function renderStats() {
    graph.update(stats, Array.from({ length: stats.length }, (_, index) => getStatsLabel(index, config)));
}

function gameOver(message) {
    document.getElementById('parity').textContent = message;
    document.getElementById('picker').replaceChildren();
    document.getElementById('actions').replaceChildren();
    document.getElementById('actions').classList.remove('post-game-actions');
    setActionsLocked(true);
    cube.selection.visible = false;
}

function createPostGameAction(label, onClick) {
    const button = document.createElement('button');
    button.innerText = label;
    button.classList.add('action', 'action-wide');
    button.onclick = onClick;
    return button;
}

function renderWinActions() {
    let resetLabelTimeoutId;
    const share = document.createElement('button');
    share.innerText = 'Share';
    share.classList.add('action', 'action-wide');
    share.onclick = () => {
        const today = new Date().toISOString().substring(0, 10);
        const modeText = isDailyMode() ? 'Daily' : 'Trainer';
        const result = `Cuble ${today} ${config.label} (${modeText}): ${guesses}/${config.maxAttempts}, ${score.join(' ')}`;
        navigator.clipboard.writeText(result).then(
            () => {
                share.innerText = 'Copied';
                window.clearTimeout(resetLabelTimeoutId);
                resetLabelTimeoutId = window.setTimeout(() => {
                    share.innerText = 'Share';
                }, 2000);
            },
            () => {
                share.innerText = 'Copy failed';
                window.clearTimeout(resetLabelTimeoutId);
                resetLabelTimeoutId = window.setTimeout(() => {
                    share.innerText = 'Share';
                }, 2000);
            },
        );
    };

    const scramble = createPostGameAction('Scramble', () => toggleVisible('scramble-container'));
    const actions = document.getElementById('actions');
    actions.classList.add('post-game-actions');
    actions.replaceChildren(share, scramble);
    setActionsLocked(true);
}

function check() {
    const assignments = cube.getAssignments();
    const validation = validateCurrentAssignments(assignments);

    if (!validation.valid) {
        document.getElementById('guess').classList.add('shake');
        updateCubeStatus();
        return;
    }

    if (guesses >= getEffectiveAttemptLimit(config)) {
        recordGameResult(GAME_RESULTS.LOST);
        gameOver(`Game Over! Maximum ${getEffectiveAttemptLimit(config)} guesses reached.`);
        return;
    }

    localStorage.setItem(getStorageKey('guesses'), guesses++);
    document.getElementById('guess-label').textContent = String(guesses);
    cube.save();

    const currentColors = assignmentsToFacelets(model, assignments);
    feedback.drawCube(currentColors, answerColors, config.size);
    updateScore();
    updateScoreDisplay();
    updateCubeStatus();

    if (currentColors.toString() === answerColors.toString()) {
        recordGameResult(GAME_RESULTS.WON, guesses);

        const canvas = document.getElementById('confetti');
        canvas.style.display = 'block';
        setTimeout(() => {
            const burst = confetti.create(canvas, { resize: true, useWorker: true });
            burst({ particleCount: 100, spread: 135, shapes: ['square'], origin: { x: 0.5, y: 0.6 } });
            cube.selection.visible = false;
            document.getElementById('parity').textContent = `You won in ${guesses} guesses!`;
            document.getElementById('picker').replaceChildren();
            renderWinActions();
            setTimeout(() => canvas.style.display = 'none', 3000);
        }, Cube2D.DELAY * 100);
    }
}

async function init() {
    config = getPuzzleConfig(currentPuzzleId);
    model = buildPuzzleModel(config.size);
    wingStateOwnerMap = buildWingStateOwnerMap();
    feedback.setDimension(config.size);

    currentScramble = await generateScramble();
    const answerCube = applyScramble(config.size, currentScramble);
    answerAssignments = getAssignmentsFromCubies(model, answerCube);
    answerColors = assignmentsToFacelets(model, answerAssignments);
    cube = new Cube3D(model, answerAssignments, getStorageKey);
    document.getElementById('scramble-sequence').textContent = currentScramble;

    initializeStorage();
    cube.load();
    if (!validateAssignments(model, cube.getAssignments())) {
        for (const slot of model.slots) {
            cube.setAssignment(slot.id, slot.defaultColors);
        }
        cube.save();
    }

    guesses = parseInt(localStorage.getItem(getStorageKey('guesses')), 10);
    if (Number.isNaN(guesses)) guesses = -1;

    const savedScore = localStorage.getItem(getStorageKey('score'));
    score = savedScore ? JSON.parse(savedScore) : Array(model.editableSlotIds.length).fill(-1);
    stats = loadStats();

    updateModeIndicator();
    setActionsLocked(false);
    document.getElementById('actions').classList.remove('post-game-actions');
    updateCubeStatus();
    check();

    document.getElementById('open-stats').onclick = () => {
        toggleVisible('stats-container');
        renderStats();
        document.getElementById('countdown-timer').style.display = isDailyMode() ? 'block' : 'none';
    };
    document.getElementById('close-scramble').onclick = () => toggleVisible('scramble-container');
    document.getElementById('close-stats').onclick = () => toggleVisible('stats-container');
    document.getElementById('mode-toggle').onclick = switchGameMode;
    document.getElementById('new-game').onclick = startNewTrainerGame;
    document.getElementById('guess').onclick = check;
    document.getElementById('guess').addEventListener('animationend', () => document.getElementById('guess').classList.remove('shake'));
    document.getElementById('puzzle-select').onchange = (event) => {
        setPuzzleMode(event.target.value);
        window.location.reload();
    };

    updateScoreDisplay();
}

document.getElementById('open-tutorial').onclick = () => toggleVisible('tutorial-container');
document.getElementById('read-tutorial').onchange = () => {
    document.getElementById('close-tutorial').disabled = !document.getElementById('read-tutorial').checked;
};
document.getElementById('close-tutorial').onclick = () => {
    toggleVisible('tutorial-container');
    localStorage.setItem('tutorialComplete', true);
};
if (!localStorage.getItem('tutorialComplete')) {
    toggleVisible('tutorial-container');
} else {
    document.getElementById('read-tutorial').checked = true;
    document.getElementById('close-tutorial').disabled = false;
}

const midnight = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
midnight.setHours(0, 0, 0, 0);
function updateClock() {
    const msLeft = Date.parse(midnight) - Date.parse(new Date());
    const secondsLeft = Math.floor((msLeft / 1000) % 60);
    const minutesLeft = Math.floor((msLeft / 1000 / 60) % 60);
    const hoursLeft = Math.floor((msLeft / (1000 * 60 * 60)) % 24);
    document.getElementById('hours').innerText = (`0${hoursLeft}`).slice(-2);
    document.getElementById('minutes').innerText = (`0${minutesLeft}`).slice(-2);
    document.getElementById('seconds').innerText = (`0${secondsLeft}`).slice(-2);
}
updateClock();
setInterval(updateClock, 1000);

document.addEventListener('keydown', (event) => {
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || !cube) return;
    if (document.getElementById('stats-container').style.display !== 'none') return;
    if (document.getElementById('scramble-container').style.display !== 'none') return;
    if (document.getElementById('tutorial-container').style.display !== 'none') return;

    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
        cube.navigateWASD(key);
    }
});

if (window.feather && typeof window.feather.replace === 'function') {
    window.feather.replace();
}

init().catch((error) => {
    console.error('Failed to initialize Cuble.', error);
    const parity = document.getElementById('parity');
    parity.textContent = 'Failed to load puzzle. Check the console and refresh.';
    parity.style.color = 'red';
});

if ('serviceWorker' in navigator) {
    registerSW();
}
