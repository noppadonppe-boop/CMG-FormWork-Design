# RC Formwork — Local v0.3

Target: F:\Project Code\RC-FormWork-app

This package is a local source copy of cloud v0.3, commit 1a5a485a7fe76b6f32df48fd3441f100c64da6f6.
It has no Git remote, hosting identity, dependencies, build cache or private credentials.
The original cloud app remains available. No Firebase production or AI provider is configured.

After copying, open this folder in Codex or VS Code.
To run the local app manually, install Node22.12+ and run:

```powershell
Set-Location 'F:\Project Code\RC-FormWork-app'
npm ci
npm test
npm run build
npm run dev
```

Alternatively run scripts/Start-Frontend.ps1 from PowerShell.
The source passed65 software checks and frontend/backend builds in the cloud development environment.
Windows runtime, browser interactions and PDF visual QA have not been verified.

Browser draft data is not inside this source package. Export each project using the cloud
app's project-backup button, then import the JSON into localhost. Reattach original PDFs/images.
Calculations remain SCREENING_ONLY; joints, stability and construction approval remain incomplete.

Development should now continue locally under the owner's specified path. Do not publish
cloud changes, use Firebase production/paid providers, or issue construction documents without
a further applicable owner instruction.
