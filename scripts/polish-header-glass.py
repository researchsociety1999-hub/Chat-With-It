#!/usr/bin/env python3
"""Glassmorphic rounded header action icons."""
from pathlib import Path

MARKER = "/* Header actions — glassmorphism */"
BLOCK = '''/* Header actions — glassmorphism */
.chat-header {
  background: rgba(255, 255, 255, 0.04);
  -webkit-backdrop-filter: blur(20px) saturate(1.35);
  backdrop-filter: blur(20px) saturate(1.35);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.28rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  backdrop-filter: blur(16px) saturate(1.4);
  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.header-actions > .btn,
.header-actions > .dropdown > .btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  padding: 0;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.06);
  color: var(--fg-muted);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
}

.header-actions > .btn:hover,
.header-actions > .dropdown > .btn:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--fg);
  transform: translateY(-1px);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.header-actions > .btn:active,
.header-actions > .dropdown > .btn:active {
  transform: translateY(0) scale(0.96);
}

.header-actions > .btn:focus-visible,
.header-actions > .dropdown > .btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

/* Hide text labels inside the glass pill — icons only */
.header-actions .btn-ghost span,
.header-actions .btn-sm span {
  display: none;
}

/* Reset stays danger-tinted glass */
.header-actions > .btn-danger,
.header-actions > #resetBtn {
  border-color: rgba(239, 68, 68, 0.35);
  color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}
.header-actions > .btn-danger:hover,
.header-actions > #resetBtn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.55);
  color: var(--danger);
}

/* Dropdown menus still need non-circular trigger spacing */
.header-actions .dropdown {
  position: relative;
}

@media (max-width: 640px) {
  .header-actions {
    gap: 0.22rem;
    padding: 0.22rem;
  }
  .header-actions > .btn,
  .header-actions > .dropdown > .btn {
    width: 34px;
    height: 34px;
    min-width: 34px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .header-actions > .btn,
  .header-actions > .dropdown > .btn {
    transition: none;
  }
}

/* Light theme: slightly stronger glass so icons stay readable */
html[data-theme="light"] .header-actions {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow:
    0 6px 18px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}
html[data-theme="light"] .header-actions > .btn,
html[data-theme="light"] .header-actions > .dropdown > .btn {
  background: rgba(255, 255, 255, 0.55);
  border-color: rgba(0, 0, 0, 0.08);
  color: var(--fg-muted);
}
html[data-theme="light"] .header-actions > .btn:hover,
html[data-theme="light"] .header-actions > .dropdown > .btn:hover {
  background: rgba(255, 255, 255, 0.85);
  color: var(--fg);
}
'''

def main() -> None:
    css = Path("css/app.css")
    text = css.read_text(encoding="utf-8")
    if MARKER in text:
        start = text.find(MARKER)
        # replace existing block through end if it was appended last
        # keep anything after a following known section unlikely — block is end-appended
        text = text[:start]
    css.write_text(text.rstrip() + "\n\n" + BLOCK, encoding="utf-8")
    print("css ok", css.stat().st_size)

    sw = Path("sw.js")
    swt = sw.read_text(encoding="utf-8")
    for old, new in (
        ("chatwithit-v19", "chatwithit-v20"),
        ("chatwithit-v18", "chatwithit-v20"),
        ("chatwithit-v17", "chatwithit-v20"),
    ):
        if old in swt:
            sw.write_text(swt.replace(old, new), encoding="utf-8")
            print("sw", old, "->", new)
            break
    else:
        print("sw unchanged")

if __name__ == "__main__":
    main()
