/**
 * Parametrized question templates for the seeded demo papers. Each template
 * produces a realistic question with computed options so the Question Bank,
 * Error Notebook and retry flows have real content to work with.
 */
import type { Difficulty } from "../types";

type R = () => number;
export interface GenQ {
  text: string;
  options?: string[];
  answer?: number;
  value?: number;
}
export interface Template {
  subject: "Physics" | "Chemistry" | "Mathematics";
  chapter: string;
  topic: string;
  difficulty: Difficulty;
  numerical?: boolean;
  gen: (r: R) => GenQ;
}

const pick = <T,>(r: R, xs: T[]) => xs[Math.floor(r() * xs.length)];
const int = (r: R, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ""));

/** Shuffle distractors around the correct value; returns options + answer index. */
function mcq(r: R, correct: string, distractors: string[]): { options: string[]; answer: number } {
  const uniq = [...new Set(distractors.filter((d) => d !== correct))];
  const fillers = ["None of these", "Cannot be determined", "Data insufficient"];
  while (uniq.length < 3) uniq.push(fillers[uniq.length]);
  const opts = [correct, ...uniq.slice(0, 3)];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { options: opts, answer: opts.indexOf(correct) };
}

export const TEMPLATES: Template[] = [
  /* ------------------------------ Physics ------------------------------ */
  { subject: "Physics", chapter: "Kinematics", topic: "Projectile motion", difficulty: "medium", gen: (r) => {
    const u = pick(r, [10, 20, 30, 40]); const th = pick(r, [30, 60]);
    const h = (u * u * Math.sin((th * Math.PI) / 180) ** 2) / 20;
    return { text: `A ball is projected with speed ${u} m/s at ${th}° to the horizontal. The maximum height reached is (g = 10 m/s²):`, ...mcq(r, `${fmt(h)} m`, [`${fmt(h * 2)} m`, `${fmt(h / 2)} m`, `${fmt((u * u) / 20)} m`]) };
  } },
  { subject: "Physics", chapter: "Kinematics", topic: "Motion in 1D", difficulty: "easy", gen: (r) => {
    const u = int(r, 2, 8); const a = int(r, 2, 5); const t = int(r, 3, 6);
    const s = u * t + 0.5 * a * t * t;
    return { text: `A car starts with velocity ${u} m/s and accelerates uniformly at ${a} m/s². The distance covered in ${t} s is:`, ...mcq(r, `${fmt(s)} m`, [`${fmt(u * t + a * t * t)} m`, `${fmt(s - u * t)} m`, `${fmt(s + u)} m`]) };
  } },
  { subject: "Physics", chapter: "Kinematics", topic: "Relative velocity", difficulty: "medium", numerical: true, gen: (r) => {
    const v1 = int(r, 30, 60); const v2 = int(r, 10, 25); const d = pick(r, [140, 175, 210]);
    return { text: `Two trains move in the same direction at ${v1} km/h and ${v2} km/h. If the faster train is ${d} m behind, find the time (in s) to catch up.`, value: Number(((d / 1000) / (v1 - v2) * 3600).toFixed(1)) };
  } },
  { subject: "Physics", chapter: "Laws of Motion", topic: "Friction", difficulty: "medium", gen: (r) => {
    const m = int(r, 2, 10); const mu = pick(r, [0.2, 0.3, 0.4, 0.5]); const f = m * 10 * mu;
    return { text: `A block of mass ${m} kg rests on a rough horizontal surface (μ = ${mu}). The minimum horizontal force needed to start moving it is (g = 10 m/s²):`, ...mcq(r, `${fmt(f)} N`, [`${fmt(m * 10)} N`, `${fmt(f / 2)} N`, `${fmt(f + m)} N`]) };
  } },
  { subject: "Physics", chapter: "Laws of Motion", topic: "Newton's laws & FBDs", difficulty: "easy", gen: (r) => {
    const m1 = int(r, 2, 5); const m2 = int(r, 3, 7); const a = ((m2 - m1) * 10) / (m1 + m2);
    return { text: `Two masses ${m1} kg and ${m2} kg hang from a light frictionless pulley (Atwood machine). The magnitude of acceleration is (g = 10 m/s²):`, ...mcq(r, `${fmt(Math.abs(a))} m/s²`, [`${fmt(Math.abs(a) * 2)} m/s²`, `10 m/s²`, `${fmt(Math.abs(m2 - m1))} m/s²`]) };
  } },
  { subject: "Physics", chapter: "Work, Energy & Power", topic: "Collisions", difficulty: "medium", gen: (r) => {
    const m = int(r, 1, 4); const v = int(r, 4, 10);
    return { text: `A ${m} kg ball moving at ${v} m/s collides perfectly inelastically with an identical ball at rest. The kinetic energy lost is:`, ...mcq(r, `${fmt((m * v * v) / 4)} J`, [`${fmt((m * v * v) / 2)} J`, `${fmt((m * v * v) / 8)} J`, `0 J`]) };
  } },
  { subject: "Physics", chapter: "Rotational Motion", topic: "Moment of inertia", difficulty: "hard", gen: (r) => {
    const M = int(r, 2, 6); const R = pick(r, [0.1, 0.2, 0.5]);
    return { text: `The moment of inertia of a uniform disc of mass ${M} kg and radius ${R} m about a tangent in its plane is:`, ...mcq(r, `${fmt(1.25 * M * R * R)} kg·m²`, [`${fmt(1.5 * M * R * R)} kg·m²`, `${fmt(0.5 * M * R * R)} kg·m²`, `${fmt(0.25 * M * R * R)} kg·m²`]) };
  } },
  { subject: "Physics", chapter: "Rotational Motion", topic: "Rolling motion", difficulty: "hard", gen: (r) => {
    const h = pick(r, [0.9, 1.8, 2.7]);
    return { text: `A solid sphere rolls without slipping down an incline of height ${h} m from rest. Its speed at the bottom is (g = 10 m/s²):`, ...mcq(r, `${fmt(Math.sqrt((10 / 7) * 10 * h))} m/s`, [`${fmt(Math.sqrt(2 * 10 * h))} m/s`, `${fmt(Math.sqrt(10 * h))} m/s`, `${fmt(Math.sqrt((4 / 3) * 10 * h))} m/s`]) };
  } },
  { subject: "Physics", chapter: "Thermodynamics", topic: "Thermodynamic processes", difficulty: "medium", gen: (r) => {
    const n = int(r, 1, 3); const T = pick(r, [300, 400]);
    return { text: `${n} mole of an ideal gas expands isothermally at ${T} K to twice its volume. The work done by the gas is (R = 8.3 J/mol·K, ln 2 = 0.69):`, ...mcq(r, `${fmt(n * 8.3 * T * 0.69)} J`, [`${fmt(n * 8.3 * T)} J`, `${fmt(n * 8.3 * T * 0.69 * 2)} J`, `0 J`]) };
  } },
  { subject: "Physics", chapter: "Electrostatics", topic: "Potential & capacitors", difficulty: "hard", gen: (r) => {
    const c = int(r, 2, 6); const v = pick(r, [10, 20, 50]);
    return { text: `Two identical ${c} μF capacitors are connected in series across a ${v} V battery. The total energy stored is:`, ...mcq(r, `${fmt(0.5 * (c / 2) * v * v)} μJ`, [`${fmt(0.5 * c * v * v)} μJ`, `${fmt(c * v * v)} μJ`, `${fmt(0.25 * (c / 2) * v * v)} μJ`]) };
  } },
  { subject: "Physics", chapter: "Electrostatics", topic: "Coulomb's law & fields", difficulty: "medium", gen: (r) => {
    const q = int(r, 1, 5);
    return { text: `A charge of ${q} μC is placed at the centre of a cube. The electric flux through one face of the cube is:`, ...mcq(r, `${q}/(6ε₀) μC`, [`${q}/ε₀ μC`, `${q}/(4ε₀) μC`, `${q}/(8ε₀) μC`]) };
  } },
  { subject: "Physics", chapter: "Current Electricity", topic: "Kirchhoff's laws", difficulty: "medium", gen: (r) => {
    const a = int(r, 2, 6); const b = int(r, 3, 12);
    return { text: `Resistors of ${a} Ω and ${b} Ω are connected in parallel across a ${a * b} V ideal source. The current drawn from the source is:`, ...mcq(r, `${fmt(b + a)} A`, [`${fmt((a * b) / (a + b))} A`, `${fmt(a * b)} A`, `${fmt(b)} A`]) };
  } },
  { subject: "Physics", chapter: "Electromagnetic Induction", topic: "Faraday's law", difficulty: "hard", gen: (r) => {
    const B = pick(r, [0.2, 0.5]); const l = pick(r, [0.5, 1]); const v = int(r, 2, 8);
    return { text: `A rod of length ${l} m moves at ${v} m/s perpendicular to a uniform magnetic field of ${B} T. The induced emf across its ends is:`, ...mcq(r, `${fmt(B * l * v)} V`, [`${fmt(B * v)} V`, `${fmt(B * l * v * 2)} V`, `${fmt(-B * l * v)} V`]) };
  } },
  { subject: "Physics", chapter: "Ray Optics", topic: "Mirrors & lenses", difficulty: "medium", gen: (r) => {
    const f = pick(r, [10, 15, 20]); const u = f * pick(r, [2, 3]);
    const v = (u * f) / (u - f);
    return { text: `An object is placed ${u} cm in front of a convex lens of focal length ${f} cm. The image distance is:`, ...mcq(r, `${fmt(v)} cm`, [`${fmt(-v)} cm`, `${fmt(u)} cm`, `${fmt(v / 2)} cm`]) };
  } },
  { subject: "Physics", chapter: "Modern Physics", topic: "Photoelectric effect", difficulty: "medium", numerical: true, gen: (r) => {
    const E = pick(r, [4.5, 5, 6.2]); const W = pick(r, [2.1, 2.3, 2.5]);
    return { text: `Light of photon energy ${E} eV falls on a metal of work function ${W} eV. Find the stopping potential in volts.`, value: Number((E - W).toFixed(2)) };
  } },
  { subject: "Physics", chapter: "Oscillations", topic: "Springs & pendulums", difficulty: "medium", gen: (r) => {
    const m = pick(r, [0.1, 0.4, 0.9]); const k = pick(r, [10, 40, 90]);
    return { text: `A mass of ${m} kg attached to a spring of constant ${k} N/m oscillates. Its time period is:`, ...mcq(r, `${fmt(2 * Math.PI * Math.sqrt(m / k))} s`, [`${fmt(Math.PI * Math.sqrt(m / k))} s`, `${fmt(2 * Math.PI * Math.sqrt(k / m))} s`, `${fmt(Math.sqrt(m / k))} s`]) };
  } },

  /* ----------------------------- Chemistry ----------------------------- */
  { subject: "Chemistry", chapter: "Mole Concept", topic: "Stoichiometry", difficulty: "easy", gen: (r) => {
    const g = pick(r, [8, 16, 32]);
    return { text: `The number of moles of O₂ required to completely burn ${g} g of methane (CH₄) is:`, ...mcq(r, `${fmt((g / 16) * 2)}`, [`${fmt(g / 16)}`, `${fmt((g / 16) * 4)}`, `${fmt((g / 16) * 1.5)}`]) };
  } },
  { subject: "Chemistry", chapter: "Mole Concept", topic: "Concentration terms", difficulty: "easy", numerical: true, gen: (r) => {
    const g = pick(r, [4, 8, 10]); const v = pick(r, [250, 500]);
    return { text: `${g} g of NaOH is dissolved in water to make ${v} mL of solution. Find its molarity (M).`, value: Number(((g / 40) / (v / 1000)).toFixed(2)) };
  } },
  { subject: "Chemistry", chapter: "Chemical Bonding", topic: "Hybridisation", difficulty: "medium", gen: (r) => {
    const [mol, hyb] = pick(r, [["XeF₄", "sp³d²"], ["SF₄", "sp³d"], ["BF₃", "sp²"], ["NH₃", "sp³"]] as [string, string][]);
    return { text: `The hybridisation of the central atom in ${mol} is:`, ...mcq(r, hyb, ["sp³d²", "sp³d", "sp²", "sp³"].filter((h) => h !== hyb)) };
  } },
  { subject: "Chemistry", chapter: "Chemical Thermodynamics", topic: "Enthalpy & Hess's law", difficulty: "medium", gen: (r) => {
    const a = int(r, 280, 400); const b = int(r, 90, 200);
    return { text: `Given ΔH(A→B) = −${a} kJ and ΔH(C→B) = −${b} kJ, the enthalpy change for A → C is:`, ...mcq(r, `−${a - b} kJ`, [`−${a + b} kJ`, `+${a - b} kJ`, `+${a + b} kJ`]) };
  } },
  { subject: "Chemistry", chapter: "Ionic Equilibrium", topic: "pH & buffers", difficulty: "hard", gen: (r) => {
    const pka = pick(r, [4.74, 4.2, 9.25]); const ratio = pick(r, [1, 10]);
    return { text: `A buffer contains a weak acid (pKa = ${pka}) and its salt in the ratio [salt]/[acid] = ${ratio}. Its pH is:`, ...mcq(r, `${fmt(pka + Math.log10(ratio))}`, [`${fmt(pka - Math.log10(ratio) - (ratio === 1 ? 1 : 0))}`, `${fmt(pka + 2)}`, `7`]) };
  } },
  { subject: "Chemistry", chapter: "Electrochemistry", topic: "Nernst equation", difficulty: "hard", gen: (r) => {
    const e0 = pick(r, [1.1, 0.46, 0.8]); const q = pick(r, [10, 100]);
    return { text: `For a cell with E° = ${e0} V and n = 2, the EMF at 298 K when the reaction quotient Q = ${q} is:`, ...mcq(r, `${fmt(e0 - (0.059 / 2) * Math.log10(q))} V`, [`${fmt(e0 + (0.059 / 2) * Math.log10(q))} V`, `${fmt(e0 - 0.059 * Math.log10(q))} V`, `${fmt(e0)} V`]) };
  } },
  { subject: "Chemistry", chapter: "Electrochemistry", topic: "Electrolysis", difficulty: "medium", numerical: true, gen: (r) => {
    const i = pick(r, [2, 5]); const t = pick(r, [965, 1930]);
    return { text: `A current of ${i} A is passed through CuSO₄ solution for ${t} s. Find the mass of copper deposited in grams (Cu = 63.5, F = 96500 C).`, value: Number(((i * t) / 96500 / 2 * 63.5).toFixed(2)) };
  } },
  { subject: "Chemistry", chapter: "Chemical Kinetics", topic: "Order & half-life", difficulty: "medium", gen: (r) => {
    const t = pick(r, [10, 20, 30]);
    return { text: `A first-order reaction has a half-life of ${t} min. The time for 75% completion is:`, ...mcq(r, `${2 * t} min`, [`${t} min`, `${3 * t} min`, `${1.5 * t} min`]) };
  } },
  { subject: "Chemistry", chapter: "Coordination Compounds", topic: "Crystal field theory", difficulty: "medium", gen: (r) => {
    const [cx, n] = pick(r, [["[Fe(CN)₆]³⁻", "1"], ["[CoF₆]³⁻", "4"], ["[Ni(CO)₄]", "0"], ["[Fe(H₂O)₆]²⁺", "4"]] as [string, string][]);
    return { text: `The number of unpaired electrons in ${cx} is:`, ...mcq(r, n, ["0", "1", "2", "3", "4", "5"].filter((x) => x !== n).slice(0, 3)) };
  } },
  { subject: "Chemistry", chapter: "GOC", topic: "Inductive & resonance effects", difficulty: "medium", gen: (r) => ({
    text: "Which of the following is the strongest acid?", ...mcq(r, "p-nitrophenol", ["phenol", "p-cresol", "p-methoxyphenol"]),
  }) },
  { subject: "Chemistry", chapter: "Aldehydes & Ketones", topic: "Named reactions", difficulty: "hard", gen: (r) => {
    const [rx, prod] = pick(r, [["Cannizzaro reaction of benzaldehyde", "benzyl alcohol + benzoate"], ["Clemmensen reduction of acetophenone", "ethylbenzene"], ["aldol condensation of ethanal", "3-hydroxybutanal"]] as [string, string][]);
    return { text: `The major product(s) of the ${rx} is/are:`, ...mcq(r, prod, ["benzyl alcohol + benzoate", "ethylbenzene", "3-hydroxybutanal", "benzoic acid", "acetone"].filter((p) => p !== prod)) };
  } },
  { subject: "Chemistry", chapter: "p-Block Elements", topic: "Group 15-16 compounds", difficulty: "medium", gen: (r) => ({
    text: "Which of the following oxides of nitrogen is paramagnetic?", ...mcq(r, "NO₂", ["N₂O", "N₂O₄", "N₂O₅"]),
  }) },
  { subject: "Chemistry", chapter: "Solutions", topic: "Colligative properties", difficulty: "medium", gen: (r) => {
    const m = pick(r, [0.1, 0.2, 0.5]);
    return { text: `The depression in freezing point of a ${m} m aqueous NaCl solution (Kf = 1.86 K kg/mol, complete dissociation) is:`, ...mcq(r, `${fmt(2 * 1.86 * m)} K`, [`${fmt(1.86 * m)} K`, `${fmt(3 * 1.86 * m)} K`, `${fmt(1.86 / m)} K`]) };
  } },

  /* ---------------------------- Mathematics ---------------------------- */
  { subject: "Mathematics", chapter: "Quadratic Equations", topic: "Nature of roots", difficulty: "medium", gen: (r) => {
    const a = int(r, 2, 6);
    return { text: `The number of integral values of k for which x² − ${2 * a}x + k = 0 has real and distinct positive roots is:`, ...mcq(r, `${a * a - 1}`, [`${a * a}`, `${a * a - 2}`, `${a * a + 1}`]) };
  } },
  { subject: "Mathematics", chapter: "Sequences & Series", topic: "AP, GP & HP", difficulty: "easy", gen: (r) => {
    const a = int(r, 1, 5); const d = int(r, 2, 4); const n = pick(r, [10, 20]);
    return { text: `The sum of the first ${n} terms of the AP ${a}, ${a + d}, ${a + 2 * d}, … is:`, ...mcq(r, `${(n / 2) * (2 * a + (n - 1) * d)}`, [`${n * (a + (n - 1) * d)}`, `${(n / 2) * (a + (n - 1) * d)}`, `${(n / 2) * (2 * a + n * d)}`]) };
  } },
  { subject: "Mathematics", chapter: "Permutations & Combinations", topic: "Selections & distributions", difficulty: "hard", gen: (r) => {
    const n = pick(r, [5, 6, 7]);
    const c = (n * (n - 1)) / 2;
    return { text: `The number of ways to choose 2 people from ${n} to form a committee, if order does not matter, is:`, ...mcq(r, `${c}`, [`${n * (n - 1)}`, `${2 ** n}`, `${c + n}`]) };
  } },
  { subject: "Mathematics", chapter: "Matrices & Determinants", topic: "Determinant properties", difficulty: "medium", gen: (r) => {
    const d = int(r, 2, 5);
    return { text: `If A is a 3×3 matrix with |A| = ${d}, then |adj(2A)| equals:`, ...mcq(r, `${2 ** 6 * d * d}`, [`${2 ** 3 * d * d}`, `${2 * d * d}`, `${2 ** 6 * d}`]) };
  } },
  { subject: "Mathematics", chapter: "Conic Sections", topic: "Parabola", difficulty: "hard", gen: (r) => {
    const a = int(r, 1, 4);
    return { text: `The length of the latus rectum of the parabola y² = ${4 * a}x is:`, ...mcq(r, `${4 * a}`, [`${2 * a}`, `${a}`, `${8 * a}`]) };
  } },
  { subject: "Mathematics", chapter: "Limits & Continuity", topic: "Standard limits", difficulty: "medium", gen: (r) => {
    const k = int(r, 2, 7);
    return { text: `The value of lim(x→0) sin(${k}x)/x is:`, ...mcq(r, `${k}`, [`1`, `1/${k}`, `0`]) };
  } },
  { subject: "Mathematics", chapter: "Applications of Derivatives", topic: "Maxima & minima", difficulty: "hard", gen: (r) => {
    const s = pick(r, [20, 40, 60]);
    return { text: `A rectangle has perimeter ${s} cm. Its maximum possible area is:`, ...mcq(r, `${(s / 4) ** 2} cm²`, [`${(s / 2) ** 2} cm²`, `${(s / 4) ** 2 / 2} cm²`, `${s} cm²`]) };
  } },
  { subject: "Mathematics", chapter: "Definite Integration", topic: "Properties of definite integrals", difficulty: "hard", gen: (r) => {
    const n = pick(r, [2, 3, 4]);
    return { text: `The value of ∫₀^π x·sin${n === 2 ? "²" : n === 3 ? "³" : "⁴"}x dx / ∫₀^π sin${n === 2 ? "²" : n === 3 ? "³" : "⁴"}x dx is:`, ...mcq(r, "π/2", ["π", "π/4", "2π"]) };
  } },
  { subject: "Mathematics", chapter: "Definite Integration", topic: "Area under curves", difficulty: "hard", numerical: true, gen: (r) => {
    const a = pick(r, [2, 3, 4]);
    return { text: `Find the area (in sq. units) bounded by y = x² and y = ${a}x.`, value: Number(((a ** 3) / 6).toFixed(2)) };
  } },
  { subject: "Mathematics", chapter: "Indefinite Integration", topic: "Integration by parts", difficulty: "medium", gen: (r) => ({
    text: "∫ x·eˣ dx equals:", ...mcq(r, "eˣ(x − 1) + C", ["eˣ(x + 1) + C", "x²eˣ/2 + C", "xeˣ + C"]),
  }) },
  { subject: "Mathematics", chapter: "Vectors", topic: "Dot & cross product", difficulty: "easy", gen: (r) => {
    const a = int(r, 1, 4); const b = int(r, 1, 4);
    return { text: `If a = ${a}i + ${b}j and b = ${b}i − ${a}j, then a · b equals:`, ...mcq(r, "0", [`${a * b}`, `${2 * a * b}`, `${a * a + b * b}`]) };
  } },
  { subject: "Mathematics", chapter: "3D Geometry", topic: "Planes", difficulty: "medium", gen: (r) => {
    const d = int(r, 3, 9);
    return { text: `The distance of the origin from the plane 2x − y + 2z = ${3 * d} is:`, ...mcq(r, `${d}`, [`${3 * d}`, `${d / 3}`, `${2 * d}`]) };
  } },
  { subject: "Mathematics", chapter: "Probability", topic: "Conditional probability", difficulty: "hard", gen: (r) => ({
    text: "Two dice are thrown. Given that the sum is 8, the probability that both show even numbers is:", ...mcq(r, "3/5", ["1/3", "2/5", "1/2"]),
  }) },
  { subject: "Mathematics", chapter: "Probability", topic: "Bayes' theorem", difficulty: "hard", numerical: true, gen: (r) => {
    const p = pick(r, [0.4, 0.5, 0.6]);
    return { text: `Bag A is chosen with probability ${p} and has 3 red, 2 black balls; bag B has 1 red, 4 black. A red ball is drawn. Find P(bag A | red) to two decimals.`, value: Number(((p * 0.6) / (p * 0.6 + (1 - p) * 0.2)).toFixed(2)) };
  } },
  { subject: "Mathematics", chapter: "Complex Numbers", topic: "Argand plane", difficulty: "medium", gen: (r) => {
    const a = int(r, 3, 8); const b = pick(r, [4, 6]);
    return { text: `The modulus of (${a} + ${b}i)(${b} − ${a}i) is:`, ...mcq(r, `${a * a + b * b}`, [`${a + b}`, `${Math.sqrt(a * a + b * b).toFixed(1)}`, `${2 * a * b}`]) };
  } },
  { subject: "Mathematics", chapter: "Differential Equations", topic: "Variable separable", difficulty: "medium", gen: (r) => ({
    text: "The general solution of dy/dx = y/x is:", ...mcq(r, "y = Cx", ["y = C/x", "y = x + C", "y = Ceˣ"]),
  }) },
];
