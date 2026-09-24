export interface Node {
  id: number;
  x: number;
  y: number;
  fixed: boolean;       // boundary condition
}

export interface Element {
  id: number;
  nodeIds: [number, number];  // 2-node truss element
  area: number;               // cross-section area (m²)
  youngsModulus: number;      // Pa
}

export interface Load {
  nodeId: number;
  fx: number;   // force X component (N)
  fy: number;   // force Y component (N)
}

export interface FEAModel {
  nodes: Node[];
  elements: Element[];
  loads: Load[];
}

export interface ElementResult {
  stress: number;   // Pa
  strain: number;
  force: number;    // N
}

export interface FEAResult {
  displacements: number[];    // global displacement vector
  stresses: number[];          // per-element stress (aligned with model.elements)
  strains: number[];           // per-element strain
  forces: number[];            // per-element axial force
  maxDisplacement: number;
  maxStress: number;
  reactionForces: { nodeId: number; fx: number; fy: number }[];
}
