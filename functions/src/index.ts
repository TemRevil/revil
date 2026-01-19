import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import axios from "axios";
import { defineString } from "firebase-functions/params";

const GOOGLE_SCRIPT_URL = defineString("GOOGLE_SCRIPT_URL");

setGlobalOptions({ maxInstances: 10 });

export const syncMeeting = onCall(async (request) => {
    // Optional: Add auth check here
    // if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

    const payload = request.data;


    try {
        const response = await axios.post(GOOGLE_SCRIPT_URL.value(), payload, {
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