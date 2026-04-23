const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
];

async function main() {
  const root = path.resolve(__dirname, "..");
  const input = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(root, "docs", "manual-mdl-monte-siao.html");
  const output = process.argv[3]
    ? path.resolve(process.argv[3])
    : path.join(root, "docs", "manual-mdl-monte-siao.pdf");

  const executablePath = BROWSER_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
  const page = await browser.newPage({ viewport: { width: 1240, height: 1754 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(input).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" }
  });
  await browser.close();
  console.log(output);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
