// Rebuild the offline report and native draw.io files without network access.
// A deliberately small preview renderer, not a general mxGraph exporter.
const fs = require('node:fs');
const path = require('node:path');
const { title, paper, diagrams } = require('./architecture-diagrams.cjs');
const output = path.resolve(__dirname, '../docs');
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const font = 'Courier New', ink = '#000000', stroke = '#000000';
const fills = { box: '#ffffff', terminal: '#ffffff', decision: '#ffffff', note: '#ffffff', external: '#ffffff', database: '#ffffff', class: '#ffffff', actor: '#ffffff', usecase: '#ffffff', package: '#ffffff', frame: 'none', text: 'none' };
const label = n => n.label;
const isDashed = n => ['note', 'external'].includes(n.kind);
function geometry(d) {
  const nodes = [
    { id: 'figure-title', x: 40, y: 18, w: d.width - 80, h: 38, label: `FIGURE ${d.figure}. ${d.title.toUpperCase()}`, kind: 'text', size: 24 },
    { id: 'figure-status', x: 40, y: 64, w: d.width - 80, h: 26, label: d.status, kind: 'text', size: 16 }, ...d.nodes,
  ];
  const byId = new Map(nodes.map(n => [n.id, n]));
  if (byId.size !== nodes.length) throw new Error(`Duplicate node ID: ${d.id}`);
  const boundary = (n, other) => {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    const dx = other.x + other.w / 2 - cx, dy = other.y + other.h / 2 - cy;
    let t = 1 / Math.max(Math.abs(dx) / (n.w / 2), Math.abs(dy) / (n.h / 2));
    if (n.kind === 'decision') t = 1 / (Math.abs(dx) / (n.w / 2) + Math.abs(dy) / (n.h / 2));
    if (n.kind === 'usecase') t = 1 / Math.hypot(dx / (n.w / 2), dy / (n.h / 2));
    return [cx + dx * t, cy + dy * t];
  };
  return { nodes, edges: d.edges.map((e, i) => {
    if (e.points) return { id: `edge-${i}`, ...e };
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) throw new Error(`Missing endpoint in ${d.id}`);
    return { id: `edge-${i}`, ...e, points: [boundary(a, b), boundary(b, a)] };
  }) };
}
function nativeXml(d, g) {
  const cells = g.nodes.map(n => {
    const shapes = { terminal: 'rounded=1;arcSize=45;', decision: 'shape=rhombus;', usecase: 'ellipse;', database: 'shape=cylinder3;size=12;', frame: 'rounded=0;verticalAlign=top;spacingTop=15;', text: 'text;strokeColor=none;align=left;' };
    const style = `whiteSpace=wrap;html=0;rounded=0;fontFamily=${font};fontSize=${n.size || 18};fontColor=${ink};strokeColor=${stroke};fillColor=${fills[n.kind]};spacing=8;${shapes[n.kind] || ''}${isDashed(n) ? 'dashed=1;' : ''}`;
    return `<mxCell id="${n.id}" value="${escape(label(n)).replace(/\n/g, '&#xa;')}" style="${style}" vertex="1" parent="1"><mxGeometry x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" as="geometry"/></mxCell>`;
  });
  const edges = g.edges.map(e => {
    const style = `edgeStyle=none;html=0;fontFamily=${font};fontSize=15;fontColor=${ink};strokeColor=${stroke};strokeWidth=1.5;endArrow=${e.arrow === 'none' ? 'none' : 'block'};endFill=${e.arrow === 'generalization' ? 0 : 1};labelBackgroundColor=#ffffff;${e.dashed ? 'dashed=1;' : ''}`;
    const endpoints = e.from ? ` source="${e.from}" target="${e.to}"` : '';
    const points = e.points.map(([x, y], i) => `<mxPoint x="${x}" y="${y}" as="${i ? 'target' : 'source'}Point"/>`).join('');
    return `<mxCell id="${e.id}" value="${escape(e.label)}" style="${style}" edge="1" parent="1"${endpoints}><mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`;
  });
  // Skill repair pass: generated XML is already escaped; normalize defensively.
  let xml = `<mxfile host="app.diagrams.net"><diagram id="${d.id}" name="Figure ${d.figure} - ${escape(d.title)}"><mxGraphModel dx="${d.width}" dy="${d.height}" grid="1" gridSize="10" page="1" pageScale="1" pageWidth="${d.width}" pageHeight="${d.height}" adaptiveColors="auto"><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}${edges.join('')}</root></mxGraphModel></diagram></mxfile>`;
  xml = xml.replace(/="([^"]*)"/g, (_, v) => '="' + v.replace(/</g, '&lt;').replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/g, '&amp;') + '"');
  return xml.replace(/<mxCell id="([^"]+)" parent="\1"\s*\/>/g, '<mxCell id="$1" parent="0"/>');
}
function previewSvg(d, g, xml) {
  const text = (x, y, value, size = 16, align = 'middle') => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${ink}" text-anchor="${align}">${escape(value)}</text>`;
  const nodeSvg = n => {
    const { x, y, w, h, kind } = n;
    const attr = `fill="${fills[kind]}" stroke="${kind === 'text' ? 'none' : stroke}" stroke-width="1.5"${isDashed(n) ? ' stroke-dasharray="7 5"' : ''}`;
    let shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${kind === 'terminal' ? 28 : 0}" ${attr}/>`;
    if (kind === 'decision') shape = `<polygon points="${x+w/2},${y} ${x+w},${y+h/2} ${x+w/2},${y+h} ${x},${y+h/2}" ${attr}/>`;
    if (kind === 'usecase') shape = `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" ${attr}/>`;
    if (kind === 'database') shape = `<path d="M${x} ${y+12} C${x} ${y-4} ${x+w} ${y-4} ${x+w} ${y+12} L${x+w} ${y+h-12} C${x+w} ${y+h+4} ${x} ${y+h+4} ${x} ${y+h-12} Z M${x} ${y+12} C${x} ${y+28} ${x+w} ${y+28} ${x+w} ${y+12}" ${attr}/>`;
    const lines = label(n).split('\n'), size = n.size || 18, lineHeight = size * 1.4;
    const top = kind === 'frame' ? y + 30 : y + (h - (lines.length - 1) * lineHeight) / 2 + size * .33;
    return `<g data-node="${n.id}">${shape}${lines.map((l, i) => l ? text(kind === 'text' ? x : x+w/2, top+i*lineHeight, l, size, kind === 'text' ? 'start' : 'middle') : '').join('')}</g>`;
  };
  const edgeSvg = e => {
    const [[x1, y1], [x2, y2]] = e.points, x = (x1+x2)/2, y = (y1+y2)/2 - 9;
    const width = e.label.length * 9.1 + 16;
    return `<g data-edge="${e.id}"><path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="1.5"${e.dashed ? ' stroke-dasharray="7 5"' : ''}${e.arrow === 'none' ? '' : ` marker-end="url(#${d.id}-${e.arrow === 'generalization' ? 'generalization' : 'arrow'})"`}/>${e.label ? `<rect x="${x-width/2}" y="${y-16}" width="${width}" height="21" fill="#fff"/>${text(x, y, e.label, 15)}` : ''}</g>`;
  };
  const frames = g.nodes.filter(n => n.kind === 'frame'), nodes = g.nodes.filter(n => n.kind !== 'frame');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-labelledby="${d.id}-title ${d.id}-desc" content="${escape(xml)}"><title id="${d.id}-title">Figure ${d.figure}. ${escape(d.title)}</title><desc id="${d.id}-desc">${escape(d.summary)}</desc><defs><marker id="${d.id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="${stroke}"/></marker><marker id="${d.id}-generalization" viewBox="-1 -1 12 12" refX="10" refY="5" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#fff" stroke="${stroke}"/></marker></defs><rect width="100%" height="100%" fill="#fff"/>${frames.map(nodeSvg).join('')}${g.edges.map(edgeSvg).join('')}${nodes.map(nodeSvg).join('')}</svg>`;
}
const assets = diagrams.map(d => {
  const g = geometry(d), xml = nativeXml(d, g);
  fs.mkdirSync(path.join(output, 'diagrams'), { recursive: true });
  fs.writeFileSync(path.join(output, 'diagrams', d.id + '.drawio'), xml);
  const svg = previewSvg(d, g, xml);
  fs.writeFileSync(path.join(output, 'diagrams', d.id + '.svg'), svg);
  return { ...d, xml, svg };
});
const sourceLinks = sources => sources.map(s => `<a href="${escape(s)}">${escape(s.replace(/^\.\.\//, ''))}</a>`).join(' · ');
const sections = assets.map(d => `<section id="${d.id}" aria-labelledby="heading-${d.id}">
<div class="section-top"><span class="figure-number">FIGURE ${d.figure}</span><span class="status">${escape(d.status)}</span></div>
<h2 id="heading-${d.id}">${escape(d.title)}</h2><p class="summary">${escape(d.summary)}</p>
<div class="toolbar" role="group" aria-label="Download ${escape(d.title)}">${['drawio', 'svg', 'png'].map(f => `<button type="button" data-export="${d.id}" data-format="${f}">${f === 'drawio' ? 'Editable draw.io' : f.toUpperCase()}</button>`).join('')}</div>
<div class="diagram-scroll" tabindex="0" role="region" aria-label="${escape(d.title)} diagram; scroll horizontally on small screens">${d.svg}</div>
<p class="reading"><strong>How to read it.</strong> ${escape(d.explanation)}</p>
<details><summary>Where this diagram comes from</summary><p>Figure ${d.figure} in the <a href="${paper}">main editable paper</a>. ${['architecture', 'proposed', 'usecase', 'classes', 'sequence', 'packages', 'deployment'].includes(d.id) ? 'This diagram has been inserted into the main paper.' : 'These simpler diagrams are ready for review. They have not yet replaced the pictures in Word.'}</p><p class="source-links">${sourceLinks(d.sources)}</p></details>
<template id="xml-${d.id}">${escape(d.xml)}</template></section>`).join('\n');
const template = fs.readFileSync(path.join(__dirname, 'architecture-viewer.template.html'), 'utf8');
const replacements = {
  TITLE: escape(title), PAPER: escape(paper), SECTIONS: sections,
  NAV: assets.map(d => `<a href="#${d.id}">${d.figure}. ${escape(d.title)}</a>`).join(''),
  REQUIREMENTS_SOURCES: sourceLinks(['../frontend/package.json', '../backend/package.json', '../prd.md', 'sms-production-cutover.md']),
};
fs.writeFileSync(path.join(output, 'architecture-viewer.html'), template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
  if (!(key in replacements)) throw new Error(`Unknown template key: ${key}`);
  return replacements[key];
}));
console.log(`Built ${diagrams.length} editable draw.io diagrams, SVG previews, and offline architecture-viewer.html.`);
