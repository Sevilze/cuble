import confetti from 'canvas-confetti';
import seedrandom from 'seedrandom';
import { registerSW } from 'virtual:pwa-register';
import RubiksCubeSolver from './lib/solver.js';
import Cube2D from './cube2d.js';
import Cube3D from './cube3d.js';
import Graph from './graph.js';

// Game mode constants
const GAME_MODES = {
    DAILY: 'daily',
    TRAINER: 'trainer'
};

// Game mode state management
let currentGameMode = localStorage.getItem('gameMode') || GAME_MODES.DAILY;

function setGameMode(mode) {
    if (mode === GAME_MODES.DAILY || mode === GAME_MODES.TRAINER) {
        currentGameMode = mode;
        localStorage.setItem('gameMode', mode);
        return true;
    }
    return false;
}

function getCurrentGameMode() {
    return currentGameMode;
}

function isTrainerMode() {
    return currentGameMode === GAME_MODES.TRAINER;
}

function isDailyMode() {
    return currentGameMode === GAME_MODES.DAILY;
}

const feedback = new Cube2D(document.getElementById('feedback'));

// Generate cube state based on current mode
function generateCubeState() {
    const solver = new RubiksCubeSolver();
    let rng;

    if (isDailyMode()) {
        // Use daily seed for consistent daily puzzle
        const today = new Date().toDateString();
        rng = seedrandom(today);
    } else {
        // Use timestamp-based seed for random trainer puzzles
        const timestamp = Date.now();
        rng = seedrandom(timestamp.toString());
    }

    do {
        // Generate random permutation
        const edgePermutation = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], rng);
        const cornerPermutation = shuffle([12, 13, 14, 15, 16, 17, 18, 19], rng);
        const permutation = [...edgePermutation, ...cornerPermutation];
        // Generate orientations
        const orientation = [];
        // Edges only have 2 orientations
        for (let i = 0; i < 12; i++) {
            orientation.push(Math.floor(rng() * 2));
        }
        // Corners can have 3 orientations
        for (let i = 0; i < 8; i++) {
            orientation.push(Math.floor(rng() * 3));
        }
        solver.currentState = [...permutation, ...orientation];
    } while (!solver.verifyState());

    return solver.currentState;
}

const answerState = generateCubeState();
const answerColors = stateToFaceletColors(answerState);
const cube = new Cube3D(answerState);

// Create global solver instance for state verification
const solver = new RubiksCubeSolver();

function toggleVisible(id) {
    const element = document.getElementById(id);
    if (element.style.display === 'none') {
        element.style.display = 'block';
    } else {
        element.style.display = 'none';
    }
}
// Set up statistics
let stats = JSON.parse(localStorage.getItem('stats'));
if (stats === null) {
    stats = Array(7).fill(0);
} else if (stats.length === 22) {
    // Migrate from old 22-element format to new 7-element format
    const newStats = Array(7).fill(0);
    // Map guesses 1-6 to indices 0-5, and 7+ to index 6
    for (let i = 0; i < Math.min(6, stats.length); i++) {
        newStats[i] = stats[i];
    }
    // Sum all guesses 7 and above into the 6+ category
    for (let i = 6; i < stats.length; i++) {
        newStats[6] += stats[i];
    }
    stats = newStats;
    localStorage.setItem('stats', JSON.stringify(stats));
}
const graph = new Graph(document.getElementById('graph'));
document.getElementById('open-stats').onclick = () => {
    toggleVisible('stats-container');
    graph.update(stats);

    // Show/hide countdown timer based on mode
    const countdownTimer = document.getElementById('countdown-timer');
    if (isDailyMode()) {
        countdownTimer.style.display = 'block';
    } else {
        countdownTimer.style.display = 'none';
    }
};
document.getElementById('close-stats').onclick = () => toggleVisible('stats-container');

// Set up countdown timer
const midnight = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
midnight.setHours(0);
midnight.setMinutes(0);
midnight.setSeconds(0);
function updateClock() {
    const msLeft = Date.parse(midnight) - Date.parse(new Date());
    const secondsLeft = Math.floor((msLeft / 1000) % 60);
    const minutesLeft = Math.floor((msLeft / 1000 / 60) % 60);
    const hoursLeft = Math.floor((msLeft / (1000 * 60 * 60)) % 24);
    document.getElementById('hours').innerText = ('0' + hoursLeft).slice(-2);
    document.getElementById('minutes').innerText = ('0' + minutesLeft).slice(-2);
    document.getElementById('seconds').innerText = ('0' + secondsLeft).slice(-2);
}
updateClock();
setInterval(updateClock, 1000);

// Replace feather icons once DOM is ready
if (window.feather && typeof window.feather.replace === 'function') {
    window.feather.replace();
}

// Set up mode toggle functionality
function updateModeIndicator() {
    const modeText = document.getElementById('mode-text');
    const modeToggle = document.getElementById('mode-toggle');
    const newGameButton = document.getElementById('new-game');

    if (isDailyMode()) {
        modeText.textContent = 'DAILY MODE';
        modeToggle.textContent = 'Trainer Mode';
        newGameButton.style.display = 'none';
    } else {
        modeText.textContent = 'TRAINER MODE';
        modeToggle.textContent = 'Daily Mode';
        newGameButton.style.display = 'inline-block';
    }
}

function switchGameMode() {
    const newMode = isDailyMode() ? GAME_MODES.TRAINER : GAME_MODES.DAILY;
    setGameMode(newMode);
    updateModeIndicator();
    window.location.reload();
}

function startNewTrainerGame() {
    if (isTrainerMode()) {
        // Clear trainer game state
        localStorage.removeItem(getStorageKey('guesses'));
        localStorage.removeItem(getStorageKey('score'));
        localStorage.removeItem(getStorageKey('complete'));

        // Reload to start fresh
        window.location.reload();
    }
}

document.getElementById('mode-toggle').onclick = switchGameMode;
document.getElementById('new-game').onclick = startNewTrainerGame;
updateModeIndicator();

// Set up tutorial
const example = new Cube2D(document.getElementById('example'));
example.drawFace(0, 0, 'ULDRUFUBU', '.XXX.//XX');
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

// Set up guess button
const guess = document.getElementById('guess');
guess.onclick = check;
guess.addEventListener('animationend', () => guess.classList.remove('shake'));

// Load state from storage based on mode
function getStorageKey(key) {
    const prefix = isDailyMode() ? 'daily_' : 'trainer_';
    return prefix + key;
}

// Make getStorageKey available globally for Cube3D
window.getStorageKey = getStorageKey;

if (isDailyMode()) {
    // Daily mode: check if it's a new day
    const today = new Date().toDateString();
    if (localStorage.getItem('today') !== today) {
        localStorage.setItem('today', today);
        localStorage.setItem(getStorageKey('guesses'), -1);
        localStorage.setItem(getStorageKey('score'), JSON.stringify(Array(20).fill(-1)));
        localStorage.removeItem(getStorageKey('complete'));
        cube.save();
    } else {
        cube.load();
    }
} else {
    // Trainer mode: always start fresh unless continuing current game
    if (!localStorage.getItem(getStorageKey('guesses'))) {
        localStorage.setItem(getStorageKey('guesses'), -1);
        localStorage.setItem(getStorageKey('score'), JSON.stringify(Array(20).fill(-1)));
        localStorage.removeItem(getStorageKey('complete'));
        cube.save();
    } else {
        cube.load();
    }
}

let guesses = parseInt(localStorage.getItem(getStorageKey('guesses'))) || -1;
const savedScore = localStorage.getItem(getStorageKey('score'));
let score = savedScore ? JSON.parse(savedScore) : Array(20).fill(-1);
check();

// Initialize statistics display
updateStatisticsDisplay();

// Set up WASD navigation
document.addEventListener('keydown', (event) => {
    // Only handle WASD keys when not in input fields or modals
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
    if (document.getElementById('stats-container').style.display !== 'none') return;
    if (document.getElementById('tutorial-container').style.display !== 'none') return;

    // Ensure consistent lowercase handling for all key comparisons
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
        event.preventDefault();
        cube.navigateWASD(key);
    }
});

function check() {
    solver.currentState = [...cube.permutation, ...cube.orientation];
    // solver.js does not check all numbers are in valid [0, 20) range
    if (cube.permutation.includes(-1) || !solver.verifyState()) {
        guess.classList.add('shake');
    } else if (guesses >= 6) {
        // Game over - maximum guesses reached
        document.getElementById('parity').innerText = 'Game Over! Maximum 6 guesses reached.';
        document.getElementById('picker').replaceChildren();
        document.getElementById('actions').replaceChildren();
        cube.selection.visible = false;
        return;
    } else {
        // Increment guesses, save state, and show feedback
        localStorage.setItem(getStorageKey('guesses'), guesses++);
        const guessLabel = document.getElementById('guess-label');
        if (guessLabel) guessLabel.textContent = String(guesses);
        cube.save();
        cube.updateParity();
        cube.initPicker(cube.selection);
        const currentColors = stateToFaceletColors(solver.currentState);
        // Check answer
        feedback.drawCube(currentColors, answerColors);
        // Update statistics display after guess is processed
        updateStatisticsDisplay();
        if (currentColors.toString() === answerColors.toString()) {
            if (!localStorage.getItem(getStorageKey('complete'))) {
                localStorage.setItem(getStorageKey('complete'), true);
                stats[Math.min(guesses - 1, stats.length - 1)]++;
                localStorage.setItem('stats', JSON.stringify(stats));
            }
            // Show confetti
            const canvas = document.getElementById('confetti');
            canvas.style.display = 'block';
            setTimeout(() => {
                let myConfetti = confetti.create(canvas, { resize: true, useWorker: true });
                myConfetti({
                    particleCount: 100,
                    spread: 135,
                    shapes: ['square'],
                    origin: { x: .5, y: .6 },
                });
                cube.selection.visible = false;
                document.getElementById('parity').innerText = `You won in ${guesses} guesses!`;
                document.getElementById('picker').replaceChildren();
                const share = document.createElement('button');
                share.innerText = '📋 Share';
                share.classList.add('action');
                share.style.flex = '1';
                share.onclick = () => {
                    const today = new Date().toISOString().substring(0, 10);
                    const modeText = isDailyMode() ? 'Daily' : 'Trainer';
                    const result = `Cuble ${today} (${modeText}): ${guesses}/6, ${score.join(' ')}`;
                    navigator.clipboard.writeText(result).then(
                        () => share.innerText = 'Copied results to clipboard!',
                        () => share.innerText = 'Could not copy to clipboard!',
                    );
                };
                document.getElementById('actions').replaceChildren(share);
                setTimeout(() => canvas.style.display = 'none', 3000);
            }, Cube2D.DELAY * 100);
        }
    }
}

function updateScore(score) {
    let correct = 0;
    for (let i = 0; i < score.length; i++) {
        if (cube.permutation[i] === answerState[i] && cube.orientation[i] === answerState[i + 20]) {
            correct++;
            if (score[i] === -1) {
                score[i] = guesses;
            }
        }
    }
    localStorage.setItem(getStorageKey('score'), JSON.stringify(score));
    return correct;
}

function countSolvedStickers() {
    const currentColors = stateToFaceletColors([...cube.permutation, ...cube.orientation]);
    let solvedStickers = 0;

    // Count correctly colored stickers (excluding centers which are always correct)
    for (let i = 0; i < 54; i++) {
        // Skip center stickers (positions 4, 13, 22, 31, 40, 49 in ULFRBD order)
        if (i % 9 === 4) continue;

        if (currentColors[i] === answerColors[i]) {
            solvedStickers++;
        }
    }

    // Add the 6 center stickers which are always correct
    return solvedStickers + 6;
}

function updateStatisticsDisplay() {
    const solvedPieces = updateScore(score);
    const solvedStickers = countSolvedStickers();

    document.getElementById('solved-pieces').textContent = `Pieces: ${solvedPieces}/20`;
    document.getElementById('solved-stickers').textContent = `Stickers: ${solvedStickers}/54`;
}

// Make updateStatisticsDisplay available globally for Cube3D
window.updateStatisticsDisplay = updateStatisticsDisplay;

function stateToFaceletColors(state) {
    const permutation = state.slice(0, 20);
    const orientation = state.slice(20);
    // Convert a permutation and orientation state into the 54 facelet colors required by Cube2D
    const FACELETS = {
        U: ['UBL', 'UB', 'URB', 'UL', 'U', 'UR', 'ULF', 'UF', 'UFR'],
        L: ['UBL', 'UL', 'ULF', 'BL', 'L', 'FL', 'DLB', 'DL', 'DFL'],
        F: ['ULF', 'UF', 'UFR', 'FL', 'F', 'FR', 'DFL', 'DF', 'DRF'],
        R: ['UFR', 'UR', 'URB', 'FR', 'R', 'BR', 'DRF', 'DR', 'DBR'],
        B: ['URB', 'UB', 'UBL', 'BR', 'B', 'BL', 'DBR', 'DB', 'DLB'],
        D: ['DFL', 'DF', 'DRF', 'DL', 'D', 'DR', 'DLB', 'DB', 'DBR'],
    };
    const colors = [];
    for (const face of 'ULFRBD') {
        for (const facelet of FACELETS[face]) {
            if (facelet.length === 1) {
                colors.push(facelet);
            } else {
                const index = Cube3D.getStateIndex(facelet);
                let actualPermutation = Cube3D.CUBIE_ORDER[permutation[index]];
                let actualOrientation = facelet.indexOf(face);
                if (facelet.length === 2) {
                    actualOrientation += orientation[index];
                } else if (facelet.length === 3) {
                    // HACK: swap orientations 1 and 2
                    actualOrientation += 3 - orientation[index];
                }
                colors.push(actualPermutation.charAt(actualOrientation % actualPermutation.length));
            }
        }
    }
    return colors;
}

function shuffle(array, rng) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(rng() * (i + 1));
        let temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

if ('serviceWorker' in navigator) {
    // && !/localhost/.test(window.location)) {
    registerSW();
}
