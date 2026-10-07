# HW3 video — Smart Diff demo (1–3 min)

What the course task asks of the video, how the take is prepared, and the script that records it.

## What the task requires

- A demo video of **1–3 minutes**, linked from the pull request; the scenario is the task's
  "How to check" block.
- **Every P1 criterion must be visible in the video.** P2 and P3 do not block acceptance.
- The last step is spoken or written: one sentence on why grouping calls no model.

| Step of the task | P1 criterion it shows | In the take |
|---|---|---|
| Open the test PR → Files changed: five groups with labels and counts, docs and boilerplate collapsed | groups in order with label and file count; docs and boilerplate collapsed | the opening frame: the script collapses the open groups first, so all five headers fit in it |
| Expand boilerplate: the lock file is inside | the lock file is boilerplate | the click on Boilerplate |
| Run review, wait, return to Files changed: the counter on the group header, the dot on the file card | counter of files with findings; dot on the file card | Run Review, then straight back to Files changed, ends segment A; the wait is cut; segment B opens on the same page |
| Expand the file with the finding: the comment under its line. Then Original order and back | finding under the line with severity, title, rationale; the Original order switch | the scroll to the finding, then the two clicks |
| One sentence: why grouping calls no model | — | the closing caption |

The seventh P1 criterion, an open pull request with a description, is PR #14 itself.

The take also shows four things beyond P1, about twenty seconds in all: the marks appearing
without a reload (the page is not reloaded between the two segments), Dismiss, collapsing a card
to one line, and Hide comments hiding the cards while the stripes, tags and dots stay.

## Before recording

1. The dev stack is up on `:3000` / `:3001` with a model key configured: the take runs one real
   review.
2. **The demo PR must have no review yet**, or the opening frames already show marks. Use a
   demo PR that was never reviewed, or delete its runs first (Agent runs → Timeline → the trash
   icon of each run).
3. The demo PR needs a file of every role and a bug a reviewer finds in a core file. PR #13
   (branch `test/smart-diff-demo`) and PR #15 (`test/smart-diff-demo-video`, the same commit)
   are built for this: `client/src/lib/format/duration.ts` has five deliberate bugs, on lines
   18, 24, 30, 35 and 36, and the General Reviewer on `deepseek/deepseek-v4-flash` finds them in
   about 40 seconds. PR #15 is the one the video was recorded on.
4. `agent-browser` and an `ffmpeg` with `libx264` and `libass` are on `PATH`; `agent-browser
   doctor` must pass. Without Homebrew, install the npm package `ffmpeg-static` in a scratch
   folder and put its binary on `PATH`.

## Things to know

- **The finding usually sits a few lines away from the bug.** The review prompt carries the raw
  diff with no line numbers, so the model counts lines itself. Over six runs on this file on
  2026-10-07 it was 2–5 lines low nearly every time (13–15 for line 18, 27–29 for line 30); only
  one run put two findings on the exact lines. The card is drawn where the model says; this is
  the reviewer's accuracy, not the diff view, and it stays until the prompt numbers the lines.
  `GOOD_LINES` makes the script refuse a take in which no finding is on a real bug line; three
  such attempts in a row were refused, and the delivered video was recorded without it.
- The app starts in the dark theme; the script sets the light one, as in the PR screenshots.
  `THEME=dark` keeps the default.
- Captions are burned in, so the video needs no voice-over. To narrate instead, drop the
  `subtitles` filter and read the caption lines aloud.
- After the take the demo PR has one more run, and one of its findings is dismissed. To record
  again, delete that run first.

## Recording

Save the script below as `record-hw3.sh`, then:

```sh
# the real take: one review by the General Reviewer on demo PR #15 of the fork
REPO=<repo uuid> PR=15 FINDING_FILE=client/src/lib/format/duration.ts bash record-hw3.sh

# the same, but accept the take only when a finding is on a real bug line (exit 3 otherwise)
REPO=<repo uuid> PR=15 FINDING_FILE=client/src/lib/format/duration.ts GOOD_LINES=18,24,30,35,36 bash record-hw3.sh

# a dry run on the seeded PR: no review, no model call
REPO=<seeded repo uuid> PR=482 SKIP_REVIEW=1 FINDING_FILE=src/config.ts bash record-hw3.sh
```

`<repo uuid>` is the id in the app's URL, `/repos/<repo uuid>/pulls`. On 2026-10-07 the dry run
came to 45 seconds and the real take to 56 seconds, about 3 MB. The script also writes the
captions next to the video as an `.srt` file.

```bash
#!/usr/bin/env bash
# Records the HW3 Smart Diff demo with agent-browser against the running dev stack.
#
#   REPO=<repo uuid> PR=<number> FINDING_FILE=<path> ./record-hw3.sh                 # full take, runs one review
#   REPO=<repo uuid> PR=<number> FINDING_FILE=<path> SKIP_REVIEW=1 ./record-hw3.sh   # dry run, no model call
#
# Needs: the dev stack on :3000/:3001, agent-browser, ffmpeg (libx264 + libass) on PATH.
# The wait for the review is left out of the video: one segment before it, one after.
# The page is NOT reloaded between the segments, so the marks that appear are the live refresh.
#
# GOOD_LINES (optional, "18,24,30") lists the lines where the demo's bugs really are. The model
# reports line numbers itself and is often a few lines off; with GOOD_LINES the take focuses on
# a finding that landed on a listed line, and exits with status 3 when there is none, so that
# the caller can delete that run and record again.
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
API="${API:-http://localhost:3001}"
REPO="${REPO:?repo uuid}"
PR="${PR:?PR number}"
AGENT="${AGENT:-General Reviewer}"
FINDING_FILE="${FINDING_FILE:?path of the file whose finding the take scrolls to}"
GOOD_LINES="${GOOD_LINES:-}"
OUT="${OUT:-$PWD/hw3-smart-diff-demo.mp4}"
SKIP_REVIEW="${SKIP_REVIEW:-0}"
THEME="${THEME:-light}"                 # light matches the PR screenshots
WORK="$(mktemp -d)"
ab() { agent-browser --session hw3 "$@"; }
pause() { ab wait "$1" >/dev/null; }
js() { ab eval "$1" >/dev/null; }
now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }
dur() { { ffmpeg -hide_banner -i "$1" 2>&1 || true; } | sed -n 's/.*Duration: \([0-9:.]*\),.*/\1/p' | awk -F: '{ print $1*3600 + $2*60 + $3 }'; }

# Captions: `say "<text>"` opens a caption at the current moment of the current segment and
# closes the previous one. Times are kept per segment and shifted when the segments are joined.
CAPS="$WORK/caps.tsv"; : > "$CAPS"; SEG=a; T0=0
seg_start() { SEG="$1"; T0="$(now)"; }
say() { printf '%s\t%s\t%s\n' "$SEG" "$(awk -v n="$(now)" -v t="$T0" 'BEGIN{printf "%.2f", n-t}')" "$1" >> "$CAPS"; }

PR_ID="$(curl -s "$API/repos/$REPO/pulls" | python3 -c "import sys,json; print([p['id'] for p in json.load(sys.stdin) if p['number']==int('$PR')][0])")"
URL="$BASE/repos/$REPO/pulls/$PR?tab=diff"

ab close >/dev/null 2>&1 || true
ab open about:blank >/dev/null
ab set viewport 1440 900 >/dev/null
ab open "$BASE/" >/dev/null
js "localStorage.setItem('dd-theme','$THEME')"            # the app defaults to dark
ab open "$URL" >/dev/null
ab wait --text "The substance of the change" >/dev/null
# Collapse the open groups so that the first frame holds all five headers.
js "(() => { for (const b of document.querySelectorAll('button[aria-expanded=\"true\"]')) b.click(); document.querySelector('main').scrollTo(0,0); })()"
pause 800

# ---- segment A: before the review ------------------------------------------------------
ab record start "$WORK/a.mp4" --cursor >/dev/null
seg_start a
say "Files changed groups the PR's files by role: core, tests, wiring, docs, boilerplate. Each group shows its file count."
pause 5500
say "The lock file is in boilerplate, which starts collapsed like docs."
ab find role button click --name "Boilerplate" >/dev/null
pause 4000
say "Core comes first: the substance of the change."
ab find role button click --name "The substance of the change" >/dev/null
pause 3500
if [ "$SKIP_REVIEW" != "1" ]; then
  say "No review has run yet, so there are no marks. Run Review…"
  ab find role button click --name "Run Review" >/dev/null
  pause 1200
  ab find text "$AGENT" click >/dev/null
  pause 2000                                 # the page moves to Agent runs, the run starts
  say "…and straight back to Files changed. The wait for the model is cut here."
  ab find role button click --name "Files changed" >/dev/null
  ab wait --text "The substance of the change" >/dev/null
  pause 3000
fi
ab record stop >/dev/null

if [ "$SKIP_REVIEW" != "1" ]; then
  echo "waiting for the review to finish…"
  for _ in $(seq 1 120); do
    n="$(curl -s "$API/pulls/$PR_ID/runs/active" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")"
    [ "$n" = "0" ] && break
    sleep 3
  done
  sleep 8                                    # the page polls every 4 s and refreshes by itself
fi

# Pick the finding the take focuses on, and a second one to dismiss.
read -r FOCUS_ID OTHER_ID ACCURATE <<<"$(curl -s "$API/pulls/$PR_ID/reviews" | FILE="$FINDING_FILE" GOOD="$GOOD_LINES" python3 -c "
import os, sys, json
good = {int(x) for x in os.environ['GOOD'].split(',') if x.strip()}
rank = {'CRITICAL': 0, 'WARNING': 1, 'SUGGESTION': 2}
latest = {}
for rv in sorted(json.load(sys.stdin), key=lambda r: r['created_at']):
    latest[rv['agent_id']] = rv
fs = [f for rv in latest.values() for f in rv['findings'] if f['file'] == os.environ['FILE'] and not f['dismissed_at']]
fs.sort(key=lambda f: (f['start_line'] not in good, rank.get(f['severity'], 9), f['start_line']))
focus = fs[0] if fs else None
others = [f for f in fs[1:] if f['start_line'] != focus['start_line']] if focus else []
print(focus['id'] if focus else '-', others[0]['id'] if others else '-', int(bool(focus and (not good or focus['start_line'] in good))))
")"
echo "focus finding: $FOCUS_ID · second: $OTHER_ID · on a listed line: $ACCURATE"
if [ -n "$GOOD_LINES" ] && [ "$ACCURATE" != "1" ]; then
  echo "no finding landed on a listed line ($GOOD_LINES); not recording segment B" >&2
  ab close >/dev/null 2>&1 || true
  exit 3
fi
card() { printf "document.querySelector('[data-finding-id=\"%s\"]')" "$1"; }

# ---- segment B: after the review, same page, no reload ----------------------------------
ab record start "$WORK/b.mp4" --cursor >/dev/null
seg_start b
say "The run ended and the marks appeared without a reload: files with findings on the group, a dot on the file."
pause 5000
js "(() => { const c=$(card "$FOCUS_ID"); c && c.scrollIntoView({behavior:'smooth',block:'center'}); })()"
pause 1200
say "The finding sits under its line: a stripe, a severity tag, the title and the rationale."
pause 6000
say "A click on a card's header collapses it to one line."
js "(() => { const c=$(card "$FOCUS_ID"); c && c.firstElementChild.click(); })()"
pause 3500
if [ "$SKIP_REVIEW" != "1" ] && [ "$OTHER_ID" != "-" ]; then   # a dry run leaves the seeded findings as they are
  js "(() => { const c=$(card "$OTHER_ID"); c && c.scrollIntoView({behavior:'smooth',block:'center'}); })()"
  pause 1500
  say "Dismiss mutes the card, and a dismissed finding no longer counts."
  js "(() => { const c=$(card "$OTHER_ID"); const b=c && [...c.querySelectorAll('button')].find(x=>x.innerText.trim()==='Dismiss'); b && b.click(); })()"
  pause 4000
fi
say "Hide comments hides the cards. The stripes, tags and dots stay."
js "(() => { const b=[...document.querySelectorAll('button')].find(x=>/^Hide comments/.test(x.innerText.trim())); b && b.click(); })()"
pause 400
js "(() => { const el=[...document.querySelectorAll('span.mono')].find(s=>s.textContent.trim()==='$FINDING_FILE'); const body=el && el.parentElement.nextElementSibling; (body||el).scrollIntoView({behavior:'smooth',block:'center'}); })()"
pause 4500
js "(() => { const b=[...document.querySelectorAll('button')].find(x=>/^Show comments/.test(x.innerText.trim())); b && b.click(); })()"
pause 1200
js "document.querySelector('main').scrollTo({top:0,behavior:'smooth'})"
pause 1500
say "Original order returns the list GitHub gives."
ab find role button click --name "Original order" >/dev/null
pause 3500
say "Grouping calls no model: a file's role is a fixed rule over its path."
ab find role button click --name "Smart order" >/dev/null
pause 5000
ab record stop >/dev/null
ab close >/dev/null 2>&1 || true

# ---- join the two segments and burn the captions in ------------------------------------
A="$(dur "$WORK/a.mp4")"; B="$(dur "$WORK/b.mp4")"
python3 - "$CAPS" "$A" "$B" > "$WORK/captions.srt" <<'PY'
import sys
rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1]) if l.strip()]
a, b = float(sys.argv[2]), float(sys.argv[3])
caps = [((float(t) + (a if seg == "b" else 0.0)), seg, text) for seg, t, text in rows]
def ts(s):
    h = int(s // 3600); m = int((s % 3600) // 60); x = s - h * 3600 - m * 60
    return f"{h:02d}:{m:02d}:{x:06.3f}".replace(".", ",")
for i, (start, seg, text) in enumerate(caps):
    seg_end = a if seg == "a" else a + b
    nxt = caps[i + 1][0] if i + 1 < len(caps) and caps[i + 1][1] == seg else seg_end
    end = max(start + 1.0, min(nxt, seg_end) - 0.15)
    print(f"{i + 1}\n{ts(start + 0.1)} --> {ts(end)}\n{text}\n")
PY

printf "file '%s'\nfile '%s'\n" "$WORK/a.mp4" "$WORK/b.mp4" > "$WORK/list.txt"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$WORK/list.txt" -c copy "$WORK/joined.mp4"
( cd "$WORK" && ffmpeg -hide_banner -loglevel error -y -i joined.mp4 \
    -vf "subtitles=captions.srt:force_style='FontSize=11,BorderStyle=3,Outline=2,Shadow=0,BackColour=&H80000000,MarginV=18'" \
    -c:v libx264 -pix_fmt yuv420p -crf 20 "$OUT" )
cp "$WORK/captions.srt" "${OUT%.mp4}.srt"
echo "segments: A=${A}s B=${B}s"
echo "saved: $OUT ($(dur "$OUT")s, $(du -h "$OUT" | cut -f1))"
```

## After recording

1. Watch the file once: five headers, the lock file, the mark and the dot, the card under a
   line, both orders, the closing caption.
2. Upload it (the course form takes a file up to 150 MB or a link) and replace
   "Demo video: _to be added_" in the description of PR #14 with the link.
