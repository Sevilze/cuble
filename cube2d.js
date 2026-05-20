import COLORS from './colors.js';

export default class Cube2D {
    static PADDING = 6;
    static DELAY = 1;

    constructor(canvas, dimension = 3) {
        this.element = canvas;
        this.ctx = canvas.getContext('2d');
        this.dimension = 0;
        this.setDimension(dimension);
    }

    setDimension(dimension) {
        if (this.dimension === dimension) return;
        this.dimension = dimension;

        const displayWidth = this.element.clientWidth || 300;
        this.cellSize = Math.max(10, Math.floor((displayWidth - Cube2D.PADDING * 6) / (dimension * 4)));
        this.faceSize = this.cellSize * dimension + (dimension - 1);
        const displayHeight = this.faceSize * 3 + Cube2D.PADDING * 2;
        const pixelRatio = window.devicePixelRatio || 1;

        this.element.style.height = `${displayHeight}px`;
        this.element.width = displayWidth * pixelRatio;
        this.element.height = displayHeight * pixelRatio;
        this.ctx = this.element.getContext('2d');
        this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        this.width = displayWidth;
        this.height = displayHeight;
    }

    drawSquare(x, y, color, feedback) {
        this.ctx.fillStyle = `rgb(${color.r * 256}, ${color.g * 256}, ${color.b * 256})`;
        this.ctx.fillRect(x, y, this.cellSize, this.cellSize);
        if (feedback !== '.') {
            this.ctx.beginPath();
            this.ctx.moveTo(x + this.cellSize, y);
            this.ctx.lineTo(x, y + this.cellSize);
            this.ctx.stroke();
        }
        if (feedback === 'X') {
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x + this.cellSize, y + this.cellSize);
            this.ctx.stroke();
        }
    }

    drawFace(x, y, colors, feedback) {
        for (let row = 0; row < this.dimension; row++) {
            for (let col = 0; col < this.dimension; col++) {
                const index = row * this.dimension + col;
                this.drawSquare(
                    x + col * (this.cellSize + 1),
                    y + row * (this.cellSize + 1),
                    COLORS[colors[index]],
                    feedback[index]
                );
            }
        }
    }

    drawCube(guess, answer, dimension = this.dimension) {
        this.setDimension(dimension);
        const feedback = Cube2D.getFeedback(guess, answer, dimension);
        this.ctx.clearRect(0, 0, this.width, this.height);

        const topX = this.faceSize + Cube2D.PADDING;
        const midY = this.faceSize + Cube2D.PADDING;

        this.drawFace(topX, 0, guess.slice(0, dimension * dimension), feedback.slice(0, dimension * dimension));
        for (let face = 0; face < 4; face++) {
            const start = (face + 1) * dimension * dimension;
            this.drawFace(
                face * (this.faceSize + Cube2D.PADDING),
                midY,
                guess.slice(start, start + dimension * dimension),
                feedback.slice(start, start + dimension * dimension)
            );
        }
        const bottomStart = 5 * dimension * dimension;
        this.drawFace(topX, (this.faceSize + Cube2D.PADDING) * 2, guess.slice(bottomStart), feedback.slice(bottomStart));
    }

    static getFeedback(guess, answer, dimension) {
        const perFace = dimension * dimension;
        const feedback = [];

        for (let face = 0; face < 6; face++) {
            const available = {
                corner: { U: 0, L: 0, F: 0, R: 0, B: 0, D: 0 },
                edge: { U: 0, L: 0, F: 0, R: 0, B: 0, D: 0 },
                center: { U: 0, L: 0, F: 0, R: 0, B: 0, D: 0 },
            };

            for (let index = 0; index < perFace; index++) {
                const faceletIndex = face * perFace + index;
                if (guess[faceletIndex] === answer[faceletIndex]) continue;
                available[Cube2D.getFaceletType(index, dimension)][answer[faceletIndex]]++;
            }

            for (let index = 0; index < perFace; index++) {
                const faceletIndex = face * perFace + index;
                const type = Cube2D.getFaceletType(index, dimension);
                if (guess[faceletIndex] === answer[faceletIndex]) {
                    feedback.push('.');
                } else if (available[type][guess[faceletIndex]]-- > 0) {
                    feedback.push('/');
                } else {
                    feedback.push('X');
                }
            }
        }

        return feedback;
    }

    static getFaceletType(index, dimension) {
        const row = Math.floor(index / dimension);
        const col = index % dimension;
        const last = dimension - 1;

        if ((row === 0 || row === last) && (col === 0 || col === last)) {
            return 'corner';
        }
        if (row === 0 || row === last || col === 0 || col === last) {
            return 'edge';
        }
        return 'center';
    }
}
