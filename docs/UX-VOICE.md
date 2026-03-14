# UX Voice and Status Semantics

## Voice
- Tone is operational, concise, and factual.
- Messages should state state-change + impact + next action when relevant.
- Avoid celebratory language; prefer clear status statements.

## Status colors
- `ok` (green): healthy, completed, active.
- `warn` (amber): waiting state, paused state, limited compatibility.
- `err` (red): failed, unavailable, or blocked.
- `accent` (blue/cyan): neutral telemetry and controls.

## Copy patterns
- Action toasts:
  - Success: `"Auto-sync resumed"`
  - Warning: `"Auto-sync paused"`
  - Error: include concrete failure cause from API.
- Job state labels:
  - `running`, `waiting_network`, `waiting_window`, `paused_service`, `failed`, `completed`.

## Density modes
- Compact mode hides low-signal details and keeps critical telemetry visible.
- Editor modes:
  - Basic: essential safety-first fields.
  - Advanced: reliability and scheduling controls.
  - Expert: raw arguments and generated command preview.
