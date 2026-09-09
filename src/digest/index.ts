/**
 * digest/index.ts — Export all digest functions
 */

export { buildViewModel, type ViewModelOptions } from "./viewModel";
export { renderEmail, renderText } from "./renderer";
export { sendEmail, type EmailOptions } from "./mailer";

/**
 * Run the digest pipeline
 */
export async function runDigest(
    args: Record<string, string | boolean>,
): Promise<void> {
    // Import the main digest logic
    const { main } = await import("../digest");
    await main(args);
}
