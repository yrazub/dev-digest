# HW3 video — Smart Diff demo (1–3 min)

What the course task asks of the video, how the take is prepared, and the script that records it.

## What the task requires

- A demo video of **1–3 minutes**, linked from the pull request; the scenario is the task's
  "How to check" block.
- **Every P1 criterion must be visible in the video.** P2 and P3 do not block acceptance.
- The last step is spoken or written: one sentence on why grouping calls no model.

| Step of the task | P1 criterion it shows | In the take |
|---|---|---|
| Open the test PR → Files changed: five groups with labels and counts, docs and boilerplate collapsed | groups in order with label and file count; docs and boilerplate collapsed | the opening frames and a slow scroll over all five headers |
| Expand boilerplate: the lock file is inside | the lock file is boilerplate | the click on Boilerplate |
| Run review, wait, return to Files changed: the counter on the group header, the dot on the file card | counter of files with findings; dot on the file card | Run Review ends segment A; the wait is cut; segment B returns to Files changed |
| Expand the file with the finding: the comment under its line. Then Original order and back | finding under the line with severity, title, rationale; the Original order switch | the scroll to the finding, then the two clicks |
| One sentence: why grouping calls no model | — | the closing caption |

The seventh P1 criterion, an open pull request with a description, is PR #14 itself.

## Before recording

1. The dev stack is up on `:3000` / `:3001` with a model key configured: the take runs one real
   review.
2. **The demo PR must have no review yet**, or the opening frames already show marks. Use a
   demo PR that was never reviewed, or delete its runs first (Agent runs → Timeline → the trash
   icon of each run).
3. The demo PR needs a file of every role and a bug a reviewer finds in a core file. PR #13
   (branch `test/smart-diff-demo`) is built for this: `client/src/lib/format/duration.ts` has
   five deliberate bugs, and the General Reviewer on `deepseek/deepseek-v4-flash` found all of
   them in about 40 seconds on 2026-10-07.
4. `agent-browser` and an `ffmpeg` with `libx264` and `libass` are on `PATH`; `agent-browser
   doctor` must pass. Without Homebrew, install the npm package `ffmpeg-static` in a scratch
   folder and put its binary on `PATH`.

## Things to know

- **The finding can sit one line below the bug.** The model reports the line numbers itself and
  was one line low on four of the five bugs in PR #13. The card is drawn where the model says;
  this is the reviewer's accuracy, not the diff view.
- The app starts in the dark theme; the script sets the light one, as in the PR screenshots.
  `THEME=dark` keeps the default.
- Captions are burned in, so the video needs no voice-over. To narrate instead, drop the
  `subtitles` filter and read the caption lines aloud.
- After the take the demo PR has one more run. Nothing else changes.

## Recording

Save the script below as `record-hw3.sh`, then:

```sh
# the real take: one review by the General Reviewer on demo PR #13 of the fork
REPO=<repo uuid> PR=13 FINDING_FILE=client/src/lib/format/duration.ts bash record-hw3.sh

# a dry run on the seeded PR: no review, no model call
REPO=<seeded repo uuid> PR=482 SKIP_REVIEW=1 FINDING_FILE=src/config.ts bash record-hw3.sh
```

`<repo uuid>` is the id in the app's URL, `/repos/<repo uuid>/pulls`. The dry run was recorded on
2026-10-07: 34 seconds, 2 MB. With the Run Review step the take is about 40 seconds.

```bash
#!/usr/bin/env bash
# Records the HW3 Smart Diff demo with agent-browser against the running dev stack.
#
#   REPO=<repo uuid> PR=<number> ./record-hw3.sh          # full take, runs one review
#   REPO=<repo uuid> PR=<number> SKIP_REVIEW=1 ./record-hw3.sh   # dry run, no model call
#
# Needs: the dev stack on :3000/:3001, agent-browser, ffmpeg (libx264 + libass) on PATH.
# The wait for the review is left out of the video: one segment before it, one after.
set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
API="${API:-http://localhost:3001}"
REPO="${REPO:?repo uuid}"
PR="${PR:?PR number}"
AGENT="${AGENT:-General Reviewer}"
FINDING_FILE="${FINDING_FILE:-}"          # path whose finding the take scrolls to; empty = no scroll
OUT="${OUT:-$PWD/hw3-smart-diff-demo.mp4}"
SKIP_REVIEW="${SKIP_REVIEW:-0}"
THEME="${THEME:-light}"                 # light matches the PR screenshots
WORK="$(mktemp -d)"
ab() { agent-browser --session hw3 "$@"; }
pause() { ab wait "$1" >/dev/null; }
dur() { { ffmpeg -hide_banner -i "$1" 2>&1 || true; } | sed -n 's/.*Duration: \([0-9:.]*\),.*/\1/p' | awk -F: '{ print $1*3600 + $2*60 + $3 }'; }

PR_ID="$(curl -s "$API/repos/$REPO/pulls" | python3 -c "import sys,json; print([p['id'] for p in json.load(sys.stdin) if p['number']==int('$PR')][0])")"
URL="$BASE/repos/$REPO/pulls/$PR?tab=diff"

ab close >/dev/null 2>&1 || true
ab open about:blank >/dev/null
ab set viewport 1440 900 >/dev/null
ab open "$BASE/" >/dev/null
ab eval "localStorage.setItem('dd-theme','$THEME')" >/dev/null   # the app defaults to dark
ab open "$URL" >/dev/null
ab wait --text "The substance of the change" >/dev/null
pause 800

# ---- segment A: before the review ------------------------------------------------------
ab record start "$WORK/a.mp4" --cursor >/dev/null
pause 2500                                   # the header: label, totals, order switch, first group
ab eval "(() => { const m=document.querySelector('main'); m.scrollTo({top:m.scrollHeight,behavior:'smooth'}); })()" >/dev/null
pause 3500                                   # all five groups; docs + boilerplate collapsed
ab find role button click --name "Boilerplate" >/dev/null
pause 3500                                   # the lock file is inside
ab eval "document.querySelector('main').scrollTo({top:0,behavior:'smooth'})" >/dev/null
pause 1200
if [ "$SKIP_REVIEW" != "1" ]; then
  ab find role button click --name "Run Review" >/dev/null
  pause 1200
  ab find text "$AGENT" click >/dev/null
  pause 2500                                 # the page moves to Agent runs, the run starts
fi
ab record stop >/dev/null

if [ "$SKIP_REVIEW" != "1" ]; then
  echo "waiting for the review to finish…"
  for _ in $(seq 1 120); do
    n="$(curl -s "$API/pulls/$PR_ID/runs/active" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")"
    [ "$n" = "0" ] && break
    sleep 3
  done
  sleep 5                                    # let the page pick the result up
fi

# ---- segment B: after the review -------------------------------------------------------
ab record start "$WORK/b.mp4" --cursor >/dev/null
pause 2000
ab find role button click --name "Files changed" >/dev/null
ab wait --text "The substance of the change" >/dev/null
pause 4500                                   # the mark on the group header, the dot on the file
if [ -n "$FINDING_FILE" ]; then
  ab eval "(() => { const el=[...document.querySelectorAll('span.mono')].find(s=>s.textContent.trim()==='$FINDING_FILE'); const tag=el && el.closest('div').parentElement.querySelector('[data-finding-id]'); (tag||el).scrollIntoView({behavior:'smooth',block:'center'}); })()" >/dev/null
  pause 6000                                 # the finding under its line: stripe, tag, card
fi
ab eval "document.querySelector('main').scrollTo({top:0,behavior:'smooth'})" >/dev/null
pause 1500
ab find role button click --name "Original order" >/dev/null
pause 3500
ab find role button click --name "Smart order" >/dev/null
pause 4500                                   # closing frame: the caption about no model call
ab record stop >/dev/null
ab close >/dev/null 2>&1 || true

# ---- join the two segments and burn the captions in ------------------------------------
A="$(dur "$WORK/a.mp4")"; B="$(dur "$WORK/b.mp4")"
ts() { awk -v s="$1" 'BEGIN { h=int(s/3600); m=int((s-h*3600)/60); x=s-h*3600-m*60; printf "%02d:%02d:%06.3f", h, m, x }' | tr . ,; }
cap() { printf '%s\n%s --> %s\n%s\n\n' "$1" "$(ts "$2")" "$(ts "$3")" "$4"; }
{
  cap 1 0.3 5.6 "Files changed groups the PR's files by role: core, tests, wiring, docs, boilerplate."
  cap 2 5.9 "$(awk -v a="$A" 'BEGIN{print (a<10.4)?a-0.2:10.4}')" "Docs and boilerplate start collapsed. The lock file is in boilerplate."
  if [ "$SKIP_REVIEW" != "1" ]; then
    cap 3 "$(awk -v a="$A" 'BEGIN{print a-3.6}')" "$(awk -v a="$A" 'BEGIN{print a-0.2}')" "Run Review. The wait for the model is cut from this video."
  fi
  cap 4 "$(awk -v a="$A" 'BEGIN{print a+2.2}')" "$(awk -v a="$A" 'BEGIN{print a+6.6}')" "After the review: the group header counts files with findings, the file card gets a dot."
  if [ -n "$FINDING_FILE" ]; then
    cap 5 "$(awk -v a="$A" 'BEGIN{print a+7.0}')" "$(awk -v a="$A" 'BEGIN{print a+13.2}')" "The finding sits under its line: severity, title, rationale, Accept and Dismiss."
  fi
  cap 6 "$(awk -v a="$A" -v b="$B" 'BEGIN{print a+b-8.3}')" "$(awk -v a="$A" -v b="$B" 'BEGIN{print a+b-4.9}')" "Original order returns the list GitHub gives."
  cap 7 "$(awk -v a="$A" -v b="$B" 'BEGIN{print a+b-4.6}')" "$(awk -v a="$A" -v b="$B" 'BEGIN{print a+b-0.2}')" "Grouping calls no model: a file's role is a fixed rule over its path."
} > "$WORK/captions.srt"

printf "file '%s'\nfile '%s'\n" "$WORK/a.mp4" "$WORK/b.mp4" > "$WORK/list.txt"
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i "$WORK/list.txt" -c copy "$WORK/joined.mp4"
( cd "$WORK" && ffmpeg -hide_banner -loglevel error -y -i joined.mp4 \
    -vf "subtitles=captions.srt:force_style='FontSize=11,BorderStyle=3,Outline=2,Shadow=0,BackColour=&H80000000,MarginV=18'" \
    -c:v libx264 -pix_fmt yuv420p -crf 20 "$OUT" )
echo "segments: A=${A}s B=${B}s"
echo "saved: $OUT ($(dur "$OUT")s, $(du -h "$OUT" | cut -f1))"
```

## After recording

1. Watch the file once: five headers, the lock file, the mark and the dot, the card under a
   line, both orders, the closing caption.
2. Upload it (the course form takes a file up to 150 MB or a link) and replace
   "Demo video: _to be added_" in the description of PR #14 with the link.
