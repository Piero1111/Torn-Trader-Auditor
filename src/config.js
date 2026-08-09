export const CONFIG = {

    TORN_API_BASE:
        "https://api.torn.com/v2",

    W3B_API_BASE:
        "https://weav3r.dev/api",


    /*
     * Auditoría normal:
     * una vez cada hora.
     */
    AUDIT_INTERVAL:
        60 * 60 * 1000,


    SAMPLE_PERCENTAGE:
        0.10,


    EWMA_ALPHA:
        0.20,


    GREEN_THRESHOLD:
        0.03,


    YELLOW_THRESHOLD:
        0.10,


    HISTORY_DAYS:
        180,


    SEARCH_MIN_LENGTH:
        2
};