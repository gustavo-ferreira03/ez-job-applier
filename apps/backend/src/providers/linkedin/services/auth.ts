import type { Page } from "playwright-core";
import { setLanguageEnglish } from "./setLanguageEnglish";
import { isLoggedIn } from "./status";

const MANUAL_LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

export async function login(page: Page) {
    if (await isLoggedIn(page)) {
        await setLanguageEnglish(page);
        return;
    }

    throw new Error("LinkedIn session expired; log in again");
}
