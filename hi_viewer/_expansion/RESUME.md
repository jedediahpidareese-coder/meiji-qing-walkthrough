# HI viewer — whole-book coverage expansion (RESUME)

**Goal (user-approved 2026-07-11):** every data-bearing HI page for every domain in the viewer —
**803 pages / 300 domains**. Adds **647 NEW pages** to the viewer (was 182). Driven by the right-of-marker
rule: content left of a ○domain marker is that domain's; content right of it belongs to the PREVIOUS domain,
which may be a domain not yet in the viewer (transitive — new pages surface further domains).

## State = `data/pages.json` (the checkpoint)
A page is DONE when its `(volume,pdf_page,page_side)` is present in `pages.json`. Resume computes
`remaining = worklist − pages.json`. Nothing to track separately.

## Files (durable, in this `_expansion/` dir unless noted)
- `worklist_full.json` — the 647-page seed: per page, its MASTER domains, fascicle, and up to 60 MASTER
  field/value cross-check rows. (regen: `outputs/scripts/hi_expand_full_worklist.py OUT`)
- Scripts in `outputs/scripts/`: `hi_expand_gen_newpages_wf.py` (batch workflow generator),
  `hi_expand_apply_newpages.py` (apply results), `hi_expand_full_image_prep.py` (image extraction).
- Page images: extracted into `images/` (crop from `藩制一覧英語/page_images/*.jpg` spreads, else render from
  `藩制一覧英語/raw/藩制一覧{上,下}.pdf`; `vol_pNNN` == PDF 1-indexed page NNN; half = left `[0:w//2]` / right `[w//2:]`).

## Per-batch loop (each ~30 pages ≈ 10M tokens ≈ 2-3h; ~22 batches total)
1. **Generate** the next batch (skips pages already in pages.json):
   `PYTHONIOENCODING=utf-8 python outputs/scripts/hi_expand_gen_newpages_wf.py <OUT>.js --seed=<worklist_full.json> --batch=30`
2. **Launch** it with the Workflow tool (`scriptPath: <OUT>.js`). It runs propose→adversarial-verify per page.
3. **On completion**: extract `result.results` from the task output file → `PYTHONIOENCODING=utf-8 python
   outputs/scripts/hi_expand_apply_newpages.py <results>.json apply`. This writes `data/annotations/<id>.json`,
   appends `pages.json`, adds `master_extracts` rows + glossary stubs. (backups `*.bak_newpg` first time.)
4. Repeat 1-3 until `remaining=0`.

## Apply rules already enforced (see script)
- verify corrections win; keep=false dropped; verifier `missed` added.
- neighbour-owned boxes (owner ≠ primary domain) get a `（<owner>分）` suffix so the UI shows whose data it is.
- idents unique per page after normField (parens+whitespace stripped) — auto-disambiguated.
- a data row's field_jp is forced to normField-match its box ident (else cross-highlight breaks).

## Phase 3 — integrate (after all batches, or periodically)
1. **Renumber `sequence`** so pages read continuously: group by domain, order right-page-before-left within a
   spread, then by pdf_page. (all new entries currently have sequence=0.)
2. Normalize `domain_canonical`/`domain_en` to one string per domain.
3. Regenerate crops: `python outputs/scripts/generate_hi_viewer_crops.py`.
4. Deterministic geometry safety: `hi_viewer_overlap_resolver.py apply` + `hi_viewer_clip_top_fixer.py apply`.
5. Reconcile counts: `#annotation files == #pages.json ids == #images used`.
6. Bump VER (viewer.js + viewer.html), robocopy → deploy repo, DELETE `*.bak_*` from deploy, commit, push,
   force Pages build, verify live. (see `_BUILD_GUIDE.md §7`.)

## Cost (measured from the 6-page pilot)
~347k tokens/page. 647 pages ≈ **~224M tokens**, multi-day / many token-windows. Fully resumable — a window
running out mid-batch leaves the workflow's finished pages cached; re-launch to finish the batch, or just run
the next `--batch` (pages.json already has the applied ones).

## ▶ ✅ EXPANSION COMPLETE — STATE AS OF 2026-08-30 (read this first)
- **855 pages / 283 domains — DEPLOYED and live-verified at VER `20260711hi91`**
  (deploy commit `e51dbdce`). The 647-page worklist is at zero AND the 21 fascicle-1 pages it
  could never see are now in too.
- **The fascicle-1 gap is CLOSED.** 21 half-leaves were invisible to `worklist_full.json` because
  MASTER held exactly one row for each — the worklist was built from MASTER's own page references,
  so a page MASTER had barely transcribed looked like a page with nothing on it. Reading them
  recovered **284 values MASTER never carried** and filled **90 empty `analytic_wide` cells**.
  庭瀬藩 and 西大路藩 entered the viewer for the first time (281 → 283).
- **Every viewer domain has a dataset row, and every MASTER domain key resolves.**
  `build_analytic_wide.py` reports `Unresolved master-CSV domain names: []`.
- **Verification:** 855 pages == 855 annotations == 855 crops; sequences contiguous; QA CLEAN
  first pass (structural 0/0/0/0, numeric 0/5532, fascicle 0, book_page 0); orthographic duplicate
  groups 0; positional parentheticals 0; persons-per-household 4.03–5.55 across every domain the
  batch touched.
- **Held back for adjudication, NOT applied:** `outputs/hansei_ichiran_reocr/_ADJUDICATE_2026-08-30_fasc1gap.md`
  — 4 value conflicts, 2 cross-page disagreements, 3 `hi_infantry_persons` moves.

### ⚠️ Three import traps this batch exposed — re-read before any future bulk MASTER import
1. **Agents emit `parsed` with comma thousands ("3,071"); MASTER stores bare numbers** and the
   build truncates at the comma, so 3,071 silently becomes 3. Strip commas and assert none survive.
2. **Never dedup on (domain, field) without the page.** 西大路人口 appears on two pages with two
   different values (9,106 and 768); a page-blind key discarded the real population. Keep both and
   report the disagreement.
3. **A page's `合計人口` / bare `人口` is sometimes the SHIZOKU+SOTSU sub-total, not the domain
   total** — and `合計人口` outranks `人口` in the `hi_jinkou` whitelist, so it captures the column.
   新見藩 read 0.39 persons/household and 西大路藩 0.34 before this was caught. **Test every
   candidate against 士族+卒族, and sanity-check persons-per-household (expect ~4–6).**
   Relabel to `士卒族*`; never change the value.

Also: **the build's fill-only overlay reads the EXISTING `analytic_wide.csv`**, so one bad rebuild
contaminates the next even after MASTER is rolled back. Restore a known-clean copy before rebuilding.

### Coverage reconciled — the viewer and the dataset now agree (2026-08-30)
The "300 domains" in the old goal line was a PLANNING ESTIMATE, never a count; do not measure
against it. The grounded measure is the viewer's domains diffed against `analytic_wide.csv`'s 286
rows, aliases and kanji variants folded:
- **Viewer domains with NO dataset row: 0.** The three former orphans are resolved:
  - **大網藩 → 龍崎藩.** Same han; MASTER re-keyed, crossref and locator folded, viewer page
    `oami_lower_p147_left` re-keyed.
  - **松川藩 → 守山藩.** Source-confirmed, not inferred: MASTER's marker row at `upper_p215_right`
    transcribes **○守山藩 (松川ト改)** — the compilers recorded the rename on the marker itself.
    Viewer page `matsukawa_lower_p213_right` re-keyed.
  - **刈屋藩 = 刈谷藩**, a 屋/谷 variant pair. ADD IT TO THE FOLDING MAP.
  In all three the page keeps `domain_hi_name` exactly as HI prints it.
- **6 dataset domains have no viewer page of their own**: 大山領, 平戸新田藩, 庭瀬藩, 牟原藩,
  芝山藩, 西大路藩. Checked one by one — every one of them DOES appear in the viewer, on a page
  annotated under a neighbouring primary domain, so no HI data is missing from the site.
- **The residual is 21 fascicle-1 half-leaves that were never imaged — and they hold UNEXTRACTED
  DATA. This is a data gap, not a display gap.** Measured 2026-08-30.
  MASTER references 831 half-leaves; 23 of them had no `.jpg` in `images/` (2 of the 23 carry only a
  metadata row — `目次・頁番號` and `異動註記` — leaving **21 data-bearing pages**). All 21 have now
  been rendered from the source PDFs with `hi_expand_extract_pdf_pages.py`, so the images exist;
  none of the 21 is in `pages.json` yet.
  **They are absent from `worklist_full.json` because MASTER holds exactly ONE row for each** — and
  the worklist was built from MASTER's own page references, so a page MASTER barely transcribed
  looks like a page with nothing on it.
  Reading `upper_p044_left` (庭瀬藩) shows how wrong that is. MASTER has its 草高 alone; the page
  prints, in fascicle-1 order: 草高 貳萬五百七十三石七斗八升二合六勺五才 (20,573.78265 — the one row
  MASTER has), 高 二萬石, 正租米, 雜税金, 合米, 戸數 四千七百二十三, 人口 二萬三百八十一
  (男 10,596 / 女 9,785), 士族戸數 162, 卒族戸數 168, 士族人口 502, 卒族人口 416, 穢多戸數 163 /
  人口 861, 非人戸數 19 / 人口 81, 神社 58社 — about fifteen values, of which MASTER carries one.
  `analytic_wide` confirms the loss: 庭瀬藩's `hi_kosuu` and `hi_jinkou` are EMPTY while the page
  prints 4,723 and 20,381; its `hi_sotsu_jinin` is empty while the page prints 416.
  **The 21 pages, and the domain whose entry each one carries:**
  `lower` p031L 足守 · p202L 黒石 · p215R 福山 · p219R 挙母 · p228L 佐伯 · p236R 峯山 · p237L 静岡 ·
  p241R 下妻 · p242L 弘前 — `upper` p027R 出石 · p032R 飯田 · p040L 伯太 · p041R 林田 ·
  **p044L 庭瀬** · **p045L 西大路** · p045R 新見 · p046R 新谷 · p047R 西端 · p048L 本荘 ·
  p049L 堀江 · p100R 上ノ山.
  **庭瀬藩 and 西大路藩 are the only two domains with NO other viewer page**, so annotating just
  those two closes the domain-coverage gap (281 → 283); the other 19 belong to domains already in
  the viewer and would add a source page plus the missing fascicle-1 values.
  ⚠️ New values found this way are a MASTER ADDITION, so the collect-only rule applies: present
  them for adjudication, do not bulk-apply.
- One domain under two names accounts for the rest of the apparent gap: aliases 久保田=秋田,
  加賀=金澤, 尾張=名古屋, 庄内=大泉, 対馬府中=嚴原, 小倉=香春, 伊予松山=松山, 伊予吉田=吉田, and
  kanji-variant pairs the folding map must include: 与/與, 峰/峯, 発/發, 桜/櫻, 狭/狹, 条/條, 屋/谷.

### ⚠️ The build dropped every hand-adjudicated correction (root cause, FIXED 2026-08-29)
`build_analytic_wide.py`'s loader filtered MASTER on `confidence in {"high","medium"}`. The
adjudication passes stamp corrected cells `verified_scan_<date>` — a value in NEITHER set — so all
20 such rows were silently discarded and the corrections never reached `analytic_wide.csv`. This is
what made the file look "out of sync" and what produced the 2026-08-16 regressions.
Fixed with two helpers next to `CONFIDENCE_RANK`: `conf_admitted()` (admits a `verified_scan`
PREFIX, because the value carries the pass's date) and `conf_rank()` (ranks it 4, above `high`).
**Any future confidence value must be added to both, or its rows vanish without a warning.**
Backup: `build_analytic_wide.py.bak_pre_confidence_fix_2026_08_29`.
A 2026-08-16 note blamed the PRESERVE_FROM_EXISTING overlay for this; that diagnosis was WRONG —
the affected column is fill-only and its whitelist already held the exact label.

### The 大網/龍崎 merge needed THREE files, not one
The Aug 5 merge was applied to `analytic_wide.csv` alone, so the next rebuild resurrected the row
(286→287). A domain fold has to touch every file the build enumerates domains from:
`MASTER_hansei_ichiran.csv` (re-key the rows), `domain_name_crossref.csv`, and
`han_page_locator.csv` (whose `extraction_status='extracted'` feeds `extracted_canons`).
Backups all stamped `.bak_pre_ryugasaki_*_2026_08_29`.

### Name distinctions that must NOT be collapsed
- **鶴舞藩 (Tsurumai, Kazusa) vs 舞鶴藩 (Maizuru, Tango)** — HI prints the Kazusa name TRANSPOSED as
  舞鶴, so the two collide on the printed form. Live: Tsurumai 5 pages, Maizuru 3. Separated by
  kokudaka scale (Kazusa's block is 69,620 koku) and by Maizuru holding its own HI entry.
- **村岡藩 (prints 邨岡藩, ~11k Tajima/Yamana) vs 大泉藩 (Shōnai/Ōizumi)** — do not merge.
- **眞島藩 has no 真島藩 twin** (MASTER 25 rows vs 0) despite matching the 眞/真 variant map.

### The orthographic sweep is a PERMANENT loop step
It caught a real duplicate domain in three consecutive batches — Asao (淺/浅), Yajima (嶋/島),
Marugame (亀/龜). **MASTER decides the canonical, and its choice is NOT consistent by script style**:
Yajima consolidated to the KYUJITAI 矢嶋藩, Marugame to the SHINJITAI 丸亀藩. A prefer-the-modern-form
heuristic would have got Yajima wrong. `domain_hi_name` always keeps the form HI prints, and a DROP
in the domain count is often the correct outcome.

### Recurring failure modes and their fixes (all now guarded)
- **Transient API failure on ONE page** (`529 Overloaded`, or an agent that stalls at a handful of
  tool calls then goes silent for an hour while siblings run normally). Do NOT kill the batch: let
  the rest finish, apply the reachable pages, and the stranded page returns to the worklist. Seen in
  batches L, O; every time, the page came back clean in the next batch.
- **Retry-thrash** (batch L): several keys relaunched 5-6× and never completing, starving the queue.
  Detect via attempts-per-key >= 4. Kill + resume, or apply the reachable pages.
- **Duplicate-rect boxes** (batches D, N, Q) — see the section below.
- **Watchdog design.** A stall is `no completions AND no agent has written to disk in 5 min`. A flat
  counter ALONE is ambiguous: it equally means a long page is in progress. Track
  `proposals+verifies` combined, never the verify counter alone (it legitimately sits at 0 for the
  first hour). Read only `journal.jsonl` — reading every agent transcript makes the poll slower than
  its own sleep interval and the stall timer then silently under-reports.

### Duplicate-rect boxes — a NEW failure mode to sweep for (RESOLVED for batch D)
Batch D produced two boxes whose rect was byte-identical to a NEIGHBOUR's (IoU=1.0 — impossible;
one box was written with the other's coordinates copied in). Both re-measured by ink-projection
(`wf_b52f6826-f59`) and fixed; backups `*.json.bak_dupfix`:
- `shibata_lower_p082_left` `卒戸數` had the running header's rect → `xywh=pixel:930,1014,87,670`
  (its real column is x 940-1008 in large data type; the header's is x 821-874 in small header type).
- `shibata_lower_p083_left` `人員 (非人) 男` had the female box's rect → `xywh=pixel:2520,1670,53,336`
  (seam at x=2520; male prints RIGHT, female LEFT; 男 51 + 女 46 = 97 = parent 人員).
**The overlap resolver CANNOT fix this class** — at IoU=1.0 there is no "box merely spilling into a
neighbour" to trim, so it reports the pair and moves on. The QA sweep catches it; do not skip the
sweep before a deploy. Useful trick when re-measuring an M/F pair: derive the page's box convention
from its OTHER M/F pairs (渡守/華族 here) and check the rule reproduces a known-good box to the
pixel before trusting it on the broken one.

### Durable lessons from the batch runs
(The batch worklist is closed — the current state is the block above. Everything below
is what the 34 batches taught, kept because it still governs any future annotation work.)

   **The post-integrate ORTHOGRAPHIC SWEEP has now caught two real duplicate domains in three
   batches** — Asao (淺/浅) in AD and Yajima (嶋/島) in AF — so it is not a one-off cleanup, it belongs
   in the loop after every domain-adding batch. Both resolved the same way: MASTER decides the
   canonical (矢嶋藩 has 18 MASTER rows, 矢島藩 zero), and `domain_hi_name` keeps the form HI actually
   prints. Domain counts corrected 276->275 and 282->281 respectively; a DROP in that number can be
   the correct outcome.

   **⚠️ THE HAND-CURATED FOCAL PAGES HAVE UNRELIABLE `book_page` VALUES — a second instance.**
   Batch AE's book-page check flagged a break that was NOT from the batch (AE's own pages run
   352->359 unbroken). It was the two legacy Chōshū focal pages repeating 358/359, numbers p192 had
   already used. Read off the scans: `upper_p193_right` prints 三百六十 (360) and `upper_p193_left`
   prints 三百六十一 (361) — both legacy records were off by exactly 2. Corrected.
   This is the SAME defect class as the Satsuma/Tosa focal pages corrected 2026-08-05
   (百五十一 / 百五十四). **Treat every remaining hand-curated legacy page's book_page as suspect**;
   they carry no 版心 page-number box, so the value was never read off the scan in the first place.

   **⚠️ integrate's `domain_en` longest-wins now has a SECOND failure shape: verbose POSITIONAL
   parentheticals.** In AD it renamed 野村藩 to "Nomura (preceding Kumamoto on this spread)" — a note
   one agent wrote about page layout, not a name. `viewer.js` `cleanDomain()` strips these from the
   NAV label, which is why they hide, but the summary card prints `domain_en` raw, and the stored
   value is wrong regardless. **After every integrate, grep domain_en for
   `\((?:preceding|sharing|shares|following|continues)` as well as checking any rename against MASTER.**

   **村岡藩 checked and correct as of batch AC** — it entered with `domain_hi_name` 邨岡藩 as printed
   and kokudaka 11,010 (the Tajima/Yamana baron), and is still entirely separate from 大泉藩
   (Shōnai/Ōizumi). Live after deploy: 村岡 3 pages, 大泉 5 pages. Do NOT merge them.

   **⚠️ NAME TRAP just hit in AB, expect more of this class in fascicle 4-5.** HI prints the Kazusa
   domain's name TRANSPOSED as 舞鶴藩 — which is a DIFFERENT domain already in the viewer, Tango's
   舞鶴藩 (Maizuru) at `lower_p211_right`. The annotating agent separated them by scale (the Kazusa
   block's 草高 is 69,620 koku against Maizuru's far smaller figure) and by Maizuru having its own HI
   entry at pp.210-211, then recorded `domain_hi_name` 舞鶴藩 as printed while keying the domain
   鶴舞藩 (Tsurumai). Live check after deploy: 5 Tsurumai pages, 1 Maizuru page, still distinct.
   **When two domains' printed names are transpositions or homographs, check kokudaka scale and
   whether each has its own HI entry before letting either name win.**
   Two things are parked and need a decision, neither blocking the batches:
   - **Fix `build_analytic_wide.py`** (three regressions, above) so analytic_wide can resync to MASTER.
     The 大網藩 half of it wants a MASTER change — re-key its 8 rows to 龍崎藩 the way 本庄→本荘 was
     done — which is a domain-key edit and so worth confirming first.
   - **Two batch-AA items still open** as label/ownership questions, not readings: 福江藩 p225R (one
     figure carried twice, as 正租(金) and as 雑税 金) and 福本藩 p226L (which domain owns the 永 column).

   Superseded note — batch AA is now deployed:
   **Batch AA APPLIED but NOT DEPLOYED (728 pages locally; hi81 = 713 is what is live).**
   106 pages remain. Two things are pending before the next batch:
   - **Deploy 728 @ hi82** (VER bump + robocopy + push + force Pages build). Everything upstream of
     the deploy is done and verified: QA sweep CLEAN first pass (structural 0/0/0/0, numeric
     0/4,398, fascicle 0, book_page 0), integrate stable at 0 changes on re-run, all seven batch-AA
     domain_en values match MASTER, overlap resolver 0 trims with the same 3 known pre-existing
     residuals (omigawa_lower_p161_left, yonezawa_upper_p111_right, yonezawa_upper_p112_left).
   - **Rebuild `analytic_wide.csv`** for four MASTER `parsed_value` corrections made 2026-08-16
     (府内藩 草高 26,422.3301 and 社家人口 312; 福本藩 卒族人口 170; 府内藩 大豆納 2,173.053, which
     was previously empty). ⚠️ `build_analytic_wide.py`'s PRESERVE_FROM_EXISTING overlay can
     silently clobber MASTER corrections — re-check those four cells after the rebuild.
   Then: launch **batch AB** (`--batch=15`), one workflow only, from `upper_p154_left`.

   **MASTER corrections applied 2026-08-16 (do NOT re-raise these as candidates):** 15 in total,
   each read off the scan rather than taken on an agent's word — 館山藩 p144R (社 human count 70 not
   78; 寺 unmanned 41 not 81; plus the 此米 row's stale description and the 拂/掃 misread) and 14
   from batch AA across p222-p227. Full evidence in `outputs/hansei_ichiran_reocr/CORRECTIONS_LOG.md`;
   commits `ce40629`, `b244530`, `c403b32`. **The collect-only rule gained a scope limit that day:**
   it governs BULK agent-reported candidates, where nobody has opened the page. A character
   misreading that has been read off the scan and confirmed by arithmetic is a mistake, not a
   candidate — fix it, log it, back the file up first. Two batch-AA items are still open because
   they are label/ownership decisions rather than readings: 福江藩 p225R (one figure carried twice,
   as 正租(金) and as 雑税 金; plus an inherited `草高 (corrected)` 19,375.956666) and 福本藩 p226L
   (which domain owns the 永 column).

   **⚠️ EXPECT API FAILURES ON THE VERIFY PHASE — RESUME, DON'T RE-RUN.** Both batches W and X lost
   verify agents to server-side errors (W: 8 lost to `529 Overloaded` + connections closed mid-response;
   X: 4 lost to `ENOTFOUND` + responses stalled mid-stream). In both cases `resumeFromRunId` replayed
   every completed agent from cache and re-ran only the failures — ~2.7M tokens each time against
   4-5M to redo the batch, and all 15 pages applied instead of half of them being stranded.
   **This failure mode is invisible to the watchdog by design**: no retries, no stall, agents writing
   until they die. It appears ONLY in the workflow's own completion report under `<failures>`, which
   is where per-agent errors must be read. Batch W showed zero retries; batch X showed 3 attempts on
   some keys, so the two are on a spectrum with the batch-L thrash (>=4 attempts = kill and resume).

   **⚠️ COMPLETION TEST: count DISTINCT pages having BOTH halves — never the number of result
   records.** Batch R was paused and resumed; the resume replayed cached verifies AND re-ran some,
   so the journal held 15 verify RECORDS covering only 9 distinct pages, while 6 pages had no verify
   at all. A monitor counting records declared "complete" while 6 agents were still working —
   applying then would have needlessly stranded those 6. Rebuilding results from the journal
   (which matches proposals to verifies BY PAGE ID) exposed the discrepancy; checking agent
   write-activity confirmed the run was still live. Waiting yielded all 15.

   Older next-action note (batch N):
   Next: launch **batch O** (`hi_expand_gen_newpages_wf.py --batch=15` recommended — see below),
   one workflow only, then follow step 1.
   **VOLUME CROSSOVER: vol2 (lower) is nearly exhausted; the remaining pages are mostly vol1
   (upper) = the CIVIL register, fascicles 1-5** — kokudaka/demographics page shapes, not the
   officials/military ones batches G-N worked through. Live split is vol1:101 / vol2:433.
   Expect new QA false-positive classes at the transition; watch the first vol1 batch's sweep.
   The remaining worklist is SPARSE — it fills gaps between covered pages, so page ranges widen.

   **⚠️ PREFER `--batch=15` NOW.** Batch L at 30 hit a RETRY-THRASH failure (see log): 6 verify
   agents each retried 5-6x without ever completing, starving the queue for 2+ hours. A partial
   batch is safe (apply takes only both-halves-complete pages; the rest return to the worklist),
   but 15 keeps the blast radius smaller. Batch M re-ran L's 14 stranded pages at 15 with ZERO
   retries, so that failure was transient infrastructure — not bad pages.

   **⚠️ WATCHDOG MUST BE LIGHTWEIGHT.** Do NOT have the monitor read every `agent-*.jsonl` each
   poll to count tool calls — those files reach 10-17 MB and the poll then takes far longer than
   its `sleep`, so the stall counter runs slow and under-reports (this is why batch L's 2-hour
   stall never flagged). Read ONLY `journal.jsonl` (small) for proposal/verify counts.
   then follow step 1. batch-30 + capped prompt is the proven recipe (G ran clean in ~1.7h, all 30
   proposals in the first hour, max ~100 tool calls, 0 errors). Prefer 30 on fresh budget, 15 near a
   window cap. NOTE: from ~p122 the expansion has entered **fascicle 8 (officials/military pages)** —
   a different page shape (titles + person names, court ranks, troop counts).

   **PROVEN RECIPE (batch E, 2026-07-17): `--batch=15` + capped prompt.** The prompt cap is baked
   into `hi_expand_gen_newpages_wf.py`: step 5 "iterate until clean" → "AT MOST 2 overlay passes",
   plus an EFFORT BUDGET (~30-45 tool calls). Batch E ran 15 pages in ~2.2h / 5.1M tokens, max 77
   tool calls on any agent (vs the 110-130 grind that stalled the batch-30 attempt), 0 errors, and
   accuracy held (caught 芝邨 佛堂=10-not-17 + 3 omitted populations on page 1 alone). This machine
   has 8 CPU cores → workflow concurrency cap = 6; agents are CPU-bound (PIL ink-projection), so a
   parallel 2nd batch oversubscribes and slows both — ONE batch at a time is a hard constraint.
   Watchdog pattern: silent monitor, grind flag at >90 TOOL CALLS (NOT file size — image reads
   inflate size to ~6-10 MB normally), stall flag at 30 min.
1. **When a batch completes**: extract `result.results` from the task output file → keep only entries
   with BOTH `proposal` and `verify` → `hi_expand_apply_newpages.py <results>.json apply` → re-run the
   QA sweep (below) → re-run `hi_expand_master_diff.py` to collect new MASTER candidates → then
   deploy (step 3) and launch the next batch (step 2).
   **MASTER candidates are COLLECT-ONLY.** Do not bulk-apply and do not adjudicate them into MASTER —
   that is a separate task the user must be asked about first (confirmed 2026-07-17).
   See `MASTER_DISCREPANCIES.md`.
2. **Launch the next batch**: `python outputs/scripts/hi_expand_gen_newpages_wf.py <OUT>.js
   --seed=outputs/walkthrough/hi_viewer/_expansion/worklist_full.json --batch=30`, `node --check` it,
   then run it with the Workflow tool. ~30 pages ≈ 10-12M tokens ≈ 3-4h, 60 agents.
   Run **ONE batch at a time** — a ~20-way parallel launch tripped the session limit and wasted a window.
3. **Deploy** — see "Phase 3 — integrate" below. Gotchas that WILL bite:
   - Renumber sequences with `outputs/scripts/hi_expand_integrate_pages.py apply` (it is in
     `outputs/scripts/`, NOT the scratchpad — an older note said otherwise). If ever lost, re-derive:
     order domains by their lowest existing sequence (new domains append in book order), and within a
     domain sort by (volume, pdf_page, side) with **R before L** in a spread.
   - **DO NOT** run `hi_viewer_clip_top_fixer.py` (see warning below). Overlap resolver IS safe.
   - After robocopy: exclude `_expansion/`, and **verify no `*.bak_*` reached the deploy tree**.
     (robocopy `/XF *.bak_*` DID match the compound `.json.bak_*` names on 2026-07-17 — an older note
     claimed it misses them. Check rather than assume; purge any that slip through.)
   - A stray file literally named **`nul`** (Windows reserved name) once appeared in
     `data/annotations/` and blocked `git add`. If git errors on it, delete via git-bash
     `rm -f .../annotations/nul` (PowerShell `Test-Path` cannot see it). Did NOT recur 2026-07-17.
   - Spot-checking live crop URLs with `curl`: percent-encode the path. Crop filenames contain kanji
     and raw curl 404s on them — that is a curl artifact, not a missing file (browsers encode).

## ⚠️ The watchdog must NOT declare completion (settled 2026-08-05, batch V)
`journal.jsonl` is not a reliable per-page record. On batch V, `upper_p113_right` wrote only its
VERIFY record — the proposal completed (the task output had all 15 pages and apply took all 15) but
left no journal record carrying that page id. Any journal-derived "N of 15 done" therefore
undercounts; on batch V it produced a false "one page stranded" report AND a false STALL after the
run had already finished. **Counting result records instead is no safer**: batch R replayed cached
verifies, giving 30 records over only 9 verified pages, which would have declared completion far too
early. There is no journal-only rule that is both safe and complete.
**The workflow's own completion notification is authoritative.** Use `scratchpad/watch_batch.py`
(`watch_batch.py <run_dir> <n_pages>`), which does THRASH and STALL only, and TaskStop it when the
workflow notification arrives. Completion and per-page reconciliation come from the task output file.

## ⚠️ `domain_en` longest-wins can promote a MISSPELLING (found 2026-08-05, batch T)
`hi_expand_integrate_pages.py` picks one `domain_en` per domain by longest-variant-wins (deliberate,
so "Kanazawa (Kaga)" beats "Kanazawa"). Batch T exposed the failure mode: 加納藩 had a legacy page
`kadano_lower_p167_left` whose agent romanized 加納 as **"Kadano"**, and because that is LONGER than
the correct "Kanō", integrate propagated the misspelling onto batch T's two new Kanō pages. MASTER
has Kano/Kanō. Fixed by setting all four 加納藩 pages to `Kanō`; integrate then reports 0 changes,
which is the stability test to re-run after any such fix. **If integrate renames a domain, check the
new name against MASTER before deploying — longest-wins has no idea which variant is correct.**
(The page id `kadano_lower_p167_left` still carries the bad romanization. Ids are internal — they
name annotation files and crop dirs — so it was left alone; only `domain_en` is user-visible.)

### 龍崎藩 RESOLVED = Ryūgasaki — and it turned up a probable DUPLICATE ENTITY (2026-08-05)
The reading is **りゅうがさき (Ryūgasaki)**; the viewer was right and MASTER's `Ryūsaki` was wrong
(fixed on 13 MASTER rows). Source: ja.wikipedia 龍ヶ崎藩, corroborated by an exact kokudaka match.

**The important part is what the marker's parenthetical means.** HI prints ○龍崎藩 with a smaller
（大綱/大網）beneath it, which the annotating agent glossed as たいこう "general summary — section
subheading". That is wrong: it is the domain's FORMER NAME. 大網藩 (Ōami, Kazusa; 知藩事 米津政敏)
moved its seat to Ryūgasaki and was renamed on Meiji 4/2/17 (6 April 1871), and was abolished at
haihan chiken on 4/7/14 (29 August 1871) — so "龍崎藩" names an entity that existed for **five
months**. Wikipedia's 実高 12,425 koku matches MASTER's 草高 12,425.538 exactly, which is what makes
the identification solid rather than a name coincidence. The viewer annotation has been corrected.
(The printed glyph is too heavily inked to call 綱 vs 網; `transcribing` was left as-is and the
ambiguity is stated in the box's English.)

⚠️ **THEREFORE: `analytic_wide.csv` almost certainly double-counts this domain.** It carries BOTH
`龍崎藩` (from HI vol1 — kokudaka 12,425.538, shizoku 237, sotsu 76; 63 non-empty fields) AND
`大網藩` (from HI vol2 — troops 60; 20 non-empty fields). They are perfectly COMPLEMENTARY: neither
holds any of the other's data, which is the same signature as the 本庄/本荘 Honjō split merged on
2026-05-22. If so the true domain count is 286, not 287, and merging would give Ryūgasaki its troop
figure and Ōami its kokudaka.
**NOT merged — this needs Jed's decision**, because merges here have a history of going wrong in
both directions (see the 大泉/庄内 vs 村岡 note: those look mergeable and must NOT be merged).

**Not a provenance problem — already settled in `_HI_SOURCE_STRUCTURE.md`.** A post-1870 name in
HI is exactly what that note predicts: the DATA is what each domain reported up (上申) over
明治2-3年 (1869-70), but the compilation is by the 修史局 afterwards and this printing is a 1928
日本史籍協会 reprint. A later compiler naming the domain 龍崎藩 while annotating the old name is
consistent with 1869-70 returns. Don't re-raise this.

### Open: 9 viewer romanizations disagree with MASTER — NOT adjudicated
A sweep of `domain_en` against MASTER (macrons/case/parentheticals folded) finds 9. They split three
ways and need Jed's call, not a bulk rewrite, because these are user-visible domain labels:
- **Viewer looks wrong:** 須坂藩 viewer `Susaka` vs MASTER `Suzaka` (すざか) — note the viewer is
  internally inconsistent here too, carrying both `susaka_lower_p119_right` and
  `suzaka_lower_p119_left`; 岩村田藩 `Iwamurata` vs `Iwamurada`; 西端藩 `Nishihata` vs `Nishibata`;
  加知山藩 `Kajiyama` vs `Kachiyama`.
- **MASTER looks wrong:** 小久保藩 viewer `Kokubo` vs MASTER `Okubo`; 曾我野藩 `Sogano` vs `Soganoya`;
  龍崎藩 `Ryūgasaki` vs `Ryūsaki`.
- **Intentional, leave alone:** 大泉藩 `Shōnai (Ōizumi)` and 香春藩 `Kokura (Kawara)` — deliberate
  disambiguations. MASTER also carries junk (`Nishihata (TOC)` under 岩村田藩).

## Progress log
- 2026-08-05: **batch T applied → 623 pages / 253 domains** (15 pages: upper_p081L→p085R, p091L,
  p091R, p092L, p096L, p097L — vol1 fascicle 2 plus the first TWO fascicle-3 pages, both 加納藩).
  30/30 agents, 0 errors, zero retries, 4.95M tokens, ~2.0h. QA clean FIRST PASS (structural 0/0/0/0;
  numeric 0/3,266; and the new fascicle + book_page checks both 0 on fresh data, which is the first
  evidence they do not false-positive on a new batch). 392 boxes, 338 data rows, 0 dropped,
  9 idents auto-renamed. New domain surfaced: 荻野山中藩. Overlap resolver trimmed 1 box on
  `kano_upper_p097_left`; 3 residuals remain, all pre-existing and below the QA threshold.
  **Integrate introduced a regression that had to be caught before deploy** — see the `domain_en`
  longest-wins warning above: 加納藩 was renamed Kanō → "Kadano" from a legacy page's misromanization.
- 2026-08-05: **batch S deployed → 608 @ hi74** (commit `0488197b`). 15 pages (upper_p071R,
  upper_p074L→p080R), all vol1 fascicle 2. 30/30 agents, 0 errors, zero retries, 5.16M tokens, ~2.0h.
  QA clean FIRST PASS (structural 0/0/0/0; numeric 0/3,055). Integrate 0 changes on re-run; overlap
  resolver 0 trims; crops 12,827/0 skipped; reconcile clean (608 pages == 608 annotations ==
  608 crops-manifest entries; 596 distinct images, the 12-page gap being the shared-leaf pairs).
  MASTER candidates 166→180 (+14, collect-only).
  **A type-sort failure the verifier caught, and the metadata gap it exposed.** On
  `oshi_upper_p071_right` the proposer read the running head as 第一 and OVERRODE MASTER's fascicle 2
  on that basis. The verifier measured the bar at 18 px against 10-11 px for a genuine 一 elsewhere on
  the same page, found clean paper (gray 196-213) in the gap above it, and diagnosed a rocked type
  sort whose upper stroke of 二 never printed — confirmed because 忍藩's other three leaves
  (百十七/百十八/百十九) all print 第二. MASTER was right.
  ⚠️ **But `hi_expand_apply_newpages.py` only propagated the correction to `table_number` and to the
  header BOX. The page-level `page_header_kanji`, `page_header_en` and `page_summary_en` kept the
  proposer's "第一 / Fascicle 1" wording** — so the page would have shipped saying fascicle 1 in its
  own header while its table_number said 2. Fixed by hand this batch. **Worth guarding in apply:
  when the verifier corrects the fascicle, rewrite the page-level header/summary strings too.**
  **Two cheap deterministic checks added to the QA sweep, both of which caught real errors:**
  - **book_page continuity** — within a batch the printed page number increments by exactly 1 in
    (pdf_page, R-then-L) order. This caught `ogi_upper_p075_left` transcribed 頁二十五: the glyph is an
    over-inked 百 (compared side-by-side against a known 百 on the facing leaf — same top stroke, same
    enclosing box with ONE internal bar, and critically no 八 legs below, which 頁 would have). It sat
    between 百二十四 and 百二十六, so it can only be 百二十五. The misread had also propagated into the
    box's reading and translation as "page 25"; all three fixed.
  - **running-head vs table_number** — the 第N in `page_header_kanji` must equal `table_number`. Over
    all 608 pages this found the Oshi page plus **two PRE-EXISTING already-live errors**:
    `kameyama_upper_p093_right` and `kawagoe_upper_p094_right` both print 第二 and carry fascicle-2
    demographic content (戸數/人口/村數/寺) but carried `table_number` 1. Set to 2; sweep now returns 0.
  **✅ RESOLVED (2026-08-05, Jed approved): all 20 book_page breaks closed, 12 corrections.** Every
  number was read off its own scan; the arithmetic only said WHERE to look, never what to write.
  Baseline is now 0, so any future hit is new. Corrections, vol2 unless noted:
  `akizuki_lower_p025_left` 三十七→二十七, `ashikaga_lower_p042_right` 六十六→六十,
  `anshi_lower_p043_right` 六十七→六十二, `anshi_lower_p043_left` 六十→六十三,
  `mito_lower_p069_right` 百七十四→百十四, `minakuchi_lower_p073_right` 百三十二→百二十二,
  `mineoka_lower_p078_right` 百三十三→百三十二, `shizuku_lower_p093_right` 百六十三→百六十二,
  `ichinoseki_lower_p126_right` 二百二十九→二百二十八, `tsushima_lower_p121_left` 三百十九→二百十九,
  and **two of the original hand-curated FOCAL pages (vol1)**: `satsuma_kokudaka` 百四十九→百五十一
  and `tosa_demographics` 百五十六→百五十四 — the Satsuma/Tosa run is 151-152-153-154, printed plainly.
  Those four focal pages carry no 版心 box, so their numbers were found by locating the bottom-margin
  ink cluster at the same x as a known page of the same side (L≈880, R≈2090 at 3095px width).
  **`anji_lower_p042_left` (六十一 = 61) was CORRECT** and only looked guilty because BOTH its
  neighbours were wrong — the reason a page bracketed on both sides of a break still must be read
  rather than inferred.
  Two ink-projection habits that settled the hard ones: **compare stroke darkness** (on
  `ashikaga_lower_p042_right` the apparent third glyph measured 83-93 mean gray against 57-60 for the
  real 六 and 十, i.e. show-through from the reverse leaf, not a printed numeral; same trick killed the
  phantom middle stroke that turned 二十七 into 三十七); and **count ink-rows against glyph pitch**
  (`mito_lower_p069_right` had only 150 px of glyph run, room for three glyphs, so 百十四 not the
  four-glyph 百七十四).
  **`_BUILD_GUIDE.md` had been published to the public site since ~2026-07-05.** The deploy
  procedure's `/XF _BUILD_GUIDE.md` prevents the COPY but cannot delete an already-committed file, and
  it was tracked in the deploy repo. Removed in this commit (`git rm --cached` + delete). **Check
  after any deploy that `/XF`-excluded files are absent from the deploy tree, not merely un-copied.**
  Non-issue confirmed while investigating: 12 physical leaves legitimately carry TWO page records
  (e.g. `oshi_upper_p072_left` / `ozu_upper_p072_left`). That is the design — one record per domain,
  each holding the whole leaf with the other domain's boxes suffixed `（…藩分）` — not duplication.
- 2026-07-27: **batch Q deployed → 578 @ hi72** (commit `1672c698`). 15 pages (upper_p053L→p060L),
  first **fascicle 2** batch. 30/30 agents, 0 errors, zero retries. QA numeric clean (0/2,736).
  MASTER candidates 153→164 (+11, collect-only).
  **Third duplicate-rect occurrence — but a NEW and now-guarded mechanism: a VERIFIER FIELD-COPY.**
  The verifier returned the SAME `corrected_xywh` for 但シ御賞典歩合註記 and （以下六行朱書） while its
  own `issue` prose still described their two distinct ink runs (citing "ink x1596-1657" for the
  former, which matches the PROPOSAL's box, not the rect it emitted). The proposer was correct;
  no re-measurement was needed — the verifier's own evidence adjudicated it.
  **`hi_expand_apply_newpages.py` now rejects a `corrected_xywh` that exactly equals a DIFFERENT
  proposed box's rect on the same page** (a copy error cannot be a measurement) and reports
  `rect_copy_rejected=N`. Verified to fire exactly once on this batch and on nothing else.
  Diagnostic habit worth keeping: when a verifier correction looks wrong, read its own `issue` text —
  it often contains the measurement that contradicts the field it emitted.
- 2026-07-27: **batch P deployed → 563 @ hi71** (commit `67787c7c`). 15 pages (upper_p024L→p047L),
  all vol1 fascicle 1. 30/30 agents, 0 errors, **zero retries**. Included batch O's stranded
  `upper_p024_left`, which completed cleanly — third confirmation that these one-off losses are
  transient API failures, not bad pages. QA clean FIRST PASS (structural 0/0/0/0; numeric 0/2,622).
  MASTER candidates 147→153 (+6, collect-only).
  **Legacy `kochi_officials_2` geometry fixed** (the item flagged after batch O). Measurement showed
  it was worse than the IoU number suggested: the ○龜岡藩 marker box sat **~78 px LEFT of its own
  ink**, straddling two columns — swallowing the right 27 px of the running-header column AND
  clipping the right 44 px of its own glyphs (about half of 龜岡藩). Corrected to
  `966,1210,112,642`. The header box measured correct and was left alone.
  ⚠️ The same agent flagged an ADJACENT box it did not touch: `常備兵（山內）` over-extended 60 px
  left of its ink. Fixing only the marker would have left a NEW 20 px overlap at IoU 8.1% — still
  above the 6% threshold — so both had to move; `常備兵` pulled to `1108,1205,97,672`. Lesson: after
  a measured box fix, re-run the pairwise overlap check over the WHOLE page before calling it done.
  **Watchdog design (settled after three mis-tunings today):** a stall is `no completions AND no
  agent has written to disk in 5 min`. A flat counter alone is ambiguous — it equally means "a long
  page is in progress". Earlier versions fired spuriously by (1) too tight a threshold, (2) checking
  before any result could exist, (3) watching only the VERIFY counter, which legitimately sits at 0
  for the first hour while proposals run. Track `proposals+verifies` combined, and gate on agent
  write-activity.
- 2026-07-27: **batch O deployed → 548 @ hi70** (commit `834fc1df`). 14 of 15 pages
  (upper_p024L→p034L) — **first batch entirely in the vol1 CIVIL register** (fascicle 1). Far denser
  than officials pages: 447 boxes / 349 data rows over 14 pages. **QA numerically CLEAN on the
  densest page type yet — 2,421 numerals re-parsed, 0 disagreements**, so the civil-register
  transition needed no new sweep rules (contrast the fascicle-8 transition, which needed three).
  MASTER candidates 145→147 (+2, collect-only).
  **`upper_p024_left` was lost to `API Error: 529 Overloaded`** and returned to the worklist. This
  is the SAME cause as batch L's thrash, now stated explicitly by the harness — one agent stalls
  early (7 tool calls, then silent 75+ min) while its siblings run normally. Diagnosis pattern: a
  single silent agent with a low tool-call count = transient API failure on that one page; let the
  rest finish and apply the reachable pages. Do NOT kill the batch for it.
  Watchdog lesson (I got this wrong in both directions today): a stall check must NOT fire before
  the first result exists — a 15-page batch legitimately reads 0/0 for 20-45 min. Best pattern:
  watch for the CONDITION you care about (e.g. "verifies >= 14, all reachable pages done") rather
  than inferring trouble from a flat aggregate counter.
- 2026-07-27: **batch N deployed → 534 @ hi69** (commit `d009dea`). 15 pages (p233R→upper_p023R) —
  **crosses the VOLUME boundary** into vol1 fascicle 1 (civil register). 30/30 agents 0 errors,
  5.0M tokens, zero retries. QA clean; MASTER candidates 144→145 (+1, collect-only). Two fixes:
  - **Duplicate-rect (2nd occurrence, cf. batch D):** `込高` and `改出新田高` on
    `imabari_upper_p023_left` shared one rect. Re-measured by ink projection — and the measurement
    **disproved the hypothesis in the prompt**: there is no second column in the apparent gap
    (that was ~1.5° page skew); `込高` is stacked BELOW `高` in the SAME column. Glyph counts
    matched exactly (19 = 改出新田高+14-glyph value; 11 = 込高+9), and arithmetic confirmed it:
    35,000 + 1,808.057 + 6,426.757 = 43,234.814 = the printed 草高. When writing these fix prompts,
    state the hypothesis as a hypothesis — the agent correctly rejected mine.
  - **Empty `volume` field on 2 legacy curated pages** (`kochi_officials_2`, `kumamoto_households`).
    The batch generator maps `volume`→upper/lower to decide which locations are already DONE, so an
    empty volume made `upper_p185_right` invisible as covered — **a future batch would have
    re-annotated it as a duplicate**. Volumes set from the image filenames (pdf_page + side
    independently agree). Remaining dropped 301→300, confirming the phantom is gone.
    ⚠️ Worth re-checking after any hand-editing of pages.json: `sum(1 for p in pages if not
    p.get('volume'))` must be 0.
- 2026-07-27: **batch M deployed → 519 @ hi68** (commit `1fb976b`). 15 pages (p221L→p232R) —
  exactly the pages batch L stranded. 30/30 agents 0 errors, 4.9M tokens, ~1.7h, and **every
  work-key launched exactly once (zero retries)**, which settles it: L's stall was transient
  infrastructure, not pathological pages. QA clean (structural 0/0/0/0; numeric 0/2,100).
  MASTER candidates 144 → 144 (+0). One QA gap closed: the ABBREVIATED office titles printed
  without 事 (`少參四人` = "junior councillors, 4 men") were missing from OFFICIALS — and they
  matter doubly because **參 is also the formal numeral 3**, so the run-extractor read 參四 as 34.
  Added 少參|大參|權參|權大參 (+ shinjitai forms) to the vocabulary.
- 2026-07-27: **batch L (PARTIAL) deployed → 504 @ hi67** (commit `2553797`). Launched at 30 pages
  (p210L→p232L); 30/30 proposals + 16/30 verifies completed, then **RETRY-THRASH**: 6 verify keys
  each relaunched 5-6× and never completed (agents aborted mid-request, `[Request interrupted by
  user]`; some after grinding to 88-97 tool calls / 10-17 MB, others within 1 call). They respawned
  into every concurrency slot and starved the 8 still-queued verifies — **no agent completed for
  2h11m**. Stopped; applied the **16 both-halves-complete pages**; the other 14 (p221→p232)
  returned to the worklist automatically. QA clean first pass (structural 0/0/0/0; numeric 0/2,089).
  MASTER candidates 142→144 (+2, collect-only).
  **Two durable lessons** (both now in NEXT ACTIONS): prefer `--batch=15` at this stage, and keep
  the watchdog lightweight — the heavy version that counted tool calls across all agent transcripts
  polled slower than its own sleep interval and never fired its stall flag.
  Recovering a killed run: rebuild the results file from `journal.jsonl` (pair proposals+verifies by
  page_id, `meta` from the workflow script's PAGES array) — the task-output file may not exist.
- 2026-07-17: **batch K deployed → 488 @ hi66** (commit `48bd4ff`). 15 pages (p189R→p209R), 14 of
  them **fascicle 9**; 田安藩 surfaced transitively by the right-of-marker rule (its military printed
  right of the ○田安藩 marker belongs to 高瀨藩, and Tayasu's own block opens left of it). 30/30
  agents 0 errors, 5.0M tokens, ~2.1h. QA clean (structural 0/0/0/0; numeric 0/2,071).
  MASTER candidates 142 → 142 (+0 — fascicle-9 officials pages carry few uniquely-joinable numeric
  rows). One QA gap closed: `執政` (shissei, an older han office title) was missing from the
  OFFICIALS vocabulary, so a space-separated name list under it (山口旬 山口誠 會美四郎, parsed=3)
  got its 四 re-parsed out of a NAME. **Fixed by extending the vocabulary** (執政/参政/奉行/大夫 added),
  NOT by a structural heuristic — token-count rules were tested and over-skip real rows
  (座頭 二人 → 2, 神職 五戸 → 5 match by coincidence). When a new office title appears, add it there.
- 2026-07-17: **batch J deployed → 473 @ hi65** (commit `7be42d1`). 15 pages (p182L→p189L), crosses
  into **FASCICLE 9**. 30/30 agents 0 errors, 4.5M tokens, ~1.5h (all 15 proposals in hour one).
  QA clean (structural 0/0/0/0; numeric 0/2,050). MASTER candidates 138→142 (+4, collect-only).
  One new QA false-positive class fixed: a **bare personal-name row** (`三澤意`, `川地鐵五郎` —
  field_jp == raw, parsed=1 person) has no office title for OFFICIALS to match and only one name so
  NAMELIST misses it, yet the NAME contains numerals (三, 五). New rule: `parsed == 1` + **no 一/壹
  anywhere in raw** + person unit → the 1 is a count of a named individual, not a transcription
  (a genuine 1-row always prints its 一: 知事一員, 教頭一人). Narrow — excluded only 2 more rows.
- 2026-07-17: **batch I deployed → 458 @ hi64** (commit `ef5e89d`). 30 pages (p156R→p181R, fascicle-8
  officials/military). 60/60 agents 0 errors, 8.4M tokens. **QA clean on the FIRST pass** (structural
  0/0/0/0; numeric 0/2,031) — the accumulated filters (隊/officials/namelist exclusions, fascicle
  guard, domain_en cleaner) held with no new fix needed. MASTER candidates 137→138 (+1, collect-only).
- 2026-07-17: **batch H deployed → 428 @ hi63** (commit `8754ad2`). 30 pages (p134R→p156L, more
  fascicle-8 officials/military). Paused mid-run for budget, resumed next session (all 30 proposals
  replayed from cache). 60/60 agents 0 errors. QA clean (structural 0/0/0/0; numeric 0/2,015).
  MASTER candidates 132→137 (+5, collect-only). Two more robustness fixes: (1) domain_en cleaner
  generalized — `clean_domain_en()` (apply) + `bare()` (integrate) now strip "Domain"/"Han"
  ANYWHERE (trailing, mid-string as in "Hakata Domain (Izumi Province…)", or "(X-han)") while
  keeping province quals like "(Kii)"/"(Kaga)". (2) QA sweep OFFICIALS filter extended with 職員|姓名
  + a NAMELIST rule (・-joined name lists) — a 職員姓名 row (parsed=name count, raw=names w/ 五味 etc.)
  was a false positive.
- 2026-07-17: **batch G deployed → 398 @ hi62** (commit `5ca639a`). 30 pages (p118R→p134L), crosses
  into FASCICLE 8 (officials/military). Ran clean in ~1.7h, 60/60 agents 0 errors. QA clean
  (structural 0/0/0/0; numeric 0/1,998). MASTER candidates 124→132 (+8, additive, collect-only).
  Two fixes this batch: (1) apply now guards `table_number` to a valid fascicle **1-9** — the verifier
  had "corrected" one page's fascicle to 217 (a misread); helper `_fascicle()` ignores out-of-range
  corrections. (2) QA sweep now also excludes **fascicle-8 OFFICIALS rows** from the numeral
  re-parse (same category error as 隊): their `parsed` is a headcount of people while `raw` is
  "title + name + court rank" full of incidental numerals (高原七兵衞, 從五位, 各一人) — matched via an
  OFFICIALS token regex (參事|知事|公議人|教授|…|位|各). 13 false positives → 0; 116 rows now skipped,
  1,998 real rows still checked. 30 pages (姫路/平戸/人吉/久居/廣瀬/
  日出/一橋/母里/森/膳所/仙臺/關宿). Resume completed 60/60 agents 0 errors. QA clean (structural 0/0/0/0
  after overlap-resolver trimmed 18; numeric 0/1,944). MASTER candidates 98→124 (+26, additive,
  collect-only). FOURTH naming-bug variant fixed: "(Hisai-han)"/"(Mori-han)" redundant parentheticals —
  both scripts now strip any trailing "(...han)" while keeping province quals like "(Kaga)" (they don't
  end in "han"). KNOWN cosmetic: 母里藩 + 森藩 both romanize to "Mori" (distinguished by JP in nav;
  province-disambiguation "(Izumo)"/"(Bungo)" is an unfixed future nicety).
- 2026-07-17: **batch F (30 pages, p101R→p118L) hit the 5-HOUR SESSION LIMIT mid-run** — 18 proposals
  completed but ALL 18 verifies + 12 proposes errored ("You've hit your session limit"). 0 applyable
  (a page needs BOTH halves). RECOVERED via `resumeFromRunId=wf_237b12aa-ea9` (task `whcqsicbb`): the
  18 proposals replayed from cache in seconds, verifies + remaining 12 pages ran fresh after reset.
  ⚠️ **Session limit is a SEPARATE constraint** from CPU/concurrency — a 30-page batch's ~5M+ tokens
  can exceed the remaining budget in a 5-hour window and error out the tail. Two mitigations: prefer
  `--batch=15` when the window may be near its cap, and if it errors mid-run, RESUME (don't re-run) —
  completed proposals are cached. resumeFromRunId worked across the limit-reset gap here.
- 2026-07-17: **batch E deployed → 338 @ hi60** (commit `694aa4e`). 15 pages (芝邨/椎谷/下妻/志筑/宍戸/
  七戸 + 弘前/姫路/彦根). QA clean (structural 0/0/0/0 after overlap-resolver trimmed 13 M/F+adjacent
  overlaps; numeric 0/1,614). MASTER candidates 89→98 (+9, additive; collect-only). Third naming bug
  fixed: `(domain)` parenthetical wasn't stripped (batch C = case, batch E = parens) — both apply +
  integrate now strip " domain"/" han"/"(domain)"/"(han)" while keeping real quals like "(Kaga)".
  Batch abandoned once at 30 (dense-page grind) → re-run at 15 with capped prompt = clean.
- 2026-07-11: prep complete (worklist + 647 images). Pilot (6 pages) applied → viewer at 188 pages.
- 2026-07-11: batches recovered-15 + A-30 applied → 233. Batch B-30 applied → 263. **Deployed 263 @ hi57.**
- 2026-07-11: batch C-30 applied → 293 (not yet deployed).
- 2026-07-17: **deployed 293 @ hi58** (commit `8086448`). Integrate renumbered 195 sequences and
  normalized 3 `domain_en` values; overlap resolver trimmed 1 box across 248 pages; crops regenerated
  (5,889, 0 skipped). Reconcile clean: 293 pages == 293 annotations == 293 crops-manifest entries,
  all images present, sequences contiguous 1–293.
  Fixed `hi_expand_integrate_pages.py`: for brand-new domains it picked the LONGEST `domain_en`
  variant, which promoted agent-written "Sakurai domain"/"Yunagaya han" over the bare name. All 98
  established domains use bare romanizations, so it now strips a trailing "domain"/"han" before
  picking (parenthetical qualifiers like "Kanazawa (Kaga)" still win, which is why longest-wins stays).
- 2026-07-17: batch D-30 (`lower_p075_left`→`lower_p089_right`, run `wf_dee4b1cd-88b`) COMPLETED —
  60/60 agents, 0 errors, 12.5M tokens, ~4.4h. Applied → **323 pages**. 696 boxes, 557 data rows,
  0 dropped, 2 verifier-`missed` added, 33 idents auto-renamed, 1 domain corrected.
  Two apply-script bugs found and fixed while applying batch D:
  - `domain_en` suffix strip was **case-sensitive** (`\b(Domain|Han)\b` with no `re.I`), which is the
    ROOT CAUSE of batch C's "Sakurai domain"/"Yunagaya han" — capitalised stripped, lowercase leaked.
    (`hi_expand_integrate_pages.py` now also strips it as a downstream net.)
  - when the verifier corrected `primary_domain_jp`, the page id + `domain_en` were still derived from
    the PROPOSER's `primary_domain_en` — i.e. the name of the domain it got WRONG. `lower_p078_right`
    would have shipped 峯岡藩 under id `mikusa_…` labelled "Mikusa". Now re-looked-up from MASTER by
    domain_jp (峯岡藩 → Mineoka); also stopped listing a page's own domain as its neighbour.
  QA sweep gained a `隊`-row exclusion: a 隊 row's `parsed` is a DERIVED headcount (unit count x a
  men-per-unit rate that often prints in a NEIGHBOURING column), so re-parsing its numeral is a
  category error — 二番大隊→240 and 豫備七小隊 同前→420 are CORRECT and were false positives.
  Batch D QA final: **structural 0/0/0/0, numeric 0/1,425 — CLEAN** (after the 2 dup-rect fixes).
  MASTER candidates re-collected: 54 → **89** (+35 from batch D), purely additive.
- 2026-07-17: **deployed 323 @ hi59** (commit `d10e8b3`). Integrate renumbered 30 sequences,
  domain_en normalized 0 (apply-script suffix fix held); overlap resolver 0 trims; crops 6,585/0
  skipped; reconcile clean (323==323==323). Live verified.
- 2026-07-17: batch E-30 launched (`lower_p090_left`→`lower_p108_right`), run `wf_a5794171-4a3`.

## ⚠️ DO NOT run `hi_viewer_clip_top_fixer.py` on agent-annotated (new) pages
It was written for the OLD snap-damaged pages, where the snap had placed an M/F box top too low
and cut off leading digits. Agent-annotated pages already have correct M/F tops. On them the
fixer FALSE-POSITIVES: it sees ink in the gap above an M/F box (the parent total's trailing 人
glyph, or the 内 marker) and extends the box up to swallow it. Caught 2026-07-11 — it "fixed"
152 boxes across 29 new pages; all were damage and were reverted from `.bak_cliptop`.
The overlap resolver IS safe to run on new pages (it only trims genuine overlaps).

## QA sweep (run after each batch — deterministic, no agent tokens)
**`PYTHONIOENCODING=utf-8 python outputs/scripts/hi_expand_qa_sweep.py [--only=pid,...] [--verbose]`**
(durable as of 2026-07-17 — earlier batches used an ad-hoc script that was not kept. It self-scopes
via `worklist_full.json` locations, never an id regex: the pre-expansion pages share the
`<domain>_<vol>_pNNN_<side>` id shape and would otherwise be swept in as "new".)

Three checks. The first two run over the applied expansion pages; the third (METADATA, added
2026-08-05) runs over EVERY viewer page, because both of its rules caught pre-existing live errors
on their first run. `SUMMARY ... -> CLEAN` covers structural + numeric + fascicle; book_page breaks
print separately as candidates against a baseline count.
1. **Structural**: box↔box overlap (IoU>6%), out-of-bounds vs the real image size, ident collisions
   after normField, and every master_extracts row matching a box ident.
2. **Numeric**: independently re-parse each `raw` kanji numeral and diff against the agent's
   `parsed`. Only rows with exactly ONE numeral run **and** an integer `parsed` are compared —
   otherwise it grabs the wrong number (e.g. `兵隊 十二小隊 人員五百七十六人` → 12 not 576;
   `僧（一向宗）五十三人` → the 一 in the sect name; `一葛八百箱` → the list marker 一).
3. **Metadata**: the running head's 第N must equal `table_number`; and `book_page` must increment by
   exactly 1 across adjacent half-leaves (pdf_page N right → N left → N+1 right).

**The parser is the hard part — knowing 廿=20 is necessary but NOT sufficient.** Three traps, all
of which produced false "disagreements" against correct agent data on 2026-07-17 before being fixed:
   - `廿二` = 22, not 20*10+2 = 202. A compound digit (拾/廿/卅) ADDS its follower.
   - …but track compound-ness with a flag, don't infer it from `current >= 10`, or `一〇二` (=102)
     breaks: its intermediate 10 is positional, not compound. (`〇`/`零` are real digits here.)
   - `十萬…` = 100,000. Keep the below-万 `section` separate from `total`, or 十 flushes early and
     萬 then multiplies it plus a phantom 1 → 110,000.
   `hi_expand_qa_sweep.py` handles all three and passes a 42-case unit set; reuse it rather than
   re-deriving. (Note: `phase_f_arithmetic_check_2026_05_28.py` carries the 廿二 and 十萬 bugs —
   don't copy its `parse_kanji` for new work.)

Result 2026-07-17 over all 105 applied new pages: structural 0/0/0/0; 1,145 unambiguous numerals
re-parsed, **0 disagreements**. (2026-07-11, first 75 pages: 0/0/0/0, 834 numerals, 0 disagreements.)
Known pre-existing (NOT from these batches): duplicate idents on some OLD officials pages
(nomura/wakayama/omigawa) where two domains share 知事/大参事 labels — cross-highlight picks the
first box. Worth a future cleanup.
