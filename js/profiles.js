/**
 * API Key Profiles
 * Lets the user save, switch, and delete named credential profiles.
 * Profiles are stored in localStorage (key names only — never the raw tokens).
 * Raw tokens are held ONLY in AppState memory, exactly like single-key mode.
 *
 * Shape of localStorage entry "cwiProfiles":
 *   [
 *     { id: "p1", name: "Work OR",   provider: "openrouter",   token: "sk-or-..." },
 *     { id: "p2", name: "HF personal", provider: "huggingface", token: "hf_..."   },
 *   ]
 *
 * Note: storing tokens in localStorage is a deliberate user opt-in trade-off
 * (same trust boundary as the browser's password manager). Profiles can be
 * deleted at any time and the page is the only origin that can read them.
 */

const Profiles = (() => {
  const LS_KEY = 'cwiProfiles';

  // ── Storage helpers ───────────────────────────────────────────────────────

  function load() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function save(profiles) {
    localStorage.setItem(LS_KEY, JSON.stringify(profiles));
  }

  function uid() {
    return 'p' + Math.random().toString(36).slice(2, 9);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function getAll() {
    return load();
  }

  function add(name, provider, token) {
    if (!name || !provider || !token) return null;
    const profiles = load();
    const profile = { id: uid(), name: name.trim(), provider, token };
    profiles.push(profile);
    save(profiles);
    return profile;
  }

  function remove(id) {
    const profiles = load().filter(p => p.id !== id);
    save(profiles);
  }

  function rename(id, newName) {
    const profiles = load().map(p => p.id === id ? { ...p, name: newName.trim() } : p);
    save(profiles);
  }

  /**
   * Activate a profile — copies its token into AppState memory and switches
   * the provider. Returns true on success.
   */
  function activate(id) {
    const profile = load().find(p => p.id === id);
    if (!profile) return false;

    AppState.currentProvider = profile.provider;
    if (profile.provider === 'openrouter') {
      AppState.apiKey  = profile.token;
      AppState.hfToken = '';
    } else {
      AppState.hfToken = profile.token;
      AppState.apiKey  = '';
    }
    AppState.persistState();
    return true;
  }

  /**
   * Save the currently active in-memory token as a new named profile.
   */
  function saveCurrentAsProfile(name) {
    const provider = AppState.currentProvider;
    const token    = AppState.getAuthToken();
    if (!token) return null;
    return add(name, provider, token);
  }

  // ── UI rendering ──────────────────────────────────────────────────────────

  function renderProfilesPanel() {
    const panel = document.getElementById('profilesPanel');
    if (!panel) return;

    const profiles = getAll();
    const activeToken = AppState.getAuthToken();

    const providerLabel = p => p.provider === 'openrouter' ? 'OR' : 'HF';
    const providerClass = p => p.provider === 'openrouter' ? 'badge-or' : 'badge-hf';
    const isActive      = p => p.token === activeToken && p.provider === AppState.currentProvider;

    const rows = profiles.map(p => `
      <div class="profile-row${isActive(p) ? ' profile-active' : ''}" data-id="${p.id}">
        <span class="profile-badge ${providerClass(p)}">${providerLabel(p)}</span>
        <span class="profile-name" title="${escHtml(p.name)}">${escHtml(p.name)}</span>
        <div class="profile-actions">
          <button class="profile-btn profile-use" data-id="${p.id}" title="Activate">${isActive(p) ? '✓ Active' : 'Use'}</button>
          <button class="profile-btn profile-del" data-id="${p.id}" title="Delete">✕</button>
        </div>
      </div>
    `).join('');

    panel.innerHTML = `
      <div class="profiles-list">
        ${profiles.length ? rows : '<p class="profiles-empty">No saved profiles yet.</p>'}
      </div>
      <div class="profiles-add">
        <input id="profileNameInput" type="text" placeholder="Profile name…" maxlength="40" />
        <button id="profileSaveBtn" class="btn-secondary">Save current key</button>
      </div>
    `;

    // Events
    panel.querySelectorAll('.profile-use').forEach(btn => {
      btn.addEventListener('click', () => {
        activate(btn.dataset.id);
        renderProfilesPanel();
        if (typeof UI !== 'undefined') {
          // FIX: pass a label string so authStatus element is not set to "undefined"
          const providerName = AppState.currentProvider === 'openrouter' ? 'OpenRouter' : 'Hugging Face';
          UI.setAuthState(true, `${providerName} authenticated`);
          UI.toast('Profile activated — reloading models…', 'success', 3000);
        }
        // FIX: was App.loadModels() which does not exist — correct method is App.refreshModels()
        if (typeof App !== 'undefined') App.refreshModels();
      });
    });

    panel.querySelectorAll('.profile-del').forEach(btn => {
      btn.addEventListener('click', () => {
        // FIX: use UI.confirmModal() instead of native confirm() for consistency + accessibility
        const doDelete = () => {
          remove(btn.dataset.id);
          renderProfilesPanel();
          if (typeof UI !== 'undefined') UI.toast('Profile deleted', 'info', 2000);
        };
        if (typeof UI !== 'undefined' && typeof UI.confirmModal === 'function') {
          UI.confirmModal('Delete this profile?', doDelete);
        } else {
          // Fallback if UI is not yet available (should not happen in normal flow)
          if (confirm('Delete this profile?')) doDelete();
        }
      });
    });

    const saveBtn = document.getElementById('profileSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const nameInput = document.getElementById('profileNameInput');
        const name = nameInput?.value?.trim();
        if (!name) {
          if (typeof UI !== 'undefined') UI.toast('Enter a profile name first', 'warning', 2500);
          return;
        }
        const profile = saveCurrentAsProfile(name);
        if (!profile) {
          if (typeof UI !== 'undefined') UI.toast('No active API key to save', 'warning', 2500);
          return;
        }
        nameInput.value = '';
        renderProfilesPanel();
        if (typeof UI !== 'undefined') UI.toast(`Profile "${escHtml(name)}" saved`, 'success', 2500);
      });
    }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Call once on DOMContentLoaded to wire up the profiles toggle button
   * and initial render.
   */
  function init() {
    const toggleBtn = document.getElementById('profilesToggleBtn');
    const panel     = document.getElementById('profilesPanel');
    if (!toggleBtn || !panel) return;

    toggleBtn.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      toggleBtn.setAttribute('aria-expanded', String(open));
      if (open) renderProfilesPanel();
    });

    // Close panel when clicking outside
    document.addEventListener('click', e => {
      if (!panel.contains(e.target) && e.target !== toggleBtn) {
        panel.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  return { getAll, add, remove, rename, activate, saveCurrentAsProfile, renderProfilesPanel, init };
})();
