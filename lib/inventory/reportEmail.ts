import { Resend } from "resend";

type SendInventoryReportEmailOptions = {
  reportBuffer: Buffer;
  reportFilename: string;
  reportDate: Date;
};

export async function sendInventoryReportEmail({
  reportBuffer,
  reportFilename,
  reportDate,
}: SendInventoryReportEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.INVENTORY_REPORT_EMAIL_TO;
  const emailFrom = process.env.INVENTORY_REPORT_EMAIL_FROM;

  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }

  if (!emailTo) {
    throw new Error("Missing INVENTORY_REPORT_EMAIL_TO environment variable.");
  }

  if (!emailFrom) {
    throw new Error(
      "Missing INVENTORY_REPORT_EMAIL_FROM environment variable.",
    );
  }

  const resend = new Resend(apiKey);

  const formattedDate = reportDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });

  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: emailTo,
    subject: `SpeakStock Inventory Report - ${formattedDate}`,
    text: [
      `SpeakStock inventory report for ${formattedDate}.`,
      "",
      "The Excel report is attached to this email.",
    ].join("\n"),
    attachments: [
      {
        filename: reportFilename,
        content: reportBuffer,
      },
    ],
  });

  if (error) {
    throw new Error(`Failed to send inventory report: ${error.message}`);
  }

  return data;
}
