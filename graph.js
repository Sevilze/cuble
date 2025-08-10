export default class Graph {
    static THICKNESS = 35;

    constructor(canvas) {
        this.canvas = canvas;
    }

    update(stats) {
        // Always show all score categories (1-6+)
        let start = 0;
        // Find score with highest frequency
        let max = 0;
        for (let i = start; i < stats.length; i++) {
            max = Math.max(max, stats[i]);
        }
        this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio;
        this.canvas.height = Graph.THICKNESS * stats.length * window.devicePixelRatio;
        this.canvas.getContext('2d').scale(window.devicePixelRatio, window.devicePixelRatio);
        const ctx = this.canvas.getContext('2d');
        // Render graph
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.fillStyle = 'white';
        // HACK: Ensure font is loaded before drawing text
        const font = new FontFace('Rubik', 'url(https://fonts.gstatic.com/s/rubik/v19/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-B4iFV0UzdYPFkZVO.woff)');
        font.load().then(font => {
            document.fonts.add(font);
            ctx.font = 'larger Rubik';
            let y = 0;
            for (let i = start; i < stats.length; i++) {
                ctx.fillText(i === stats.length - 1 ? '6+' : (i + 1), 0, y + 25);
                let value = stats[i] / max * (this.canvas.offsetWidth - Graph.THICKNESS);
                if (isNaN(value) || value < Graph.THICKNESS) {
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
