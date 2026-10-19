// Renders the Android launcher icons and splash screens from the web logo
// (frontend/public/favicon.svg). Run after changing the logo:
//   npm run icons
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const root = path.join(__dirname, "..");
const res = path.join(root, "android/app/src/main/res");
const icon = fs.readFileSync(path.join(root, "../frontend/public/favicon.svg"), "utf8");

// Logo contents without the outer <svg> and the rounded background square.
const inner = icon.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const defs = inner.match(/<defs>[\s\S]*<\/defs>/)[0];
const mark = inner.replace(/<defs>[\s\S]*<\/defs>/, "").replace(/<rect[^>]*\/>/, "");

const NAVY = "#0A1638";
const scaled = (scale) =>
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mark}</g>`;
const svg = (body, w = 512, h = 512, vb = "0 0 512 512") =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${defs}${body}</svg>`;

const render = (src, width) => new Resvg(src, { fitTo: { mode: "width", value: width } }).render().asPng();
const write = (rel, buf) => {
  fs.mkdirSync(path.dirname(path.join(res, rel)), { recursive: true });
  fs.writeFileSync(path.join(res, rel), buf);
};

// Legacy launcher icons (48dp) and adaptive foreground (108dp, full-bleed:
// the launcher crops it to its own shape, the mark stays in the safe zone).
const square = icon;
const round = svg(`<circle cx="256" cy="256" r="256" fill="url(#bg)"/>${scaled(0.9)}`);
const foreground = svg(`<rect width="512" height="512" fill="url(#bg)"/>${scaled(0.66)}`);
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  write(`mipmap-${d}/ic_launcher.png`, render(square, 48 * k));
  write(`mipmap-${d}/ic_launcher_round.png`, render(round, 48 * k));
  write(`mipmap-${d}/ic_launcher_foreground.png`, render(foreground, 108 * k));
}

// Splash (pre-Android 12): logo centered on navy.
const splash = (w, h) => {
  const size = Math.min(w, h) * 0.32;
  const x = (w - size) / 2;
  const y = (h - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${NAVY}"/>
    <svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 512 512">${inner}</svg>
  </svg>`;
};
const splashSizes = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(splashSizes)) {
  write(`drawable-port-${d}/splash.png`, render(splash(w, h), w));
  write(`drawable-land-${d}/splash.png`, render(splash(h, w), h));
}
write("drawable/splash.png", render(splash(480, 320), 480));

console.log("Android icons and splash screens generated.");
