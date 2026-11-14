// builds sample sets: different sizes, grey backgrounds of different shades, a subject in the middle
const sharp = require('sharp'); const path = require('path'); const fs = require('fs');
const root = process.argv[2]; fs.mkdirSync(root, { recursive: true });
async function img(file, w, h, bg, fg, text) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${bg}"/>
  <circle cx="${w/2}" cy="${h*0.42}" r="${Math.min(w,h)*0.18}" fill="${fg}"/><rect x="${w*0.3}" y="${h*0.55}" width="${w*0.4}" height="${h*0.3}" rx="20" fill="${fg}"/>
  <text x="50%" y="${h*0.95}" font-size="${Math.min(w,h)*0.08}" text-anchor="middle" fill="#222" font-family="sans-serif">${text}</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(file);
}
(async () => {
  const sets = { 'Set A': [[800,1200,'#d8d8d8'],[1000,1400,'#cfcfcf'],[600,900,'#dddddd']], 'Set B (grid)': [], 'Set C': [[1200,800,'#bdbdbd'],[900,700,'#c4c4c4']] };
  const cols = ['#c0392b','#2980b9','#27ae60','#8e44ad','#d35400','#16a085','#2c3e50','#f39c12','#7f8c8d','#e84393'];
  for (let i = 0; i < 10; i++) sets['Set B (grid)'].push([700 + (i%3)*100, 1000 + (i%4)*80, ['#d0d0d0','#c8c8c8','#d9d9d9'][i%3]]);
  for (const [name, list] of Object.entries(sets)) {
    const d = path.join(root, name); fs.mkdirSync(d, { recursive: true });
    let k = 0; for (const [w,h,bg] of list) { k++; await img(path.join(d, `img ${k}.jpg`), w, h, bg, cols[k%cols.length], `${name} #${k}`); }
  }
  // a greyscale png and a png with alpha in Set C
  await sharp({ create: { width: 500, height: 500, channels: 3, background: '#b4b4b4' } }).greyscale().png().toFile(path.join(root, 'Set C', 'img 3 grey.png'));
  await sharp({ create: { width: 400, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><circle cx="200" cy="300" r="150" fill="#e67e22"/></svg>') }]).png().toFile(path.join(root, 'Set C', 'img 4 alpha.png'));
  console.log('ok');
})();
