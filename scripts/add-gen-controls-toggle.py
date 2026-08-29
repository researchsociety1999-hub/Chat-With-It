#!/usr/bin/env python3
"""Patch ChatWithIt to add On/Off toggle for temperature and max tokens."""
from pathlib import Path


def main() -> None:
    # --- index.html ---
    html = Path("index.html")
    h = html.read_text(encoding="utf-8")
    old = (
        '      <div class="card">\n'
        '        <button class="card-title sidebar-section-toggle" data-icon="\u2699\ufe0f" title="Generation" aria-label="Open Generation settings" type="button">Generation</button>\n'
        '        <div class="row" style="justify-content:space-between;font-size:.8rem"><label for="tempSlider">Temperature</label><span id="tempVal" style="font-weight:700">0.7</span></div>\n'
        '        <input id="tempSlider" type="range" min="0" max="2" step="0.1" value="0.7" aria-label="Temperature">\n'
        '        <div class="row" style="justify-content:space-between;font-size:.8rem"><label for="maxTokensSlider">Max tokens</label><span id="maxTokensVal" style="font-weight:700">1,024</span></div>\n'
        '        <input id="maxTokensSlider" type="range" min="128" max="8192" step="128" value="1024" aria-label="Max tokens">\n'
        "      </div>"
    )
    # Match whatever emoji is in the file for Generation button
    import re

    pat = re.compile(
        r'      <div class="card">\n'
        r'        <button class="card-title sidebar-section-toggle" data-icon="[^"]*" title="Generation" aria-label="Open Generation settings" type="button">Generation</button>\n'
        r'        <div class="row" style="justify-content:space-between;font-size:\.8rem"><label for="tempSlider">Temperature</label><span id="tempVal" style="font-weight:700">0\.7</span></div>\n'
        r'        <input id="tempSlider" type="range" min="0" max="2" step="0\.1" value="0\.7" aria-label="Temperature">\n'
        r'        <div class="row" style="justify-content:space-between;font-size:\.8rem"><label for="maxTokensSlider">Max tokens</label><span id="maxTokensVal" style="font-weight:700">1,024</span></div>\n'
        r'        <input id="maxTokensSlider" type="range" min="128" max="8192" step="128" value="1024" aria-label="Max tokens">\n'
        r'      </div>',
        re.M,
    )
    new = '''      <div class="card">
        <div class="sidebar-card-heading" style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">
          <button class="card-title sidebar-section-toggle" data-icon="\u2699\ufe0f" title="Generation" aria-label="Open Generation settings" type="button" style="margin:0">Generation</button>
          <label class="gen-toggle" title="Use temperature and max tokens">
            <input type="checkbox" id="genControlsToggle" checked aria-label="Enable generation controls">
            <span class="gen-toggle-track" aria-hidden="true"></span>
            <span class="gen-toggle-label">On</span>
          </label>
        </div>
        <div id="genControlsPanel">
          <div class="row" style="justify-content:space-between;font-size:.8rem"><label for="tempSlider">Temperature</label><span id="tempVal" style="font-weight:700">0.7</span></div>
          <input id="tempSlider" type="range" min="0" max="2" step="0.1" value="0.7" aria-label="Temperature">
          <div class="row" style="justify-content:space-between;font-size:.8rem"><label for="maxTokensSlider">Max tokens</label><span id="maxTokensVal" style="font-weight:700">1,024</span></div>
          <input id="maxTokensSlider" type="range" min="128" max="8192" step="128" value="1024" aria-label="Max tokens">
        </div>
        <p id="genControlsOffHint" class="muted hidden" style="font-size:.72rem;margin:0">Provider defaults (temperature / max tokens not sent).</p>
      </div>'''
    h2, n = pat.subn(new, h, count=1)
    if n != 1:
        raise SystemExit(f"index.html generation block not found (matches={n})")
    html.write_text(h2, encoding="utf-8")
    print("index.html ok")

    # --- state.js ---
    st = Path("js/state.js")
    s = st.read_text(encoding="utf-8")
    if "generationControlsEnabled" not in s:
        s = s.replace(
            "  temperature: 0.7,\n  maxTokens: 1024,\n",
            "  temperature: 0.7,\n  maxTokens: 1024,\n  generationControlsEnabled: true,\n",
            1,
        )
        s = s.replace(
            "        if (parsed.maxTokens)                  this.maxTokens            = parsed.maxTokens;\n",
            "        if (parsed.maxTokens)                  this.maxTokens            = parsed.maxTokens;\n"
            "        if (parsed.generationControlsEnabled !== undefined) this.generationControlsEnabled = !!parsed.generationControlsEnabled;\n",
            1,
        )
        s = s.replace(
            "        maxTokens:            this.maxTokens,\n",
            "        maxTokens:            this.maxTokens,\n"
            "        generationControlsEnabled: this.generationControlsEnabled,\n",
            1,
        )
        st.write_text(s, encoding="utf-8")
        print("state.js ok")
    else:
        print("state.js already patched")

    # --- app.js ---
    app = Path("js/app.js")
    a = app.read_text(encoding="utf-8")
    old_send = "{ temperature: AppState.temperature, maxTokens: AppState.maxTokens }"
    new_send = (
        "AppState.generationControlsEnabled\n"
        "          ? { temperature: AppState.temperature, maxTokens: AppState.maxTokens }\n"
        "          : {}"
    )
    if old_send not in a:
        raise SystemExit("app.js send options not found")
    a = a.replace(old_send, new_send, 1)

    old_wire = (
        "    const tempSlider = UI.el('tempSlider');\n"
        "    const tempVal    = UI.el('tempVal');\n"
        "    if (tempSlider) {\n"
        "      tempSlider.value = AppState.temperature;\n"
        "      if (tempVal) tempVal.textContent = AppState.temperature.toFixed(1);\n"
        "      tempSlider.addEventListener('input', (e) => {\n"
        "        AppState.temperature = parseFloat(e.target.value);\n"
        "        if (tempVal) tempVal.textContent = AppState.temperature.toFixed(1);\n"
        "        AppState.persistState();\n"
        "      });\n"
        "    }\n"
        "\n"
        "    const maxSlider = UI.el('maxTokensSlider');\n"
        "    const maxVal    = UI.el('maxTokensVal');\n"
        "    if (maxSlider) {\n"
        "      maxSlider.value = AppState.maxTokens;\n"
        "      if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();\n"
        "      maxSlider.addEventListener('input', (e) => {\n"
        "        AppState.maxTokens = parseInt(e.target.value, 10);\n"
        "        if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();\n"
        "        AppState.persistState();\n"
        "      });\n"
        "    }"
    )
    new_wire = r'''    const tempSlider = UI.el('tempSlider');
    const tempVal    = UI.el('tempVal');
    const maxSlider  = UI.el('maxTokensSlider');
    const maxVal     = UI.el('maxTokensVal');
    const genToggle  = UI.el('genControlsToggle');
    const genPanel   = UI.el('genControlsPanel');
    const genHint    = UI.el('genControlsOffHint');
    const genLabel   = genToggle?.closest('.gen-toggle')?.querySelector('.gen-toggle-label');

    const syncGenControlsUI = () => {
      const on = !!AppState.generationControlsEnabled;
      if (genToggle) genToggle.checked = on;
      if (genPanel) genPanel.classList.toggle('hidden', !on);
      if (genHint) genHint.classList.toggle('hidden', on);
      if (genLabel) genLabel.textContent = on ? 'On' : 'Off';
      if (tempSlider) tempSlider.disabled = !on;
      if (maxSlider) maxSlider.disabled = !on;
    };

    if (tempSlider) {
      tempSlider.value = AppState.temperature;
      if (tempVal) tempVal.textContent = AppState.temperature.toFixed(1);
      tempSlider.addEventListener('input', (e) => {
        AppState.temperature = parseFloat(e.target.value);
        if (tempVal) tempVal.textContent = AppState.temperature.toFixed(1);
        AppState.persistState();
      });
    }

    if (maxSlider) {
      maxSlider.value = AppState.maxTokens;
      if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();
      maxSlider.addEventListener('input', (e) => {
        AppState.maxTokens = parseInt(e.target.value, 10);
        if (maxVal) maxVal.textContent = AppState.maxTokens.toLocaleString();
        AppState.persistState();
      });
    }

    if (genToggle) {
      genToggle.addEventListener('change', () => {
        AppState.generationControlsEnabled = genToggle.checked;
        AppState.persistState();
        syncGenControlsUI();
      });
    }
    syncGenControlsUI();'''
    if old_wire not in a:
        raise SystemExit("app.js slider wiring not found")
    a = a.replace(old_wire, new_wire, 1)
    app.write_text(a, encoding="utf-8")
    print("app.js ok")

    # --- api.js ---
    api = Path("js/api.js")
    ap = api.read_text(encoding="utf-8")
    old_payload = (
        "    const payload = {\n"
        "      model:       modelId,\n"
        "      messages:    messages,\n"
        "      temperature: options.temperature ?? AppState.temperature,\n"
        "      max_tokens:  options.maxTokens ?? AppState.maxTokens,\n"
        "      top_p:       options.topP ?? 0.95,\n"
        "      stream:      true,\n"
        "      stream_options: { include_usage: true },\n"
        "    };"
    )
    new_payload = (
        "    const payload = {\n"
        "      model:       modelId,\n"
        "      messages:    messages,\n"
        "      top_p:       options.topP ?? 0.95,\n"
        "      stream:      true,\n"
        "      stream_options: { include_usage: true },\n"
        "    };\n"
        "    if (options.temperature !== undefined || AppState.generationControlsEnabled) {\n"
        "      payload.temperature = options.temperature ?? AppState.temperature;\n"
        "    }\n"
        "    if (options.maxTokens !== undefined || AppState.generationControlsEnabled) {\n"
        "      payload.max_tokens = options.maxTokens ?? AppState.maxTokens;\n"
        "    }"
    )
    if old_payload not in ap:
        raise SystemExit("api.js payload not found")
    api.write_text(ap.replace(old_payload, new_payload, 1), encoding="utf-8")
    print("api.js ok")

    # --- css ---
    css = Path("css/app.css")
    c = css.read_text(encoding="utf-8")
    if ".gen-toggle" not in c:
        c += """

/* Generation controls toggle */
.gen-toggle {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}
.gen-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.gen-toggle-track {
  width: 32px;
  height: 18px;
  border-radius: 99px;
  background: var(--border-2);
  position: relative;
  transition: background .15s ease;
  flex-shrink: 0;
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
  transition: transform .15s ease;
}
.gen-toggle input:checked + .gen-toggle-track {
  background: var(--accent);
}
.gen-toggle input:checked + .gen-toggle-track::after {
  transform: translateX(14px);
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
"""
        css.write_text(c, encoding="utf-8")
        print("app.css ok")
    else:
        print("app.css already has gen-toggle")

    sw = Path("sw.js")
    swt = sw.read_text(encoding="utf-8")
    if "chatwithit-v17" in swt:
        sw.write_text(swt.replace("chatwithit-v17", "chatwithit-v18"), encoding="utf-8")
        print("sw v17 -> v18")
    elif "chatwithit-v18" in swt:
        print("sw already v18")
    else:
        print("sw unexpected version")


if __name__ == "__main__":
    main()
