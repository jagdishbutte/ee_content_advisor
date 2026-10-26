import discovered from "./feeds.json";

// Single source of truth for what the pipeline polls. Edit this list to add/remove sources.
// Feed URLs are NOT written here by hand: run `npm run discover-feeds`, which verifies them and
// writes config/feeds.json; the values are merged in below.

export type SourceType = "news" | "data" | "visual_reference";
export type PollFrequency = "every_run" | "daily" | "weekly";

export interface SourceConfig {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  feedUrl?: string;
  /** "no_feed" when discovery found no usable RSS/Atom feed. */
  feedStatus?: "ok" | "no_feed" | "unchecked";
  /** Candidate news/press page used only when there is no feed and robots.txt allows it. */
  newsPageUrl?: string;
  /** Set by discovery: newsPageUrl responded and robots.txt allows fetching it. */
  newsPageAllowed?: boolean;
  pollFrequency: PollFrequency;
  enabled: boolean;
  topics: string[];
  /** 1 (low) – 5 (high). Feeds into pre-scoring. */
  authority: number;
  notes: string;
}

type BaseSource = Omit<SourceConfig, "feedUrl" | "feedStatus" | "newsPageAllowed">;

export const baseSources: BaseSource[] = [
  // News — polled every run
  { id: "semianalysis", name: "SemiAnalysis", url: "https://newsletter.semianalysis.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["semiconductors", "ai_infrastructure"], authority: 5, notes: "Deep analysis; most posts paywalled, expect partial content." },
  { id: "semiengineering", name: "Semiconductor Engineering", url: "https://semiengineering.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["semiconductors"], authority: 4, notes: "" },
  { id: "eetimes", name: "EE Times", url: "https://www.eetimes.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["semiconductors", "ev_batteries", "emerging_tech"], authority: 4, notes: "" },
  { id: "semiwiki", name: "SemiWiki", url: "https://semiwiki.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["semiconductors"], authority: 3, notes: "" },
  { id: "chipsandcheese", name: "Chips and Cheese", url: "https://chipsandcheese.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["semiconductors", "ai_infrastructure"], authority: 4, notes: "Microarchitecture deep dives." },
  { id: "servethehome", name: "ServeTheHome", url: "https://www.servethehome.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["ai_infrastructure", "energy_datacentres"], authority: 3, notes: "" },
  { id: "hpcwire", name: "HPCwire", url: "https://www.hpcwire.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["ai_infrastructure"], authority: 4, notes: "" },
  { id: "theregister-dc", name: "The Register Data Centre", url: "https://www.theregister.com/data_centre/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["energy_datacentres", "ai_infrastructure"], authority: 3, notes: "" },
  { id: "tomshardware", name: "Tom's Hardware", url: "https://www.tomshardware.com/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["semiconductors"], authority: 3, notes: "High volume; relies on scoring to filter consumer content." },
  { id: "ieee-spectrum", name: "IEEE Spectrum", url: "https://spectrum.ieee.org/", type: "news", pollFrequency: "every_run", enabled: true, topics: ["semiconductors", "robotics", "ev_batteries", "emerging_tech"], authority: 5, notes: "" },

  // Data — slow publishers
  { id: "semi-mi", name: "SEMI Market Intelligence", url: "https://www.semi.org/en/products-services/market-intelligence", type: "data", newsPageUrl: "https://www.semi.org/en/news-resources/press-releases", pollFrequency: "daily", enabled: true, topics: ["semiconductors"], authority: 5, notes: "Reports are paid; press releases carry headline numbers." },
  { id: "sia", name: "Semiconductor Industry Association", url: "https://www.semiconductors.org/", type: "data", newsPageUrl: "https://www.semiconductors.org/news-events/latest-news/", pollFrequency: "daily", enabled: true, topics: ["semiconductors"], authority: 5, notes: "Monthly global sales releases." },
  { id: "trendforce", name: "TrendForce", url: "https://www.trendforce.com/", type: "data", newsPageUrl: "https://www.trendforce.com/presscenter/news", pollFrequency: "daily", enabled: true, topics: ["semiconductors", "ev_batteries", "ai_infrastructure"], authority: 4, notes: "" },
  { id: "iea", name: "International Energy Agency", url: "https://www.iea.org/", type: "data", newsPageUrl: "https://www.iea.org/news", pollFrequency: "daily", enabled: true, topics: ["energy_datacentres", "ev_batteries"], authority: 5, notes: "" },
  { id: "stanford-ai-index", name: "Stanford AI Index", url: "https://hai.stanford.edu/ai-index", type: "data", newsPageUrl: "https://hai.stanford.edu/news", pollFrequency: "weekly", enabled: true, topics: ["ai_infrastructure", "emerging_tech"], authority: 5, notes: "Annual report; HAI news in between." },
  { id: "ifr", name: "International Federation of Robotics", url: "https://ifr.org/", type: "data", newsPageUrl: "https://ifr.org/news", pollFrequency: "weekly", enabled: true, topics: ["robotics"], authority: 4, notes: "" },
  { id: "wef-publications", name: "World Economic Forum publications", url: "https://www.weforum.org/publications/", type: "data", newsPageUrl: "https://www.weforum.org/publications/", pollFrequency: "weekly", enabled: true, topics: ["emerging_tech", "energy_datacentres"], authority: 4, notes: "" },

  // Visual reference — inspiration only. Never scrape or reuse their graphics; never sent to the LLM.
  { id: "visualcapitalist", name: "Visual Capitalist", url: "https://www.visualcapitalist.com/", type: "visual_reference", pollFrequency: "weekly", enabled: true, topics: [], authority: 3, notes: "Inspiration only." },
  { id: "voronoi", name: "Voronoi", url: "https://www.voronoiapp.com/", type: "visual_reference", pollFrequency: "weekly", enabled: true, topics: [], authority: 3, notes: "Inspiration only." },
  { id: "ourworldindata", name: "Our World in Data", url: "https://ourworldindata.org/", type: "visual_reference", pollFrequency: "weekly", enabled: true, topics: [], authority: 4, notes: "Open datasets (CC BY) — good for finding underlying data." },
  { id: "informationisbeautiful", name: "Information Is Beautiful", url: "https://informationisbeautiful.net/", type: "visual_reference", pollFrequency: "weekly", enabled: true, topics: [], authority: 3, notes: "Inspiration only." },
  { id: "iea-data", name: "IEA Data & Statistics", url: "https://www.iea.org/data-and-statistics", type: "visual_reference", pollFrequency: "weekly", enabled: true, topics: [], authority: 4, notes: "Inspiration and public datasets." },
  { id: "wef-infographics", name: "WEF Infographics", url: "https://www.weforum.org/stories/", type: "visual_reference", pollFrequency: "weekly", enabled: true, topics: [], authority: 3, notes: "Inspiration only." },
];

export interface DiscoveredFeed {
  feedUrl?: string;
  status: "ok" | "no_feed";
  newsPageAllowed?: boolean;
  checkedAt: string;
}

const discoveredFeeds = discovered as Record<string, DiscoveredFeed>;

export const sources: SourceConfig[] = baseSources.map((s) => {
  const d = discoveredFeeds[s.id];
  if (!d) return { ...s, feedStatus: "unchecked" };
  const merged: SourceConfig = { ...s, feedUrl: d.feedUrl, feedStatus: d.status, newsPageAllowed: d.newsPageAllowed };
  // No feed and no permitted fallback page (visual references never use the fallback) → disabled.
  const canFallback = s.type !== "visual_reference" && !!s.newsPageUrl && !!d.newsPageAllowed;
  if (d.status === "no_feed" && !canFallback) merged.enabled = false;
  return merged;
});

export function getSource(id: string): SourceConfig | undefined {
  return sources.find((s) => s.id === id);
}
