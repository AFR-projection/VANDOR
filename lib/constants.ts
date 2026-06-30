import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

/** False on http:// deploys (VPS IP) so login cookies work before SSL. */
export function shouldUseSecureCookies(): boolean {
  if (isDevelopmentEnvironment || isTestEnvironment) {
    return false;
  }
  if (process.env.VANDOR_INSECURE_COOKIES === "1") {
    return false;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase() ?? "";
  if (appUrl.startsWith("http://")) {
    return false;
  }
  return true;
}

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();
