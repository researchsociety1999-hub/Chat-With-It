#!/usr/bin/env python3
from pathlib import Path

NEW_BLOCK = """/* Generation controls toggle */
.gen-toggle {
  display: inline-flex;
  align-items: center;
  gap: .4rem;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  min-height: 28px;
}
.gen-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.gen-toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 99px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  position: relative;
  transition: background .15s ease, border-color .15s ease;
  flex-shrink: 0;
}
.gen-toggle:hover .gen-toggle-track {
  border-color: var(--border-2);
}
.gen-toggle-track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform .15s ease;
}
.gen-toggle input:checked + .gen-toggle-track {
  background: var(--accent);
  border-color: var(--accent);
}
.gen-toggle input:checked + .gen-toggle-track::after {
  transform: translateX(16px);
}
.gen-toggle input:focus-visible + .gen-toggle-track {
  box-shadow: var(--focus-ring);
}
.gen-toggle-label {
  font-size: .72rem;
  font-weight: 700;
  color: var(--fg-muted);
  min-width: 1.5rem;
}
#genControlsPanel.hidden { display: none !important; }
@media (prefers-reduced-motion: reduce) {
  .gen-toggle-track,
  .gen-toggle-track::after { transition: none; }
}
html.high-contrast .gen-toggle-track {
  border: 2px solid var(--fg);
  background: #000;
}
html.high-contrast .gen-toggle input:checked + .gen-toggle-track {
  background: var(--accent);
  border-color: var(--fg);
}
html.high-contrast .gen-toggle-track::after {
  background: var(--fg);
  box-shadow: none;
}
"""

def main() -> None:
    p = Path("css/app.css")
    text = p.read_text(encoding="utf-8")
    start = text.find("/* Generation controls toggle */")
    if start < 0:
        raise SystemExit("toggle CSS block not found")
    p.write_text(text[:start] + NEW_BLOCK, encoding="utf-8")
    print("css updated", p.stat().st_size)

    sw = Path("sw.js")
    swt = sw.read_text(encoding="utf-8")
    for old, new in (("chatwithit-v18", "chatwithit-v19"), ("chatwithit-v17", "chatwithit-v19")):
        if old in swt:
            sw.write_text(swt.replace(old, new), encoding="utf-8")
            print("sw", old, "->", new)
            break
    else:
        print("sw unchanged")

if __name__ == "__main__":
    main()
