import { config } from "dotenv";

// Scripts run outside Next.js, so load .env.local then .env the same way Next does.
config({ path: ".env.local", quiet: true });
config({ quiet: true });
