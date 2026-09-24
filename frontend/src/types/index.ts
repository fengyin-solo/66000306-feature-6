export interface Node {
  id: number;
  x: number;
  y: number;
  fixed: boolean;       // boundary condition
  displacementX: number;
  displacementY: number;
}

export interface Element {
  id: number;
  nodeIds: [number, number];  // 2-node truss element
  area: number;               // cross-section area (m²)
  youngsModulus: number;      // Pa
  allowableStress: number;    // allowable stress (Pa)
  stress: number;             // computed
  strain: number;             // computed
  force: number;              // computed
}

/** Editable property panel draft (values kept in display units as raw strings). */
export interface ElementDraft {
  areaMm2: string;          // cross-section area in mm²
  youngsGpa: string;        // Young's modulus in GPa
  allowableMpa: string;     // allowable stress in MPa
  errors: {
    area?: string;
    youngs?: string;
    allowable?: string;
  };
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

export interface FEAResult {
  displacements: number[];    // global displacement vector
  stresses: number[];          // per-element stress
  strains: number[];           // per-element strain
  maxDisplacement: number;
  maxStress: number;
  reactionForces: { nodeId: number; fx: number; fy: number }[];
}
