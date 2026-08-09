# Monitor Lifecycle — Reset on Clear DTC

## Overview

When DTCs are cleared (Mode 04), emissions monitors transition to "pending/incomplete" state and gradually complete as PIDs are read, simulating a real ECU drive cycle.

## Behavior

### Clear DTC (Mode 04)

- MIL turns off
- DTC count resets to 0
- All 11 monitors transition to `completed: false`
- `supported` values remain unchanged

### Drive Cycle Simulation

| Trigger | Effect |
|---|---|
| 3 `getLiveData()` calls | Common tests (misfire, fuelSystem, comprehensiveComponent) → completed |
| 1 diagnosis run (`readPid` calls) | Engine-specific monitors (remaining 8) → completed |

### Lifecycle

```
clearDtcCodes() → [ALL PENDING]
    ↓
3× getLiveData() → [COMMON TESTS COMPLETE, SPECIFIC PENDING]  
    ↓
1× runDiagnosis() → [ALL COMPLETE]
```

### Scope

- Per-scenario, in-memory only (resets on API restart)
- Applies to both Docker emulator mode and TCP direct mode

## API

No new endpoints. Existing endpoints behavior changes:

- `POST /api/clear-dtc` → additionally resets monitor lifecycle
- `GET /api/vehicle-status` → returns lifecycle-modified status when reset is active
- `GET /api/live-data` → increments drive cycle counter
- `POST /api/diagnosis` → increments drive cycle counter
