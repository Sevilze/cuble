export default class Graph {
    static THICKNESS = 35;

    constructor(canvas) {
        this.canvas = canvas;
    }

    update(stats, labels) {
        const max = Math.max(...stats, 0);
        this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio;
        this.canvas.height = Graph.THICKNESS * stats.length * window.devicePixelRatio;
        this.canvas.getContext('2d').setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = 'white';
        const font = new FontFace('Rubik', 'url(https://fonts.gstatic.com/s/rubik/v19/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-B4iFV0UzdYPFkZVO.woff)');
        font.load().then(font => {
            document.fonts.add(font);
            ctx.font = 'larger Rubik';
            let y = 0;
            for (let i = 0; i < stats.length; i++) {
                ctx.fillText(labels[i], 0, y + 25);
                let value = max === 0 ? Graph.THICKNESS : stats[i] / max * (this.canvas.offsetWidth - Graph.THICKNESS);
                if (value < Graph.THICKNESS) {
                    value = Graph.THICKNESS;
                }
                ctx.fillRect(Graph.THICKNESS * 1.2, y + 5, value, Graph.THICKNESS - 10);
                ctx.fillStyle = 'black';
                const offset = 10 * (String(stats[i]).length - 1);
                ctx.fillText(stats[i], value + 15 - offset, y + 25);
                ctx.fillStyle = 'white';
                y += Graph.THICKNESS;
            }
        });
    }
}
