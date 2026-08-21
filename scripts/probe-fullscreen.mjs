import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(
  `<button id="go">go fullscreen</button>
   <div id="status">none</div>
   <script>
     document.getElementById("go").addEventListener("click", async () => {
       const status = document.getElementById("status");
       try {
         await document.documentElement.requestFullscreen();
         status.textContent = "resolved";
       } catch (error) {
         status.textContent = "rejected:" + error.name;
       }
     });
     document.addEventListener("fullscreenchange", () => {
       window.fired = true;
     });
   </script>`
);

// Real user gesture → fullscreen request.
await page.click("#go");
await page.waitForTimeout(500);
console.log(
  "after click:",
  await page.evaluate(() => document.getElementById("status").textContent),
  "| fullscreenElement:",
  await page.evaluate(() => Boolean(document.fullscreenElement))
);

// Escape should exit real fullscreen and fire fullscreenchange.
await page.evaluate(() => {
  window.fired = false;
});
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
console.log(
  "after Escape:",
  JSON.stringify(
    await page.evaluate(() => ({
      inFullscreen: Boolean(document.fullscreenElement),
      fullscreenchangeFired: Boolean(window.fired),
    }))
  )
);

// A click should re-enter fullscreen (fresh user activation).
await page.click("#go");
await page.waitForTimeout(500);
console.log(
  "re-enter via click:",
  await page.evaluate(() => document.getElementById("status").textContent),
  "| fullscreenElement:",
  await page.evaluate(() => Boolean(document.fullscreenElement))
);

await browser.close();
