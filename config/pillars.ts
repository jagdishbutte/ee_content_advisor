// Content pillars for Elevate Edge. Pre-scoring matches these keywords (case-insensitive, whole words)
// against an item's title and text. Edit freely; `weight` scales how strongly a pillar counts (0–1).

export interface Pillar {
  id: string;
  label: string;
  weight: number;
  keywords: string[];
}

export const pillars: Pillar[] = [
  {
    id: "semiconductors",
    label: "Semiconductors",
    weight: 1,
    keywords: ["semiconductor", "chip", "chips", "chipmaker", "foundry", "fab", "wafer", "tsmc", "intel", "samsung foundry", "asml", "euv", "lithography", "2nm", "3nm", "node", "packaging", "cowos", "hbm", "dram", "nand", "memory", "eda", "risc-v", "arm", "chips act", "export controls"],
  },
  {
    id: "ai_infrastructure",
    label: "AI & AI infrastructure",
    weight: 1,
    keywords: ["ai", "artificial intelligence", "gpu", "gpus", "accelerator", "nvidia", "amd", "llm", "model", "inference", "training", "data center", "datacenter", "hyperscaler", "supercomputer", "blackwell", "tpu", "generative ai", "openai", "agentic"],
  },
  {
    id: "ev_batteries",
    label: "EVs & batteries",
    weight: 0.9,
    keywords: ["ev", "evs", "electric vehicle", "electric vehicles", "battery", "batteries", "lithium", "solid-state", "charging", "tesla", "byd", "cathode", "anode", "gigafactory", "sic", "silicon carbide", "gan", "power electronics"],
  },
  {
    id: "energy_datacentres",
    label: "Energy & data centres",
    weight: 0.8,
    keywords: ["energy", "power grid", "grid", "electricity", "nuclear", "smr", "renewable", "solar", "cooling", "liquid cooling", "power demand", "megawatt", "gigawatt", "mw", "gw", "emissions"],
  },
  {
    id: "robotics",
    label: "Robotics & automation",
    weight: 0.8,
    keywords: ["robot", "robots", "robotics", "humanoid", "automation", "autonomous", "industrial robot", "cobot"],
  },
  {
    id: "emerging_tech",
    label: "Emerging tech",
    weight: 0.7,
    keywords: ["quantum", "photonics", "silicon photonics", "6g", "space", "satellite", "ar", "vr", "neuromorphic", "chiplet", "chiplets", "fusion", "biotech"],
  },
];
