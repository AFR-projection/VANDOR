import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();

export const suggestions = [
  "Ingat bahwa saya lebih suka jawaban dalam Bahasa Indonesia",
  "Buatkan rencana produktivitas untuk hari ini",
  "Review kode ini dan cari bug keamanan",
  "Apa cuaca di Jakarta sekarang?",
];
