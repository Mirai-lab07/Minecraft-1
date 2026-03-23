export declare class PerlinNoise {
    private permutation;
    private p;
    constructor(seed?: number);
    fade(t: number): number;
    lerp(t: number, a: number, b: number): number;
    grad(hash: number, x: number, y: number, z: number): number;
    noise(x: number, y: number, z: number): number;
}
//# sourceMappingURL=noise.d.ts.map