// ST-112 proof source: an engineering document. Run from the repo root.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require_ = createRequire(new URL("../apps/pipeline-worker/index.js", import.meta.url));
const { PDFDocument, StandardFonts } = require_("pdf-lib");
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const sections = [
  ["How Truss Bridges Carry Load", 24, bold],
  ["", 12, font],
  ["1. What a truss is", 16, bold],
  ["A truss is a frame of straight members joined at their ends to form", 12, font],
  ["triangles. A triangle cannot change shape unless one of its sides", 12, font],
  ["changes length, so a frame of triangles stays rigid under load. A", 12, font],
  ["rectangle, by contrast, can lean into a parallelogram without any", 12, font],
  ["side changing length, which is why square frames need a diagonal.", 12, font],
  ["", 12, font],
  ["2. Tension and compression", 16, bold],
  ["Every member of a truss is either pulled or pushed along its length.", 12, font],
  ["A member being pulled is in tension and tends to stretch. A member", 12, font],
  ["being pushed is in compression and tends to shorten or buckle. In a", 12, font],
  ["simple bridge truss the top chord is in compression and the bottom", 12, font],
  ["chord is in tension, while the diagonals alternate between the two.", 12, font],
  ["", 12, font],
  ["3. The load path", 16, bold],
  ["When a vehicle crosses the bridge, its weight first presses on the", 12, font],
  ["deck. The deck passes the weight to the joints of the truss. The", 12, font],
  ["members carry the force from joint to joint toward the two ends.", 12, font],
  ["Finally the supports at each end push up on the truss and pass the", 12, font],
  ["load into the ground. This route is called the load path.", 12, font],
  ["", 12, font],
  ["4. Why trusses use less material", 16, bold],
  ["A solid beam bends under load, so most of its material near the", 12, font],
  ["middle of its depth does little work. A truss puts material only", 12, font],
  ["where force flows, along the chords and diagonals. For the same", 12, font],
  ["span, a truss can therefore be lighter than a solid beam while", 12, font],
  ["carrying the same load.", 12, font],
  ["", 12, font],
  ["5. How trusses fail", 16, bold],
  ["Long thin members in compression can buckle sideways before the", 12, font],
  ["material itself is crushed. Joints can also fail if the connection", 12, font],
  ["is weaker than the members it joins. Engineers therefore check each", 12, font],
  ["member for buckling and design joints to be stronger than members.", 12, font],
];
const page = doc.addPage([595, 842]);
let y = 790;
for (const [text, size, f] of sections) {
  if (text) page.drawText(text, { x: 60, y, size, font: f });
  y -= size + 7;
}
writeFileSync(".runtime-logs/st112-engineering.pdf", await doc.save());
console.log("generated .runtime-logs/st112-engineering.pdf", y);
