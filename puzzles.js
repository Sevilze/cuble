export const FACE_ORDER = ['U', 'L', 'F', 'R', 'B', 'D'];

export const DEV_ATTEMPT_FLAG = 'dev_max_attempts';

export const PIECE_LABELS = {
    corners: ['UFR', 'URB', 'UBL', 'ULF', 'DRF', 'DFL', 'DLB', 'DBR'],
    edges: ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'],
    centers: FACE_ORDER,
};

export const PUZZLES = {
    '333': {
        id: '333',
        label: '3x3x3',
        size: 3,
        eventId: '333',
        maxAttempts: 4,
        statsLimit: 4,
    },
    '444': {
        id: '444',
        label: '4x4x4',
        size: 4,
        eventId: '444',
        maxAttempts: 6,
        statsLimit: 6,
    },
    '555': {
        id: '555',
        label: '5x5x5',
        eventId: '555',
        size: 5,
        maxAttempts: 10,
        statsLimit: 10,
    },
};

export function getPuzzleConfig(puzzleId) {
    return PUZZLES[puzzleId] || PUZZLES['333'];
}

export function getEffectiveAttemptLimit(config) {
    return localStorage.getItem(DEV_ATTEMPT_FLAG) === '1' ? 99 : config.maxAttempts;
}

export function getStatsBucketCount(config) {
    return config.statsLimit + 1;
}

export function getStatsLabel(index, config) {
    return index === config.statsLimit ? `${config.statsLimit + 1}+` : `${index + 1}`;
}

export function getPieceCatalog(size) {
    const catalog = {
        corner: createCatalogEntries(PIECE_LABELS.corners, 1),
        center: createCatalogEntries(PIECE_LABELS.centers, size === 4 ? 4 : 1),
    };

    if (size === 3) {
        catalog.edge = createCatalogEntries(PIECE_LABELS.edges, 1);
    } else if (size === 4) {
        catalog.edgeWing = createCatalogEntries(PIECE_LABELS.edges, 2);
    }

    if (size === 5) {
        catalog.edgeWing = createCatalogEntries(PIECE_LABELS.edges, 2);
        catalog.edgeMiddle = createCatalogEntries(PIECE_LABELS.edges, 1);
        catalog.centerX = createCatalogEntries(PIECE_LABELS.centers, 4);
        catalog.centerT = createCatalogEntries(PIECE_LABELS.centers, 4);
        catalog.center = createCatalogEntries(PIECE_LABELS.centers, 1);
    }
    return catalog;
}

function createCatalogEntries(labels, count) {
    return labels.map((label) => ({
        id: normalizePieceId(label),
        label,
        colors: label,
        count,
    }));
}

export function normalizePieceId(colors) {
    return colors.split('').sort().join('');
}