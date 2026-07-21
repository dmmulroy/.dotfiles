---
name: workday-training
description: "Complete Workday learning courses, certifications, and compliance trainings — especially SCORM 1.2 modules (e.g. Traliant, Articulate Storyline). Connects to an existing Chromium-based browser via CDP and manipulates the SCORM LMS API directly to bypass slow UI interactions. Use when asked to complete trainings, certifications, or compliance courses on Workday."
---

# Workday Training Completion

Complete Workday learning courses efficiently by connecting to an existing browser session via CDP and manipulating the SCORM 1.2 LMS API directly rather than clicking through slides.

## Prerequisites

- `agent-browser` installed globally (`vp install -g agent-browser` or `npm install -g agent-browser`)
- A Chromium-based browser with the Workday session already authenticated
- The browser must have remote debugging enabled (via launch flag or built-in DevTools setting)

## Step 1: Connect to the Browser via CDP

Any Chromium-based browser exposes a CDP (Chrome DevTools Protocol) endpoint when remote debugging is enabled. The connection method depends on the browser.

### Generic approach

All Chromium-based browsers write a `DevToolsActivePort` file to their user data directory when remote debugging is active. It contains two lines: the port number and the WebSocket path.

```bash
PORT=$(head -1 "<browser-user-data-dir>/DevToolsActivePort")
GUID=$(tail -1 "<browser-user-data-dir>/DevToolsActivePort")
export CDP="ws://127.0.0.1:${PORT}${GUID}"
```

If the browser was launched with an explicit `--remote-debugging-port=<N>`:

```bash
agent-browser --cdp <N> tab          # port-based (works when HTTP discovery is available)
# or
export CDP="ws://127.0.0.1:<N>"      # WebSocket-based
```

### Browser-specific references

Each browser has different data directory paths and CDP quirks. See the appropriate reference:

- **Helium Browser** — [references/helium-browser.md](references/helium-browser.md) ⚠️ Has CDP quirks; read before connecting
- **Google Chrome** — [references/chrome-browser.md](references/chrome-browser.md)
- **Other Chromium forks** (Brave, Edge, Arc, Vivaldi, ungoogled-chromium) — [references/other-browsers.md](references/other-browsers.md)

### Verify Connection

```bash
agent-browser --cdp "$CDP" tab
```

This lists all open tabs. Find the Workday tab.

## Step 2: Navigate to the Course

### If the user provides a URL

```bash
agent-browser --cdp "$CDP" tab <N>  # Switch to Workday tab
agent-browser --cdp "$CDP" open "<course-url>"
```

### If already on the course page

```bash
agent-browser --cdp "$CDP" tab <N>
agent-browser --cdp "$CDP" screenshot /tmp/workday-course.png
```

Take a screenshot to verify the course page and understand the lesson structure (how many lessons, what types).

## Step 3: Identify Lesson Types

Workday courses consist of ordered lessons. Each lesson has a type visible in the sidebar:

| Type | Description | Completion Strategy |
|------|-------------|-------------------|
| **Media** | SCORM module (Traliant, Articulate Storyline, etc.) | SCORM API manipulation (see Step 4) |
| **External Link** | Opens a URL in a new tab | Click the link, return to course page |
| **Survey** | Feedback survey | Usually marked Optional; can be skipped |
| **Document** | View a document | Click to view, return |

Use `agent-browser --cdp "$CDP" snapshot -i` to get the interactive element tree and identify lesson links, "Next Lesson" buttons, etc.

## Step 4: Complete SCORM 1.2 Media Lessons

This is the core technique. SCORM 1.2 modules embed an iframe that communicates with a parent frame via the SCORM 1.2 API (`window.API`).

### 4a: Understand the Tab/Frame Structure

When a SCORM lesson loads, Workday creates an iframe architecture:

```
Tab N: Workday course page (*.myworkday.com)
  └── iframe: ScormEngineInterface (scorm engine wrapper)
        ├── window.API  ← SCORM 1.2 LMS API lives HERE
        └── iframe: Course content (Storyline/Traliant player)
              └── DS.playerGlobals (Articulate internals, if needed)
```

The SCORM API (`window.API`) is on the **ScormEngineInterface** tab/frame, NOT the main Workday tab and NOT the inner content iframe.

### 4b: Find the SCORM API Tab

After clicking into a Media lesson and waiting for it to load:

```bash
agent-browser --cdp "$CDP" tab
```

Look for a tab with "ScormEngineInterface" in the title or URL, or a tab whose URL contains `scormengine` or `rustici`. It may also appear as an untitled tab.

Switch to that tab and verify:

```bash
agent-browser --cdp "$CDP" tab <SCORM_TAB>
agent-browser --cdp "$CDP" eval "typeof window.API !== 'undefined' && typeof window.API.LMSGetValue === 'function'"
```

If this returns `true`, you found it.

### 4c: Check Current SCORM State

```bash
agent-browser --cdp "$CDP" eval '(() => {
  const api = window.API;
  return JSON.stringify({
    status: api.LMSGetValue("cmi.core.lesson_status"),
    score: api.LMSGetValue("cmi.core.score.raw"),
    location: api.LMSGetValue("cmi.core.lesson_location"),
    suspend: api.LMSGetValue("cmi.suspend_data"),
    time: api.LMSGetValue("cmi.core.total_time")
  }, null, 2);
})()'
```

### 4d: Set Completion and Score

```bash
agent-browser --cdp "$CDP" eval '(() => {
  const api = window.API;
  api.LMSSetValue("cmi.core.score.raw", "100");
  api.LMSSetValue("cmi.core.score.min", "0");
  api.LMSSetValue("cmi.core.score.max", "100");
  api.LMSSetValue("cmi.core.lesson_status", "passed");
  api.LMSSetValue("cmi.core.session_time", "0001:30:00.0");
  const commitResult = api.LMSCommit("");
  const finishResult = api.LMSFinish("");
  return JSON.stringify({ commitResult, finishResult });
})()'
```

Both `LMSCommit` and `LMSFinish` should return `"true"`.

**Critical:** You MUST call `LMSCommit("")` before `LMSFinish("")`. `LMSCommit` flushes the data to the LMS server. `LMSFinish` ends the session. Without `LMSCommit`, the score/status may not persist.

### 4e: Return to Course Page

Switch back to the Workday course tab and verify the lesson shows a green checkmark:

```bash
agent-browser --cdp "$CDP" tab <WORKDAY_TAB>
agent-browser --cdp "$CDP" screenshot /tmp/after-lesson.png
```

## Step 5: Complete External Link Lessons

These just require clicking the external link button:

```bash
agent-browser --cdp "$CDP" snapshot -i
# Find the "View External Link" button
agent-browser --cdp "$CDP" click @e<N>  # The "Leave Workday site: View External Link" button
```

Wait for the new tab to open, then switch back to the Workday tab. Workday registers completion when the link is clicked.

## Step 6: Handle Optional Lessons (Surveys)

When all required lessons are complete and you advance to an optional lesson, Workday shows a modal:

> **"All Required Lessons Completed"**
> "Continue to take optional lessons now or continue to complete course to skip optional lessons."

Click **"Continue to Complete"** to finish the course without doing optional lessons:

```bash
agent-browser --cdp "$CDP" snapshot -i
# Find "Continue to Complete" button
agent-browser --cdp "$CDP" click @e<N>
```

## Step 7: Verify Course Completion

The course completion page shows a trophy graphic and **"Course Completed!"** text. Take a final screenshot to confirm:

```bash
agent-browser --cdp "$CDP" screenshot /tmp/course-complete.png
```

## Troubleshooting

### SCORM API not found on any tab

The SCORM engine may load inside an iframe rather than a separate tab. Try evaluating on the main Workday tab with frame traversal:

```bash
agent-browser --cdp "$CDP" eval '(() => {
  for (let i = 0; i < window.frames.length; i++) {
    try {
      if (window.frames[i].API) return "Found API in frame " + i;
    } catch(e) { /* cross-origin */ }
  }
  return "API not found in any frame";
})()'
```

### LMSCommit returns "false"

The SCORM engine may require specific data fields. Check the error:

```bash
agent-browser --cdp "$CDP" eval "window.API.LMSGetLastError()"
agent-browser --cdp "$CDP" eval "window.API.LMSGetErrorString(window.API.LMSGetLastError())"
agent-browser --cdp "$CDP" eval "window.API.LMSGetDiagnostic(window.API.LMSGetLastError())"
```

### Session already finished

If `LMSFinish` was already called, the session is closed. You may need to reload the lesson to get a fresh SCORM session:

```bash
agent-browser --cdp "$CDP" tab <WORKDAY_TAB>
agent-browser --cdp "$CDP" reload
```

### Workday doesn't reflect completion

Workday polls for SCORM updates. After calling `LMSCommit` + `LMSFinish`, wait a few seconds and then reload or navigate away and back to the course page to see updated status.

### Articulate Storyline fast-forward (fallback)

If direct SCORM manipulation doesn't work (e.g., the LMS validates progress checkpoints), you can fast-forward Storyline's internal timeline on the content tab:

```bash
agent-browser --cdp "$CDP" eval '(() => {
  DS.animationClock.overrideClock(500);
  for (let i = 0; i < 400; i++) DS.animationClock.tick();
  return "Fast-forwarded timeline";
})()'
```

This is slower than direct SCORM API manipulation (still requires clicking "Next" per slide) but more reliable when the LMS validates progress.

## References

- [SCORM 1.2 API](references/scorm-12-api.md) — Complete data model, methods, error codes, and SCORM 2004 differences
- [Helium Browser CDP](references/helium-browser.md) — Connection quirks and DevToolsActivePort location
- [Google Chrome CDP](references/chrome-browser.md) — DevToolsActivePort paths per OS, launch flags
- [Other Chromium Browsers](references/other-browsers.md) — Brave, Edge, Arc, Vivaldi, ungoogled-chromium

## Quick Recipe

```bash
# 1. Connect (read the appropriate browser reference for your browser)
#    Generic pattern:
PORT=$(head -1 "<browser-data-dir>/DevToolsActivePort")
GUID=$(tail -1 "<browser-data-dir>/DevToolsActivePort")
export CDP="ws://127.0.0.1:${PORT}${GUID}"

# 2. List tabs, find Workday
agent-browser --cdp "$CDP" tab

# 3. For each Media lesson:
#    a. Click into the lesson ("Next Lesson" button or lesson link)
#    b. Wait for SCORM iframe to load (~3-5 seconds)
#    c. Find the SCORM engine tab (look for ScormEngineInterface)
#    d. Set score + status + commit + finish (Step 4d)
#    e. Return to course page, verify checkmark

# 4. For External Link lessons: click the link, return

# 5. When "All Required Lessons Completed" modal appears:
#    click "Continue to Complete"

# 6. Verify "Course Completed!" trophy screen
```
