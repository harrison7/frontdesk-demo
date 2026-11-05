import { BUSINESS } from "./business";

/**
 * Canned replies used whenever we do not (or cannot) use the model's text.
 * They are fixed strings so their claims (phone numbers, hours) are reviewed
 * once, and so the fallback works even when the AI provider is down.
 */
export const RESPONSES = {
  unsure:
    `I'm not sure about that based on the information I have, and I don't want to guess. ` +
    `Would you like me to connect you with someone on our team? You can also call the office at ` +
    `${BUSINESS.officePhone} (${BUSINESS.officeHours}).`,

  unsureEmergency:
    `For anything urgent, please call our 24/7 emergency line at ${BUSINESS.emergencyPhone} ` +
    `so a person can help right away.`,

  injection:
    `I'm the virtual front desk for ${BUSINESS.name}, so I can only help with questions about our ` +
    `heating, cooling, and plumbing services, and I can't change how I work or share my setup. ` +
    `Is there something about your home I can help with?`,

  empty: "Please type a question, and I'll do my best to help.",

  tooLong:
    "That message is a bit long for me. Could you ask your question in a sentence or two?",
} as const;
