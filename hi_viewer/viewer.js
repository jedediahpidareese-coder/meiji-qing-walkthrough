/* ============================================================
   Hansei Ichiran source-page viewer  (OpenSeadragon rebuild)
   ------------------------------------------------------------
   Left  : deep-zoom page (OpenSeadragon, single-image tile source) with
           annotation overlays positioned in image coordinates — they pan/zoom
           WITH the page. Hover an overlay -> highlight its data row; click ->
           zoom the page to that value and open its detail.
   Right : page summary + the MASTER-extracted values; hover a row -> highlight
           its column on the page; click -> zoom + detail.
   Top   : a kanji / modern-JP / English toggle controlling the on-page tooltip.
   ============================================================ */

let pages = [];
let extracts = {};
let glossary = {};
let annotationsByPage = {};      // page_id -> [annotation objects]
let cropsManifest = {};          // page_id -> [{ident, crop_path, ...}]
let currentPage = 0;
let currentAnnotations = [];
let overlaysByField = {};        // field_jp -> overlay element (current page)
let viewer = null;               // OpenSeadragon instance
let currentLang = 'english_translation';

const $ = (sel) => document.querySelector(sel);
const xywhRe = /xywh=pixel:([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)/;
const VER = '20260711hi92';

async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`);
  return r.json();
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function parseXywh(v) {
  const m = xywhRe.exec(v || '');
  return m ? { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } : null;
}
function bodyOf(ann, purpose) {
  return (ann.body || []).find(b => b.purpose === purpose)?.value || '';
}
function identOf(ann) { return bodyOf(ann, 'identifying'); }

/* Field labels drift between the annotation `identifying` value and the MASTER
   `field_jp` (parenthetical notes like "隊士 (top right notation)", and
   kyūjitai↔shinjitai variants like 雜稅銭 vs 雑稅銭). Normalize so the
   overlay↔row cross-highlight + crop lookup are robust. */
const KANJI_VARIANTS = { '雜':'雑','兒':'児','廣':'広','豐':'豊','澤':'沢','眞':'真','龍':'竜','邨':'村','佛':'仏','國':'国','會':'会','學':'学','產':'産' };
function normField(s) {
  if (!s) return '';
  s = String(s).replace(/[（(][^)）]*[)）]/g, '');   // drop parenthetical notes
  s = s.replace(/\s+/g, '');                          // drop whitespace
  return [...s].map(c => KANJI_VARIANTS[c] || c).join('');
}
function findAnnotationByField(f) { const k = normField(f); return currentAnnotations.find(a => normField(identOf(a)) === k); }
function findCropByField(pageId, f) { const k = normField(f); return (cropsManifest[pageId] || []).find(e => normField(e.ident) === k); }

/* ---------------- page selector + meta ---------------- */
/* Drop verbose parentheticals ("(preceding X on this spread)") from a domain_en so the
   nav label stays short. */
function cleanDomain(d) { return String(d || '').replace(/\s*\((?:preceding|sharing|shares)[^)]*\)/i, '').trim(); }
/* A SHORT, UNIFORM page-type label derived from the (free-form, 175-distinct) page_topic +
   its fascicle number, so the dropdown reads the same way across every domain. Fascicles 8–9
   are the officials/military register; 1–7 are the civil register — so incidental troop
   mentions on a civil page don't mislabel it. The full description stays in the summary card. */
function pageType(p) {
  const t = (p.page_topic || '').toLowerCase();
  const tn = p.table_number || 0;
  const off = /official|officer|職員|councill|governor|chiji|shokuin|参事|san.?ji|roster|appointee|shosanji|personnel|administrative/.test(t);
  const mil = /militar|兵隊|\btroop|\barmy|battalion|platoon|artiller|warship|\bnavy\b|heitai|銃|砲|\bcorps\b|soldier|standing army/.test(t);
  if (tn >= 8) {
    if (mil && !off) return 'Military';
    if (off && !mil) return 'Officials';
    return 'Officials & military';
  }
  const pop = /demograph|population|household|status.?(class|group)|census|male|female|人口|outcaste|clerg|retainer/.test(t);
  const fis = /kokudaka|land assess|land yield|land.?tax|fiscal|\btax|revenue|product|gendaka|currency|草高|assessed|landholding/.test(t);
  if (pop && fis) return 'Civil register';
  if (pop) return 'Population & households';
  if (fis) return 'Kokudaka & taxes';
  return 'Civil register';
}
function populatePageSelect() {
  const sel = $('#page-select');
  sel.innerHTML = '';
  pages.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${p.sequence}. ${cleanDomain(p.domain_en)} — ${pageType(p)}`;
    opt.title = p.page_topic || '';   // full description on hover
    sel.appendChild(opt);
  });
}
function renderPageMeta(page) {
  const idx = pages.indexOf(page);
  $('#page-count').textContent = `${idx >= 0 ? idx + 1 : '·'} / ${pages.length}`;
  // current-domain anchor in the nav bar (fills the right side; layout-safe, ellipsis-capped)
  $('#nav-context').innerHTML =
    `<span class="nav-domain">${escapeHtml(page.domain_canonical)}</span>` +
    `<span class="nav-domain-en">${escapeHtml(cleanDomain(page.domain_en))}</span>`;
  $('#image-filename').textContent = `${page.image.split('/').pop()} · ${page.volume} PDF p${page.pdf_page}-${page.page_side}`;
  // domain / book-page / topic live in the summary card (fully readable, wraps) — NOT the nav bar,
  // which stays a fixed size page-to-page.
  $('#page-summary').innerHTML = `
    <div class="summary-title">
      <span class="summary-domain">${escapeHtml(page.domain_canonical)} <span class="summary-domain-en">(${escapeHtml(page.domain_en)})</span></span>
      ${page.book_page ? `<span class="summary-bookpage">book p. ${escapeHtml(page.book_page)}</span>` : ''}
    </div>
    <div class="summary-topic">Table ${escapeHtml(String(page.table_number))} — ${escapeHtml(page.page_topic)}</div>
    <span class="summary-kanji">${escapeHtml(page.page_header_kanji)}</span>
    <span class="summary-en-head">${escapeHtml(page.page_header_en)}</span>
    <p>${escapeHtml(page.page_summary_en)}</p>
  `;
}

/* ---------------- furigana ---------------- */
function renderFieldWithFurigana(fieldJp) {
  const entry = glossary[fieldJp];
  if (entry && entry.furigana) {
    return `<ruby>${escapeHtml(fieldJp)}<rt>${escapeHtml(entry.furigana)}</rt></ruby>`;
  }
  return escapeHtml(fieldJp);
}

/* ---------------- cross-highlight ---------------- */
function setActiveField(fieldJp, { scrollRow = false } = {}) {
  const key = normField(fieldJp);
  Object.entries(overlaysByField).forEach(([f, el]) => el.classList.toggle('active', normField(f) === key));
  let activeRow = null;
  document.querySelectorAll('.extract-table tr[data-field-jp]').forEach(tr => {
    const on = normField(tr.dataset.fieldJp) === key;
    tr.classList.toggle('active', on);
    if (on) activeRow = tr;
  });
  if (scrollRow && activeRow) {
    const pane = $('.data-pane');
    const rr = activeRow.getBoundingClientRect(), pr = pane.getBoundingClientRect();
    if (rr.top < pr.top + 60 || rr.bottom > pr.bottom - 10) {
      activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
function clearActiveField() {
  Object.values(overlaysByField).forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.extract-table tr.active').forEach(tr => tr.classList.remove('active'));
}

/* ---------------- on-page tooltip ---------------- */
function showTip(ann, clientX, clientY) {
  const tip = $('#osd-tip');
  const kanji = bodyOf(ann, 'transcribing');
  const jp = bodyOf(ann, 'modern_jp_reading');
  const en = bodyOf(ann, 'english_translation');
  const val = bodyOf(ann, 'extracted_value');
  let main = currentLang === 'transcribing' ? kanji
           : currentLang === 'modern_jp_reading' ? (jp || kanji)
           : (en || jp || kanji);
  const cls = currentLang === 'english_translation' ? 'tip-en' : 'tip-kanji';
  tip.innerHTML = `<span class="${cls}">${escapeHtml(main)}</span>` +
                  (val ? `<span class="tip-val">${escapeHtml(val)}</span>` : '');
  tip.hidden = false;
  // position within the page pane, flipping if near the right edge
  const pane = $('.page-pane').getBoundingClientRect();
  let x = clientX - pane.left + 16, y = clientY - pane.top + 14;
  tip.style.left = '0px'; tip.style.top = '0px';
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  if (x + tw > pane.width - 8) x = clientX - pane.left - tw - 14;
  if (y + th > pane.height - 8) y = clientY - pane.top - th - 14;
  tip.style.left = Math.max(6, x) + 'px';
  tip.style.top = Math.max(6, y) + 'px';
}
function hideTip() { $('#osd-tip').hidden = true; }

/* ---------------- data table ---------------- */
function renderExtractTable(pageId) {
  const tbody = $('#extract-rows');
  tbody.innerHTML = '';
  const allRows = extracts[pageId] || [];
  if (!allRows.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#9a8d76;text-align:center;padding:22px">No MASTER extract rows for this page.</td></tr>';
    return;
  }
  // de-duplicate ONLY exact-duplicate rows (same label + value + unit). Distinct fields
  // that happen to share a value+unit (e.g. four warships each "1 ship") must NOT collapse.
  const seen = new Map();
  allRows.forEach(r => {
    const k = `${normField(r.field_jp)}|${r.parsed}|${r.unit || ''}`;
    if (!seen.has(k)) seen.set(k, r);
  });
  const rows = [...seen.values()];
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.dataset.fieldJp = r.field_jp;
    const gloss = glossary[r.field_jp] || {};
    const hasAnno = !!findAnnotationByField(r.field_jp);
    if (hasAnno) tr.classList.add('has-anno');
    // 2nd column follows the language toggle: English name, or the modern-JP reading.
    const col2 = currentLang === 'english_translation' ? (gloss.en || '')
               : (gloss.furigana || '');
    tr.innerHTML = `
      <td class="field-jp">${renderFieldWithFurigana(r.field_jp)}</td>
      <td class="field-en">${escapeHtml(col2)}</td>
      <td class="value">${escapeHtml(r.parsed)}</td>
      <td class="unit">${escapeHtml(r.unit || '')}</td>`;
    tr.addEventListener('mouseenter', () => setActiveField(r.field_jp));
    tr.addEventListener('mouseleave', clearActiveField);
    if (hasAnno) {
      tr.addEventListener('click', () => { zoomToField(r.field_jp); openDetailFor(r.field_jp); });
    } else {
      tr.addEventListener('click', () => openDetailFor(r.field_jp));
    }
    tbody.appendChild(tr);
  });
}

/* ---------------- OSD overlays ---------------- */
function rectFor(ann) {
  const b = parseXywh(ann.target?.selector?.value);
  if (!b) return null;
  return new OpenSeadragon.Rect(b.x, b.y, b.w, b.h);
}
function addOverlays() {
  overlaysByField = {};
  currentAnnotations.forEach(ann => {
    const r = rectFor(ann);
    if (!r) return;
    const field = identOf(ann);
    const el = document.createElement('div');
    el.className = 'hl-box' + (field.startsWith('○') ? ' is-marker' : '');
    el.dataset.fieldJp = field;
    el.addEventListener('mouseenter', (e) => { setActiveField(field, { scrollRow: true }); showTip(ann, e.clientX, e.clientY); });
    el.addEventListener('mousemove', (e) => showTip(ann, e.clientX, e.clientY));
    el.addEventListener('mouseleave', () => { clearActiveField(); hideTip(); });
    // Box click -> detail popup is handled centrally by the viewer's 'canvas-click' handler
    // (see init). A per-overlay DOM mouseup is unreliable: OSD captures the pointer on mousedown,
    // so the overlay's own mouseup never fires. OSD's canvas-click IS click-vs-drag aware and
    // fires through the capture; we hit-test its position against the annotation rectangles.
    viewer.addOverlay({ element: el, location: viewer.viewport.imageToViewportRectangle(r) });
    overlaysByField[field] = el;
  });
}
/* Re-place every overlay from scratch. OpenSeadragon stores an overlay's location in VIEWPORT
   coordinates, computed once (via imageToViewportRectangle) at add time. If a page is opened
   while its container is collapsed to 0/1px — e.g. the viewer was opened in a background tab the
   browser hasn't laid out yet, or a fast page-switch fired before the first image finished
   sizing — that conversion resolves against a not-yet-valid viewport and EVERY overlay
   degenerates to a ~2px box stacked at the origin ("all the highlights vanish"). OSD's own
   autoResize later fixes the canvas and fires 'resize', but it does NOT recompute the already-
   stored degenerate overlay locations — so we recompute them here. Idempotent; safe to call
   repeatedly. */
function placeOverlays() {
  if (!viewer || viewer.world.getItemCount() === 0) return;
  viewer.clearOverlays();
  addOverlays();
}
function zoomToField(fieldJp) {
  const ann = findAnnotationByField(fieldJp);
  if (!ann || !viewer) return;
  const r = rectFor(ann);
  if (!r) return;
  // pad the column generously so context around the value is visible
  const padX = r.width * 3.2, padY = r.height * 0.18;
  const padded = new OpenSeadragon.Rect(r.x - padX, r.y - padY, r.width + padX * 2, r.height + padY * 2);
  viewer.viewport.fitBoundsWithConstraints(viewer.viewport.imageToViewportRectangle(padded), false);
  const el = overlaysByField[fieldJp];
  if (el) { el.classList.add('active'); }
}

/* ---------------- detail modal ---------------- */
function openDetailFor(fieldJp) {
  const ann = findAnnotationByField(fieldJp);
  const body = {};
  if (ann) (ann.body || []).forEach(b => { body[b.purpose] = b.value; });
  const crop = findCropByField(pages[currentPage].id, fieldJp);
  const extractRow = (extracts[pages[currentPage].id] || []).find(r => r.field_jp === fieldJp);
  const gloss = glossary[fieldJp] || {};

  $('#detail-master').textContent = body.identifying || fieldJp;
  $('#detail-kanji').textContent = body.transcribing
    || (extractRow ? (extractRow.raw || `${fieldJp} ${extractRow.parsed || ''}`) : '—');
  $('#detail-modern-jp').textContent = body.modern_jp_reading
    || (gloss.furigana ? `${fieldJp}（${gloss.furigana}）` : '—');
  $('#detail-en').textContent = body.english_translation || gloss.en || '— no annotation written yet for this field —';
  $('#detail-value').textContent = extractRow
    ? `${extractRow.parsed}${extractRow.unit ? ' ' + extractRow.unit : ''}`
    : (body.extracted_value || '—');

  const zlink = $('#detail-zoom-link');
  if (crop) {
    $('#detail-crop').src = crop.crop_path + '?v=' + VER;
    $('#detail-crop').alt = `Source column for ${fieldJp}`;
    $('#detail-crop').style.display = '';
  } else {
    $('#detail-crop').style.display = 'none';
  }
  zlink.style.display = findAnnotationByField(fieldJp) ? '' : 'none';
  zlink.onclick = () => { closeDetail(); zoomToField(fieldJp); };
  $('#detail-modal').hidden = false;
}
function closeDetail() { $('#detail-modal').hidden = true; }

/* ---------------- page load ---------------- */
function loadPage(idx) {
  if (idx < 0 || idx >= pages.length) return;
  currentPage = idx;
  const page = pages[idx];
  $('#prev-page').disabled = idx === 0;
  $('#next-page').disabled = idx === pages.length - 1;
  $('#page-select').value = idx;
  hideTip();
  renderPageMeta(page);
  currentAnnotations = annotationsByPage[page.id] || [];
  renderExtractTable(page.id);
  viewer.clearOverlays();
  overlaysByField = {};
  viewer.open({ type: 'image', url: `${page.image}?v=${VER}` });
}

/* ---------------- init ---------------- */
async function init() {
  try {
    const manifest = await loadJson(`data/pages.json?v=${VER}`);
    pages = manifest.pages;
    extracts = await loadJson(`data/master_extracts.json?v=${VER}`);
    glossary = await loadJson(`data/hi_field_glossary.json?v=${VER}`);
    cropsManifest = await loadJson(`data/crops_manifest.json?v=${VER}`);
    await Promise.all(pages.map(async p => {
      try { annotationsByPage[p.id] = await loadJson(`data/annotations/${p.id}.json?v=${VER}`); }
      catch (e) { annotationsByPage[p.id] = []; }
    }));
  } catch (e) {
    document.body.innerHTML = `<p style="padding:40px;color:#a8362a;font-family:Georgia,serif">Failed to load viewer data: ${e.message}</p>`;
    return;
  }

  viewer = OpenSeadragon({
    id: 'osd',
    prefixUrl: 'https://cdn.jsdelivr.net/npm/openseadragon@4.1.0/build/openseadragon/images/',
    showNavigationControl: false,
    showNavigator: true,
    navigatorPosition: 'BOTTOM_RIGHT',
    navigatorHeight: 92, navigatorWidth: 70,
    navigatorBorderColor: 'rgba(200,90,50,0.7)',
    navigatorDisplayRegionColor: 'rgba(200,90,50,0.9)',
    minZoomImageRatio: 0.7,
    maxZoomPixelRatio: 2.4,
    visibilityRatio: 0.85,
    constrainDuringPan: true,
    animationTime: 0.7,
    springStiffness: 7,
    gestureSettingsTouch: { pinchToZoom: true, flickEnabled: true },
    gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true },
    zoomPerScroll: 1.35,
    immediateRender: false,
    preserveImageSizeOnResize: true,
  });
  // Re-place overlays both when an image opens AND whenever OSD resizes its canvas. The resize
  // hook is what recovers the "collapsed container" case: if the page opened while the viewer was
  // 0/1px wide, the overlays were computed against a degenerate viewport; when the container later
  // gets its real size OSD fires 'resize', and we recompute the overlays at the correct scale.
  viewer.addHandler('open', placeOverlays);
  viewer.addHandler('resize', placeOverlays);

  // If the viewer opened while its container was collapsed (0/1px) — e.g. opened in a background
  // tab the browser hadn't laid out — OSD's drawer canvas stays that size and every overlay stays
  // degenerate. OSD only re-measures inside its render loop, which is paused while collapsed, so
  // it doesn't self-correct just from the container growing. Watch the container and, on a real
  // width change, call forceResize() — the OSD API that re-evaluates the container size, resizes
  // the canvas, and fires 'resize' (-> placeOverlays recomputes the overlays at the right scale).
  if (window.ResizeObserver) {
    const osdEl = document.getElementById('osd');
    let lastW = osdEl.clientWidth;
    new ResizeObserver(() => {
      const w = osdEl.clientWidth;
      if (w > 2 && w !== lastW) { lastW = w; if (viewer.isOpen()) viewer.forceResize(); }
    }).observe(osdEl);
  }

  // Click a highlighted column on the page -> open its detail, same as clicking its table row.
  // Use OSD's canvas-click (click-vs-drag aware, fires through OSD's pointer capture) and
  // hit-test the click against the annotation rectangles, choosing the smallest box that
  // contains the point. event.quick is false for a drag, so panning is unaffected.
  viewer.addHandler('canvas-click', (event) => {
    if (!event.quick) return;
    const ipt = viewer.viewport.viewportToImageCoordinates(viewer.viewport.pointFromPixel(event.position));
    let best = null, bestArea = Infinity;
    currentAnnotations.forEach(ann => {
      const r = rectFor(ann);
      if (!r) return;
      if (ipt.x >= r.x && ipt.x <= r.x + r.width && ipt.y >= r.y && ipt.y <= r.y + r.height && r.width * r.height < bestArea) {
        bestArea = r.width * r.height; best = ann;
      }
    });
    if (best) { const f = identOf(best); hideTip(); zoomToField(f); openDetailFor(f); }
  });

  populatePageSelect();
  $('#page-select').addEventListener('change', e => loadPage(parseInt(e.target.value, 10)));
  $('#prev-page').addEventListener('click', () => loadPage(currentPage - 1));
  $('#next-page').addEventListener('click', () => loadPage(currentPage + 1));
  $('#zoom-in').addEventListener('click', () => viewer.viewport.zoomBy(1.5).applyConstraints());
  $('#zoom-out').addEventListener('click', () => viewer.viewport.zoomBy(1 / 1.5).applyConstraints());
  $('#zoom-home').addEventListener('click', () => viewer.viewport.goHome());

  // language toggle
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentLang = btn.dataset.lang;
      if (pages[currentPage]) renderExtractTable(pages[currentPage].id);
    });
  });

  // modal
  $('#detail-close').addEventListener('click', closeDetail);
  $('#detail-modal').addEventListener('click', e => { if (e.target.id === 'detail-modal') closeDetail(); });

  // keyboard
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') { if (!$('#detail-modal').hidden) closeDetail(); else viewer.viewport.goHome(); }
    else if (e.key === 'ArrowRight' && $('#detail-modal').hidden) loadPage(currentPage + 1);
    else if (e.key === 'ArrowLeft' && $('#detail-modal').hidden) loadPage(currentPage - 1);
    else if ((e.key === '+' || e.key === '=') ) viewer.viewport.zoomBy(1.4).applyConstraints();
    else if (e.key === '-') viewer.viewport.zoomBy(1 / 1.4).applyConstraints();
  });

  loadPage(0);
}

init();
