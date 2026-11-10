const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

(async () => {
  const html = fs.readFileSync('docs/architecture-viewer.html','utf8');
  const md = fs.readFileSync('docs/system-architecture.md','utf8');
  const ids = [...html.matchAll(/<section id="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,9);
  assert.equal(new Set(ids).size,9);
  assert(ids.includes('sequence'));
  assert.equal((html.match(/<svg /g)||[]).length,8);
  assert.equal((html.match(/data-export=/g)||[]).length,24);
  assert(!/<script[^>]+src=|@import\s|<link[^>]+stylesheet/i.test(html));
  const pageStyle = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert((pageStyle.match(/#[0-9a-fA-F]{3,8}\b/g) || []).every(color=>['#000','#000000','#fff','#ffffff'].includes(color.toLowerCase())));
  for(const id of ids) {
    assert(html.includes(`href="#${id}"`));
    if(id !== 'requirements') {
      const svg = fs.readFileSync(`docs/diagrams/${id}.svg`,'utf8');
      assert(html.includes(svg));
      assert(md.includes(`diagrams/${id}.svg`));
      assert(svg.includes('font-family="Courier New"'));
      for (const color of svg.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
        assert(['#000', '#000000', '#fff', '#ffffff'].includes(color.toLowerCase()), `Unexpected color ${color} in ${id}`);
      }
      const visibleText = [...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m=>m[1]).join(' ');
      assert(!/\b(API|JSON|RLS|SQL|HTTP|PostgreSQL|React|TypeScript|INSERT|auth_user_id|foreign key|persistence|inference)\b/i.test(visibleText), `Technical wording in ${id}`);
      const xml = fs.readFileSync(`docs/diagrams/${id}.drawio`,'utf8');
      assert(xml.includes('<mxGraphModel'));
      const cells = [...xml.matchAll(/<mxCell[^>]+style="([^"]*)"/g)];
      assert(cells.length > 0);
      assert(cells.every(cell=>cell[1].includes('fontFamily=Courier New;')));
    }
  }
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(code);
  let printed=false, failPng=false, downloads=[], revoked=[], savedUrl=0;
  const state={textContent:''};
  const printButton={addEventListener(_event,cb){this.click=cb;}};
  const buttons=ids.filter(id=>id!=='requirements').flatMap(id=>['svg','png','drawio'].map(format=>({dataset:{export:id,format},disabled:false,addEventListener(_event,cb){this.click=cb;}})));
  const ctx={fillRect(){},drawImage(){}};
  let lastCanvas;
  const document={
    getElementById(id){
      if(id==='print-report') return printButton;
      if(id.startsWith('xml-')) return {textContent:fs.readFileSync(`docs/diagrams/${id.slice(4)}.drawio`,'utf8')};
      return state;
    },
    querySelectorAll(){return buttons;},
    querySelector(selector){const id=selector.match(/^#(\w+) svg$/)[1];return {source:fs.readFileSync(`docs/diagrams/${id}.svg`,'utf8'),viewBox:{baseVal:{width:1120,height:590}}};},
    createElement(tag){
      if(tag==='a') return {click(){downloads.push(this.download);},remove(){}};
      assert.equal(tag,'canvas');
      return lastCanvas={getContext(){return ctx;},toBlob(cb){cb(failPng?null:new Blob(['PNG']));}};
    },
    body:{appendChild(){}}
  };
  vm.runInNewContext(code,{
    document,window:{print(){printed=true;}},Blob,
    URL:{createObjectURL(){return `blob:${++savedUrl}`;},revokeObjectURL(url){revoked.push(url);}},
    XMLSerializer:class{serializeToString(svg){return svg.source;}},
    Image:class{set src(url){queueMicrotask(()=>this.onload());}},
    setTimeout(cb){cb();}
  });
  printButton.click(); assert(printed);
  for(const button of buttons) {
    await button.click();
    assert.equal(button.disabled,false);
  }
  assert.equal(downloads.length,24);
  assert(downloads.includes('architecture.svg') && downloads.includes('deployment.png') && downloads.includes('sequence.drawio'));
  assert.equal(lastCanvas.width,3360);assert.equal(lastCanvas.height,1770);
  failPng=true;
  await buttons[1].click();
  assert.equal(downloads.length,24);
  assert.equal(buttons[1].disabled,false);
  assert.equal(state.textContent,'PNG export failed. Download the SVG instead.');
  assert.equal(revoked.length,savedUrl);
  console.log('PASS: 9 sections; 8 SVG/native draw.io pairs; Courier New; navigation; offline assets; script syntax; print; 24 exports; PNG failure recovery; canvas scaling; URL cleanup. Browser mocks verify behavior, not visual layout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
