import type { Page } from "playwright-core";

export async function isLoggedIn(page: Page): Promise<boolean> {
    const cookies = await page.context().cookies("https://www.linkedin.com");

    // Fast path: no li_at cookie means definitely not logged in
    const liAt = cookies.find((c) => c.name === "li_at");
    if (!liAt) return false;

    // Cookie exists but may be expired — verify with a lightweight API call (~200ms)
    const jsessionid = cookies.find((c) => c.name === "JSESSIONID")?.value ?? "";
    const csrfToken = jsessionid.replace("ajax:", "");

    const response = await page.request.get(
        "https://www.linkedin.com/voyager/api/me",
        { headers: { accept: "application/json", "csrf-token": csrfToken } },
    );
    return response.ok();
}
