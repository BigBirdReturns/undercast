from pathlib import Path

TARGET = Path('.github/workflows/complete-doctor-who-cycle-002-v2.yml')

text = TARGET.read_text(encoding='utf-8')
before = (
    '          const refreshedTerminalState = `runNode("scripts/census-adapter.mjs", ["write"]);\n'
    'runNode("scripts/census-adapter.mjs", ["check"]);\n'
    'runNode("scripts/autopilot.mjs", ["sync", "--scope", "doctor-who", "--now", context.timestamps.final_at]);\n'
    'runNode("scripts/autopilot.mjs", ["validate"]);`;'
)
after = (
    '          const refreshedTerminalState = \'runNode("scripts/census-adapter.mjs", ["write"]);\\n'
    'runNode("scripts/census-adapter.mjs", ["check"]);\\n'
    'runNode("scripts/autopilot.mjs", ["sync", "--scope", "doctor-who", "--now", context.timestamps.final_at]);\\n'
    'runNode("scripts/autopilot.mjs", ["validate"]);\';'
)

count = text.count(before)
if count != 1:
    raise SystemExit(f'expected one malformed multiline serializer, found {count}')

text = text.replace(before, after)
if text.count(after) != 1:
    raise SystemExit('repaired serializer not present exactly once')
if 'const refreshedTerminalState = `runNode' in text:
    raise SystemExit('malformed template literal survived repair')

TARGET.write_text(text, encoding='utf-8')
print('repaired Gredd v2 terminal-state serializer')
