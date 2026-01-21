## 2025-05-15 - [Exposed Firebase Service Account Key]
**Vulnerability:** A full Firebase Service Account key (`service-account.json`) was committed to the repository in the `functions/` directory.
**Learning:** Hardcoding or committing service account keys is a critical security risk as it provides full administrative access to the entire Firebase project. Even if the key is not explicitly imported in the current version of the code, its presence in the repository history (and current working tree) is enough for exploitation.
**Prevention:** Always use Application Default Credentials (ADC) when running in environments like Firebase Functions, or use environment variables/secrets (like Firebase Secrets) to manage sensitive keys. Ensure `.gitignore` includes any potential secret files.
