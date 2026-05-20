import * as THREE from 'three';
import COLORS from './colors.js';

export default class Cubie extends THREE.Mesh {
    constructor(x, y, z, faces, slotId) {
        const material = new THREE.MeshBasicMaterial({ vertexColors: true });
        const colors = [];
        for (let i = 0; i < 36; i++) {
            colors.push(0, 0, 0);
        }

        const geometry = new THREE.BoxGeometry().toNonIndexed();
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        super(geometry, material);
        this.position.set(x, y, z);
        this.scale.set(0.92, 0.92, 0.92);
        this.slotId = slotId;
        this.faces = faces;
        this.colors = faces;
        this.setColors(faces);
    }

    setColors(colors) {
        if (colors.length !== this.faces.length) {
            throw new Error(`Expected ${this.faces.length} colors but got ${colors}.`);
        }
        this.colors = colors;
        const faceMap = { R: 0, L: 6, U: 12, D: 18, F: 24, B: 30 };
        const colorAttribute = this.geometry.getAttribute('color');
        for (let i = 0; i < this.faces.length; i++) {
            const color = COLORS[colors.charAt(i)] || COLORS.X;
            for (let j = 0; j < 6; j++) {
                colorAttribute.setXYZ(faceMap[this.faces.charAt(i)] + j, color.r, color.g, color.b);
            }
        }
        this.geometry.attributes.color.needsUpdate = true;
    }

    erase() {
        this.setColors('X'.repeat(this.faces.length));
    }

    rotate() {
        if (this.colors.length <= 1) return;
        this.setColors(this.colors.substring(1) + this.colors.charAt(0));
    }
}
