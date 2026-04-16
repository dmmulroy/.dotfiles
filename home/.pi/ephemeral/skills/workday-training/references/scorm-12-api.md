# SCORM 1.2 Runtime Data Model Reference

## LMS API Methods

The SCORM 1.2 API object is found at `window.API` (searched up the frame hierarchy).

| Method | Description |
|--------|-------------|
| `LMSInitialize("")` | Start a SCORM session. Usually called automatically by the content. |
| `LMSFinish("")` | End the SCORM session. Must be called after `LMSCommit`. |
| `LMSGetValue(element)` | Read a data model element. |
| `LMSSetValue(element, value)` | Write a data model element. |
| `LMSCommit("")` | Flush pending data to the LMS server. Call before `LMSFinish`. |
| `LMSGetLastError()` | Get the error code from the last API call. |
| `LMSGetErrorString(code)` | Get human-readable error message for a code. |
| `LMSGetDiagnostic(code)` | Get detailed diagnostic info for an error. |

**All methods take and return strings.** Even numeric values are strings.

## Core Data Model Elements

### Session & Status

| Element | Type | Description |
|---------|------|-------------|
| `cmi.core.lesson_status` | `"passed"`, `"completed"`, `"failed"`, `"incomplete"`, `"browsed"`, `"not attempted"` | Lesson completion status. Set to `"passed"` for full credit. |
| `cmi.core.lesson_mode` | `"browse"`, `"normal"`, `"review"` | Read-only. How the lesson was launched. |
| `cmi.core.entry` | `"ab-initio"`, `"resume"`, `""` | Read-only. Whether this is a first attempt or resume. |
| `cmi.core.exit` | `"time-out"`, `"suspend"`, `"logout"`, `""` | How the learner exited. Set before `LMSFinish`. |
| `cmi.core.credit` | `"credit"`, `"no-credit"` | Read-only. Whether this attempt counts for credit. |

### Score

| Element | Type | Description |
|---------|------|-------------|
| `cmi.core.score.raw` | `"0"` to `"100"` (string) | The learner's score. |
| `cmi.core.score.min` | `"0"` (string) | Minimum possible score. |
| `cmi.core.score.max` | `"100"` (string) | Maximum possible score. |

### Time

| Element | Type | Description |
|---------|------|-------------|
| `cmi.core.session_time` | `"HHHH:MM:SS.S"` | Time spent in current session. Set before `LMSFinish`. Example: `"0001:30:00.0"` = 1 hour 30 minutes. |
| `cmi.core.total_time` | `"HHHH:MM:SS.S"` | Read-only. Cumulative time across all sessions. |

### Location & Suspend Data

| Element | Type | Description |
|---------|------|-------------|
| `cmi.core.lesson_location` | String (max 255 chars) | Bookmark for resume. Content-defined format. |
| `cmi.suspend_data` | String (max 4096 chars) | Arbitrary content state for resume. Often JSON or delimited data. |
| `cmi.launch_data` | String | Read-only. Data provided by the LMS at launch. |

### Learner Info

| Element | Type | Description |
|---------|------|-------------|
| `cmi.core.student_id` | String | Read-only. Learner identifier. |
| `cmi.core.student_name` | String | Read-only. Learner name (usually `"Last, First"`). |

### Interactions (Quiz Questions)

Used for detailed quiz reporting. Each interaction is indexed: `cmi.interactions.0.*`, `cmi.interactions.1.*`, etc.

| Element | Type | Description |
|---------|------|-------------|
| `cmi.interactions._count` | Integer string | Read-only. Number of interactions recorded. |
| `cmi.interactions.N.id` | String | Unique identifier for the interaction. |
| `cmi.interactions.N.type` | `"true-false"`, `"choice"`, `"fill-in"`, `"matching"`, `"performance"`, `"sequencing"`, `"likert"`, `"numeric"` | Type of interaction. |
| `cmi.interactions.N.student_response` | String | What the learner answered. |
| `cmi.interactions.N.correct_responses.0.pattern` | String | The correct answer. |
| `cmi.interactions.N.result` | `"correct"`, `"wrong"`, `"unanticipated"`, `"neutral"`, or numeric | Result of the interaction. |
| `cmi.interactions.N.weighting` | Numeric string | Weight of this interaction in scoring. |
| `cmi.interactions.N.latency` | `"HHHH:MM:SS.S"` | Time spent on this interaction. |
| `cmi.interactions.N.time` | `"HH:MM:SS"` | Time the interaction was completed. |

### Objectives

| Element | Type | Description |
|---------|------|-------------|
| `cmi.objectives._count` | Integer string | Read-only. Number of objectives. |
| `cmi.objectives.N.id` | String | Objective identifier. |
| `cmi.objectives.N.score.raw` | Numeric string | Score for this objective. |
| `cmi.objectives.N.status` | `"passed"`, `"completed"`, `"failed"`, `"incomplete"`, `"browsed"`, `"not attempted"` | Status of this objective. |

## Error Codes

| Code | Meaning |
|------|---------|
| `"0"` | No error |
| `"101"` | General exception |
| `"201"` | Invalid argument error |
| `"202"` | Element cannot have children |
| `"203"` | Element not an array — cannot have count |
| `"301"` | Not initialized (session not started) |
| `"401"` | Not implemented |
| `"402"` | Invalid set value — element is read-only |
| `"403"` | Element is write-only |
| `"404"` | Element is read-only |
| `"405"` | Incorrect data type |

## Minimum Viable Completion Script

The absolute minimum to mark a SCORM 1.2 lesson as passed with a perfect score:

```javascript
(() => {
  const api = window.API;
  api.LMSSetValue("cmi.core.score.raw", "100");
  api.LMSSetValue("cmi.core.score.min", "0");
  api.LMSSetValue("cmi.core.score.max", "100");
  api.LMSSetValue("cmi.core.lesson_status", "passed");
  api.LMSSetValue("cmi.core.session_time", "0001:30:00.0");
  api.LMSCommit("");
  api.LMSFinish("");
})()
```

## SCORM 2004 Differences (if encountered)

SCORM 2004 uses a different API object name and data model:

| SCORM 1.2 | SCORM 2004 |
|-----------|------------|
| `window.API` | `window.API_1484_11` |
| `LMSInitialize("")` | `Initialize("")` |
| `LMSFinish("")` | `Terminate("")` |
| `LMSGetValue(el)` | `GetValue(el)` |
| `LMSSetValue(el, val)` | `SetValue(el, val)` |
| `LMSCommit("")` | `Commit("")` |
| `cmi.core.lesson_status` | `cmi.completion_status` + `cmi.success_status` |
| `cmi.core.score.raw` | `cmi.score.raw` |
| `cmi.core.session_time` | `cmi.session_time` (ISO 8601 duration: `PT1H30M`) |

### SCORM 2004 Completion Script

```javascript
(() => {
  const api = window.API_1484_11;
  api.SetValue("cmi.score.raw", "100");
  api.SetValue("cmi.score.min", "0");
  api.SetValue("cmi.score.max", "100");
  api.SetValue("cmi.score.scaled", "1");
  api.SetValue("cmi.completion_status", "completed");
  api.SetValue("cmi.success_status", "passed");
  api.SetValue("cmi.session_time", "PT1H30M0S");
  api.Commit("");
  api.Terminate("");
})()
```
