AYFA — Drive Upload Actual Error Update

1. Replace the Apps Script code with google-apps-script.gs and save the project.
2. In Project Settings, confirm the manifest is enabled and appsscript.json includes https://www.googleapis.com/auth/drive.
3. In the Apps Script editor, select authorizeDriveAccess_ and click Run. Sign in as the account that owns the web app deployment and approve the Google Drive permission prompt. This one-time step authorizes DriveApp for the script owner.
4. Open Executions and confirm authorizeDriveAccess_ completed successfully.
5. Deploy -> Manage deployments -> Edit -> New version -> Deploy. Keep Execute as: Me and the intended access setting.
6. Test Upload Photos to Drive. Website hosting deployment alone does not update the Apps Script web app.

If the browser says it cannot read the Apps Script response, redeploy the Web App as a new version.
