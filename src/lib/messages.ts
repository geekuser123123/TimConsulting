/**
 * Client-facing and internal message copy, approved by Tim. Keep all copy here so any future
 * wording change can be reviewed (and re-approved) in one place.
 */

import { formatPhone } from "./normalize";

export const SIGNATURE = "Tim Berry Consulting";

export const copy = {
  requestReceived: {
    subject: "We received your discovery call request",
    body: (firstName: string) =>
      `Hi ${firstName},\n\nWe received your request for a discovery call with Tim Berry. Tim reviews each request before scheduling. If the request is accepted, we will send you a private link to choose a time.\n\n${SIGNATURE}`,
  },

  timDeclined: {
    subject: "Your discovery call request",
    body: (firstName: string) =>
      `Hi ${firstName},\n\nThank you for submitting your request. Based on the information provided, we will not be scheduling a discovery call with Tim at this time. If there is another resource or service that may be appropriate, our team will let you know.\n\n${SIGNATURE}`,
  },

  timAccepted: {
    subject: "Tim approved your discovery call — choose a time",
    body: (firstName: string, link: string, minutes: number) =>
      `Hi ${firstName},\n\nTim has reviewed your request and approved a ${minutes}-minute discovery call. Use the link below to choose an available time.\n\n${link}\n\nThis link is private to you. Please do not share it.\n\n${SIGNATURE}`,
    sms: (link: string, minutes: number) =>
      `Tim Berry approved your ${minutes}-minute discovery call. Choose a time here: ${link}`,
  },

  timAcceptedNoRecording: {
    subject: "Tim approved your discovery call",
    body: (firstName: string) =>
      `Hi ${firstName},\n\nTim has reviewed your request and approved a discovery call. Because you asked that the call not be recorded, a member of our team will contact you directly to arrange a time.\n\n${SIGNATURE}`,
  },

  schedulingReminder: {
    subject: "Reminder: choose a time for your discovery call",
    body: (firstName: string, link: string) =>
      `Hi ${firstName},\n\nTim approved your discovery call, but a time hasn't been selected yet. You can choose a time here:\n\n${link}\n\n${SIGNATURE}`,
  },

  callPurpose: (minutes: number) =>
    `This is a ${minutes}-minute discovery call designed to understand your situation and determine what work, if any, is appropriate.`,

  /** How the client joins: Tim phones them (tel:) or a meeting link. */
  callDetails: (meetingUrl: string | undefined) => {
    if (!meetingUrl) return "";
    if (meetingUrl.startsWith("tel:")) return `Tim will call you at ${formatPhone(meetingUrl.slice(4))}. Please be available at that number.`;
    return `Join here: ${meetingUrl}`;
  },

  bookingConfirmed: {
    subject: "Your discovery call with Tim Berry is confirmed",
    body: (firstName: string, when: string, meetingUrl: string | undefined, minutes: number, manageLink?: string) =>
      `Hi ${firstName},\n\nYour discovery call with Tim Berry is confirmed for ${when}.\n${meetingUrl ? `\n${copy.callDetails(meetingUrl)}\n` : ""}\n${copy.callPurpose(minutes)}\n\nThe call will be recorded and transcribed, as you consented to in your request.${manageLink ? `\n\nNeed a different time? You can reschedule or cancel here: ${manageLink}` : ""}\n\n${SIGNATURE}`,
  },

  bookingCancelled: {
    subject: "Your discovery call with Tim Berry was cancelled",
    body: (firstName: string, link: string) =>
      `Hi ${firstName},\n\nYour discovery call has been cancelled. If you'd like to talk with Tim, you can choose a new time using your private link:\n\n${link}\n\n${SIGNATURE}`,
  },

  reminder: {
    subject: (label: string) => `Reminder: your discovery call with Tim Berry ${label}`,
    body: (firstName: string, when: string, meetingUrl: string | undefined, minutes: number) =>
      `Hi ${firstName},\n\nThis is a reminder of your discovery call with Tim Berry at ${when}.\n${meetingUrl ? `\n${copy.callDetails(meetingUrl)}\n` : ""}\n${copy.callPurpose(minutes)}\n\n${SIGNATURE}`,
    sms: (when: string, meetingUrl: string | undefined) =>
      `Reminder: discovery call with Tim Berry at ${when}.${meetingUrl?.startsWith("tel:") ? " Tim will call you." : meetingUrl ? ` Join: ${meetingUrl}` : ""}`,
  },

  proposalSent: {
    subject: "Your proposed scope of work from Tim Berry",
    body: (firstName: string, link: string) =>
      `Hi ${firstName},\n\nThank you for speaking with Tim. Your proposed scope of work is ready for review. It explains the work, what you'll receive, what is not included, and the fee.\n\n${link}\n\nYou can accept or decline directly on that page. This link is private to you.\n\n${SIGNATURE}`,
  },

  proposalReminder: {
    subject: "Your proposal from Tim Berry is ready when you are",
    body: (firstName: string, link: string) =>
      `Hi ${firstName},\n\nA quick note that your proposed scope of work is still available here:\n\n${link}\n\nNo action is needed if you've decided not to move forward.\n\n${SIGNATURE}`,
  },

  paymentReceived: {
    subject: "Payment received — thank you",
    body: (firstName: string, amount: string) =>
      `Hi ${firstName},\n\nWe received your payment of ${amount}. Thank you.\n\n${SIGNATURE}`,
  },

  engagementActive: {
    subject: "Your engagement is active",
    body: (firstName: string) =>
      `Hi ${firstName},\n\nYour engagement is active. Our team will contact you regarding the information and documents needed to begin the work.\n\n${SIGNATURE}`,
  },
};

export const consentText = {
  recordingTitle: "Why discovery calls are recorded",
  recordingWhy:
    "Discovery calls are recorded and transcribed so important details are not missed and our team can accurately review your situation and prepare next steps.",
  recordingPrivacy: "We do not sell your recordings or transcripts.",
  recording: "I consent to my discovery call being recorded and transcribed for these purposes.",
  noRecordingPrompt: "Unable to consent to recording?",
  noRecordingOption: "You may submit your information in writing for review instead.",
  noRelationship:
    "I understand that submitting this request does not guarantee that Tim Berry will accept the matter or create an attorney-client relationship.",
  sensitiveWarning:
    "Please provide enough information for us to understand your situation, but do not enter Social Security numbers, passwords, full account numbers, or similar sensitive identifiers in this form.",
  verbalScript:
    "Before we begin: this call is being recorded and transcribed for note-taking, case evaluation, and preparing a proposed scope of work. Is that still okay with you?",
};

/**
 * Engagement agreement shown on the proposal page and signed by typing a name (approved by Tim).
 * Set ENGAGEMENT_AGREEMENT_REQUIRED=false to skip this step.
 */
export const engagementAgreement = {
  title: "Engagement Agreement",
  paragraphs: [
    "This agreement confirms that you are engaging Tim Berry and the firm to perform the Proposed Work described above, for the Professional Fee stated above.",
    "The engagement is limited to the Proposed Work and Deliverables described in this proposal. Anything listed under “Not Included,” and any additional services, would require a separate engagement.",
    "You agree to provide the information and documents listed under Client Responsibilities. The work may be delayed until they are received.",
    "An attorney-client relationship begins only when this agreement is signed and any required payment has been received.",
  ],
  consent: "I have read and agree to the engagement terms above, and I agree that typing my name below is my electronic signature.",
};
