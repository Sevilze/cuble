import { FACE_ORDER, getPieceCatalog } from './puzzles.js';

const FACE_VECTORS = {
    U: [0, 0, 1],
    D: [0, 0, -1],
    F: [0, 1, 0],
    B: [0, -1, 0],
    R: [1, 0, 0],
    L: [-1, 0, 0],
};

const CORNER_ORDER = {
    BRU: 'URB',
    BLU: 'UBL',
    FLU: 'ULF',
    FRU: 'UFR',
    DFR: 'DRF',
    DFL: 'DFL',
    BDL: 'DLB',
    BDR: 'DBR',
};

const FACE_ROTATIONS = {
    U: { axis: 'z', angle: 1 },
    D: { axis: 'z', angle: -1 },
    R: { axis: 'x', angle: 1 },
    L: { axis: 'x', angle: -1 },
    F: { axis: 'y', angle: 1 },
    B: { axis: 'y', angle: -1 },
};

export function buildPuzzleModel(size) {
    const slots = generateSlots(size);
    const slotMap = Object.fromEntries(slots.map((slot) => [slot.id, slot]));
    const catalog = getPieceCatalog(size);
    const solvedAssignments = Object.fromEntries(slots.map((slot) => [slot.id, slot.defaultColors]));
    const editableSlotIds = slots.filter((slot) => slot.editable).map((slot) => slot.id);

    return {
        size,
        slots,
        slotMap,
        catalog,
        solvedAssignments,
        editableSlotIds,
    };
}

export function createSolvedCube(size) {
    const cubies = new Map();
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            for (let z = 0; z < size; z++) {
                const faces = getVisibleFaces(size, x, y, z);
                if (faces.length === 0) continue;

                cubies.set(coordKey(x, y, z), {
                    x,
                    y,
                    z,
                    stickers: Object.fromEntries(faces.map((face) => [face, face])),
                });
            }
        }
    }
    return cubies;
}

export function applyScramble(size, scramble) {
    const cube = createSolvedCube(size);
    for (const move of parseAlgorithm(scramble, size)) {
        applyMove(cube, size, move);
    }
    return cube;
}

export function getAssignmentsFromCubies(model, cubies) {
    return Object.fromEntries(
        model.slots.map((slot) => {
            const cubie = cubies.get(coordKey(slot.x, slot.y, slot.z));
            const colors = slot.faces.map((face) => cubie?.stickers[face] || 'X').join('');
            return [slot.id, colors];
        })
    );
}

export function assignmentsToFacelets(model, assignments) {
    const faces = Object.fromEntries(FACE_ORDER.map((face) => [face, Array.from({ length: model.size }, () => Array(model.size).fill('X'))]));

    for (const slot of model.slots) {
        const colors = assignments[slot.id] || 'X'.repeat(slot.faces.length);
        for (let index = 0; index < slot.facelets.length; index++) {
            const facelet = slot.facelets[index];
            faces[facelet.face][facelet.row][facelet.col] = colors[index] || 'X';
        }
    }

    return FACE_ORDER.flatMap((face) => faces[face].flat());
}

export function validateAssignments(model, assignments) {
    const countsByGroup = {};

    for (const slot of model.slots) {
        const colors = assignments[slot.id];
        if (!colors || colors.length !== slot.faces.length || colors.includes('X')) {
            return false;
        }

        const groupCounts = countsByGroup[slot.group] || {};
        const pieceId = normalize(colors);
        groupCounts[pieceId] = (groupCounts[pieceId] || 0) + 1;
        countsByGroup[slot.group] = groupCounts;
    }

    for (const [group, entries] of Object.entries(model.catalog)) {
        const actual = countsByGroup[group] || {};
        for (const entry of entries) {
            if ((actual[entry.id] || 0) !== entry.count) {
                return false;
            }
        }
    }

    return true;
}

export function countSolvedPieces(model, assignments, answerAssignments) {
    let solved = 0;
    for (const slot of model.slots) {
        if ((assignments[slot.id] || '') === answerAssignments[slot.id]) {
            solved++;
        }
    }
    return solved;
}

export function countSolvedStickers(guessFacelets, answerFacelets) {
    let solved = 0;
    for (let index = 0; index < answerFacelets.length; index++) {
        if (guessFacelets[index] === answerFacelets[index]) {
            solved++;
        }
    }
    return solved;
}

export function getSlotType(slot, size) {
    if (slot.faces.length === 3) return 'corner';
    if (slot.faces.length === 2) {
        if (size === 5 && slot.offset === 0) return 'edgeMiddle';
        return size === 3 ? 'edge' : 'edgeWing';
    }
    if (slot.faces.length === 1) {
        if (size === 5) {
            if (!slot.editable) return 'center';
            return slot.centerKind === 'x' ? 'centerX' : 'centerT';
        }
        return 'center';
    }
    return 'center';
}

function generateSlots(size) {
    const slots = [];
    const center = (size - 1) / 2;
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            for (let z = 0; z < size; z++) {
                const faces = canonicalizeFaces(getVisibleFaces(size, x, y, z), x, y, z, size);
                if (faces.length === 0) continue;

                const facelets = faces.map((face) => ({ face, ...getFaceletPosition(face, x, y, z, size) }));
                const editable = !(faces.length === 1 && size % 2 === 1 && isFixedCenter(x, y, z, center));
                const offset = getEdgeOffset(x, y, z, center);
                const centerKind = getCenterKind(x, y, z, center);
                const id = `${faces.join('')}:${x},${y},${z}`;
                const slot = {
                    id,
                    x,
                    y,
                    z,
                    faces,
                    defaultColors: faces.join(''),
                    facelets,
                    editable,
                    offset,
                    centerKind,
                    position: [x - center, y - center, z - center],
                };
                slot.group = getSlotType(slot, size);
                slots.push(slot);
            }
        }
    }
    return slots;
}

function applyMove(cube, size, move) {
    const quarterTurns = move.turns === 2 ? 2 : 1;
    const direction = move.turns === -1 ? -1 : 1;

    for (let turn = 0; turn < quarterTurns; turn++) {
        applyQuarterTurn(cube, size, move.face, direction, move.layers);
    }
}

function applyQuarterTurn(cube, size, face, direction, layers) {
    const transform = FACE_ROTATIONS[face];
    const next = new Map();
    for (const cubie of cube.values()) {
        if (isAffectedLayer(cubie, size, face, layers)) {
            const rotated = rotateCubie(cubie, size, transform.axis, transform.angle * direction);
            next.set(coordKey(rotated.x, rotated.y, rotated.z), rotated);
        } else {
            next.set(coordKey(cubie.x, cubie.y, cubie.z), cubie);
        }
    }
    cube.clear();
    for (const [key, value] of next.entries()) {
        cube.set(key, value);
    }
}

function rotateCubie(cubie, size, axis, angle) {
    const center = (size - 1) / 2;
    const [x, y, z] = rotatePoint(cubie.x - center, cubie.y - center, cubie.z - center, axis, angle);
    const stickers = {};

    for (const [face, color] of Object.entries(cubie.stickers)) {
        const vector = FACE_VECTORS[face];
        const [vx, vy, vz] = rotatePoint(vector[0], vector[1], vector[2], axis, angle);
        stickers[vectorToFace(vx, vy, vz)] = color;
    }

    return {
        x: Math.round(x + center),
        y: Math.round(y + center),
        z: Math.round(z + center),
        stickers,
    };
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

function isAffectedLayer(cubie, size, face, layers) {
    if (face === 'U') return cubie.z >= size - layers;
    if (face === 'D') return cubie.z < layers;
    if (face === 'R') return cubie.x >= size - layers;
    if (face === 'L') return cubie.x < layers;
    if (face === 'F') return cubie.y >= size - layers;
    return cubie.y < layers;
}

function parseAlgorithm(scramble, size) {
    return scramble.split(/\s+/).filter(Boolean).map((token) => parseMove(token, size));
}

function parseMove(token, size) {
    const match = token.match(/^(\d+)?([URFDLBurfdlb])(w)?(2|')?$/);
    if (!match) {
        throw new Error(`Unsupported move: ${token}`);
    }

    const [, prefix, rawFace, wideMarker, suffix] = match;
    const face = rawFace.toUpperCase();
    const wide = Boolean(wideMarker) || rawFace !== face;
    const layers = prefix ? Number(prefix) : (wide ? Math.min(2, size - 1) : 1);

    return {
        face,
        layers,
        turns: suffix === '2' ? 2 : (suffix === "'" ? -1 : 1),
    };
}

function getVisibleFaces(size, x, y, z) {
    const faces = [];
    if (z === size - 1) faces.push('U');
    if (x === 0) faces.push('L');
    if (y === size - 1) faces.push('F');
    if (x === size - 1) faces.push('R');
    if (y === 0) faces.push('B');
    if (z === 0) faces.push('D');
    return faces;
}

function canonicalizeFaces(faces, x, y, z, size) {
    if (faces.length <= 1) return faces;
    if (faces.length === 2) {
        if (faces.includes('U')) return ['U', faces.find((face) => face !== 'U')];
        if (faces.includes('D')) return ['D', faces.find((face) => face !== 'D')];
        if (faces.includes('F')) return ['F', faces.find((face) => face !== 'F')];
        if (faces.includes('B')) return ['B', faces.find((face) => face !== 'B')];
        return faces;
    }

    const key = faces.slice().sort().join('');
    if (CORNER_ORDER[key]) {
        return CORNER_ORDER[key].split('');
    }
    return faces;
}

function getFaceletPosition(face, x, y, z, size) {
    switch (face) {
        case 'U':
            return { row: y, col: x };
        case 'L':
            return { row: size - 1 - z, col: y };
        case 'F':
            return { row: size - 1 - z, col: x };
        case 'R':
            return { row: size - 1 - z, col: size - 1 - y };
        case 'B':
            return { row: size - 1 - z, col: size - 1 - x };
        case 'D':
            return { row: size - 1 - y, col: x };
        default:
            return { row: 0, col: 0 };
    }
}

function getEdgeOffset(x, y, z, center) {
    const interior = [x, y, z].filter((value) => value !== 0 && value !== center * 2);
    if (interior.length !== 1) return null;
    return Math.round(interior[0] - center);
}

function getCenterKind(x, y, z, center) {
    const interior = [x, y, z].filter((value) => value !== 0 && value !== center * 2);
    if (interior.length !== 2) return null;
    if (interior[0] === center || interior[1] === center) return 't';
    return 'x';
}

function isFixedCenter(x, y, z, center) {
    return [x, y, z].includes(center) && [x, y, z].filter((value) => value === center).length === 2;
}

function normalize(colors) {
    return colors.split('').sort().join('');
}

function coordKey(x, y, z) {
    return `${x},${y},${z}`;
}

function vectorToFace(x, y, z) {
    if (x === 1) return 'R';
    if (x === -1) return 'L';
    if (y === 1) return 'F';
    if (y === -1) return 'B';
    if (z === 1) return 'U';
    return 'D';
}