// Run the full pipeline once from your machine: `npm run pipeline`.
import "./load-env";
import { runWithDefaults } from "@/lib/pipeline/run";

runWithDefaults("manual")
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
