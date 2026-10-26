import { describe, expect, it } from "vitest";
import { computeOffsets, updateOffsets, type OffsetRow, type Vote } from "@/lib/pipeline/feedback";

const up = (source_id: string, topics: string[] = []): Vote => ({ feedback: "up", source_id, topics });
const down = (source_id: string, topics: string[] = []): Vote => ({ feedback: "down", source_id, topics });

describe("feedback offsets", () => {
  it("nets votes per source and main topic", () => {
    const rows = computeOffsets([up("a", ["ai", "ev"]), up("a", ["ai"]), down("b", ["ev"])], 2, 10);
    expect(rows).toEqual([
      { kind: "source", key: "a", offset: 4 },
      { kind: "source", key: "b", offset: -2 },
      { kind: "topic", key: "ai", offset: 4 },
      { kind: "topic", key: "ev", offset: -2 },
    ]);
  });

  it("clamps to the maximum and drops keys that net to zero", () => {
    const votes = [...Array.from({ length: 20 }, () => down("a")), up("b"), down("b")];
    expect(computeOffsets(votes, 2, 10)).toEqual([{ kind: "source", key: "a", offset: -10 }]);
  });

  it("replaces stored offsets", async () => {
    let saved: OffsetRow[] = [];
    const result = await updateOffsets({ votes: async () => [up("a")], replaceOffsets: async (rows) => void (saved = rows) });
    expect(result).toEqual({ votes: 1, offsets: 1 });
    expect(saved[0]).toMatchObject({ kind: "source", key: "a" });
  });
});
