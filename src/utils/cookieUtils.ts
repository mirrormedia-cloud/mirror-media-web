/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function normalizeCookieInput(input = "") {
  if (!input || typeof input !== "string") return "";

  let text = input.trim();

  // Remove Cookie: prefix if user copied full header
  text = text.replace(/^cookie:\s*/i, "");

  // If pasted browser cookie string
  if (text.includes("=") && text.includes(";") && !text.includes("\t")) {
    return text
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .join("; ");
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const cookies = [];

  for (const line of lines) {
    if (line.startsWith("#")) continue;

    // Netscape cookie format:
    // domain flag path secure expiration name value
    const tabParts = line.split("\t");

    if (tabParts.length >= 7) {
      const name = tabParts[5];
      const value = tabParts.slice(6).join("");
      if (name && value) {
        cookies.push(`${name}=${value}`);
      }
      continue;
    }

    const spaceParts = line.split(/\s+/);

    if (spaceParts.length >= 7 && line.includes(".")) {
      const name = spaceParts[5];
      const value = spaceParts.slice(6).join("");
      if (name && value) {
        cookies.push(`${name}=${value}`);
      }
      continue;
    }

    // key=value line
    if (line.includes("=") && !line.includes(":")) {
      cookies.push(line);
    }
  }

  return cookies.join("; ");
}
