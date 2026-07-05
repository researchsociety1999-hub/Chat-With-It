# Support

## How to Get Help

### 🐛 Found a bug?
Open a [Bug Report](https://github.com/researchsociety1999-hub/Chat-With-It/issues/new?template=bug_report.md).

### 🚀 Have a feature idea?
Open a [Feature Request](https://github.com/researchsociety1999-hub/Chat-With-It/issues/new?template=feature_request.md).

### 💬 General question?
Start a [Discussion](https://github.com/researchsociety1999-hub/Chat-With-It/discussions).

### 🔒 Security issue?
See [SECURITY.md](SECURITY.md) — please do not use public issues for vulnerabilities.

---

## Before Opening an Issue

- Check the [README](README.md) FAQ section
- Search [existing issues](https://github.com/researchsociety1999-hub/Chat-With-It/issues) to avoid duplicates
- Make sure you're on the latest version (`main` branch)

---

## Common Issues

**API key not working**
- Verify your key at [openrouter.ai/keys](https://openrouter.ai/keys) or [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
- Ensure you have credits or free tier access enabled

**Models not loading**
- Check your browser console for errors (F12)
- Try a different provider or model

**App not loading locally**
- Make sure you're serving via HTTP, not opening the file directly (`file://` won't work for API calls)
- Run `npx serve .` and open `http://localhost:3000`
