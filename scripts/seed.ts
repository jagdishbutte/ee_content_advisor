import "./load-env";
import { sources } from "@/config/sources";
import { db, must } from "@/lib/db";

// Mirrors config/sources.ts into the `sources` table. Safe to re-run: upserts by id and never
// touches poll status columns. Pass --demo-posted to add example rows to posted_log.

async function main() {
  const rows = sources.map((s) => ({ id: s.id, name: s.name, type: s.type, url: s.url, enabled: s.enabled }));
  must(await db().from("sources").upsert(rows, { onConflict: "id" }), "upsert sources");
  console.log(`Seeded ${rows.length} sources (${rows.filter((r) => r.enabled).length} enabled).`);

  if (process.argv.includes("--demo-posted")) {
    must(
      await db().from("posted_log").insert([
        { title: "TSMC 2nm ramp: what it means for AI accelerators", platform: "linkedin" },
        { title: "Global EV battery demand by chemistry", platform: "instagram" },
      ]),
      "insert posted_log",
    );
    console.log("Added 2 demo posted_log rows.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
