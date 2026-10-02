/**
 * Built-in syllabus templates. Format per line:
 *   Chapter | priority(h/m/l) | difficulty(e/m/h) | topic; topic; topic
 * Priorities reflect typical exam weightage; the student can change everything.
 */
import type { Difficulty, Priority } from "./types";

export interface TemplateTopic {
  subject: string;
  chapter: string;
  topic: string;
  priority: Priority;
  difficulty: Difficulty;
}

const P: Record<string, Priority> = { h: "high", m: "medium", l: "low" };
const D: Record<string, Difficulty> = { e: "easy", m: "medium", h: "hard" };

function parse(subject: string, block: string): TemplateTopic[] {
  const out: TemplateTopic[] = [];
  for (const line of block.trim().split("\n")) {
    const [chapter, p, d, topics] = line.split("|").map((s) => s.trim());
    for (const topic of topics.split(";").map((t) => t.trim()).filter(Boolean)) {
      out.push({ subject, chapter, topic, priority: P[p] ?? "medium", difficulty: D[d] ?? "medium" });
    }
  }
  return out;
}

const PHYSICS = `
Units & Measurements | l | e | Dimensional analysis; Errors & significant figures
Kinematics | h | m | Motion in 1D; Graphs of motion; Projectile motion; Relative velocity
Laws of Motion | h | m | Newton's laws & FBDs; Friction; Circular motion dynamics
Work, Energy & Power | h | m | Work-energy theorem; Conservation of energy; Collisions
Rotational Motion | h | h | Moment of inertia; Torque & angular momentum; Rolling motion
Gravitation | m | m | Kepler's laws; Gravitational potential; Satellites & escape velocity
Properties of Matter | m | m | Elasticity; Fluid mechanics & Bernoulli; Surface tension & viscosity
Thermodynamics | h | m | Laws of thermodynamics; Thermodynamic processes; Heat engines
Kinetic Theory | m | e | Gas laws; Degrees of freedom; Mean free path
Oscillations | m | m | SHM equations; Springs & pendulums; Damped & forced oscillations
Waves | m | m | Wave equation; Standing waves; Doppler effect
Electrostatics | h | h | Coulomb's law & fields; Gauss's law; Potential & capacitors
Current Electricity | h | m | Ohm's law & circuits; Kirchhoff's laws; Meter bridge & potentiometer
Magnetic Effects of Current | h | h | Biot-Savart law; Ampere's law; Force on moving charges
Electromagnetic Induction | h | h | Faraday's law; Self & mutual inductance; AC circuits
Ray Optics | h | m | Mirrors & lenses; Refraction & prisms; Optical instruments
Wave Optics | m | h | Young's double slit; Diffraction; Polarization
Modern Physics | h | m | Photoelectric effect; Atomic models; Nuclei & radioactivity
Semiconductors | m | e | Diodes; Transistors; Logic gates
`;

const CHEMISTRY = `
Mole Concept | h | e | Stoichiometry; Concentration terms; Limiting reagent
Atomic Structure | m | m | Quantum numbers; Bohr model; Electronic configuration
Chemical Bonding | h | m | VSEPR theory; Hybridisation; Molecular orbital theory
States of Matter | l | e | Gas laws; Real gases
Chemical Thermodynamics | h | m | Enthalpy & Hess's law; Entropy & Gibbs energy
Chemical Equilibrium | h | m | Kc & Kp; Le Chatelier's principle
Ionic Equilibrium | h | h | pH & buffers; Solubility product; Salt hydrolysis
Redox Reactions | m | e | Oxidation numbers; Balancing redox equations
Electrochemistry | h | h | Nernst equation; Electrolysis; Conductance
Chemical Kinetics | h | m | Rate laws; Order & half-life; Arrhenius equation
Solutions | m | m | Colligative properties; Raoult's law
Periodic Table | m | e | Periodic trends; Ionisation energy & electronegativity
Coordination Compounds | h | m | Nomenclature & isomerism; Crystal field theory
p-Block Elements | m | m | Group 15-16 compounds; Group 17-18 compounds
d & f Block Elements | m | m | Transition metal properties; Lanthanoids
GOC | h | m | Inductive & resonance effects; Reaction intermediates
Hydrocarbons | m | m | Alkanes & alkenes; Aromatic compounds
Haloalkanes & Haloarenes | m | m | SN1/SN2 mechanisms; Elimination reactions
Alcohols, Phenols & Ethers | m | m | Preparation; Reactions & tests
Aldehydes & Ketones | h | h | Nucleophilic addition; Named reactions
Amines & Biomolecules | m | e | Basicity of amines; Carbohydrates & proteins
`;

const MATHS = `
Sets, Relations & Functions | m | e | Types of functions; Domain & range; Composition & inverse
Complex Numbers | m | m | Argand plane; De Moivre's theorem; Cube roots of unity
Quadratic Equations | h | m | Nature of roots; Location of roots
Sequences & Series | h | m | AP, GP & HP; Special series sums
Permutations & Combinations | m | h | Arrangements; Selections & distributions
Binomial Theorem | m | m | General term; Coefficient properties
Matrices & Determinants | h | m | Matrix operations; Determinant properties; Systems of equations
Straight Lines | m | e | Forms of a line; Distance & angle formulas
Conic Sections | h | h | Circles; Parabola; Ellipse & hyperbola
Limits & Continuity | h | m | Standard limits; L'Hospital's rule; Continuity & differentiability
Differentiation | h | m | Chain rule; Implicit differentiation
Applications of Derivatives | h | h | Maxima & minima; Tangents & normals; Monotonicity
Indefinite Integration | h | h | Substitution; Integration by parts; Partial fractions
Definite Integration | h | h | Properties of definite integrals; Area under curves
Differential Equations | m | m | Variable separable; Linear differential equations
Vectors | h | m | Dot & cross product; Scalar triple product
3D Geometry | h | m | Lines in space; Planes; Shortest distance
Probability | h | h | Conditional probability; Bayes' theorem; Random variables
Trigonometry | m | m | Identities; Trigonometric equations; Inverse trigonometry
Statistics | l | e | Mean & variance; Standard deviation
`;

const BIOLOGY = `
Cell Biology | h | e | Cell structure; Cell cycle & division
Plant Physiology | h | m | Photosynthesis; Respiration in plants; Plant hormones
Human Physiology | h | m | Digestion; Breathing; Circulation; Neural control
Genetics | h | h | Mendelian inheritance; Molecular basis of inheritance
Evolution | m | e | Theories of evolution; Hardy-Weinberg
Ecology | m | e | Ecosystems; Biodiversity & conservation
Reproduction | h | m | Human reproduction; Reproductive health
Biotechnology | m | m | Principles & processes; Applications
Diversity of Life | m | e | Classification; Plant & animal kingdoms
`;

const SAT = `
Algebra | h | m | Linear equations; Systems of equations; Linear inequalities
Advanced Math | h | h | Quadratics; Exponential functions; Nonlinear equations
Problem Solving & Data | m | m | Ratios & percentages; Statistics; Probability
Geometry & Trigonometry | m | m | Area & volume; Right triangles; Circles
Reading | h | m | Central ideas; Command of evidence; Inferences
Writing | m | e | Boundaries & punctuation; Transitions; Rhetorical synthesis
`;

export const SYLLABUS_TEMPLATES: Record<string, { name: string; subjects: string[]; topics: () => TemplateTopic[] }> = {
  jee: {
    name: "JEE (Physics, Chemistry, Mathematics)",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    topics: () => [...parse("Physics", PHYSICS), ...parse("Chemistry", CHEMISTRY), ...parse("Mathematics", MATHS)],
  },
  neet: {
    name: "NEET (Physics, Chemistry, Biology)",
    subjects: ["Physics", "Chemistry", "Biology"],
    topics: () => [...parse("Physics", PHYSICS), ...parse("Chemistry", CHEMISTRY), ...parse("Biology", BIOLOGY)],
  },
  sat: {
    name: "SAT (Math, Reading & Writing)",
    subjects: ["Math", "Reading & Writing"],
    topics: () => [
      ...parse("Math", SAT.split("\n").filter((l) => /Algebra|Advanced|Problem|Geometry/.test(l)).join("\n")),
      ...parse("Reading & Writing", SAT.split("\n").filter((l) => /Reading|Writing/.test(l)).join("\n")),
    ],
  },
  custom: { name: "Custom (start empty)", subjects: [], topics: () => [] },
};

/** Keyword hints used by the heuristic topic classifier. chapter → keywords */
export const CHAPTER_KEYWORDS: Record<string, { subject: string; words: string[] }> = {
  Kinematics: { subject: "Physics", words: ["velocity", "acceleration", "projectile", "displacement", "speed", "trajectory", "relative velocity", "range"] },
  "Laws of Motion": { subject: "Physics", words: ["friction", "tension", "newton", "pulley", "normal reaction", "block", "incline"] },
  "Work, Energy & Power": { subject: "Physics", words: ["work done", "kinetic energy", "potential energy", "power", "collision", "coefficient of restitution"] },
  "Rotational Motion": { subject: "Physics", words: ["moment of inertia", "torque", "angular momentum", "rolling", "rigid body", "angular velocity"] },
  Gravitation: { subject: "Physics", words: ["gravitational", "satellite", "orbit", "escape velocity", "kepler", "planet"] },
  "Properties of Matter": { subject: "Physics", words: ["young's modulus", "viscosity", "surface tension", "bernoulli", "fluid", "buoyant", "stress", "strain"] },
  Thermodynamics: { subject: "Physics", words: ["adiabatic", "isothermal", "heat engine", "carnot", "first law", "internal energy"] },
  "Kinetic Theory": { subject: "Physics", words: ["rms speed", "degrees of freedom", "mean free path", "ideal gas"] },
  Oscillations: { subject: "Physics", words: ["simple harmonic", "shm", "pendulum", "spring constant", "oscillat", "amplitude"] },
  Waves: { subject: "Physics", words: ["wave", "doppler", "standing wave", "resonance", "string", "beats"] },
  Electrostatics: { subject: "Physics", words: ["charge", "electric field", "coulomb", "capacitor", "gauss", "electric potential", "dielectric"] },
  "Current Electricity": { subject: "Physics", words: ["resistance", "resistor", "current", "kirchhoff", "emf", "wheatstone", "potentiometer", "circuit"] },
  "Magnetic Effects of Current": { subject: "Physics", words: ["magnetic field", "solenoid", "biot", "ampere", "lorentz", "cyclotron"] },
  "Electromagnetic Induction": { subject: "Physics", words: ["induced emf", "faraday", "inductance", "inductor", "lenz", "alternating current", "lcr"] },
  "Ray Optics": { subject: "Physics", words: ["lens", "mirror", "focal length", "refraction", "prism", "refractive index", "telescope"] },
  "Wave Optics": { subject: "Physics", words: ["interference", "diffraction", "young's double slit", "fringe", "polariz"] },
  "Modern Physics": { subject: "Physics", words: ["photoelectric", "work function", "de broglie", "nucleus", "half-life", "radioactive", "bohr", "photon"] },
  Semiconductors: { subject: "Physics", words: ["diode", "transistor", "logic gate", "semiconductor", "p-n junction"] },
  "Mole Concept": { subject: "Chemistry", words: ["moles", "molarity", "stoichiometr", "limiting reagent", "molality", "mass percent"] },
  "Atomic Structure": { subject: "Chemistry", words: ["quantum number", "orbital", "electronic configuration", "aufbau", "hund"] },
  "Chemical Bonding": { subject: "Chemistry", words: ["hybridi", "vsepr", "bond order", "dipole moment", "molecular orbital", "lone pair"] },
  "Chemical Thermodynamics": { subject: "Chemistry", words: ["enthalpy", "entropy", "gibbs", "hess", "spontaneous"] },
  "Chemical Equilibrium": { subject: "Chemistry", words: ["equilibrium constant", "kc", "kp", "le chatelier"] },
  "Ionic Equilibrium": { subject: "Chemistry", words: ["ph", "buffer", "ksp", "solubility product", "hydrolysis", "pka"] },
  Electrochemistry: { subject: "Chemistry", words: ["nernst", "electrode potential", "electrolysis", "galvanic", "conductance", "faraday's law of electrolysis"] },
  "Chemical Kinetics": { subject: "Chemistry", words: ["rate constant", "order of reaction", "half life", "activation energy", "arrhenius"] },
  Solutions: { subject: "Chemistry", words: ["osmotic", "raoult", "colligative", "vapour pressure", "van't hoff", "freezing point"] },
  "Coordination Compounds": { subject: "Chemistry", words: ["ligand", "coordination", "crystal field", "complex", "chelate"] },
  GOC: { subject: "Chemistry", words: ["carbocation", "resonance", "inductive effect", "hyperconjugation", "acidic strength"] },
  "Aldehydes & Ketones": { subject: "Chemistry", words: ["aldehyde", "ketone", "aldol", "cannizzaro", "carbonyl"] },
  "Haloalkanes & Haloarenes": { subject: "Chemistry", words: ["sn1", "sn2", "haloalkane", "alkyl halide"] },
  Hydrocarbons: { subject: "Chemistry", words: ["alkene", "alkyne", "benzene", "markovnikov", "ozonolysis"] },
  "Complex Numbers": { subject: "Mathematics", words: ["complex number", "argand", "modulus", "iota", "conjugate"] },
  "Quadratic Equations": { subject: "Mathematics", words: ["quadratic", "roots of the equation", "discriminant"] },
  "Sequences & Series": { subject: "Mathematics", words: ["arithmetic progression", "geometric progression", "a.p.", "g.p.", "series", "sum of first"] },
  "Permutations & Combinations": { subject: "Mathematics", words: ["arrangements", "ways", "permutation", "combination", "selected"] },
  "Binomial Theorem": { subject: "Mathematics", words: ["binomial", "coefficient of", "expansion"] },
  "Matrices & Determinants": { subject: "Mathematics", words: ["matrix", "determinant", "inverse of", "adjoint"] },
  "Conic Sections": { subject: "Mathematics", words: ["parabola", "ellipse", "hyperbola", "circle", "focus", "directrix", "eccentricity"] },
  "Limits & Continuity": { subject: "Mathematics", words: ["limit", "lim", "continuous", "differentiable at"] },
  "Applications of Derivatives": { subject: "Mathematics", words: ["maximum", "minimum", "tangent", "normal to", "increasing", "decreasing"] },
  "Indefinite Integration": { subject: "Mathematics", words: ["∫", "integral", "antiderivative"] },
  "Definite Integration": { subject: "Mathematics", words: ["definite integral", "area bounded", "area enclosed", "bounded by", "area"] },
  "Differential Equations": { subject: "Mathematics", words: ["differential equation", "dy/dx", "general solution"] },
  Vectors: { subject: "Mathematics", words: ["vector", "dot product", "cross product", "unit vector"] },
  "3D Geometry": { subject: "Mathematics", words: ["plane", "direction cosines", "skew lines", "line in space"] },
  Probability: { subject: "Mathematics", words: ["probability", "dice", "coin", "bayes", "random variable"] },
  Trigonometry: { subject: "Mathematics", words: ["sin", "cos", "tan", "trigonometric"] },
};
