# Flow Fixer report

- **File:** `fixtures/synthetic_burst.har`
- **Entries:** 5
- **Window:** ~0.1 min
- **Generate calls:** 4

## Outcome classes

- **OK:** 1
- **HARD_UNUSUAL:** 3

## Fan position pass rate

| pos | ok | total | pass % |
|----:|---:|------:|-------:|
| 0 | 1 | 1 | 100.0% |
| 1 | 0 | 1 | 0.0% |
| 2 | 0 | 1 | 0.0% |
| 3 | 0 | 1 | 0.0% |

## Notes

Synthetic fixture: one multi-output burst where only the first fire-order position succeeds — the UI fan-out × per-call scoring pattern in miniature.
