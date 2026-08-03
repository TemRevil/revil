import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import axios from "axios";

// The Google Apps Script web app that owns the actual Google Calendar work
// (create / update / cancel the event and its Meet link).
//
// Held in Secret Manager, NOT in the source: possession of this URL alone is
// enough to create, move or cancel events on the owner's calendar - it is a
// credential, so it is treated like one.
//   set it with:  firebase functions:secrets:set MEETING_SYNC_URL
const meetingSyncUrl = defineSecret("MEETING_SYNC_URL");

setGlobalOptions({ maxInstances: 10 });

// enforceAppCheck: only requests carrying a valid Firebase App Check token
// (reCAPTCHA Enterprise on the live site, debug token on localhost) may invoke
// this. Blocks direct/scripted calls that would otherwise spam the calendar.
export const syncMeeting = onCall(
    { enforceAppCheck: true, secrets: [meetingSyncUrl] },
    async (request) => {
        const payload = request.data;
        logger.info("Syncing meeting with payload:", payload);

        const url = (meetingSyncUrl.value() || "").trim();
        if (!url) {
            logger.error("MEETING_SYNC_URL secret is empty or unset");
            throw new HttpsError("failed-precondition", "Meeting sync is not configured.");
        }

        try {
            const response = await axios.post(url, payload, {
                headers: { "Content-Type": "application/json" },
            });

            const data = response.data;

            // Handle script logic errors
            if (data && data.status === "error") {
                throw new HttpsError("internal", data.message || "Error from Google Script");
            }

            return data;
        } catch (error: any) {
            logger.error("Sync Meeting Error:", error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError("internal", error.message || "Failed to communicate with synchronization service");
        }
    });
